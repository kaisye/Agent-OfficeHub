import { API, MCP, closeSql } from "./helpers.js";
import { cleanup, snapshotCards, type CardSnapshot } from "./cleanup.js";

let cards: CardSnapshot | undefined;

export async function setup() {
  for (const [name, url] of [["API", `${API}/health`], ["MCP", MCP.replace(/\/mcp$/, "/health")]] as const) {
    const ok = await fetch(url).then((r) => r.ok).catch(() => false);
    if (!ok) throw new Error(`${name} is not reachable at ${url}. Start the stack first (see docs/tech/README.md).`);
  }
  cards = await snapshotCards();
}

export async function teardown() {
  if (process.env.OH_QA_KEEP) return;
  await cleanup(cards).catch((e) => console.error("QA cleanup failed:", e.message));
  await closeSql();
}
