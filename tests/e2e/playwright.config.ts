import { defineConfig } from "@playwright/test";

// Uses the locally installed Google Chrome (no browser download). Web :3000 is expected to run in http mode against the real API.
export default defineConfig({
  testDir: "./ui",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./src/pw-global-setup.ts",
  use: {
    baseURL: process.env.OH_WEB ?? "http://localhost:3000",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "off",
  },
  outputDir: "./.pw-results",
});
