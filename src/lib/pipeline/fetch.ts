import "server-only";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { CRAWLER_USER_AGENT, fetchWithTimeout, readCappedText } from "@/lib/http";
import { extractArticles, parseFeedItems, type ArticleCandidate, type Selectors } from "@/lib/sources/detect";

// A source's list page/feed rarely has more than this many genuinely new
// items per crawl; capping keeps one run bounded and keeps us polite (each
// item past the list is a full extra page fetch).
export const MAX_ARTICLES_PER_SOURCE = 30;

const TRACKING_PARAM_PATTERN = /^(utm_\w+|fbclid|gclid|mc_[ce]id|ref|ref_src|igshid)$/i;

/**
 * Canonical form used only for hashing/dedupe — strips tracking params,
 * trailing slash, and fragment so the same article reached via different
 * campaign links still dedupes to one Article row.
 */
export function normalizeUrlForHash(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM_PATTERN.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

export function hashUrl(rawUrl: string): string {
  return crypto.createHash("sha256").update(normalizeUrlForHash(rawUrl)).digest("hex");
}

/**
 * Fetches and caches robots.txt per origin, so a whole source-crawl (list
 * page + every article page, normally all one domain) costs at most one
 * robots.txt fetch. Fails open: no robots.txt, or a robots.txt fetch error,
 * means "allowed" — we don't want a flaky robots.txt to block a crawl of a
 * site that has no crawling restrictions.
 */
export class RobotsGate {
  private cache = new Map<string, ReturnType<typeof robotsParser> | null>();

  private async getParser(origin: string) {
    if (this.cache.has(origin)) return this.cache.get(origin) ?? null;
    try {
      const robotsUrl = `${origin}/robots.txt`;
      const res = await fetchWithTimeout(robotsUrl, 5000);
      if (!res.ok) {
        this.cache.set(origin, null);
        return null;
      }
      const body = await readCappedText(res, 200_000);
      const parser = robotsParser(robotsUrl, body);
      this.cache.set(origin, parser);
      return parser;
    } catch {
      this.cache.set(origin, null);
      return null;
    }
  }

  async isAllowed(url: string): Promise<boolean> {
    try {
      const parser = await this.getParser(new URL(url).origin);
      if (!parser) return true;
      return parser.isAllowed(url, CRAWLER_USER_AGENT) ?? true;
    } catch {
      return true;
    }
  }
}

type SourceLike = {
  type: "RSS" | "HTML";
  url: string;
  feedUrl: string | null;
  selectors: Selectors | null;
};

/** The list of candidate articles for one source — the feed's items, or the HTML page's selector matches. */
export async function listSourceArticles(
  source: SourceLike,
  robots: RobotsGate,
): Promise<ArticleCandidate[]> {
  if (source.type === "RSS") {
    if (!source.feedUrl) return [];
    if (!(await robots.isAllowed(source.feedUrl))) return [];
    const res = await fetchWithTimeout(source.feedUrl);
    if (!res.ok) throw new Error(`Feed fetch failed with status ${res.status}`);
    const text = await readCappedText(res);
    return parseFeedItems(text, MAX_ARTICLES_PER_SOURCE);
  }

  if (!source.selectors) return [];
  if (!(await robots.isAllowed(source.url))) return [];
  const res = await fetchWithTimeout(source.url);
  if (!res.ok) throw new Error(`Page fetch failed with status ${res.status}`);
  const text = await readCappedText(res);
  return extractArticles(cheerio.load(text), source.selectors, source.url, MAX_ARTICLES_PER_SOURCE);
}

const BODY_NOISE_SELECTORS =
  "script, style, nav, header, footer, noscript, iframe, svg, form, aside, .ad, .advertisement";
const BODY_TEXT_MAX_CHARS = 5000;

/**
 * Fetches one article's page and extracts plain text (never stored or sent
 * anywhere as HTML — see PROJECT_BRIEF.md.txt's "never send full HTML to a
 * model"). Returns null on any failure or an empty result; callers should
 * treat that as "no body text available", not a hard error for the whole
 * source crawl.
 */
export async function fetchArticleBodyText(url: string, robots: RobotsGate): Promise<string | null> {
  if (!(await robots.isAllowed(url))) return null;

  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type");
  if (contentType && !/html/i.test(contentType)) return null;

  const html = await readCappedText(res);
  const $ = cheerio.load(html);
  $(BODY_NOISE_SELECTORS).remove();

  const text = ($("article").text() || $("main").text() || $("body").text()).trim();
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed.slice(0, BODY_TEXT_MAX_CHARS) : null;
}
