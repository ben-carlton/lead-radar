import "server-only";
import { z } from "zod";

export const ClassificationSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      isLead: z.boolean(),
      signalType: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export type Classification = z.infer<typeof ClassificationSchema>;

const REPAIR_INSTRUCTION =
  "Your previous response did not match the required JSON schema. Return ONLY a JSON object matching the schema — no prose, no markdown fences.";

export function buildRepairPrompt(): string {
  return REPAIR_INSTRUCTION;
}

/**
 * Templated from the Profile per PROJECT_BRIEF.md.txt ("never hardcoded to
 * an industry") and kept short — every word is billed on every call.
 */
export function buildClassifySystemPrompt(profile: {
  productsSold: string;
  industriesTargeted: string[];
  regions: string[];
}): string {
  return [
    "You classify news articles as B2B sales buying signals or not.",
    `The user sells: ${profile.productsSold}.`,
    profile.industriesTargeted.length > 0
      ? `Target industries: ${profile.industriesTargeted.join(", ")}.`
      : null,
    profile.regions.length > 0 ? `Target regions: ${profile.regions.join(", ")}.` : null,
    "A buying signal is a concrete event that creates near-term demand: a facility expansion, a greenfield site, a new plant, a relocation, a capacity increase, or a capex announcement.",
    'For each article, decide if it is a genuine buying signal for this user, and if so, name the signal type in a few words (e.g. "facility expansion", "new plant", "relocation").',
    "Ignore stock-price moves, executive appointments, product launches, and vague growth language with no physical facility or capacity change.",
    "Return strict JSON matching the schema, no prose.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildClassifyUserPrompt(articles: { title: string; excerpt: string }[]): string {
  const numbered = articles
    .map((a, i) => `[${i}] TITLE: ${a.title}\nEXCERPT: ${a.excerpt}`)
    .join("\n\n");
  return `Classify each of these ${articles.length} articles. Respond with one result per article, indexed to match.\n\n${numbered}`;
}
