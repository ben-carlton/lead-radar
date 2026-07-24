import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { rawDb } from "@/lib/db";
import { cleanupOrgs, seedTwoOrgs, type TestOrg } from "./setup";

/**
 * Layer 1: Postgres RLS itself (prisma/migrations/20260724120100_rls_policies).
 * These bypass src/lib/db.ts entirely and talk to Postgres directly — the
 * point is to prove the database enforces isolation even if the app-layer
 * scoping (tested in tenant-client.test.ts) has a bug.
 */
describe("Postgres RLS: app_user role", () => {
  let orgA: TestOrg;
  let orgB: TestOrg;

  beforeAll(async () => {
    ({ orgA, orgB } = await seedTwoOrgs());
  });

  afterAll(async () => {
    await cleanupOrgs(orgA, orgB);
  });

  test("app_user scoped to org A cannot read org B's row", async () => {
    const rows = await rawDb.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_user`;
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgA.organizationId}, true)`;
      return tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${orgB.userId}`;
    });

    expect(rows).toHaveLength(0);
  });

  test("app_user scoped to org A can still read org A's own row", async () => {
    const rows = await rawDb.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_user`;
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgA.organizationId}, true)`;
      return tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${orgA.userId}`;
    });

    expect(rows).toHaveLength(1);
  });

  test("app_user with no org context set sees nothing (fails closed)", async () => {
    const rows = await rawDb.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_user`;
      // Deliberately not setting app.current_org_id.
      return tx.$queryRaw<{ id: string }[]>`SELECT id FROM organizations`;
    });

    expect(rows).toHaveLength(0);
  });

  test("app_user cannot INSERT a row claiming another org's id", async () => {
    const attempt = rawDb.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_user`;
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgA.organizationId}, true)`;
      const fakeId = crypto.randomUUID();
      const email = `rls-insert-${fakeId}@example.test`;
      // Session says org A, but the row claims org B — WITH CHECK must reject it.
      await tx.$executeRaw`
        INSERT INTO users (id, email, "organizationId", role, "createdAt")
        VALUES (${fakeId}, ${email}, ${orgB.organizationId}, 'MEMBER'::"MembershipRole", now())
      `;
    });

    await expect(attempt).rejects.toThrow(/row-level security/i);
  });

  test("the unscoped owner-role client bypasses RLS (why rawDb must stay out of route handlers)", async () => {
    const rows = await rawDb.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE id IN (${orgA.userId}, ${orgB.userId})
    `;
    expect(rows).toHaveLength(2);
  });
});
