import { describe, expect, test } from "vitest";
import { filterArticle } from "@/lib/pipeline/keyword-filter";

const profile = {
  signalKeywords: ["rotary screw air compressor", "VSD compressor"],
  excludeKeywords: ["job vacancy", "obituary"],
};

describe("filterArticle", () => {
  test("passes on a default-lexicon match alone", () => {
    const result = filterArticle(
      { title: "Company breaks ground on new facility in Ipswich", bodyText: null },
      profile,
    );
    expect(result.passed).toBe(true);
    expect(result.matchedKeywords).toContain("breaks ground");
    expect(result.matchedKeywords).toContain("new facility");
  });

  test("passes on a profile-specific keyword alone", () => {
    const result = filterArticle(
      { title: "Local firm invests in new VSD compressor line", bodyText: null },
      profile,
    );
    expect(result.passed).toBe(true);
    expect(result.matchedKeywords).toContain("vsd compressor");
  });

  test("rejects when nothing matches", () => {
    const result = filterArticle(
      { title: "Local council approves new bike lane", bodyText: "No industrial signal here." },
      profile,
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.rejectReason).toMatch(/no signal keywords/i);
  });

  test("exclude keywords win even when a signal keyword also matches", () => {
    const result = filterArticle(
      {
        title: "Job vacancy: Maintenance Manager at new facility expansion",
        bodyText: null,
      },
      profile,
    );
    expect(result.passed).toBe(false);
    expect(result.rejectReason).toMatch(/job vacancy/i);
  });

  test("score counts distinct matched keywords, case-insensitively", () => {
    const result = filterArticle(
      { title: "New Facility, New Plant, NEW FACILITY again", bodyText: null },
      profile,
    );
    expect(result.passed).toBe(true);
    // "new facility" should only count once despite appearing twice.
    expect(result.matchedKeywords.filter((k) => k === "new facility")).toHaveLength(1);
  });

  test("matches against bodyText too, not just title", () => {
    const result = filterArticle(
      { title: "Untitled", bodyText: "The firm is doubling capacity at its Logan site." },
      profile,
    );
    expect(result.passed).toBe(true);
    expect(result.matchedKeywords).toContain("doubling capacity");
  });
});
