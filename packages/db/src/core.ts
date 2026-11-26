/** Shared building blocks for services: principals, row mappers, audit, events. One implementation for API + MCP. */
import type { AgentScope, EventType } from "@officehub/shared";
import type { Row, Tx } from "./client.js";
import { appSql, withWorkspace } from "./client.js";
import { HubError } from "./errors.js";

export type Principal =
  | { kind: "human"; workspaceId: string; memberId: string; role: "admin" | "member" }
  | { kind: "agent"; workspaceId: string; agentId: string; ownerId: string; roleId: string; scopes: AgentScope[] };

/** The member whose identity the action is performed for (a human, or the agent's owner). */
export const principalMemberId = (p: Principal) => (p.kind === "human" ? p.memberId : p.ownerId);

export function requireScope(p: Principal, scope: AgentScope): void {
  if (p.kind === "agent" && !p.scopes.includes(scope)) {
    throw new HubError("insufficient_scope", `Agent token lacks scope ${scope}`, 403);
  }
}
export function requireHuman(p: Principal, what: string): asserts p is Extract<Principal, { kind: "human" }> {
  if (p.kind !== "human") throw new HubError("human_only", `${what} requires a signed-in human (agent tokens are rejected)`, 403);
}

const iso = (d: Date | string | null | undefined) => (d == null ? null : new Date(d).toISOString());
export const isoReq = (d: Date | string) => new Date(d).toISOString();

export const mapWorkspace = (r: Row) => ({ id: r.id, name: r.name, slug: r.slug, connectors: r.connectors, createdAt: isoReq(r.created_at) });
export const mapMember = (r: Row) => ({
  id: r.id,
  workspaceId: r.workspace_id,
  displayName: r.display_name,
  githubLogin: r.github_login,
  role: r.role,
  areas: r.areas,
  mascot: r.mascot,
});
export const mapRole = (r: Row) => ({
  id: r.id as string,
  workspaceId: r.workspace_id as string,
  key: r.key as string,
  name: r.name as string,
  mission: r.mission as string,
  ownedPaths: r.owned_paths as string[],
  handoffPath: (r.handoff_path as string | null) ?? null,
  wave: r.wave as number,
  mascot: r.mascot,
});
export const mapCard = (r: Row) => ({
  roleId: r.role_id,
  presence: r.presence,
  doing: r.doing,
  branch: r.branch,
  paths: r.paths,
  waitingOn: r.waiting_on,
  updatedAt: isoReq(r.updated_at),
  updatedBy: r.updated_by,
  updatedByAgentId: r.updated_by_agent_id ?? null,
});
export const mapTask = (r: Row) => ({
  id: r.id,
  workspaceId: r.workspace_id,
  source: r.source,
  externalUrl: r.external_url,
  externalKey: r.external_key,
  title: r.title,
  roleId: r.role_id ?? null,
  state: r.state,
  syncedAt: iso(r.synced_at),
});
export const mapEvent = (r: Row) => ({
  id: r.id,
  workspaceId: r.workspace_id,
  specversion: "1.0" as const,
  source: r.source,
  type: r.type,
  time: isoReq(r.time),
  taskId: r.task_id,
  actorMemberId: r.actor_member_id,
  actorAgentId: r.actor_agent_id,
  data: r.data,
});
export const mapDecision = (r: Row) => ({
  id: r.id,
  workspaceId: r.workspace_id,
  title: r.title,
  body: r.body,
  rationale: r.rationale,
  decidedById: r.decided_by_id,
  taskId: r.task_id,
  roleIds: (r.role_ids as string[] | null) ?? [],
  proposalId: r.proposal_id ?? null,
  decidedAt: isoReq(r.decided_at),
});
export const mapProposal = (r: Row) => ({
  id: r.id as string,
  workspaceId: r.workspace_id as string,
  roleId: r.role_id as string,
  agentId: r.agent_id as string,
  title: r.title as string,
  body: r.body as string,
  rationale: r.rationale as string,
  status: r.status as "pending" | "accepted" | "rejected",
  decisionId: (r.decision_id as string | null) ?? null,
  createdAt: isoReq(r.created_at),
  resolvedAt: iso(r.resolved_at),
});
export const mapAgent = (r: Row) => ({
  id: r.id,
  workspaceId: r.workspace_id,
  ownerId: r.owner_id,
  roleId: r.role_id,
  kind: r.kind,
  label: r.label,
  scopes: r.scopes,
  tokenPrefix: r.token_prefix,
  revokedAt: iso(r.revoked_at),
  lastSeenAt: iso(r.last_seen_at),
});

export interface AuditEntry {
  action: string;
  targetKind?: string;
  targetId?: string | null;
  outcome?: string;
  /** structural metadata only — never message bodies or rejected content */
  meta?: Record<string, unknown>;
  /** channel; defaults from the actor (human=web, agent=mcp, webhook, system) */
  via?: "web" | "api" | "mcp" | "webhook" | "system";
}
export type AuditActor =
  | { kind: "human"; memberId: string }
  | { kind: "agent"; agentId: string; memberId: string }
  | { kind: "system" | "webhook" };

export function actorOf(p: Principal): AuditActor {
  return p.kind === "human" ? { kind: "human", memberId: p.memberId } : { kind: "agent", agentId: p.agentId, memberId: p.ownerId };
}

/** Rule 7: append-only audit row (inside an existing workspace transaction). */
export async function audit(tx: Tx, workspaceId: string, actor: AuditActor, e: AuditEntry): Promise<void> {
  await tx`INSERT INTO audit_log (workspace_id, actor_kind, member_id, agent_id, action, target_kind, target_id, outcome, meta, via)
    VALUES (${workspaceId}, ${actor.kind}, ${"memberId" in actor ? actor.memberId : null}, ${"agentId" in actor ? actor.agentId : null},
            ${e.action}, ${e.targetKind ?? null}, ${e.targetId ?? null}, ${e.outcome ?? "ok"}, ${tx.json((e.meta ?? {}) as never)},
            ${e.via ?? (actor.kind === "human" ? "web" : actor.kind === "agent" ? "mcp" : actor.kind)})`;
}

/** Audit in its own transaction (reads, rejections, secret hits — where there is no domain tx). */
export async function auditStandalone(workspaceId: string, actor: AuditActor, e: AuditEntry): Promise<void> {
  await withWorkspace(workspaceId, (tx) => audit(tx, workspaceId, actor, e));
}

export async function emitEvent(
  tx: Tx,
  p: Principal | null,
  workspaceId: string,
  type: EventType,
  data: Record<string, unknown>,
  opts: { taskId?: string | null; source?: string; dedupeKey?: string | null; time?: Date } = {},
): Promise<string | null> {
  const rows = await tx`INSERT INTO events (workspace_id, source, type, time, task_id, actor_member_id, actor_agent_id, data, dedupe_key)
    VALUES (${workspaceId}, ${opts.source ?? "officehub"}, ${type}, ${opts.time ?? new Date()}, ${opts.taskId ?? null},
      ${p ? principalMemberId(p) : null}, ${p?.kind === "agent" ? p.agentId : null}, ${tx.json(data as never)}, ${opts.dedupeKey ?? null})
    ON CONFLICT DO NOTHING RETURNING id`;
  return (rows[0]?.id as string | undefined) ?? null;
}

export { appSql };
