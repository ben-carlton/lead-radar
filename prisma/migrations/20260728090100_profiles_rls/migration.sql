-- app_user already has SELECT/INSERT/UPDATE/DELETE on this table via the
-- ALTER DEFAULT PRIVILEGES set up in 20260724120100_rls_policies — this
-- migration only needs to turn RLS on and add the policy.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON profiles
  FOR ALL
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
