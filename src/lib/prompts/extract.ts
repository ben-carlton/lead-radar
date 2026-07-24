import "server-only";
import { z } from "zod";

export const ExtractionSchema = z.object({
  companyName: z.string(),
  suburb: z.string().nullable(),
  state: z.string().nullable(),
  siteAddress: z.string().nullable(),
  whyItsALead: z.string(),
  estimatedTimeframe: z.string().nullable(),
  // Contact enrichment step 1 ("named person in the article, free") rides on
  // this same call — see PROJECT_BRIEF.md.txt's contact-enrichment section.
  contactName: z.string().nullable(),
  contactRole: z.string().nullable(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const REPAIR_INSTRUCTION =
  "Your previous response did not match the required JSON schema. Return ONLY a JSON object matching the schema — no prose, no markdown fences.";

export function buildRepairPrompt(): string {
  return REPAIR_INSTRUCTION;
}

/**
 * Templated from the Profile per PROJECT_BRIEF.md.txt ("never hardcoded to
 * an industry") and kept short — every word is billed on every call. Only
 * called for articles Haiku already confirmed as a buying signal, so this
 * prompt extracts detail rather than re-deciding relevance.
 */
export function buildExtractSystemPrompt(profile: { productsSold: string }): string {
  return [
    "You extract structured lead details from a news article about a confirmed B2B buying signal.",
    `The user sells: ${profile.productsSold}.`,
    "Identify the company the signal is about (not a journalist, analyst, or unrelated company mentioned in passing), its site location if stated, and write one or two sentences explaining why this is a sales lead for this user specifically — tie the signal to what they sell.",
    "If a field isn't stated in the article, return null for it. Never guess a location or timeframe that isn't in the text.",
    "estimatedTimeframe should be a short phrase like \"Q3 2026\" or \"early 2027\" if the article gives one, otherwise null.",
    "If the article names a real person tied to this signal (e.g. a quoted executive, plant manager, or spokesperson) along with their job title, include their name and role. Never invent a name — if no real person is named in the text, return null for both contactName and contactRole.",
    "Return strict JSON matching the schema, no prose.",
  ].join(" ");
}

export function buildExtractUserPrompt(article: {
  title: string;
  excerpt: string;
  signalType: string | null;
}): string {
  return [
    `TITLE: ${article.title}`,
    article.signalType ? `SIGNAL TYPE: ${article.signalType}` : null,
    `ARTICLE:\n${article.excerpt}`,
  ]
    .filter(Boolean)
    .join("\n");
}
