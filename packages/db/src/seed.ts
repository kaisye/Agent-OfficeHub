/**
 * Seed (v0.6): the "office-hub-dev" workspace — one orchestrator (Phong) and the six roles from docs/ARCHITECTURE.md,
 * each with one Claude Code agent token (printed once). Plus one draft so the approval queue is not empty.
 */
import { randomUUID } from "node:crypto";
import { DEFAULT_ROLES, type AgentScope } from "@officehub/shared";
import { adminSql } from "./client.js";
import { generateAgentToken } from "./tokens.js";

export interface SeedResult {
  source: string;
  workspaceId: string;
  slug: string;
  skipped: boolean;
  memberIds: Record<string, string>;
  roleIds: Record<string, string>;
  agentTokens: { label: string; owner: string; token: string }[];
}

export const SEED_SLUG = "office-hub-dev";
export const AGENT_SCOPES: AgentScope[] = ["board:read", "inbox:read", "status:write:self", "request:draft", "decision:read", "decision:propose"];

export async function seed(opts: { reset?: boolean } = {}): Promise<SeedResult> {
  const sql = adminSql();
  const base = { source: "built-in (v0.6 roles)", slug: SEED_SLUG };
  if (opts.reset) {
    // events / audit_log are append-only by trigger: pause them for an explicit reset only.
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE events DISABLE TRIGGER events_append_only`;
      await tx`ALTER TABLE audit_log DISABLE TRIGGER audit_append_only`;
      await tx`TRUNCATE workspaces CASCADE`;
      await tx`ALTER TABLE events ENABLE TRIGGER events_append_only`;
      await tx`ALTER TABLE audit_log ENABLE TRIGGER audit_append_only`;
    });
  } else {
    const ex = await sql`SELECT id FROM workspaces WHERE slug = ${SEED_SLUG}`;
    if (ex[0]) {
      const members = await sql`SELECT id, display_name FROM members WHERE workspace_id = ${ex[0].id}`;
      const roles = await sql`SELECT id, key FROM roles WHERE workspace_id = ${ex[0].id}`;
      return {
        ...base,
        workspaceId: ex[0].id,
        skipped: true,
        agentTokens: [],
        memberIds: Object.fromEntries(members.map((m) => [m.display_name, m.id])),
        roleIds: Object.fromEntries(roles.map((r) => [r.key, r.id])),
      };
    }
  }

  const ws = randomUUID();
  const phong = randomUUID();
  const roleIds: Record<string, string> = Object.fromEntries(DEFAULT_ROLES.map((r) => [r.key, randomUUID()]));
  const agentTokens: SeedResult["agentTokens"] = [];
  await sql.begin(async (tx) => {
    await tx`INSERT INTO workspaces (id, name, slug, connectors) VALUES (${ws}, 'Office Hub', ${SEED_SLUG}, '{github}'::text[])`;
    await tx`INSERT INTO members (id, workspace_id, display_name, github_login, role, areas, mascot)
      VALUES (${phong}, ${ws}, 'Phong', null, 'admin', '{}'::text[], ${tx.json({ buddy: "blu" } as never)})`;
    const agentIds: Record<string, string> = {};
    for (const r of DEFAULT_ROLES) {
      await tx`INSERT INTO roles (id, workspace_id, key, name, mission, owned_paths, handoff_path, wave, mascot)
        VALUES (${roleIds[r.key]!}, ${ws}, ${r.key}, ${r.name}, ${r.mission}, ${r.ownedPaths}::text[], ${r.handoffPath}, ${r.wave}, ${tx.json({ buddy: r.buddy } as never)})`;
      await tx`INSERT INTO status_cards (role_id, workspace_id, presence, doing, updated_by)
        VALUES (${roleIds[r.key]!}, ${ws}, 'idle', null, 'human')`;
      const t = generateAgentToken();
      const id = randomUUID();
      agentIds[r.key] = id;
      const label = `Claude Code · ${r.name}`;
      await tx`INSERT INTO agents (id, workspace_id, owner_id, role_id, kind, label, scopes, token_hash, token_prefix)
        VALUES (${id}, ${ws}, ${phong}, ${roleIds[r.key]!}, 'claude-code', ${label}, ${AGENT_SCOPES}::text[], ${t.hash}, ${t.prefix})`;
      agentTokens.push({ label, owner: r.name, token: t.token });
    }
    // One draft waiting in the approval queue: Frontend asks Backend.
    const req = randomUUID();
    await tx`INSERT INTO requests (id, workspace_id, asker_role_id, receiver_role_id, kind, title, status)
      VALUES (${req}, ${ws}, ${roleIds.frontend!}, ${roleIds.backend!}, 'question', 'Route nào trả hàng chờ duyệt cho màn hình chính?', 'draft')`;
    await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_role_id, author_agent_id)
      VALUES (${ws}, ${req}, 'ask', ${"Mình đang dựng màn \"Chờ duyệt\". Backend cho mình tên route, shape trả về và thứ tự sắp xếp nhé."}, 'agent', ${roleIds.frontend!}, ${agentIds.frontend!})`;
    await tx`INSERT INTO decisions (workspace_id, title, body, rationale, decided_by_id, role_ids)
      VALUES (${ws}, 'Office Hub v0.6: một người điều phối nhiều agent',
        'Sáu vai trò (Leader, Business, Design, Backend, Frontend, QA) là các agent. Mọi tin giữa hai agent đi qua người điều phối.',
        'Dự án do một người điều phối nhiều agent, không còn là nhóm nhiều người. Xem docs/redesign-orchestrator.md.',
        ${phong}, ${Object.values(roleIds)}::uuid[])`;
  });
  return { ...base, workspaceId: ws, skipped: false, memberIds: { Phong: phong }, roleIds, agentTokens };
}
