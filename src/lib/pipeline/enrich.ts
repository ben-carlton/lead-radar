import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ContactSource, PrismaClient } from "@/generated/prisma/client";
import { anthropic, ENRICH_MODEL } from "@/lib/ai/client";
import { hasBudgetRemaining, recordTokenUsage } from "@/lib/ai/budget";
import {
  buildEnrichSystemPrompt,
  buildEnrichUserPrompt,
  buildRepairPrompt,
  WebLookupSchema,
  type WebLookupResult,
} from "@/lib/prompts/enrich";

// "Web lookup, only if the lead scores above 60" — PROJECT_BRIEF.md.txt.
export const WEB_LOOKUP_SCORE_THRESHOLD = 60;

export type ContactResult = {
  contactName: string | null;
  contactRole: string | null;
  contactSource: ContactSource;
  contactConfidence: number | null;
  tokensIn: number;
  tokensOut: number;
};

async function callWebLookup(
  system: string,
  userPrompt: string,
): Promise<{ data: WebLookupResult | null; tokensIn: number; tokensOut: number }> {
  let tokensIn = 0;
  let tokensOut = 0;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic.messages.create({
      model: ENRICH_MODEL,
      max_tokens: 1024,
      system,
      messages,
      // The "20260209" dynamic-filtering variant runs an internal
      // code-execution loop that burned ~64K tokens on a single lookup in
      // testing (32% of the default monthly org budget) — verified against
      // the live API. This one-shot "find one named contact" task doesn't
      // need that; the basic variant found the same real contact for
      // ~5.5x fewer tokens.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
      output_config: { format: zodOutputFormat(WebLookupSchema) },
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

    const validated = parsedJson === undefined ? null : WebLookupSchema.safeParse(parsedJson);
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

// Role inference (step 3): no LLM call, and per the brief never a name —
// "Returns a likely job title to ask for, clearly flagged as inferred."
function inferRole(profile: { buyerRoles: string[] }): ContactResult {
  const role = profile.buyerRoles[0]?.trim();
  if (!role) {
    return { contactName: null, contactRole: null, contactSource: "NONE", contactConfidence: null, tokensIn: 0, tokensOut: 0 };
  }
  return {
    contactName: null,
    contactRole: role,
    contactSource: "INFERRED_ROLE",
    contactConfidence: 0.3,
    tokensIn: 0,
    tokensOut: 0,
  };
}

/**
 * Fills in a lead's contact, stopping as soon as one step succeeds, per
 * PROJECT_BRIEF.md.txt's contact-enrichment section:
 *  1. Named person already in the article — passed in from extract.ts's
 *     ExtractionSchema, free (piggybacked on that call, no extra spend here).
 *  2. One targeted web search with Sonnet, only if score > 60.
 *  3. Role inference from the profile's buyer roles — no LLM call.
 * "Never invent a person's name... A blank field is correct. A guess is a
 * bug" — every path that finds nothing falls through, ending at NONE/null
 * rather than a fabricated name. `db` must already be scoped to
 * organizationId (forOrganization() in a background job).
 */
export async function enrichContact(
  db: PrismaClient,
  params: {
    organizationId: string;
    runId: string;
    score: number;
    articleContact: { contactName: string | null; contactRole: string | null };
    profile: { buyerRoles: string[] };
    lead: { companyName: string; suburb: string | null; state: string | null; whyItsALead: string };
  },
): Promise<ContactResult> {
  const { organizationId, runId, score, articleContact, profile, lead } = params;

  if (articleContact.contactName) {
    return {
      contactName: articleContact.contactName,
      contactRole: articleContact.contactRole,
      contactSource: "ARTICLE",
      contactConfidence: 0.9,
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  if (score <= WEB_LOOKUP_SCORE_THRESHOLD) {
    return inferRole(profile);
  }

  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org || !hasBudgetRemaining(org)) {
    return inferRole(profile);
  }

  const system = buildEnrichSystemPrompt(profile);
  const userPrompt = buildEnrichUserPrompt(lead);
  const outcome = await callWebLookup(system, userPrompt);

  if (outcome.tokensIn > 0 || outcome.tokensOut > 0) {
    await recordTokenUsage(db, {
      organizationId,
      runId,
      stage: "ENRICH",
      model: ENRICH_MODEL,
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
    });
  }

  if (outcome.data?.contactName) {
    return {
      contactName: outcome.data.contactName,
      contactRole: outcome.data.contactRole,
      contactSource: "WEB_SEARCH",
      contactConfidence: outcome.data.confidence,
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
    };
  }

  return { ...inferRole(profile), tokensIn: outcome.tokensIn, tokensOut: outcome.tokensOut };
}
