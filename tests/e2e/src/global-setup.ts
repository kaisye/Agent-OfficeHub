import { spawn, type ChildProcess } from "node:child_process";
import { API, MCP, closeSql } from "./helpers.js";
import { cleanup } from "./cleanup.js";

const root = new URL("../../..", import.meta.url).pathname;
const children: ChildProcess[] = [];
const up = (url: string) => fetch(url).then((r) => r.ok).catch(() => false);

/** Starts the product servers (same code as `pnpm dev:api` / `dev:mcp`) when nothing answers on their ports. */
async function ensure(name: string, health: string, filter: string) {
  if (await up(health)) return;
  const c = spawn("pnpm", ["--filter", filter, "start"], { cwd: root, env: { ...process.env, DEV_LOGIN_ENABLED: "true" }, stdio: "ignore" });
  children.push(c);
  for (let i = 0; i < 60; i++) {
    if (await up(health)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} is not reachable at ${health} and could not be started (needs Postgres on :5433, migrated).`);
}

export default async function globalSetup() {
  await ensure("API", `${API}/health`, "@officehub/api");
  await ensure("MCP", MCP.replace(/\/mcp$/, "/health"), "@officehub/mcp");
  await cleanup().catch(() => {});
  return async () => {
    if (!process.env.OH_QA_KEEP) await cleanup().catch((e) => console.error("QA cleanup failed:", e.message));
    await closeSql();
    for (const c of children) c.kill("SIGTERM");
  };
}
