import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { inngest } from "@/inngest/client";
import type { RunCreateInput } from "@/lib/validators/run";

export class UnknownProfileError extends Error {
  constructor() {
    super("Unknown profileId");
  }
}

/**
 * Creates the Run row synchronously (so the caller — API route or UI
 * server action — can show it immediately) and hands the actual crawl off
 * to Inngest. Shared so POST /api/runs and the /runs/new server action
 * can't drift on the profileId-ownership check or the event payload shape.
 */
export async function startRun(db: PrismaClient, input: RunCreateInput) {
  const profile = await db.profile.findUnique({ where: { id: input.profileId } });
  if (!profile) throw new UnknownProfileError();

  const run = await db.run.create({
    data: {
      profileId: input.profileId,
      mode: input.mode,
      lookbackDays: input.lookbackDays ?? null,
      // organizationId is injected by the tenant client's scopeArgs; Prisma's
      // static create() type can't see that (src/lib/db.ts).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

  await inngest.send({
    name: "run/start",
    data: {
      organizationId: run.organizationId,
      profileId: run.profileId,
      runId: run.id,
      lookbackDays: run.lookbackDays,
    },
  });

  return run;
}
