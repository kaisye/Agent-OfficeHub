import { WS_PREFIX, createAgent, createWorld, sql, type AgentCred, type Session, type World } from "./helpers.js";

export const WS2_SLUG = `${WS_PREFIX}-other`;

export interface Tenant2 {
  world: World;
  workspaceId: string;
  slug: string;
  /** the orchestrator of the second workspace (kept under the v0.5 name `eve` for the Playwright specs) */
  eve: Session;
  eveId: string;
  agent: AgentCred; // a backend-role agent of this workspace
  agentToken: string;
}

/**
 * A second workspace (v0.6: its own orchestrator + six roles) used for cross-tenant checks. It is created once and REUSED between
 * runs: it accumulates append-only audit rows, so it cannot be dropped. Tests that need a throwaway one call createWorld().
 */
export async function ensureTenant2(): Promise<Tenant2> {
  const [ws] = await sql()`SELECT id FROM workspaces WHERE slug = ${WS2_SLUG}`;
  let world: World;
  if (!ws) world = await createWorld("other", WS2_SLUG);
  else {
    const db = sql();
    const [m] = await db`SELECT id FROM members WHERE workspace_id = ${ws.id} AND role = 'admin' ORDER BY created_at LIMIT 1`;
    const rs = await db`SELECT id, key FROM roles WHERE workspace_id = ${ws.id}`;
    const { login } = await import("./helpers.js");
    world = { id: ws.id as string, slug: WS2_SLUG, orchestratorId: m!.id as string, roles: Object.fromEntries(rs.map((r) => [r.key, r.id])) as World["roles"], orch: await login(m!.id as string) };
  }
  const agent = await createAgent(world, "backend");
  return { world, workspaceId: world.id, slug: world.slug, eve: world.orch, eveId: world.orchestratorId, agent, agentToken: agent.token };
}

export { createAgent };
