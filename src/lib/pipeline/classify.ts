import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { anthropic, CLASSIFY_MODEL } from "@/lib/ai/client";
import { hasBudgetRemaining, recordTokenUsage } from "@/lib/ai/budget";
import {
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  buildRepairPrompt,
  ClassificationSchema,
  type Classification,
} from "@/lib/prompts/classify";

// PROJECT_BRIEF.md.txt step 4: title plus first 1200 characters only, up to
// 10 articles per call.
const EXCERPT_CHARS = 1200;
export const CLASSIFY_BATCH_SIZE = 10;

export type ClassifyArticle = { id: string; title: string; bodyText: string | null };

export type ClassifyBatchResult = {
  leadArticleIds: string[];
  rejectedArticleIds: string[];
  failedArticleIds: string[];
  skippedBudget: boolean;
  tokensIn: number;
  tokensOut: number;
};

/**
 * Calls Haiku once (plus at most one repair retry) with structured output,
 * validates with Zod as a backstop, and returns null if both attempts fail —
 * per PROJECT_BRIEF.md.txt: "On parse failure retry once with a repair
 * instruction, then mark the article failed and move on. A bad response
 * must never crash a run."
 */
async function callClassifier(
  system: string,
  userPrompt: string,
): Promise<{ data: Classification | null; tokensIn: number; tokensOut: number }> {
  let tokensIn = 0;
  let tokensOut = 0;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic.messages.create({
      model: CLASSIFY_MODEL,
      max_tokens: 2048,
      system,
      messages,
      output_config: { format: zodOutputFormat(ClassificationSchema) },
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

    const validated = parsedJson === undefined ? null : ClassificationSchema.safeParse(parsedJson);
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
 * Classifies one batch (<= CLASSIFY_BATCH_SIZE) of keyword-filter survivors
 * with Haiku, writes Article.stage/signalType/classifierConfidence, and logs
 * spend. `db` must already be scoped to organizationId (forOrganization() in
 * a background job — this is always called from Inngest, never a route).
 *
 * Checks the org's monthly token budget before calling the model per
 * PROJECT_BRIEF.md.txt: "Per-org monthly token ceiling, checked before each
 * call, hard stop when hit." Over-budget articles are left un-classified
 * (KEYWORD_PASSED) rather than marked failed, so a later run under a fresh
 * budget can pick them up.
 */
export async function classifyBatch(
  db: PrismaClient,
  params: {
    organizationId: string;
    runId: string;
    profile: { productsSold: string; industriesTargeted: string[]; regions: string[] };
    articles: ClassifyArticle[];
  },
): Promise<ClassifyBatchResult> {
  const { organizationId, runId, profile, articles } = params;

  const result: ClassifyBatchResult = {
    leadArticleIds: [],
    rejectedArticleIds: [],
    failedArticleIds: [],
    skippedBudget: false,
    tokensIn: 0,
    tokensOut: 0,
  };
  if (articles.length === 0) return result;
  if (articles.length > CLASSIFY_BATCH_SIZE) {
    throw new Error(
      `classifyBatch(): batch of ${articles.length} exceeds max ${CLASSIFY_BATCH_SIZE}`,
    );
  }

  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org || !hasBudgetRemaining(org)) {
    result.skippedBudget = true;
    return result;
  }

  const excerpts = articles.map((article) => ({
    title: article.title,
    excerpt: (article.bodyText ?? "").slice(0, EXCERPT_CHARS),
  }));

  const system = buildClassifySystemPrompt(profile);
  const userPrompt = buildClassifyUserPrompt(excerpts);
  const outcome = await callClassifier(system, userPrompt);

  result.tokensIn = outcome.tokensIn;
  result.tokensOut = outcome.tokensOut;

  if (outcome.tokensIn > 0 || outcome.tokensOut > 0) {
    await recordTokenUsage(db, {
      organizationId,
      runId,
      stage: "CLASSIFY",
      model: CLASSIFY_MODEL,
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
    });
    await db.run.update({
      where: { id: runId },
      data: { articlesClassified: { increment: articles.length } },
    });
  }

  if (!outcome.data) {
    result.failedArticleIds = articles.map((article) => article.id);
    await db.article.updateMany({
      where: { id: { in: result.failedArticleIds } },
      data: { rejectReason: "Classifier returned no valid response after retry" },
    });
    return result;
  }

  const byIndex = new Map(outcome.data.results.map((r) => [r.index, r]));

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const classification = byIndex.get(i);

    if (!classification) {
      result.failedArticleIds.push(article.id);
      await db.article.update({
        where: { id: article.id },
        data: { rejectReason: "Classifier response missing this article" },
      });
      continue;
    }

    if (classification.isLead) result.leadArticleIds.push(article.id);
    else result.rejectedArticleIds.push(article.id);

    await db.article.update({
      where: { id: article.id },
      data: {
        stage: "CLASSIFIED",
        signalType: classification.isLead ? classification.signalType : null,
        classifierConfidence: classification.confidence,
        processedAt: new Date(),
      },
    });
  }

  return result;
}
