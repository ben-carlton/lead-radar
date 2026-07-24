import "server-only";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { XMLParser } from "fast-xml-parser";
import { fetchWithTimeout, readCappedText } from "@/lib/http";

export type Selectors = {
  articleSelector: string;
  titleSelector: string;
  linkSelector: string;
};

export type ArticleCandidate = { title: string; link: string; publishedAt: string | null };
// Kept as a name for the add-source preview UI, which never looks at
// publishedAt — same shape as ArticleCandidate either way.
export type PreviewArticle = ArticleCandidate;

export type DetectionResult =
  | { type: "rss"; feedUrl: string; suggestedName: string | null; preview: PreviewArticle[] }
  | {
      type: "html";
      selectors: Selectors | null;
      suggestedName: string | null;
      preview: PreviewArticle[];
    };

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withProtocol).toString();
}

function looksLikeFeed(contentType: string | null, text: string): boolean {
  if (contentType && /rss|atom|xml/i.test(contentType)) return true;
  const head = text.slice(0, 500);
  return /<rss[\s>]/i.test(head) || /<feed[\s>]/i.test(head) || /<rdf:rdf/i.test(head);
}

// Minimal, deliberately loose: good enough to extract title/link/date, not
// a general-purpose feed reader.
export function parseFeedItems(xml: string, limit = Infinity): ArticleCandidate[] {
  let doc: Record<string, unknown>;
  try {
    doc = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      // Feeds routinely use numeric entities (&#038; for &) in URLs; these
      // are only decoded with htmlEntities on, not by processEntities alone.
      htmlEntities: true,
    }).parse(xml);
  } catch {
    return [];
  }

  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const feed = doc.feed as Record<string, unknown> | undefined;
  const rawItems = channel?.item ?? feed?.entry ?? [];
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  return items
    .slice(0, limit)
    .map((item: Record<string, unknown>) => {
      const rawTitle = item.title;
      const title =
        typeof rawTitle === "string"
          ? rawTitle
          : ((rawTitle as Record<string, unknown> | undefined)?.["#text"] as string | undefined);

      const rawLink = item.link;
      let link = "";
      if (typeof rawLink === "string") link = rawLink;
      else if (Array.isArray(rawLink)) {
        const first = rawLink[0] as Record<string, unknown> | string;
        link = typeof first === "string" ? first : ((first?.["@_href"] as string) ?? "");
      } else if (rawLink && typeof rawLink === "object") {
        link = ((rawLink as Record<string, unknown>)["@_href"] as string) ?? "";
      }

      const rawDate = (item.pubDate ?? item.published ?? item.updated) as string | undefined;
      const parsedDate = rawDate ? new Date(rawDate) : null;
      const publishedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;

      return { title: String(title ?? "").trim(), link: link.trim(), publishedAt };
    })
    .filter((a) => a.title && a.link);
}

function discoverFeedUrl($: cheerio.CheerioAPI, baseUrl: string): string | null {
  const href = $('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="atom"]')
    .first()
    .attr("href");
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

const FEED_FALLBACK_PATHS = ["/feed", "/feed/", "/rss", "/rss.xml", "/atom.xml"];

async function tryFallbackFeedPaths(baseUrl: string): Promise<string | null> {
  for (const path of FEED_FALLBACK_PATHS) {
    const candidate = new URL(path, baseUrl).toString();
    try {
      const res = await fetchWithTimeout(candidate);
      if (!res.ok) continue;
      const text = await readCappedText(res);
      if (looksLikeFeed(res.headers.get("content-type"), text)) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTML selector heuristic: find the repeating "article card" pattern by
// looking for headline-length anchors that share a common ancestor, then
// picking whichever ancestor selector repeats the most (>= 3 times, since
// we need at least a 3-article preview anyway).
// ---------------------------------------------------------------------------

const MIN_TITLE_LENGTH = 20;
const MIN_REPEATS = 3;
const MAX_ANCESTOR_DEPTH = 4;

function tagOf(el: AnyNode | undefined): string {
  return el && "tagName" in el ? String(el.tagName).toLowerCase() : "div";
}

function ancestorSelector($el: cheerio.Cheerio<AnyNode>): string {
  const tag = tagOf($el.get(0));
  const stateClass = /^(active|current|selected)$/i;
  const cls = ($el.attr("class") ?? "").split(/\s+/).find((c) => c && !stateClass.test(c));
  return cls ? `${tag}.${cls}` : tag;
}

export function proposeSelectors($: cheerio.CheerioAPI): Selectors | null {
  const candidateAnchors = $("a[href]").filter((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    if (/^(#|javascript:|mailto:|tel:)/i.test(href)) return false;
    return $el.text().trim().length >= MIN_TITLE_LENGTH;
  });

  const counts = new Map<string, number>();
  candidateAnchors.each((_, el) => {
    let $node = $(el) as cheerio.Cheerio<AnyNode>;
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
      const $parent = $node.parent();
      if (!$parent.length || $parent.is("body")) break;
      const selector = ancestorSelector($parent);
      counts.set(selector, (counts.get(selector) ?? 0) + 1);
      $node = $parent;
    }
  });

  let best: { selector: string; count: number } | null = null;
  for (const [selector, count] of counts) {
    if (count < MIN_REPEATS) continue;
    if (!best || count > best.count) best = { selector, count };
  }
  if (!best) return null;

  const sample = $(best.selector).first();
  const heading = sample
    .find("h1, h2, h3, h4")
    .filter((_, el) => $(el).find("a").length > 0)
    .first();
  const titleSelector = heading.length ? `${tagOf(heading.get(0))} a` : "a";

  return { articleSelector: best.selector, titleSelector, linkSelector: titleSelector };
}

export function extractArticles(
  $: cheerio.CheerioAPI,
  selectors: Selectors,
  baseUrl: string,
  limit = Infinity,
): ArticleCandidate[] {
  const articles: ArticleCandidate[] = [];

  $(selectors.articleSelector).each((_, el) => {
    if (articles.length >= limit) return false;
    const $el = $(el);
    const $link =
      selectors.linkSelector === "a" ? $el.find("a").first() : $el.find(selectors.linkSelector).first();
    const title = ($el.find(selectors.titleSelector).first().text() || $link.text()).trim();
    const href = $link.attr("href");
    if (!title || !href) return;
    try {
      // HTML selectors don't give us a reliable publish date.
      articles.push({ title, link: new URL(href, baseUrl).toString(), publishedAt: null });
    } catch {
      // skip anchors with unparseable hrefs
    }
  });

  return articles;
}

/** Full auto-detection: try RSS first (autodiscovery, then common paths), fall back to HTML selectors. */
export async function detectSource(rawUrl: string): Promise<DetectionResult> {
  const url = normalizeUrl(rawUrl);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Fetching ${url} failed with status ${res.status}`);

  const text = await readCappedText(res);

  if (looksLikeFeed(res.headers.get("content-type"), text)) {
    return { type: "rss", feedUrl: url, suggestedName: null, preview: parseFeedItems(text, 3) };
  }

  const $ = cheerio.load(text);
  const suggestedName = $("title").first().text().trim() || null;

  const feedUrl = discoverFeedUrl($, url) ?? (await tryFallbackFeedPaths(url));
  if (feedUrl) {
    const feedRes = await fetchWithTimeout(feedUrl);
    const feedText = feedRes.ok ? await readCappedText(feedRes) : "";
    return {
      type: "rss",
      feedUrl,
      suggestedName,
      preview: feedText ? parseFeedItems(feedText, 3) : [],
    };
  }

  const selectors = proposeSelectors($);
  return {
    type: "html",
    selectors,
    suggestedName,
    preview: selectors ? extractArticles($, selectors, url, 3) : [],
  };
}

/** Re-run extraction with user-edited selectors, for the "tweak and re-preview" step in the UI. */
export async function previewUrlWithSelectors(
  rawUrl: string,
  selectors: Selectors,
): Promise<PreviewArticle[]> {
  const url = normalizeUrl(rawUrl);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Fetching ${url} failed with status ${res.status}`);
  const text = await readCappedText(res);
  return extractArticles(cheerio.load(text), selectors, url, 3);
}
