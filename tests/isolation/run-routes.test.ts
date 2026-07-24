import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { rawDb } from "@/lib/db";
import { GET as getRun } from "@/app/api/runs/[id]/route";
import { GET as listRuns, POST as createRun } from "@/app/api/runs/route";
import { cleanupOrgs, seedTwoOrgs, type TestOrg } from "./setup";

let mockSession: { user: { organizationId: string } } | null = null;

vi.mock("@/auth", () => ({
  auth: async () => mockSession,
}));

// inngest.send() would try to reach the Inngest dev/cloud endpoint, which
// isn't running under `vitest run` — these route tests only care about the
// tenant-isolation behavior (who can see/create what), not delivery, so the
// event send is mocked out.
vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn(async () => ({ ids: ["mock-event-id"] })) },
}));

describe("Run API routes: isolation", () => {
  let orgA: TestOrg;
  let orgB: TestOrg;
  let profileA: { id: string };
  let profileB: { id: string };
  let runA: { id: string };
  let runB: { id: string };

  beforeAll(async () => {
    ({ orgA, orgB } = await seedTwoOrgs());
    [profileA, profileB] = await Promise.all([
      rawDb.profile.create({
        data: { organizationId: orgA.organizationId, name: "A", productsSold: "x" },
      }),
      rawDb.profile.create({
        data: { organizationId: orgB.organizationId, name: "B", productsSold: "y" },
      }),
    ]);
    [runA, runB] = await Promise.all([
      rawDb.run.create({
        data: { organizationId: orgA.organizationId, profileId: profileA.id, mode: "BACKFILL" },
      }),
      rawDb.run.create({
        data: { organizationId: orgB.organizationId, profileId: profileB.id, mode: "BACKFILL" },
      }),
    ]);
  });

  afterAll(async () => {
    await cleanupOrgs(orgA, orgB);
  });

  function signInAs(org: TestOrg) {
    mockSession = { user: { organizationId: org.organizationId } };
  }

  test("GET /api/runs/:id is 404 for another org's run", async () => {
    signInAs(orgA);
    const res = await getRun(new Request(`http://test/api/runs/${runB.id}`), {
      params: Promise.resolve({ id: runB.id }),
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/runs only lists the caller's own org", async () => {
    signInAs(orgA);
    const res = await listRuns();
    const body = await res.json();
    const ids = body.runs.map((r: { id: string }) => r.id);
    expect(ids).toContain(runA.id);
    expect(ids).not.toContain(runB.id);
  });

  test("POST /api/runs rejects a profileId belonging to another org", async () => {
    signInAs(orgA);
    const res = await createRun(
      new Request("http://test/api/runs", {
        method: "POST",
        body: JSON.stringify({ profileId: profileB.id, mode: "BACKFILL", lookbackDays: 30 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("POST /api/runs succeeds with the caller's own profileId", async () => {
    signInAs(orgA);
    const res = await createRun(
      new Request("http://test/api/runs", {
        method: "POST",
        body: JSON.stringify({ profileId: profileA.id, mode: "BACKFILL", lookbackDays: 30 }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.run.organizationId).toBe(orgA.organizationId);
  });

  test("unauthenticated request gets 401, not a data leak", async () => {
    mockSession = null;
    const res = await getRun(new Request(`http://test/api/runs/${runA.id}`), {
      params: Promise.resolve({ id: runA.id }),
    });
    expect(res.status).toBe(401);
  });
});
