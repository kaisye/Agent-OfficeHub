/** Test fixtures (owner connection, bypasses RLS). Import from "@officehub/db/testing". Never used by servers. */
import { randomUUID } from "node:crypto";
import { DEFAULT_ROLES, type AgentScope } from "@officehub/shared";
import { adminSql } from "./client.js";
import { migrate } from "./migrate.js";
import { authenticateAgent } from "./auth.js";
import { createAgent } from "./services.js";
import type { Principal } from "./core.js";

export { migrate };

export type RoleKeyName = "leader" | "business" | "design" | "backend" | "frontend" | "qa";

export interface TestWorkspace {
  id: string;
  slug: string;
  /** member id of the human orchestrator */
  orchestrator: string;
  /** role key -> role id */
  roles: Record<RoleKeyName, string>;
  human: () => Extract<Principal, { kind: "human" }>;
}

export const ALL_AGENT_SCOPES: AgentScope[] = ["board:read", "inbox:read", "status:write:self", "request:draft", "decision:read", "decision:propose"];

/** A workspace with one orchestrator (admin) and the six default roles. */
export async function makeWorkspace(prefix = "t"): Promise<TestWorkspace> {
  const sql = adminSql();
  const id = randomUUID();
  const slug = `${prefix}-${id.slice(0, 8)}`;
  await sql`INSERT INTO workspaces (id, name, slug, connectors) VALUES (${id}, ${"WS " + slug}, ${slug}, ${["github"]}::text[])`;
  const orchestrator = randomUUID();
  await sql`INSERT INTO members (id, workspace_id, display_name, github_login, role, areas, mascot)
    VALUES (${orchestrator}, ${id}, 'Orchestrator', ${`orch-${id.slice(0, 6)}`}, 'admin', '{}'::text[], ${sql.json({ buddy: "blu" })})`;
  const roles = {} as Record<RoleKeyName, string>;
  for (const r of DEFAULT_ROLES) {
    const rid = randomUUID();
    roles[r.key as RoleKeyName] = rid;
    await sql`INSERT INTO roles (id, workspace_id, key, name, mission, owned_paths, handoff_path, wave, mascot)
      VALUES (${rid}, ${id}, ${r.key}, ${r.name}, ${r.mission}, ${r.ownedPaths}::text[], ${r.handoffPath}, ${r.wave}, ${sql.json({ buddy: r.buddy })})`;
  }
  return { id, slug, orchestrator, roles, human: () => ({ kind: "human", workspaceId: id, memberId: orchestrator, role: "admin" }) };
}

/** Issue an agent token for a role (as the orchestrator). */
export async function makeAgentToken(ws: TestWorkspace, role: RoleKeyName, scopes: AgentScope[] = ALL_AGENT_SCOPES) {
  return createAgent(ws.human(), { roleId: ws.roles[role], kind: "claude-code", label: `agent of ${role}`, scopes });
}

/** Issue a token and authenticate it: the agent principal as the servers would build it. */
export async function makeAgent(ws: TestWorkspace, role: RoleKeyName, scopes: AgentScope[] = ALL_AGENT_SCOPES) {
  const t = await makeAgentToken(ws, role, scopes);
  const a = await authenticateAgent(t.token);
  if (!a.ok) throw new Error("auth");
  return { ...t, principal: a.principal };
}
