/** Authentication lookups. Pre-auth reads go through narrow SECURITY DEFINER functions (see migration 0002). */
import { randomBytes } from "node:crypto";
import type { AgentScope } from "@officehub/shared";
import { appSql, withWorkspace } from "./client.js";
import type { Row } from "./client.js";
import { mapMember, mapWorkspace, type Principal } from "./core.js";
import { hashToken } from "./tokens.js";

export async function workspaceBySlug(slug: string) {
  const rows = await appSql()`SELECT * FROM auth_workspace_by_slug(${slug})`;
  return rows[0] ? mapWorkspace(rows[0]) : null;
}

export async function memberById(id: string) {
  const rows = await appSql()`SELECT * FROM auth_member_by_id(${id})`;
  return rows[0] ? { ...mapMember(rows[0]) } : null;
}
export async function membersByGithub(login: string) {
  const rows = await appSql()`SELECT * FROM auth_members_by_github(${login})`;
  return rows.map(mapMember);
}

export type AgentAuth =
  | { ok: true; principal: Extract<Principal, { kind: "agent" }> }
  | { ok: false; reason: "unknown" | "revoked"; workspaceId?: string; agentId?: string; ownerId?: string };

/** Token -> agent principal. Revoked tokens are reported distinctly (so the caller can audit + 401). */
export async function authenticateAgent(token: string): Promise<AgentAuth> {
  const rows = await appSql()`SELECT * FROM auth_agent_by_hash(${hashToken(token)})`;
  const a: Row | undefined = rows[0];
  if (!a) return { ok: false, reason: "unknown" };
  if (a.revoked_at) return { ok: false, reason: "revoked", workspaceId: a.workspace_id, agentId: a.id, ownerId: a.owner_id };
  await withWorkspace(a.workspace_id, (tx) => tx`UPDATE agents SET last_seen_at = now() WHERE id = ${a.id}`);
  return {
    ok: true,
    principal: { kind: "agent", workspaceId: a.workspace_id, agentId: a.id, ownerId: a.owner_id, scopes: a.scopes as AgentScope[] },
  };
}

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

export async function createSession(workspaceId: string, memberId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await withWorkspace(
    workspaceId,
    (tx) => tx`INSERT INTO sessions (id_hash, workspace_id, member_id, expires_at) VALUES (${hashToken(token)}, ${workspaceId}, ${memberId}, ${expiresAt})`,
  );
  return { token, expiresAt };
}

export async function authenticateSession(token: string): Promise<Extract<Principal, { kind: "human" }> | null> {
  const rows = await appSql()`SELECT * FROM auth_session_by_hash(${hashToken(token)})`;
  const s = rows[0];
  if (!s) return null;
  const m = await withWorkspace(s.workspace_id, async (tx) => (await tx`SELECT id, role FROM members WHERE id = ${s.member_id}`)[0]);
  if (!m) return null;
  return { kind: "human", workspaceId: s.workspace_id, memberId: m.id, role: m.role };
}

export async function destroySession(workspaceId: string, token: string): Promise<void> {
  await withWorkspace(workspaceId, (tx) => tx`DELETE FROM sessions WHERE id_hash = ${hashToken(token)}`);
}
