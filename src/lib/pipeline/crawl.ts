import "server-only";
import { forOrganization } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { politeDelay } from "@/lib/http";
import type { Selectors } from "@/lib/sources/detect";
import { RobotsGate, fetchArticleBodyText, hashUrl, listSourceArticles } from "./fetch";
import { filterArticle } from "./keyword-filter";

export type CrawlSourceResult = {
  sourceId: string;
  fetched: number;
  passed: number;
  rejected: number;
  duplicates: number;
  error: string | null;
};

/**
 * Fetch -> dedupe -> keyword filter for one source, per BUILD_ORDER.md.txt
 * step 6. Every write is idempotent: re-running (a retried Inngest step) on
 * the same source just re-discovers the same already-stored Article rows
 * as duplicates and skips them, never double-counting Run/Source stats.
 *
 * Sets tenant context as its first action via forOrganization(), per the
 * multi-tenant rule for background jobs — this function is always called
 * from an Inngest step with organizationId from the event payload, never
 * from a route handler with a session.
 */
export async function crawlSource(params: {
  organizationId: string;
  sourceId: string;
  runId: string;
  lookbackDays: number | null;
  robots: RobotsGate;
}): Promise<CrawlSourceResult> {
  const { organizationId, sourceId, runId, lookbackDays, robots } = params;
  const db = forOrganization(organizationId);

  const result: CrawlSourceResult = {
    sourceId,
    fetched: 0,
    passed: 0,
    rejected: 0,
    duplicates: 0,
    error: null,
  };

  const source = await db.source.findUnique({ where: { id: sourceId }, include: { profile: true } });
  if (!source) {
    result.error = "Source not found";
    return result;
  }

  let candidates;
  try {
    candidates = await listSourceArticles(
      {
        type: source.type,
        url: source.url,
        feedUrl: source.feedUrl,
        selectors: source.selectors as Selectors | null,
      },
      robots,
    );
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Failed to fetch source";
    await db.source.update({
      where: { id: sourceId },
      data: { lastCrawledAt: new Date(), errorCount: { increment: 1 } },
    });
    return result;
  }

  if (lookbackDays) {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    // HTML-sourced candidates have no reliable publishedAt (our selectors
    // don't extract a date) — keep them rather than dropping everything.
    candidates = candidates.filter((c) => !c.publishedAt || new Date(c.publishedAt) >= cutoff);
  }

  for (const candidate of candidates) {
    result.fetched += 1;
    const urlHash = hashUrl(candidate.link);

    // Dedupe key is [organizationId, urlHash] — forOrganization() already
    // scopes this findFirst to organizationId, so matching on urlHash alone
    // here still respects the per-org uniqueness rule.
    const existing = await db.article.findFirst({ where: { urlHash } });
    if (existing) {
      result.duplicates += 1;
      continue;
    }

    await politeDelay();
    const bodyText = await fetchArticleBodyText(candidate.link, robots);
    const filter = filterArticle({ title: candidate.title, bodyText }, source.profile);

    try {
      await db.article.create({
        data: {
          sourceId: source.id,
          url: candidate.link,
          urlHash,
          title: candidate.title,
          publishedAt: candidate.publishedAt ? new Date(candidate.publishedAt) : null,
          bodyText,
          stage: filter.passed ? "KEYWORD_PASSED" : "KEYWORD_REJECTED",
          keywordScore: filter.score,
          rejectReason: filter.rejectReason,
          processedAt: new Date(),
          // organizationId is injected by forOrganization()'s scopeArgs —
          // Prisma's static create() type can't see that (src/lib/db.ts).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
    } catch (err) {
      // A concurrent retry inserted the same urlHash between our findFirst
      // check and this create — that's a duplicate, not a real error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        result.duplicates += 1;
        continue;
      }
      throw err;
    }

    if (filter.passed) result.passed += 1;
    else result.rejected += 1;
  }

  await db.source.update({
    where: { id: sourceId },
    data: {
      lastCrawledAt: new Date(),
      lastSuccessAt: new Date(),
      articlesFound: { increment: result.fetched - result.duplicates },
    },
  });

  await db.run.update({
    where: { id: runId },
    data: {
      articlesFetched: { increment: result.fetched },
      articlesFiltered: { increment: result.passed },
    },
  });

  return result;
}
