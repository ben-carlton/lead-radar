-- Row Level Security, layer 1 of 3 tenant-isolation layers (see README).
--
-- The app connects to Postgres as one owner role (whatever DATABASE_URL
-- authenticates as). Postgres never applies RLS to a table's owner, so RLS
-- alone does nothing unless queries run as a *different*, non-owner role.
--
-- app_user is that role. It owns nothing, has no LOGIN, and is only ever
-- reached via `SET LOCAL ROLE app_user` inside a transaction (see
-- src/lib/db.ts). The unscoped/raw Prisma client used by the Auth.js
-- adapter and by admin/migration scripts keeps running as the owner role
-- and is therefore unaffected by any of this.
--
-- Every tenant table's policy reads the session-local
-- `app.current_org_id` setting. Application code must set it before
-- issuing any query as app_user; if it's unset, current_setting(..., true)
-- returns NULL and every policy comparison fails closed (no rows visible).

CREATE ROLE app_user NOLOGIN;
GRANT app_user TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, users, memberships TO app_user;

-- Future tables (Profile, Source, Article, Lead, Run, TokenUsage, Schedule,
-- ...) automatically get the same grants the moment they're created by
-- whichever role owns this schema, so later migrations don't need to touch
-- this again.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- organizations: a tenant can see/touch only its own row.
CREATE POLICY tenant_isolation ON organizations
  FOR ALL
  USING (id = current_setting('app.current_org_id', true))
  WITH CHECK (id = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation ON users
  FOR ALL
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation ON memberships
  FOR ALL
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

-- accounts / sessions / verification_tokens are Auth.js's own tables and
-- are deliberately NOT enrolled in RLS: identity/session lookups happen
-- before an org context exists (that's what establishes it), so they can
-- only ever go through the raw/owner-role client, never through app_user.
