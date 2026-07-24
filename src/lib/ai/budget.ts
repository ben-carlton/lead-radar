import "server-only";
import type { AiStage, PrismaClient } from "@/generated/prisma/client";

// $ per million tokens. Sonnet 5 intro pricing ($2/$10) is active through
// 2026-08-31 — see PROJECT_BRIEF.md.txt's cost-tracking requirement.
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
};

export function calculateCost(model: string, tokensIn: number, tokensOut: number): number {
  const rates = PRICING_PER_MTOK[model];
  if (!rates) throw new Error(`calculateCost(): no pricing entry for model "${model}"`);
  return (tokensIn * rates.input + tokensOut * rates.output) / 1_000_000;
}

export function hasBudgetRemaining(org: {
  tokenBudgetMonthly: number;
  tokensUsedThisMonth: number;
}): boolean {
  return org.tokensUsedThisMonth < org.tokenBudgetMonthly;
}

/**
 * Logs one LLM call's spend to TokenUsage and rolls it up onto the parent
 * Run and Organization, per PROJECT_BRIEF.md.txt: "Log tokens per stage to
 * a TokenUsage table. Show spend in the UI." `db` must already be scoped to
 * `organizationId` (forOrganization() in a background job).
 */
export async function recordTokenUsage(
  db: PrismaClient,
  params: {
    organizationId: string;
    runId: string;
    stage: AiStage;
    model: string;
    tokensIn: number;
    tokensOut: number;
  },
): Promise<number> {
  const cost = calculateCost(params.model, params.tokensIn, params.tokensOut);

  await db.tokenUsage.create({
    data: {
      runId: params.runId,
      stage: params.stage,
      model: params.model,
      tokensIn: params.tokensIn,
      tokensOut: params.tokensOut,
      cost,
      // organizationId is injected by the tenant client's scopeArgs; Prisma's
      // static create() type can't see that (src/lib/db.ts).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

  await db.run.update({
    where: { id: params.runId },
    data: {
      tokensIn: { increment: params.tokensIn },
      tokensOut: { increment: params.tokensOut },
      estimatedCost: { increment: cost },
    },
  });

  await db.organization.update({
    where: { id: params.organizationId },
    data: { tokensUsedThisMonth: { increment: params.tokensIn + params.tokensOut } },
  });

  return cost;
}
