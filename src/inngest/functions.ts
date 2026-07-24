import { inngest } from "./client";
import { forOrganization } from "@/lib/db";
import { crawlSource } from "@/lib/pipeline/crawl";
import { RobotsGate } from "@/lib/pipeline/fetch";
import { classifyBatch, CLASSIFY_BATCH_SIZE } from "@/lib/pipeline/classify";
import { extractAndScoreLead, enrichAndRescoreLead } from "@/lib/pipeline/lead";

// Deliberately trivial — this exists to prove the Inngest <-> Next.js <->
// Vercel wiring works end to end in production (BUILD_ORDER.md.txt step 5)
// before any real background job (crawling, classification, ...) gets
// built on top of it in later steps.
export const helloWorld = inngest.createFunction(
  { id: "hello-world", triggers: { event: "test/hello.world" } },
  async ({ event, step }) => {
    const name = (event.data?.name as string | undefined) ?? "world";

    await step.run("log-greeting", async () => {
      console.log(`Hello ${name}, from Inngest!`);
    });

    return { message: `Hello ${name}!`, ranAt: new Date().toISOString() };
  },
);

type RunStartPayload = {
  organizationId: string;
  profileId: string;
  runId: string;
  lookbackDays: number | null;
};

/**
 * Fetch -> dedupe -> keyword filter for every active source on a profile
 * (BUILD_ORDER.md.txt step 6 — no LLM yet). The Run row already exists by
 * the time this fires (created synchronously by POST /api/runs so the UI
 * shows it immediately); this function's job is purely to process it.
 *
 * Each source gets its own step.run — the brief's architecture describes
 * source.crawl as a separately-enqueued job per source, mainly so one
 * source's failure/retry doesn't restart another's work. step.run gives us
 * that same per-source checkpointing without needing full event-based
 * fan-out + fan-in coordination, which "prove the plumbing" doesn't call
 * for yet. sourceCrawl below still exists as its own triggerable function
 * for a standalone "recrawl this one source" case later.
 */
export const runStart = inngest.createFunction(
  { id: "run-start", triggers: { event: "run/start" } },
  async ({ event, step }) => {
    const { organizationId, profileId, runId, lookbackDays } = event.data as RunStartPayload;

    try {
      const sources = await step.run("list-active-sources", async () => {
        const db = forOrganization(organizationId);
        return db.source.findMany({
          where: { profileId, status: "ACTIVE" },
          select: { id: true },
        });
      });

      const robots = new RobotsGate();
      const passedArticleIds: string[] = [];

      for (const source of sources) {
        const crawled = await step.run(`crawl-source-${source.id}`, () =>
          crawlSource({
            organizationId,
            sourceId: source.id,
            runId,
            lookbackDays,
            robots,
          }),
        );
        passedArticleIds.push(...crawled.passedArticleIds);
      }

      // Classify -> extract -> score -> enrich the keyword-filter survivors
      // (BUILD_ORDER.md.txt step 7). Kept as step.run calls inside this same
      // function, same simplification as the per-source crawl loop above,
      // rather than a full event-fan-out per stage — Inngest checkpoints
      // each step.run independently, so this is still durable and
      // idempotent across retries without the added complexity of
      // event-based coordination.
      if (passedArticleIds.length > 0) {
        const profile = await step.run("load-profile", async () => {
          const db = forOrganization(organizationId);
          return db.profile.findUniqueOrThrow({ where: { id: profileId } });
        });

        for (let i = 0; i < passedArticleIds.length; i += CLASSIFY_BATCH_SIZE) {
          const chunk = passedArticleIds.slice(i, i + CLASSIFY_BATCH_SIZE);

          const classified = await step.run(`classify-batch-${i}`, async () => {
            const db = forOrganization(organizationId);
            const articles = await db.article.findMany({
              where: { id: { in: chunk } },
              select: { id: true, title: true, bodyText: true },
            });
            return classifyBatch(db, { organizationId, runId, profile, articles });
          });

          for (const articleId of classified.leadArticleIds) {
            const extracted = await step.run(`extract-lead-${articleId}`, async () => {
              const db = forOrganization(organizationId);
              const article = await db.article.findUniqueOrThrow({ where: { id: articleId } });
              return extractAndScoreLead(db, { organizationId, runId, profile, article });
            });

            if (extracted.status === "created" && extracted.needsEnrichment) {
              await step.run(`enrich-lead-${extracted.leadId}`, () => {
                const db = forOrganization(organizationId);
                return enrichAndRescoreLead(db, {
                  organizationId,
                  runId,
                  leadId: extracted.leadId,
                  profile,
                });
              });
            }
          }
        }
      }

      await step.run("finalize-run", async () => {
        const db = forOrganization(organizationId);
        await db.run.update({
          where: { id: runId },
          data: { status: "COMPLETED", finishedAt: new Date() },
        });
      });

      return { runId, sourceCount: sources.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await step.run("mark-run-failed", async () => {
        const db = forOrganization(organizationId);
        await db.run.update({
          where: { id: runId },
          data: { status: "FAILED", finishedAt: new Date(), errors: [{ message }] },
        });
      });
      return { runId, failed: true, message };
    }
  },
);

type SourceCrawlPayload = {
  organizationId: string;
  sourceId: string;
  runId: string;
  lookbackDays: number | null;
};

/** Standalone single-source crawl — same underlying logic runStart uses per source, triggerable on its own. */
export const sourceCrawl = inngest.createFunction(
  { id: "source-crawl", triggers: { event: "source/crawl" } },
  async ({ event, step }) => {
    const { organizationId, sourceId, runId, lookbackDays } = event.data as SourceCrawlPayload;
    const robots = new RobotsGate();

    return step.run("crawl", () =>
      crawlSource({ organizationId, sourceId, runId, lookbackDays, robots }),
    );
  },
);
