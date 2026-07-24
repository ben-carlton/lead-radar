import NextAuth from "next-auth";
import type { Session } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { rawDb } from "@/lib/db";
import type { MembershipRole } from "@/generated/prisma/client";

export const AUTH_DISABLED = process.env.AUTH_DISABLED === "1";

if (AUTH_DISABLED) {
  // Impossible to miss in logs — this must never be true in a real deploy.
  console.warn(
    "\n⚠️  AUTH_DISABLED=1 — sign-in is bypassed, every request acts as a single dev org. " +
      "Never set this in production.\n",
  );
}

const DEV_ORG_SLUG = "dev-org";
const DEV_USER_EMAIL = "dev@localhost";

let devSessionPromise: Promise<Session> | null = null;

/**
 * Auto-creates (once, lazily) a single Organization + User for AUTH_DISABLED
 * mode and returns a Session-shaped object for it. Deliberately not a real
 * Auth.js Session row — this bypasses Auth.js entirely, not just the UI.
 */
async function getOrCreateDevSession(): Promise<Session> {
  if (!devSessionPromise) {
    devSessionPromise = (async () => {
      const organization =
        (await rawDb.organization.findUnique({ where: { slug: DEV_ORG_SLUG } })) ??
        (await rawDb.organization.create({
          data: { name: "Dev org (AUTH_DISABLED)", slug: DEV_ORG_SLUG },
        }));

      const user =
        (await rawDb.user.findUnique({ where: { email: DEV_USER_EMAIL } })) ??
        (await rawDb.user.create({
          data: {
            email: DEV_USER_EMAIL,
            name: "Dev user",
            organizationId: organization.id,
            role: "OWNER",
          },
        }));

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
          role: user.role,
        },
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
      } satisfies Session;
    })();
  }
  return devSessionPromise;
}

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

export const { handlers, auth: authMiddleware, signIn, signOut } = NextAuth({
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

/**
 * The one function everything else in the app calls to read the session
 * (server components, getTenantDb(), route handlers). `authMiddleware()`
 * called with no arguments does the same thing normally — this wrapper only
 * adds the AUTH_DISABLED short-circuit. proxy.ts uses authMiddleware
 * directly instead, since it needs the request/response middleware
 * behavior this wrapper doesn't implement.
 */
export async function auth(): Promise<Session | null> {
  if (AUTH_DISABLED) {
    // The real authMiddleware() reads cookies() internally, which is what
    // tells Next.js a page can't be statically prerendered. Our bypass
    // doesn't touch cookies, so without this, `next build` happily
    // prerenders "/" at build time against whatever DATABASE_URL exists
    // then — not a live request. headers() has the same "make this
    // request-dynamic" effect without needing an actual header value.
    const { headers } = await import("next/headers");
    await headers();
    return getOrCreateDevSession();
  }
  return authMiddleware();
}
