import "server-only";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";

// @neondatabase/serverless needs a WebSocket implementation outside of
// Edge/browser runtimes, where one exists natively.
neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as { rawDb?: PrismaClient };

function createRawClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

/**
 * The unscoped client. Sees every organization's data. Only for:
 *  - the Auth.js adapter (identity lookups happen before an org context exists)
 *  - signup (creating the very first Organization row for a new user)
 *  - admin/background-job code that has already validated its own org scoping
 *  - migrations/seed scripts
 *
 * Route handlers must never import this directly — use getTenantDb().
 */
export const rawDb = globalForPrisma.rawDb ?? createRawClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.rawDb = rawDb;

const MODELS_SCOPED_BY_ORG_ID = new Set([
  "User",
  "Membership",
  "Profile",
  "Source",
  "Article",
  "Run",
  "TokenUsage",
  "Lead",
]);

const READ_OR_WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

type QueryArgs = Record<string, unknown>;

/**
 * Rewrites query args so every read/write is confined to one organization,
 * regardless of what the caller passed in. This is the application-level
 * (layer 2) tenant guard; ALTER TABLE ... ROW LEVEL SECURITY (layer 1, see
 * the RLS migration) is the backstop if this layer has a bug.
 */
function scopeArgs(
  model: string,
  operation: string,
  args: QueryArgs,
  organizationId: string,
): QueryArgs {
  const scoped: QueryArgs = { ...args };

  if (model === "Organization") {
    // Organization IS the tenant boundary: every op may only ever touch its
    // own row, addressed by id instead of an organizationId column.
    if (READ_OR_WHERE_OPS.has(operation)) {
      const where = (scoped.where ?? {}) as QueryArgs;
      // A caller that doesn't specify where.id gets their own org (the
      // common case: "look up my organization"). A caller that explicitly
      // asks for a DIFFERENT org's id must get zero rows back, not their
      // own org silently substituted — id is forced to a value that can
      // never exist rather than just overwritten, so this fails closed the
      // same way every other model's cross-org lookup does.
      const requestedId = where.id;
      const idFilter =
        requestedId === undefined || requestedId === organizationId
          ? organizationId
          : "__unreachable_organization_id__";
      scoped.where = { ...where, id: idFilter };
      return scoped;
    }
    throw new Error(
      `getTenantDb(): Organization.${operation} is not allowed through the tenant-scoped client`,
    );
  }

  if (!MODELS_SCOPED_BY_ORG_ID.has(model)) {
    // Models with no organizationId column (Account, Session,
    // VerificationToken, ...) never go through the tenant client.
    throw new Error(
      `getTenantDb(): ${model} has no organizationId column and cannot be tenant-scoped`,
    );
  }

  switch (operation) {
    case "create":
      scoped.data = { ...(scoped.data as QueryArgs), organizationId };
      return scoped;
    case "createMany":
    case "createManyAndReturn": {
      const data = scoped.data;
      scoped.data = Array.isArray(data)
        ? data.map((row) => ({ ...(row as QueryArgs), organizationId }))
        : { ...(data as QueryArgs), organizationId };
      return scoped;
    }
    case "upsert":
      scoped.where = { ...(scoped.where as QueryArgs), organizationId };
      scoped.create = { ...(scoped.create as QueryArgs), organizationId };
      scoped.update = { ...(scoped.update as QueryArgs), organizationId };
      return scoped;
    default:
      if (READ_OR_WHERE_OPS.has(operation)) {
        scoped.where = { ...(scoped.where as QueryArgs), organizationId };
        return scoped;
      }
      throw new Error(
        `getTenantDb(): unrecognized operation ${model}.${operation}; add explicit scoping before allowing it`,
      );
  }
}

/**
 * Returns a Prisma client scoped to one organization. Every operation:
 *  1. rewrites its args to include organizationId (or id, for Organization
 *     itself), so a forgotten `where` clause can't leak across tenants
 *  2. runs inside a transaction that first does `SET LOCAL ROLE app_user`
 *     and sets `app.current_org_id`, so Postgres RLS policies enforce the
 *     same boundary independently, in case (1) has a bug
 *
 * Never import rawDb directly in route handlers — call getTenantDb(), which
 * reads organizationId off the session, or forOrganization() for background
 * jobs that already have it from the job payload.
 */
type AllOperationsArgs = {
  model: string;
  operation: string;
  args: QueryArgs;
};

export function forOrganization(organizationId: string): PrismaClient {
  return rawDb.$extends({
    name: "tenant-scoped",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args }: AllOperationsArgs) {
          const scopedArgs = scopeArgs(model, operation, args, organizationId);
          return rawDb.$transaction(async (tx) => {
            await tx.$executeRaw`SET LOCAL ROLE app_user`;
            await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
            const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const delegate = (tx as any)[delegateName];
            return delegate[operation](scopedArgs);
          });
        },
      },
    },
  }) as PrismaClient;
}

/**
 * Reads the current session and returns a client scoped to the caller's
 * organization. Throws if there is no session — callers are route handlers
 * that already sit behind auth middleware, so a missing session here means
 * a route forgot to check auth, not a legitimate anonymous case.
 */
export async function getTenantDb(): Promise<PrismaClient> {
  const { auth } = await import("@/auth");
  const session = await auth();
  const organizationId = session?.user?.organizationId;
  if (!organizationId) {
    throw new Error("getTenantDb() called without an authenticated session");
  }
  return forOrganization(organizationId);
}
