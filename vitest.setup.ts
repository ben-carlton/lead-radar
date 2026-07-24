import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. The isolation suite runs real queries against " +
      "Postgres (RLS, the app_user role, real transactions) — point .env at " +
      "a dev/test database before running tests. Never point it at production.",
  );
}
