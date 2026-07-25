import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { anthropic, ENRICH_MODEL } from "@/lib/ai/client";
import { hasBudgetRemaining, recordTokenUsage } from "@/lib/ai/budget";
import {
  buildRepairPrompt,
  buildSuggestSystemPrompt,
  buildSuggestUserPrompt,
  SourceSuggestionSchema,
  type SourceSuggestionResult,
} from "@/lib/prompts/suggest-sources";

export type SuggestSourcesResult =
  | { status: "ok"; suggestions: SourceSuggestionResult["suggestions"] }
  | { status: "skipped-budget" }
  | { status: "failed" };

async function callSuggester(
  system: string,
  userPrompt: string,
): Promise<{ data: SourceSuggestionResult | null; tokensIn: number; tokensOut: number }> {
  let tokensIn = 0;
  let tokensOut = 0;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic.messages.create({
      model: ENRICH_MODEL,
      max_tokens: 2048,
      system,
      messages,
      // Basic variant, not the "_20260209" dynamic-filtering one — that
      // variant runs an internal code-execution loop that burned ~64K
      // tokens on a single lookup in testing (see enrich.ts). This is a
      // multi-candidate research task, so it's allowed a few more searches
      // than the one-shot contact lookup.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      output_config: { format: zodOutputFormat(SourceSuggestionSchema) },
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

    const validated = parsedJson === undefined ? null : SourceSuggestionSchema.safeParse(parsedJson);
    if (validated?.success) {
      return { data: validated.data, tokensIn, tokensOut };
    }

    if (attempt === 0) {
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: buildRepairPrompt() });
    }
  }

  return { data: null, tokensIn, tokensOut };
}

/**
 * Summarizes a profile's existing sources and researches lookalike trade
 * publications via Claude + web search, for the Sources page's "Find
 * similar sources" action. Does not write Source rows itself — the caller
 * decides how to dedupe/store them (see suggestSourcesAction). `db` must
 * already be scoped to organizationId (getTenantDb() from a route/action).
 */
export async function suggestSources(
  db: PrismaClient,
  params: {
    organizationId: string;
    profile: { productsSold: string; industriesTargeted: string[]; regions: string[] };
    existingSources: { name: string; url: string }[];
    excludedUrls: string[];
  },
): Promise<SuggestSourcesResult> {
  const { organizationId, profile, existingSources, excludedUrls } = params;

  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org || !hasBudgetRemaining(org)) {
    return { status: "skipped-budget" };
  }

  const system = buildSuggestSystemPrompt(profile);
  const userPrompt = buildSuggestUserPrompt({ existingSources, excludedUrls });
  const outcome = await callSuggester(system, userPrompt);

  if (outcome.tokensIn > 0 || outcome.tokensOut > 0) {
    await recordTokenUsage(db, {
      organizationId,
      stage: "SUGGEST_SOURCES",
      model: ENRICH_MODEL,
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
    });
  }

  if (!outcome.data) return { status: "failed" };

  return { status: "ok", suggestions: outcome.data.suggestions };
}
