import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // These tests write and delete real rows over real Postgres
    // connections (RLS + role switching); run them one file at a time so
    // isolation tests don't clobber each other's session state.
    fileParallelism: false,
    testTimeout: 20000,
    include: ["tests/**/*.test.ts"],
  },
});
