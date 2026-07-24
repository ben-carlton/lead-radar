import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { rawDb } from "@/lib/db";
import { GET as listSources, POST as createSource } from "@/app/api/sources/route";
import {
  DELETE as deleteSource,
  GET as getSource,
  PATCH as patchSource,
} from "@/app/api/sources/[id]/route";
import { cleanupOrgs, seedTwoOrgs, type TestOrg } from "./setup";

let mockSession: { user: { organizationId: string } } | null = null;

vi.mock("@/auth", () => ({
  auth: async () => mockSession,
}));

describe("Source API routes: isolation", () => {
  let orgA: TestOrg;
  let orgB: TestOrg;
  let profileA: { id: string };
  let profileB: { id: string };
  let sourceA: { id: string };
  let sourceB: { id: string };

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
    [sourceA, sourceB] = await Promise.all([
      rawDb.source.create({
        data: {
          organizationId: orgA.organizationId,
          profileId: profileA.id,
          name: "Org A source",
          url: "https://a.example.test",
          type: "RSS",
          feedUrl: "https://a.example.test/feed",
        },
      }),
      rawDb.source.create({
        data: {
          organizationId: orgB.organizationId,
          profileId: profileB.id,
          name: "Org B source",
          url: "https://b.example.test",
          type: "RSS",
          feedUrl: "https://b.example.test/feed",
        },
      }),
    ]);
  });

  afterAll(async () => {
    await cleanupOrgs(orgA, orgB);
  });

  function signInAs(org: TestOrg) {
    mockSession = { user: { organizationId: org.organizationId } };
  }

  test("GET /api/sources/:id is 404 for another org's source", async () => {
    signInAs(orgA);
    const res = await getSource(new Request(`http://test/api/sources/${sourceB.id}`), {
      params: Promise.resolve({ id: sourceB.id }),
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/sources only lists the caller's own org", async () => {
    signInAs(orgA);
    const res = await listSources();
    const body = await res.json();
    const ids = body.sources.map((s: { id: string }) => s.id);
    expect(ids).toContain(sourceA.id);
    expect(ids).not.toContain(sourceB.id);
  });

  test("PATCH /api/sources/:id is 404 for another org's source and leaves it untouched", async () => {
    signInAs(orgA);
    const res = await patchSource(
      new Request(`http://test/api/sources/${sourceB.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "pwned" }),
      }),
      { params: Promise.resolve({ id: sourceB.id }) },
    );
    expect(res.status).toBe(404);

    const untouched = await rawDb.source.findUnique({ where: { id: sourceB.id } });
    expect(untouched?.name).not.toBe("pwned");
  });

  test("DELETE /api/sources/:id is 404 for another org's source and leaves it in place", async () => {
    signInAs(orgA);
    const res = await deleteSource(new Request(`http://test/api/sources/${sourceB.id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: sourceB.id }),
    });
    expect(res.status).toBe(404);

    const stillThere = await rawDb.source.findUnique({ where: { id: sourceB.id } });
    expect(stillThere).not.toBeNull();
  });

  test("POST /api/sources rejects a profileId belonging to another org", async () => {
    signInAs(orgA);
    const res = await createSource(
      new Request("http://test/api/sources", {
        method: "POST",
        body: JSON.stringify({
          profileId: profileB.id, // org B's profile, org A is signed in
          name: "Cross-org attempt",
          url: `https://cross-${crypto.randomUUID().slice(0, 8)}.example.test`,
          type: "RSS",
          feedUrl: "https://cross.example.test/feed",
        }),
      }),
    );
    expect(res.status).toBe(400);

    const created = await rawDb.source.findFirst({ where: { name: "Cross-org attempt" } });
    expect(created).toBeNull();
  });

  test("POST /api/sources succeeds with the caller's own profileId", async () => {
    signInAs(orgA);
    const res = await createSource(
      new Request("http://test/api/sources", {
        method: "POST",
        body: JSON.stringify({
          profileId: profileA.id,
          name: "Legit source",
          url: `https://legit-${crypto.randomUUID().slice(0, 8)}.example.test`,
          type: "RSS",
          feedUrl: "https://legit.example.test/feed",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.source.organizationId).toBe(orgA.organizationId);
  });

  test("unauthenticated request gets 401, not a data leak", async () => {
    mockSession = null;
    const res = await getSource(new Request(`http://test/api/sources/${sourceA.id}`), {
      params: Promise.resolve({ id: sourceA.id }),
    });
    expect(res.status).toBe(401);
  });
});
