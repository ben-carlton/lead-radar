import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { rawDb } from "@/lib/db";
import { GET as listProfiles, POST as createProfile } from "@/app/api/profiles/route";
import {
  DELETE as deleteProfile,
  GET as getProfile,
  PATCH as patchProfile,
} from "@/app/api/profiles/[id]/route";
import { cleanupOrgs, seedTwoOrgs, type TestOrg } from "./setup";

/**
 * Layer 3: the actual route handlers, called directly (no HTTP server
 * needed — App Router route handlers are plain `(Request) => Response`
 * functions). auth() is mocked so we control which org is "logged in"
 * without a real Auth.js session. This is the HTTP-level 404-not-403 check
 * documented in tests/isolation/README.md, now that a real tenant route
 * exists.
 */
let mockSession: { user: { organizationId: string } } | null = null;

vi.mock("@/auth", () => ({
  auth: async () => mockSession,
}));

describe("Profile API routes: isolation", () => {
  let orgA: TestOrg;
  let orgB: TestOrg;
  let profileA: { id: string };
  let profileB: { id: string };

  beforeAll(async () => {
    ({ orgA, orgB } = await seedTwoOrgs());
    [profileA, profileB] = await Promise.all([
      rawDb.profile.create({
        data: { organizationId: orgA.organizationId, name: "Org A profile", productsSold: "x" },
      }),
      rawDb.profile.create({
        data: { organizationId: orgB.organizationId, name: "Org B profile", productsSold: "y" },
      }),
    ]);
  });

  afterAll(async () => {
    await cleanupOrgs(orgA, orgB);
  });

  function signInAs(org: TestOrg) {
    mockSession = { user: { organizationId: org.organizationId } };
  }

  test("GET /api/profiles/:id is 404 for another org's profile", async () => {
    signInAs(orgA);
    const res = await getProfile(new Request(`http://test/api/profiles/${profileB.id}`), {
      params: Promise.resolve({ id: profileB.id }),
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/profiles/:id is 200 for the caller's own profile", async () => {
    signInAs(orgA);
    const res = await getProfile(new Request(`http://test/api/profiles/${profileA.id}`), {
      params: Promise.resolve({ id: profileA.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.id).toBe(profileA.id);
  });

  test("PATCH /api/profiles/:id is 404 for another org's profile and leaves it untouched", async () => {
    signInAs(orgA);
    const res = await patchProfile(
      new Request(`http://test/api/profiles/${profileB.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "pwned" }),
      }),
      { params: Promise.resolve({ id: profileB.id }) },
    );
    expect(res.status).toBe(404);

    const untouched = await rawDb.profile.findUnique({ where: { id: profileB.id } });
    expect(untouched?.name).not.toBe("pwned");
  });

  test("DELETE /api/profiles/:id is 404 for another org's profile and leaves it in place", async () => {
    signInAs(orgA);
    const res = await deleteProfile(
      new Request(`http://test/api/profiles/${profileB.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: profileB.id }) },
    );
    expect(res.status).toBe(404);

    const stillThere = await rawDb.profile.findUnique({ where: { id: profileB.id } });
    expect(stillThere).not.toBeNull();
  });

  test("GET /api/profiles only lists the caller's own org", async () => {
    signInAs(orgA);
    const res = await listProfiles();
    const body = await res.json();
    const ids = body.profiles.map((p: { id: string }) => p.id);
    expect(ids).toContain(profileA.id);
    expect(ids).not.toContain(profileB.id);
  });

  test("POST /api/profiles ignores a spoofed organizationId in the body", async () => {
    signInAs(orgA);
    const res = await createProfile(
      new Request("http://test/api/profiles", {
        method: "POST",
        body: JSON.stringify({
          name: "Spoofed",
          productsSold: "n/a",
          organizationId: orgB.organizationId,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.profile.organizationId).toBe(orgA.organizationId);
  });

  test("unauthenticated request gets 401, not a data leak", async () => {
    mockSession = null;
    const res = await getProfile(new Request(`http://test/api/profiles/${profileA.id}`), {
      params: Promise.resolve({ id: profileA.id }),
    });
    expect(res.status).toBe(401);
  });
});
