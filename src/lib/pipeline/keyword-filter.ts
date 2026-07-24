import "server-only";
import { DEFAULT_SIGNAL_LEXICON } from "./lexicon";

export type KeywordFilterResult = {
  passed: boolean;
  score: number;
  matchedKeywords: string[];
  rejectReason: string | null;
};

function matchKeywords(haystackLower: string, keywords: string[]): string[] {
  const matched: string[] = [];
  for (const keyword of keywords) {
    const needle = keyword.trim().toLowerCase();
    if (needle && haystackLower.includes(needle)) matched.push(keyword.trim());
  }
  return matched;
}

/**
 * No LLM — plain substring matching against the default lexicon plus the
 * profile's own keywords. This is the stage that "must remove 80 to 90
 * percent of articles" (PROJECT_BRIEF.md.txt) before anything reaches an
 * LLM call in step 7.
 */
export function filterArticle(
  article: { title: string; bodyText: string | null },
  profile: { signalKeywords: string[]; excludeKeywords: string[] },
): KeywordFilterResult {
  const haystack = `${article.title} ${article.bodyText ?? ""}`.toLowerCase();

  const excludeMatches = matchKeywords(haystack, profile.excludeKeywords);
  if (excludeMatches.length > 0) {
    return {
      passed: false,
      score: 0,
      matchedKeywords: [],
      rejectReason: `Matched exclude keyword: "${excludeMatches[0]}"`,
    };
  }

  const signalKeywords = [...DEFAULT_SIGNAL_LEXICON, ...profile.signalKeywords];
  const matched = matchKeywords(haystack, signalKeywords);
  const uniqueMatched = [...new Set(matched.map((keyword) => keyword.toLowerCase()))];

  if (uniqueMatched.length === 0) {
    return { passed: false, score: 0, matchedKeywords: [], rejectReason: "No signal keywords matched" };
  }

  return { passed: true, score: uniqueMatched.length, matchedKeywords: uniqueMatched, rejectReason: null };
}
