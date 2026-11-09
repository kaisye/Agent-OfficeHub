import { defineConfig } from "vitest/config";

// Black-box suite against the LIVE stack (API :8787, MCP :8788, Postgres :5433). Files run sequentially:
// they share one seeded workspace and DB-backed rate-limit buckets.
export default defineConfig({
  test: {
    include: ["api/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    globalSetup: ["./src/global-setup.ts"],
    reporters: ["default"],
  },
});
