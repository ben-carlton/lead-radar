import { inngest } from "./client";
import { forOrganization } from "@/lib/db";
import { crawlSource } from "@/lib/pipeline/crawl";
import { RobotsGate } from "@/lib/pipeline/fetch";

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

      for (const source of sources) {
        await step.run(`crawl-source-${source.id}`, () =>
          crawlSource({
            organizationId,
            sourceId: source.id,
            runId,
            lookbackDays,
            robots,
          }),
        );
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
