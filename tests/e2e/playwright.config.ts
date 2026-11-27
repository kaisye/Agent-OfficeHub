import { defineConfig } from "@playwright/test";

// Real stack in HTTP mode (never the mock): API :8787, MCP :8788, web :3000. src/pw-global-setup.ts starts whatever is not listening yet.
// Uses the locally installed Google Chrome (no browser download).
export default defineConfig({
  testDir: "./ui",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./src/pw-global-setup.ts",
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.OH_WEB ?? "http://localhost:3000",
    channel: "chrome",
    headless: true,
    actionTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "off",
  },
  outputDir: "./.pw-results",
});
