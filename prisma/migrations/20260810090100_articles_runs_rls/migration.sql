-- app_user already has SELECT/INSERT/UPDATE/DELETE on these tables via the
-- ALTER DEFAULT PRIVILEGES set up in 20260724120100_rls_policies.

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON articles
  FOR ALL
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY tenant_isolation ON runs
  FOR ALL
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
