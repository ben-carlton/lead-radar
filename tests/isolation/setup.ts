import { rawDb } from "@/lib/db";

export type TestOrg = {
  organizationId: string;
  userId: string;
  slug: string;
};

/**
 * Seeding necessarily spans tenants, so it goes through rawDb (the unscoped
 * client) — the same escape hatch signup uses to create the first
 * Organization for a new user.
 */
async function createOrgWithUser(label: string): Promise<TestOrg> {
  const slug = `test-isolation-${label}-${crypto.randomUUID().slice(0, 8)}`;

  const organization = await rawDb.organization.create({
    data: { name: `Isolation Test Org ${label}`, slug },
  });

  const user = await rawDb.user.create({
    data: {
      email: `${slug}@example.test`,
      organizationId: organization.id,
      role: "OWNER",
    },
  });

  return { organizationId: organization.id, userId: user.id, slug };
}

/** Two orgs, each with one user, for cross-tenant leak tests. */
export async function seedTwoOrgs(): Promise<{ orgA: TestOrg; orgB: TestOrg }> {
  const [orgA, orgB] = await Promise.all([createOrgWithUser("a"), createOrgWithUser("b")]);
  return { orgA, orgB };
}

/** Organization has onDelete: Cascade to User/Membership, so this is enough. */
export async function cleanupOrgs(...orgs: (TestOrg | undefined)[]) {
  await Promise.all(
    orgs.filter((org): org is TestOrg => Boolean(org)).map((org) =>
      rawDb.organization.delete({ where: { id: org.organizationId } }).catch(() => {
        // already gone — fine, tests that assert deletion failed leave rows behind
      }),
    ),
  );
}
