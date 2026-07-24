# Lead Radar

See [PROJECT_BRIEF.md.txt](PROJECT_BRIEF.md.txt) for the product spec and
[BUILD_ORDER.md.txt](BUILD_ORDER.md.txt) for what's built and what's next.

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — a Neon Postgres pooled connection string
     ([console.neon.tech](https://console.neon.tech), Connection Details → Pooled connection)
   - `AUTH_SECRET` — already generated for local dev; regenerate for prod with
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — from a Google Cloud OAuth
     client ([console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)).
     Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - `AUTH_RESEND_KEY` — from [resend.com/api-keys](https://resend.com/api-keys)

2. Install dependencies and generate the Prisma client:

   ```bash
   npm install
   npx prisma generate
   ```

3. Apply migrations (creates tables, then the `app_user` role + RLS
   policies — see `prisma/migrations/*/migration.sql`):

   ```bash
   npx prisma migrate deploy
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

## Tenant isolation

Three independent layers, per `PROJECT_BRIEF.md.txt`:

1. **Postgres RLS** — every tenant table has a `tenant_isolation` policy
   keyed off the `app.current_org_id` session setting, enforced against a
   restricted `app_user` role (not the table owner). See
   `prisma/migrations/20260724120100_rls_policies/migration.sql`.
2. **Tenant-scoped Prisma client** — [src/lib/db.ts](src/lib/db.ts). Route
   handlers call `getTenantDb()`, never `rawDb` directly. It rewrites every
   query's `where`/`data` to the caller's `organizationId` and runs it as
   `app_user` inside a transaction, so RLS applies.
3. **Isolation test suite** — [tests/isolation](tests/isolation), run with
   `npm test`. Needs `DATABASE_URL` pointed at a real (dev/test, never
   production) Postgres — it creates and deletes real orgs/users. CI
   (`.github/workflows/isolation-tests.yml`) runs it against a throwaway Neon
   branch per run; needs `NEON_API_KEY` / `NEON_PROJECT_ID` repo secrets.

`rawDb` (the unscoped client) is reserved for the Auth.js adapter, signup
(creating the first Organization for a new user), and future admin/background
job code.

## Background jobs (Inngest)

`src/inngest/functions.ts` has one deliberately trivial function
(`hello-world`, triggered by `test/hello.world`) whose only purpose is to
prove the Inngest ↔ Next.js wiring before real jobs (crawl, classify, ...)
get built on it.

- **Local dev**: run `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`
  alongside `npm run dev`, with `INNGEST_DEV=1` set (already in `.env`).
  Verified end-to-end: the Dev Server UI at localhost:8288 shows runs
  completing when a `test/hello.world` event is sent.
- **Production**: not deployed yet. Needs a Vercel project and an Inngest
  Cloud account (app.inngest.com) connected to the deployed `/api/inngest`
  URL, with `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` set in Vercel and
  `INNGEST_DEV` **unset**. `BUILD_ORDER.md.txt` step 5 calls for proving this
  runs in production before building further background jobs on it —
  deliberately deferred for now; do this before step 6 depends on it running
  for real.

## Notes on this scaffold

- `create-next-app@latest` installed **Next.js 16.2.11** (React 19.2.4), not
  Next.js 15 as named in the brief — 15 has been superseded on npm since the
  brief was written. Flag if you want it pinned back to the 15.x line instead.
- Prisma 7's newer `prisma-client` generator is used (TS output to
  `src/generated/prisma/`, gitignored). Import from `@/generated/prisma/client`,
  not `@/generated/prisma`.
- `shadcn@latest` defaults to its new **Base UI** preset (`@base-ui/react`)
  rather than Radix — same component API, different underlying primitives.
