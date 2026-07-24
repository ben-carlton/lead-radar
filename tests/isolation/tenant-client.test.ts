import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { forOrganization, rawDb } from "@/lib/db";
import { cleanupOrgs, seedTwoOrgs, type TestOrg } from "./setup";

/**
 * Layer 2: the tenant-scoped Prisma client (src/lib/db.ts). Every one of
 * these proves org A's client cannot see, read, write, or even distinguish
 * "exists in another org" from "doesn't exist" for org B's data — the
 * 404-not-403 requirement from PROJECT_BRIEF.md.txt, at the data-access
 * layer every future route handler goes through.
 *
 * Add a case here (or a sibling file) whenever a new tenant table is added
 * — see tests/isolation/README.md.
 */
describe("tenant-scoped client: isolation", () => {
  let orgA: TestOrg;
  let orgB: TestOrg;

  beforeAll(async () => {
    ({ orgA, orgB } = await seedTwoOrgs());
  });

  afterAll(async () => {
    await cleanupOrgs(orgA, orgB);
  });

  test("findMany scoped to org A never includes org B's rows", async () => {
    const db = forOrganization(orgA.organizationId);
    const users = await db.user.findMany();

    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => u.organizationId === orgA.organizationId)).toBe(true);
    expect(users.some((u) => u.id === orgB.userId)).toBe(false);
  });

  test("findUnique by another org's id returns null, not the record", async () => {
    const db = forOrganization(orgA.organizationId);
    const result = await db.user.findUnique({ where: { id: orgB.userId } });
    expect(result).toBeNull();
  });

  test("findUnique by own org's id still works", async () => {
    const db = forOrganization(orgA.organizationId);
    const result = await db.user.findUnique({ where: { id: orgA.userId } });
    expect(result?.id).toBe(orgA.userId);
  });

  test("update targeting another org's row fails instead of succeeding", async () => {
    const db = forOrganization(orgA.organizationId);
    await expect(
      db.user.update({ where: { id: orgB.userId }, data: { name: "pwned" } }),
    ).rejects.toThrow();

    const untouched = await rawDb.user.findUnique({ where: { id: orgB.userId } });
    expect(untouched?.name).not.toBe("pwned");
  });

  test("delete targeting another org's row fails instead of succeeding", async () => {
    const db = forOrganization(orgA.organizationId);
    await expect(db.user.delete({ where: { id: orgB.userId } })).rejects.toThrow();

    const stillThere = await rawDb.user.findUnique({ where: { id: orgB.userId } });
    expect(stillThere).not.toBeNull();
  });

  test("create ignores a caller-supplied organizationId for another org", async () => {
    const db = forOrganization(orgA.organizationId);
    const created = await db.user.create({
      data: {
        email: `spoof-${crypto.randomUUID().slice(0, 8)}@example.test`,
        // A route handler bug might forward attacker-controlled body data
        // that includes this — it must never win.
        organizationId: orgB.organizationId,
        role: "MEMBER",
      },
    });

    expect(created.organizationId).toBe(orgA.organizationId);
  });

  test("Organization model only exposes the caller's own row", async () => {
    const db = forOrganization(orgA.organizationId);

    const own = await db.organization.findUnique({ where: { id: orgA.organizationId } });
    expect(own?.id).toBe(orgA.organizationId);

    const other = await db.organization.findUnique({ where: { id: orgB.organizationId } });
    expect(other).toBeNull();
  });

  test("Membership rows are isolated the same way", async () => {
    const [membershipA, membershipB] = await Promise.all([
      rawDb.membership.create({
        data: { userId: orgA.userId, organizationId: orgA.organizationId, role: "OWNER" },
      }),
      rawDb.membership.create({
        data: { userId: orgB.userId, organizationId: orgB.organizationId, role: "OWNER" },
      }),
    ]);

    const db = forOrganization(orgA.organizationId);
    const memberships = await db.membership.findMany();

    expect(memberships.some((m) => m.id === membershipA.id)).toBe(true);
    expect(memberships.some((m) => m.id === membershipB.id)).toBe(false);

    const reachAcross = await db.membership.findUnique({ where: { id: membershipB.id } });
    expect(reachAcross).toBeNull();
  });

  test("models with no organizationId column refuse to be tenant-scoped", async () => {
    const db = forOrganization(orgA.organizationId);
    // Account/Session/VerificationToken must only ever go through rawDb.
    await expect(db.account.findMany()).rejects.toThrow(/organizationId/);
  });

  test("Profile rows are isolated the same way", async () => {
    const [profileA, profileB] = await Promise.all([
      rawDb.profile.create({
        data: {
          organizationId: orgA.organizationId,
          name: "Org A profile",
          productsSold: "Air compressors",
        },
      }),
      rawDb.profile.create({
        data: {
          organizationId: orgB.organizationId,
          name: "Org B profile",
          productsSold: "Forklifts",
        },
      }),
    ]);

    const db = forOrganization(orgA.organizationId);

    const profiles = await db.profile.findMany();
    expect(profiles.some((p) => p.id === profileA.id)).toBe(true);
    expect(profiles.some((p) => p.id === profileB.id)).toBe(false);

    expect(await db.profile.findUnique({ where: { id: profileB.id } })).toBeNull();

    await expect(
      db.profile.update({ where: { id: profileB.id }, data: { name: "pwned" } }),
    ).rejects.toThrow();

    const created = await db.profile.create({
      data: {
        organizationId: orgB.organizationId, // must be overridden, not honored
        name: "Spoofed profile",
        productsSold: "n/a",
      },
    });
    expect(created.organizationId).toBe(orgA.organizationId);
  });

  test("Source rows are isolated the same way", async () => {
    const [profileA, profileB] = await Promise.all([
      rawDb.profile.create({
        data: { organizationId: orgA.organizationId, name: "A", productsSold: "x" },
      }),
      rawDb.profile.create({
        data: { organizationId: orgB.organizationId, name: "B", productsSold: "y" },
      }),
    ]);

    const [sourceA, sourceB] = await Promise.all([
      rawDb.source.create({
        data: {
          organizationId: orgA.organizationId,
          profileId: profileA.id,
          name: "Org A source",
          url: `https://a-${crypto.randomUUID().slice(0, 8)}.example.test`,
          type: "RSS",
          feedUrl: "https://a.example.test/feed",
        },
      }),
      rawDb.source.create({
        data: {
          organizationId: orgB.organizationId,
          profileId: profileB.id,
          name: "Org B source",
          url: `https://b-${crypto.randomUUID().slice(0, 8)}.example.test`,
          type: "RSS",
          feedUrl: "https://b.example.test/feed",
        },
      }),
    ]);

    const db = forOrganization(orgA.organizationId);

    const sources = await db.source.findMany();
    expect(sources.some((s) => s.id === sourceA.id)).toBe(true);
    expect(sources.some((s) => s.id === sourceB.id)).toBe(false);

    expect(await db.source.findUnique({ where: { id: sourceB.id } })).toBeNull();

    await expect(
      db.source.update({ where: { id: sourceB.id }, data: { name: "pwned" } }),
    ).rejects.toThrow();

    // profileId is a plain foreign key — scopeArgs() doesn't (and can't)
    // rewrite it, so a Source spoofing another org's profileId would slip
    // through the tenant client alone. The route layer is what actually
    // rejects this (verified in source-routes.test.ts); this case just
    // documents that the data layer permits it, so nobody "fixes" the app
    // layer later by relying on this test.
    const crossOrgProfile = await db.source.create({
      data: {
        organizationId: orgB.organizationId, // overridden to orgA, as usual
        profileId: profileB.id, // NOT overridden — still points at org B
        name: "Cross-profile source",
        url: `https://c-${crypto.randomUUID().slice(0, 8)}.example.test`,
        type: "RSS",
        feedUrl: "https://c.example.test/feed",
      },
    });
    expect(crossOrgProfile.organizationId).toBe(orgA.organizationId);
    expect(crossOrgProfile.profileId).toBe(profileB.id);
  });
});
