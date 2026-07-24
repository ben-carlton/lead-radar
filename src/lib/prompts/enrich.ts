import "server-only";
import { z } from "zod";

export const WebLookupSchema = z.object({
  contactName: z.string().nullable(),
  contactRole: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type WebLookupResult = z.infer<typeof WebLookupSchema>;

const REPAIR_INSTRUCTION =
  "Your previous response did not match the required JSON schema. Return ONLY a JSON object matching the schema — no prose, no markdown fences.";

export function buildRepairPrompt(): string {
  return REPAIR_INSTRUCTION;
}

/**
 * Step 2 of contact enrichment (PROJECT_BRIEF.md.txt): "Web lookup, only if
 * the lead scores above 60. One targeted search." Templated from the
 * profile's buyer roles, never hardcoded to an industry.
 */
export function buildEnrichSystemPrompt(profile: { buyerRoles: string[] }): string {
  return [
    "You are looking for a real, current, named contact at a company that is the subject of a B2B sales lead.",
    profile.buyerRoles.length > 0
      ? `Likely useful roles at this company: ${profile.buyerRoles.join(", ")}.`
      : null,
    "Use web search to find one real named person currently in a relevant role at this company — a press release quote, an executive team page, or a news mention are good sources.",
    "Never invent a name. If you cannot find a real, current, named person with reasonable confidence, return null for both contactName and contactRole.",
    "Return strict JSON matching the schema, no prose.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildEnrichUserPrompt(lead: {
  companyName: string;
  suburb: string | null;
  state: string | null;
  whyItsALead: string;
}): string {
  const location = [lead.suburb, lead.state].filter(Boolean).join(", ");
  return [
    `COMPANY: ${lead.companyName}`,
    location ? `LOCATION: ${location}` : null,
    `CONTEXT: ${lead.whyItsALead}`,
    "Find one named contact at this company.",
  ]
    .filter(Boolean)
    .join("\n");
}
