import "server-only";
import { z } from "zod";

// Mirrors Profile.scoringWeights' default JSON in prisma/schema.prisma —
// PROJECT_BRIEF.md.txt's defaults out of 100: signal strength 30,
// geographic fit 25, industry fit 20, recency 15, contact availability 10.
const ScoringWeightsSchema = z.object({
  signalStrength: z.number().nonnegative().default(30),
  geographicFit: z.number().nonnegative().default(25),
  industryFit: z.number().nonnegative().default(20),
  recency: z.number().nonnegative().default(15),
  contactAvailability: z.number().nonnegative().default(10),
});

export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

function parseWeights(raw: unknown): ScoringWeights {
  const result = ScoringWeightsSchema.safeParse(raw);
  return result.success ? result.data : ScoringWeightsSchema.parse({});
}

export type ScoringInputs = {
  signalType: string;
  // Free text to search for industry-fit matches — title + body + whyItsALead.
  companyText: string;
  suburb: string | null;
  state: string | null;
  publishedAt: Date | null;
  contactName: string | null;
  contactRole: string | null;
};

export type ScoreComponent = { weight: number; subscore: number; points: number };

export type ScoreBreakdown = {
  signalStrength: ScoreComponent;
  geographicFit: ScoreComponent;
  industryFit: ScoreComponent;
  recency: ScoreComponent;
  contactAvailability: ScoreComponent;
};

// "Greenfield and new plant highest, vague growth lowest" — ordered
// strongest-match-first; the first pattern that matches signalType wins.
const SIGNAL_STRENGTH_RANKING: { pattern: RegExp; subscore: number }[] = [
  { pattern: /greenfield|new plant|new facility/i, subscore: 1.0 },
  { pattern: /capacity increase|expansion/i, subscore: 0.85 },
  { pattern: /relocation/i, subscore: 0.7 },
  { pattern: /capex|capital expenditure/i, subscore: 0.6 },
];
const DEFAULT_SIGNAL_STRENGTH = 0.4;

function scoreSignalStrength(signalType: string): number {
  return SIGNAL_STRENGTH_RANKING.find((r) => r.pattern.test(signalType))?.subscore ?? DEFAULT_SIGNAL_STRENGTH;
}

// No real geocoding/adjacency data is available, so "adjacent partial" from
// the brief is approximated as "location unknown" — benefit of the doubt
// rather than a penalty, since it's genuinely ambiguous, not out of region.
function scoreGeographicFit(regions: string[], suburb: string | null, state: string | null): number {
  if (regions.length === 0) return 1.0;
  if (!suburb && !state) return 0.5;
  const haystack = `${suburb ?? ""} ${state ?? ""}`.toLowerCase();
  const matched = regions.some((region) => haystack.includes(region.trim().toLowerCase()));
  return matched ? 1.0 : 0.0;
}

const INDUSTRY_NO_MATCH_SCORE = 0.3;

function scoreIndustryFit(industriesTargeted: string[], companyText: string): number {
  if (industriesTargeted.length === 0) return 1.0;
  const haystack = companyText.toLowerCase();
  const matched = industriesTargeted.some((industry) => haystack.includes(industry.trim().toLowerCase()));
  return matched ? 1.0 : INDUSTRY_NO_MATCH_SCORE;
}

const RECENCY_WINDOW_DAYS = 90;
const UNKNOWN_RECENCY_SCORE = 0.5;

function scoreRecency(publishedAt: Date | null, now: Date): number {
  if (!publishedAt) return UNKNOWN_RECENCY_SCORE;
  const daysSince = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 0) return 1.0;
  return Math.max(0, 1 - daysSince / RECENCY_WINDOW_DAYS);
}

// "Named contact with role full, company only zero" — company-only means no
// contact at all here; a name with no role is the in-between case.
function scoreContactAvailability(contactName: string | null, contactRole: string | null): number {
  if (contactName && contactRole) return 1.0;
  if (contactName) return 0.5;
  return 0.0;
}

/**
 * Weighted 0-100 score from Profile.scoringWeights, per
 * PROJECT_BRIEF.md.txt's scoring section. Weights are normalized by their
 * own sum rather than assumed to total 100, since they're "tunable per
 * profile." Called twice per lead: once at extraction (contactAvailability
 * scores 0 — no contact known yet) and again after contact enrichment.
 */
export function scoreLead(
  profile: { regions: string[]; industriesTargeted: string[]; scoringWeights: unknown },
  input: ScoringInputs,
  now: Date = new Date(),
): { score: number; breakdown: ScoreBreakdown } {
  const weights = parseWeights(profile.scoringWeights);

  const subscores = {
    signalStrength: scoreSignalStrength(input.signalType),
    geographicFit: scoreGeographicFit(profile.regions, input.suburb, input.state),
    industryFit: scoreIndustryFit(profile.industriesTargeted, input.companyText),
    recency: scoreRecency(input.publishedAt, now),
    contactAvailability: scoreContactAvailability(input.contactName, input.contactRole),
  };

  const totalWeight =
    weights.signalStrength +
    weights.geographicFit +
    weights.industryFit +
    weights.recency +
    weights.contactAvailability;

  const breakdown = {} as ScoreBreakdown;
  let weightedSum = 0;
  for (const key of Object.keys(subscores) as (keyof typeof subscores)[]) {
    const weight = weights[key];
    const subscore = subscores[key];
    const points = totalWeight > 0 ? (weight * subscore * 100) / totalWeight : 0;
    breakdown[key] = { weight, subscore, points: Math.round(points * 10) / 10 };
    weightedSum += points;
  }

  return { score: Math.min(100, Math.max(0, Math.round(weightedSum))), breakdown };
}
