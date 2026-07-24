# Isolation test suite

Two orgs, seeded in every test file via `seedTwoOrgs()` (`setup.ts`). Every
test proves org A's access to org B's data comes back indistinguishable from
"doesn't exist" — never a 403, never a partial leak. That's the rule from
`PROJECT_BRIEF.md.txt`: **every endpoint returns 404, not 403, for another
org's records.**

Run with `npm test` (needs a real `DATABASE_URL` — see the repo root
[README.md](../../README.md)). Never point it at a database you care about:
these tests create and delete real organizations, users, and rows.

## What's covered so far

- `tenant-client.test.ts` — layer 2, the app-level guard in
  [src/lib/db.ts](../../src/lib/db.ts). `getTenantDb()`/`forOrganization()`
  reads/writes for `User`, `Membership`, `Organization`.
- `rls.test.ts` — layer 1, Postgres RLS itself, bypassing the app entirely
  (`SET LOCAL ROLE app_user` + `set_config('app.current_org_id', ...)`
  straight over `rawDb.$transaction`). Proves the database enforces the
  boundary even if layer 2 has a bug, and that it fails closed when no org
  context is set.

Layer 3 (an actual two-org 404-vs-403 test against a live HTTP route) isn't
here yet because there are no tenant-data routes yet — Profile CRUD is
`BUILD_ORDER.md.txt` step 3. See below for what to add once one exists.

## Extending this suite

**Every new tenant table needs a case in `tenant-client.test.ts`** (or a
sibling file) before its routes ship. Copy the `User` model's pattern:
`findMany` excludes the other org, `findUnique`/`update`/`delete` by the
other org's id come back null/throw, `create` can't be made to claim another
org's id even if the caller supplies one in the request body.

**Once a real route handler exists** (e.g. `GET /api/leads/:id`), add an
HTTP-level test alongside it:

```ts
test("GET /api/leads/:id returns 404 for another org's lead", async () => {
  const res = await fetch(`${baseUrl}/api/leads/${orgB.leadId}`, {
    headers: await sessionCookieFor(orgA.userId), // sign in as org A
  });
  expect(res.status).toBe(404); // not 403 — the record must not appear to exist
});
```

The two layers already tested here (tenant client + RLS) are exactly what
makes that assertion true; the HTTP test is there to catch a route handler
that bypassed `getTenantDb()` and imported `rawDb` directly.
