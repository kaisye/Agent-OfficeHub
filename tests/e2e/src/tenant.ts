import { randomUUID } from "node:crypto";
import { createAgent, login, sha256, sql, type Session } from "./helpers.js";

export const WS2_SLUG = "qa-e2e-other";
const mascot = { species: "cat", palette: "ocean", accessory: null, seed: 1 };

export interface Tenant2 {
  workspaceId: string;
  slug: string;
  eve: Session; // admin
  mallory: Session; // member
  eveId: string;
  malloryId: string;
  agentToken: string; // Eve's agent, created straight in SQL (valid token, hashed like the product does)
}

/**
 * A second workspace created directly in SQL (superuser). It is created once and REUSED between runs: it accumulates
 * append-only audit rows, so it cannot be dropped without tampering with the audit log.
 */
export async function ensureTenant2(): Promise<Tenant2> {
  const db = sql();
  let [ws] = await db`SELECT id FROM workspaces WHERE slug = ${WS2_SLUG}`;
  if (!ws) [ws] = await db`INSERT INTO workspaces (name, slug) VALUES ('QA Other Co', ${WS2_SLUG}) RETURNING id`;
  const workspaceId = ws!.id as string;
  const ensureMember = async (name: string, role: string) => {
    const [m] = await db`SELECT id FROM members WHERE workspace_id = ${workspaceId} AND display_name = ${name}`;
    if (m) return m.id as string;
    const [n] = await db`INSERT INTO members (workspace_id, display_name, role, mascot, github_login) VALUES (${workspaceId}, ${name}, ${role}, ${db.json(mascot)}, ${"qa-" + name.toLowerCase()}) RETURNING id`;
    return n!.id as string;
  };
  const eveId = await ensureMember("Eve", "admin");
  const malloryId = await ensureMember("Mallory", "member");
  const token = "oh_agent_" + randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 10);
  await db`INSERT INTO agents (workspace_id, owner_id, kind, label, scopes, token_hash, token_prefix)
    VALUES (${workspaceId}, ${eveId}, 'codex', 'qa-e2e-eve', ${["board:read", "inbox:read", "status:write:self", "request:draft"]}, ${sha256(token)}, ${token.slice(9, 17)})`;
  return { workspaceId, slug: WS2_SLUG, eve: await login(eveId), mallory: await login(malloryId), eveId, malloryId, agentToken: token };
}

export { createAgent };
