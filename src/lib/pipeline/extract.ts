import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { anthropic, EXTRACT_MODEL } from "@/lib/ai/client";
import { hasBudgetRemaining, recordTokenUsage } from "@/lib/ai/budget";
import {
  buildExtractSystemPrompt,
  buildExtractUserPrompt,
  buildRepairPrompt,
  ExtractionSchema,
  type Extraction,
} from "@/lib/prompts/extract";

// Extraction reads the full article (not the 1200-char classify excerpt),
// but still "strip to text, truncate, then send" per PROJECT_BRIEF.md.txt —
// never the raw HTML, and never unbounded.
const EXCERPT_CHARS = 6000;

export type ExtractArticle = {
  id: string;
  title: string;
  bodyText: string | null;
  signalType: string | null;
};

export type ExtractResult = {
  extraction: Extraction | null;
  tokensIn: number;
  tokensOut: number;
  skippedBudget: boolean;
};

/**
 * Calls Sonnet once (plus at most one repair retry) with structured output,
 * validates with Zod as a backstop — same retry-once-then-fail contract as
 * classify.ts, per PROJECT_BRIEF.md.txt: "On parse failure retry once with a
 * repair instruction, then mark the article failed and move on."
 */
async function callExtractor(
  system: string,
  userPrompt: string,
): Promise<{ data: Extraction | null; tokensIn: number; tokensOut: number }> {
  let tokensIn = 0;
  let tokensOut = 0;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic.messages.create({
      model: EXTRACT_MODEL,
      max_tokens: 1024,
      system,
      messages,
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    });

    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    const rawText = textBlock?.text ?? "";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      parsedJson = undefined;
    }

    const validated = parsedJson === undefined ? null : ExtractionSchema.safeParse(parsedJson);
    if (validated?.success) {
      return { data: validated.data, tokensIn, tokensOut };
    }

    if (attempt === 0) {
      messages.push({ role: "assistant", content: rawText });
      messages.push({ role: "user", content: buildRepairPrompt() });
    }
  }

  return { data: null, tokensIn, tokensOut };
}

/**
 * Extracts structured lead detail (company, location, why it's a lead,
 * timeframe) from one CLASSIFIED article with Sonnet. Does not write the
 * Lead row — the caller combines this with scoring (scoring.ts) and
 * optional contact enrichment before creating it, per BUILD_ORDER.md.txt
 * step 7. `db` must already be scoped to organizationId (forOrganization()
 * in a background job) — used here only to check budget and log spend.
 */
export async function extractLead(
  db: PrismaClient,
  params: {
    organizationId: string;
    runId: string;
    profile: { productsSold: string };
    article: ExtractArticle;
  },
): Promise<ExtractResult> {
  const { organizationId, runId, profile, article } = params;

  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org || !hasBudgetRemaining(org)) {
    return { extraction: null, tokensIn: 0, tokensOut: 0, skippedBudget: true };
  }

  const system = buildExtractSystemPrompt(profile);
  const userPrompt = buildExtractUserPrompt({
    title: article.title,
    excerpt: (article.bodyText ?? "").slice(0, EXCERPT_CHARS),
    signalType: article.signalType,
  });

  const outcome = await callExtractor(system, userPrompt);

  if (outcome.tokensIn > 0 || outcome.tokensOut > 0) {
    await recordTokenUsage(db, {
      organizationId,
      runId,
      stage: "EXTRACT",
      model: EXTRACT_MODEL,
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
    });
  }

  return {
    extraction: outcome.data,
    tokensIn: outcome.tokensIn,
    tokensOut: outcome.tokensOut,
    skippedBudget: false,
  };
}
