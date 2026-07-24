import NextAuth from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { rawDb } from "@/lib/db";
import type { MembershipRole } from "@/generated/prisma/client";

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 40);
}

async function uniqueOrgSlug(base: string) {
  const candidate = base || "org";
  const existing = await rawDb.organization.findUnique({ where: { slug: candidate } });
  if (!existing) return candidate;
  return `${candidate}-${crypto.randomUUID().slice(0, 6)}`;
}

/**
 * Signup creates an Organization automatically (non-negotiable per the
 * multi-tenant rules — every user belongs to an org, no exceptions). The
 * stock PrismaAdapter has no idea Organization exists, so it would try to
 * create a User row without organizationId and fail against our NOT NULL
 * constraint. Wrap createUser to create the org first, in the same place a
 * plain adapter would just create the user.
 */
function withAutoOrg(adapter: Adapter): Adapter {
  const createUser = adapter.createUser;
  if (!createUser) throw new Error("PrismaAdapter is missing createUser");

  return {
    ...adapter,
    async createUser(user) {
      const email = user.email;
      if (!email) throw new Error("Cannot create a user without an email");

      const localPart = email.split("@")[0] ?? "org";
      const slug = await uniqueOrgSlug(slugify(localPart));

      const organization = await rawDb.organization.create({
        data: { name: `${localPart}'s workspace`, slug },
      });

      const created = await rawDb.user.create({
        data: {
          email,
          name: user.name,
          image: user.image,
          emailVerified: user.emailVerified,
          organizationId: organization.id,
          role: "OWNER",
        },
      });

      return created as AdapterUser;
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: withAutoOrg(PrismaAdapter(rawDb)),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? "Lead Radar <onboarding@resend.dev>",
    }),
  ],
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in/check-email",
  },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.organizationId = (user as AdapterUser & { organizationId: string })
        .organizationId;
      session.user.role = (user as AdapterUser & { role: MembershipRole }).role;
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname.startsWith("/sign-in") ||
        pathname.startsWith("/api/auth") ||
        // Exact match only — Inngest's servers call this path directly and
        // verify requests themselves via INNGEST_SIGNING_KEY, not our
        // session cookie. Sibling routes like /api/inngest/trigger are NOT
        // covered by this and still require a session.
        pathname === "/api/inngest";
      return isPublic || Boolean(auth?.user);
    },
  },
});
