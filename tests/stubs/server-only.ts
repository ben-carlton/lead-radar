// Test-only stand-in for the real "server-only" package (see package.json).
// The real package's default export condition throws unconditionally and
// only no-ops under the "react-server" bundler condition, which Vitest
// running in plain Node doesn't set. Aliased in vitest.config.ts so
// importing src/lib/db.ts under test doesn't crash on module load.
export {};
