import { describe, expect, test } from "vitest";
import { scoreLead } from "@/lib/pipeline/scoring";

const profile = {
  regions: ["Texas"],
  industriesTargeted: ["food processing"],
  scoringWeights: {
    signalStrength: 30,
    geographicFit: 25,
    industryFit: 20,
    recency: 15,
    contactAvailability: 10,
  },
};

const now = new Date("2026-07-24T00:00:00Z");

describe("scoreLead", () => {
  test("scores a strong, in-region, on-industry, fresh, fully-contacted lead near 100", () => {
    const { score, breakdown } = scoreLead(
      profile,
      {
        signalType: "new plant",
        companyText: "Acme Foods breaks ground on a new food processing plant",
        suburb: "Dallas",
        state: "Texas",
        publishedAt: now,
        contactName: "Jane Smith",
        contactRole: "VP Operations",
      },
      now,
    );
    expect(score).toBe(100);
    expect(breakdown.signalStrength.subscore).toBe(1.0);
    expect(breakdown.geographicFit.subscore).toBe(1.0);
    expect(breakdown.industryFit.subscore).toBe(1.0);
    expect(breakdown.contactAvailability.subscore).toBe(1.0);
  });

  test("scores a weak, out-of-region, off-industry, stale, no-contact lead near 0", () => {
    const { score } = scoreLead(
      profile,
      {
        signalType: "reports steady growth",
        companyText: "Some unrelated retail company",
        suburb: "Portland",
        state: "Oregon",
        publishedAt: new Date("2025-01-01T00:00:00Z"), // well over 90 days stale
        contactName: null,
        contactRole: null,
      },
      now,
    );
    expect(score).toBeLessThan(30);
  });

  test("contact availability alone moves the score up when a lead is re-scored after enrichment", () => {
    const base = {
      signalType: "facility expansion",
      companyText: "Acme Foods facility expansion in the food processing sector",
      suburb: "Dallas",
      state: "Texas",
      publishedAt: now,
    };
    const before = scoreLead(profile, { ...base, contactName: null, contactRole: null }, now);
    const after = scoreLead(
      profile,
      { ...base, contactName: "Jane Smith", contactRole: "VP Operations" },
      now,
    );
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.score - before.score).toBe(10); // full contactAvailability weight
  });

  test("unknown location and unknown recency get partial credit, not zero", () => {
    const { breakdown } = scoreLead(
      profile,
      {
        signalType: "expansion",
        companyText: "food processing expansion",
        suburb: null,
        state: null,
        publishedAt: null,
        contactName: null,
        contactRole: null,
      },
      now,
    );
    expect(breakdown.geographicFit.subscore).toBe(0.5);
    expect(breakdown.recency.subscore).toBe(0.5);
  });

  test("a profile with no region or industry constraints gives full fit on both", () => {
    const openProfile = { ...profile, regions: [], industriesTargeted: [] };
    const { breakdown } = scoreLead(
      openProfile,
      {
        signalType: "new plant",
        companyText: "anything at all",
        suburb: "Nowhere",
        state: "Nowhere",
        publishedAt: now,
        contactName: null,
        contactRole: null,
      },
      now,
    );
    expect(breakdown.geographicFit.subscore).toBe(1.0);
    expect(breakdown.industryFit.subscore).toBe(1.0);
  });

  test("score is always within 0-100 regardless of weight totals", () => {
    const skewedProfile = {
      ...profile,
      scoringWeights: { signalStrength: 5, geographicFit: 5, industryFit: 5, recency: 5, contactAvailability: 5 },
    };
    const { score } = scoreLead(
      skewedProfile,
      {
        signalType: "greenfield",
        companyText: "food processing",
        suburb: "Dallas",
        state: "Texas",
        publishedAt: now,
        contactName: "Jane",
        contactRole: "VP",
      },
      now,
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBe(100); // weights are equal, so normalization still yields full marks
  });
});
