import "server-only";
import { z } from "zod";

export const SourceSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      reasoning: z.string(),
    }),
  ),
});

export type SourceSuggestionResult = z.infer<typeof SourceSuggestionSchema>;

const REPAIR_INSTRUCTION =
  "Your previous response did not match the required JSON schema. Return ONLY a JSON object matching the schema — no prose, no markdown fences.";

export function buildRepairPrompt(): string {
  return REPAIR_INSTRUCTION;
}

const MAX_SUGGESTIONS = 5;

/**
 * Templated from the Profile and the org's own source list, never
 * hardcoded to an industry. Kept short — every word is billed on every
 * call — and the "real, currently active" instruction matters: this is the
 * one place in the app where a hallucinated URL becomes a Source row a
 * human clicks "accept" on, so the bar is higher than for a plain summary.
 */
export function buildSuggestSystemPrompt(profile: {
  productsSold: string;
  industriesTargeted: string[];
  regions: string[];
}): string {
  return [
    "You research trade news publications for a B2B sales lead-finding tool.",
    `The user sells: ${profile.productsSold}.`,
    profile.industriesTargeted.length > 0
      ? `Target industries: ${profile.industriesTargeted.join(", ")}.`
      : null,
    profile.regions.length > 0 ? `Target regions: ${profile.regions.join(", ")}.` : null,
    "You will be given the trade publications the user already tracks. Use web search to find real, currently publishing news websites or trade magazines that cover similar ground — same industries, adjacent industries, or the same geographic region — and are not already in the list.",
    `Suggest up to ${MAX_SUGGESTIONS} sources. For each, give its real homepage URL and one sentence on why it fits this profile specifically.`,
    "Only suggest publications you can verify are real and currently active via search. Never invent a name or URL — if you can't find enough good candidates, return fewer, even zero.",
    "Return strict JSON matching the schema, no prose.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildSuggestUserPrompt(params: {
  existingSources: { name: string; url: string }[];
  excludedUrls: string[];
}): string {
  const existingList =
    params.existingSources.length > 0
      ? params.existingSources.map((s) => `- ${s.name} (${s.url})`).join("\n")
      : "(none yet)";

  return [
    `EXISTING SOURCES:\n${existingList}`,
    params.excludedUrls.length > 0
      ? `DO NOT SUGGEST (already suggested or rejected before): ${params.excludedUrls.join(", ")}`
      : null,
    "Find sources that would extend this list, not duplicate it.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
