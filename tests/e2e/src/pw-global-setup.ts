import { spawn, type ChildProcess } from "node:child_process";
import { API, MCP, WEB, closeSql } from "./helpers.js";
import { cleanup, snapshotCards, type CardSnapshot } from "./cleanup.js";

const root = new URL("../../..", import.meta.url).pathname;
const children: ChildProcess[] = [];
const up = (url: string) => fetch(url).then((r) => r.ok).catch(() => false);
let cards: CardSnapshot | undefined;

/** Starts a product server when nothing answers on its health URL. Detached, so teardown can kill the whole process group. */
async function ensure(name: string, health: string, args: string[], env: Record<string, string>, tries = 240) {
  if (await up(health)) return;
  const c = spawn("pnpm", args, { cwd: root, env: { ...process.env, ...env }, stdio: "ignore", detached: true });
  children.push(c);
  for (let i = 0; i < tries; i++) {
    if (await up(health)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} is not reachable at ${health} and could not be started.`);
}

/**
 * The UI specs run against the REAL stack: API :8787, MCP :8788 and the web in HTTP mode (never mock) on :3000.
 * Anything already listening is reused (the web origin must be :3000: the API only accepts WEB_ORIGIN for cookies + CSRF).
 * The web we start uses its own dist dir so it cannot corrupt a developer's `.next`.
 */
export default async function globalSetup() {
  await ensure("API", `${API}/health`, ["--filter", "@officehub/api", "start"], { DEV_LOGIN_ENABLED: "true" }, 60);
  await ensure("MCP", MCP.replace(/\/mcp$/, "/health"), ["--filter", "@officehub/mcp", "start"], {}, 60);
  await ensure(
    "web",
    `${WEB}/login`,
    ["--filter", "@officehub/web", "dev"],
    { NEXT_PUBLIC_API_MODE: "http", NEXT_PUBLIC_API_URL: API, NEXT_PUBLIC_MCP_URL: MCP, NEXT_PUBLIC_DEV_LOGIN: "1", NEXT_DIST_DIR: ".next-qa", NEXT_TELEMETRY_DISABLED: "1" },
  );
  // A web already running in mock mode would make every spec meaningless: fail loudly instead.
  const html = await fetch(`${WEB}/login`).then((r) => r.text());
  if (/officehub-demo/.test(html)) throw new Error(`Web at ${WEB} looks like mock mode (NEXT_PUBLIC_API_MODE=http is required).`);
  cards = await snapshotCards();
  await cleanup().catch(() => {});
  return async () => {
    if (!process.env.OH_QA_KEEP) await cleanup(cards).catch((e) => console.error("QA cleanup failed:", e.message));
    await closeSql();
    for (const c of children) {
      try {
        process.kill(-c.pid!, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  };
}
