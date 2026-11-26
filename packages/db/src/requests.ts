/**
 * Request service — the single implementation of the request rules (used by the API AND the MCP gateway).
 * v0.6: the two sides are roles (or the human orchestrator, role id NULL); the orchestrator is the gate.
 * Every transition goes through canTransition() from @officehub/shared; body rules through bodyRequirement();
 * visibility through canSeeMessage() (contract C13).
 */
import {
  bodyRequirement,
  canAutoForward,
  canSeeMessage,
  canTransition,
  isParty,
  type Actor,
  type EventType,
  type RequestAction,
  type RequestKind,
  type Viewer,
} from "@officehub/shared";
import type { Row, Tx } from "./client.js";
import { withWorkspace } from "./client.js";
import { audit, actorOf, auditStandalone, emitEvent, isoReq, mapProposal, requireScope, type Principal } from "./core.js";
import { HubError, notFound } from "./errors.js";
import { scanFields, secretError } from "./secrets.js";

/** Reject (422) + audit WITHOUT content when a secret is found. Call BEFORE opening any write transaction. */
export async function guardSecrets(p: Principal, where: string, fields: Record<string, string | null | undefined>): Promise<void> {
  const hit = scanFields(fields);
  if (!hit) return;
  await auditStandalone(p.workspaceId, actorOf(p), {
    action: "secret.rejected",
    targetKind: where,
    outcome: "rejected",
    meta: { rule: hit.rule, field: hit.field },
  });
  throw secretError(hit);
}

export const actorFor = (p: Principal): Actor =>
  p.kind === "human" ? { kind: "human", memberId: p.memberId } : { kind: "agent", agentId: p.agentId, roleId: p.roleId };

export const viewerOf = (p: Principal): Viewer => (p.kind === "human" ? { kind: "human" } : { kind: "role", roleId: p.roleId });

export interface MessageView {
  id: string;
  requestId: string;
  kind: "ask" | "reply" | "follow_up";
  body: string;
  authoredBy: "human" | "agent";
  authorMemberId: string | null;
  authorRoleId: string | null;
  authorAgentId: string | null;
  sentById: string | null;
  editedBeforeSend: boolean;
  createdAt: string;
}
export interface RequestView {
  id: string;
  workspaceId: string;
  askerRoleId: string | null;
  receiverRoleId: string | null;
  kind: RequestKind;
  autoForwardReply: boolean;
  taskId: string | null;
  title: string;
  status: "draft" | "sent" | "reply_drafted" | "replied" | "closed" | "cancelled";
  dueAt: string | null;
  messages: MessageView[];
  unreadForViewer: boolean;
  createdAt: string;
  updatedAt: string;
}

const mapMessage = (r: Row): MessageView => ({
  id: r.id,
  requestId: r.request_id,
  kind: r.kind,
  body: r.body,
  authoredBy: r.authored_by,
  authorMemberId: r.author_member_id ?? null,
  authorRoleId: r.author_role_id ?? null,
  authorAgentId: r.author_agent_id ?? null,
  sentById: r.sent_by_id,
  editedBeforeSend: r.edited_before_send,
  createdAt: isoReq(r.created_at),
});

const sides = (r: Row) => ({ askerRoleId: (r.asker_role_id as string | null) ?? null, receiverRoleId: (r.receiver_role_id as string | null) ?? null });

/**
 * C13 visibility (v0.6). The orchestrator sees everything. A role sees requests it is a party to; an unsent draft
 * request exists only for its asking role. Message-level filtering uses shared canSeeMessage(). Null when invisible.
 */
export function viewFor(r: Row, msgs: Row[], viewer: Viewer, seenAt?: Date): RequestView | null {
  const ref = sides(r);
  if (!isParty(ref, viewer)) return null;
  if (viewer.kind === "role" && viewer.roleId !== ref.askerRoleId && !msgs.some((m) => m.sent_by_id)) return null;
  const messages = msgs.filter((m) => canSeeMessage(ref, { kind: m.kind, sentById: m.sent_by_id }, viewer)).map(mapMessage);
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    ...ref,
    kind: r.kind,
    autoForwardReply: r.auto_forward_reply,
    taskId: r.task_id,
    title: r.title,
    status: r.status,
    dueAt: r.due_at ? isoReq(r.due_at) : null,
    messages,
    unreadForViewer: !seenAt || seenAt.getTime() < new Date(r.updated_at).getTime(),
    createdAt: isoReq(r.created_at),
    updatedAt: isoReq(r.updated_at),
  };
}

/** Read markers: the orchestrator uses inbox_reads (per member), roles use role_reads (shared by all agents of the role). */
type Reader = { kind: "member"; id: string } | { kind: "role"; id: string };
const readerOf = (p: Principal): Reader => (p.kind === "human" ? { kind: "member", id: p.memberId } : { kind: "role", id: p.roleId });

async function seenMap(tx: Tx, reader: Reader): Promise<Map<string, Date>> {
  const rows =
    reader.kind === "member"
      ? await tx`SELECT request_id, seen_updated_at FROM inbox_reads WHERE member_id = ${reader.id}`
      : await tx`SELECT request_id, seen_updated_at FROM role_reads WHERE role_id = ${reader.id}`;
  return new Map(rows.map((s) => [s.request_id as string, new Date(s.seen_updated_at)]));
}

async function markSeen(tx: Tx, workspaceId: string, reader: Reader, requestId: string, updatedAt: string | Date) {
  if (reader.kind === "member")
    await tx`INSERT INTO inbox_reads (member_id, request_id, workspace_id, seen_updated_at) VALUES (${reader.id}, ${requestId}, ${workspaceId}, ${updatedAt})
      ON CONFLICT (member_id, request_id) DO UPDATE SET seen_updated_at = GREATEST(inbox_reads.seen_updated_at, EXCLUDED.seen_updated_at)`;
  else
    await tx`INSERT INTO role_reads (role_id, request_id, workspace_id, seen_updated_at) VALUES (${reader.id}, ${requestId}, ${workspaceId}, ${updatedAt})
      ON CONFLICT (role_id, request_id) DO UPDATE SET seen_updated_at = GREATEST(role_reads.seen_updated_at, EXCLUDED.seen_updated_at)`;
}

async function loadViews(tx: Tx, rows: Row[], p: Principal): Promise<RequestView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const msgs = await tx`SELECT * FROM request_messages WHERE request_id = ANY(${ids}::uuid[]) ORDER BY created_at, id`;
  const by = new Map<string, Row[]>();
  for (const m of msgs) (by.get(m.request_id) ?? by.set(m.request_id, []).get(m.request_id)!).push(m);
  const seen = await seenMap(tx, readerOf(p));
  const viewer = viewerOf(p);
  return rows.map((r) => viewFor(r, by.get(r.id) ?? [], viewer, seen.get(r.id))).filter((v): v is RequestView => !!v);
}

/** All requests the principal may see (C13), newest first. */
export async function listRequests(p: Principal, opts: { openOnly?: boolean; taskId?: string } = {}): Promise<RequestView[]> {
  requireScope(p, "board:read");
  return withWorkspace(p.workspaceId, async (tx) => {
    const rows = opts.taskId
      ? await tx`SELECT * FROM requests WHERE task_id = ${opts.taskId} ORDER BY created_at LIMIT 300`
      : opts.openOnly
      ? await tx`SELECT * FROM requests WHERE status NOT IN ('closed','cancelled') ORDER BY updated_at DESC LIMIT 300`
      : await tx`SELECT * FROM requests ORDER BY updated_at DESC LIMIT 300`;
    return loadViews(tx, rows, p);
  });
}

export async function getRequest(p: Principal, id: string): Promise<RequestView> {
  return withWorkspace(p.workspaceId, async (tx) => {
    const rows = await tx`SELECT * FROM requests WHERE id = ${id}`;
    const v = (await loadViews(tx, rows, p))[0];
    if (!v) throw notFound("request");
    return v;
  });
}

/** Used by SSE to drop change notifications about requests the viewer may not see. */
export async function canViewRequest(p: Principal, id: string): Promise<boolean> {
  try {
    await getRequest(p, id);
    return true;
  } catch {
    return false;
  }
}

/** The orchestrator marks a request as read (web). */
export async function markRead(p: Principal, id: string): Promise<void> {
  const v = await getRequest(p, id);
  await withWorkspace(p.workspaceId, async (tx) => {
    await markSeen(tx, p.workspaceId, readerOf(p), id, v.updatedAt);
    await audit(tx, p.workspaceId, actorOf(p), { action: "request.read", targetKind: "request", targetId: id });
  });
}

export interface CreateRequestInput {
  /** role id of the receiver; null = the orchestrator (agents only) */
  receiverRoleId: string | null;
  kind: RequestKind;
  title: string;
  body: string;
  taskId: string | null;
  dueAt: string | null;
}

export const MAX_OPEN_DRAFTS_PER_AGENT = 10;

/** Resolve an MCP "to" (role key or "orchestrator") to a receiver role id (null = orchestrator). */
export async function resolveReceiver(p: Principal, to: string): Promise<string | null> {
  if (to === "orchestrator") return null;
  const r = await withWorkspace(p.workspaceId, async (tx) => (await tx`SELECT id FROM roles WHERE key = ${to}`)[0]);
  if (!r) throw new HubError("validation_failed", `Unknown role "${to}". Call read_board to see the role keys.`, 400);
  return r.id as string;
}

/**
 * Agent: creates a DRAFT for the orchestrator to forward.
 * Orchestrator: assigns work to a role — the request is created already "sent" (the orchestrator wrote it).
 */
export async function createRequestDraft(p: Principal, input: CreateRequestInput): Promise<RequestView> {
  requireScope(p, "request:draft");
  await guardSecrets(p, "request", { title: input.title, body: input.body });
  const askerRoleId = p.kind === "agent" ? p.roleId : null;
  if (p.kind === "human" && input.receiverRoleId === null) throw new HubError("validation_failed", "Pick the role to assign this to", 400);
  if (input.receiverRoleId === askerRoleId) throw new HubError("validation_failed", "A role cannot send a request to itself", 400);
  return withWorkspace(p.workspaceId, async (tx) => {
    if (p.kind === "agent") {
      // At most MAX_OPEN_DRAFTS_PER_AGENT unsent drafts per agent. The advisory lock serializes concurrent creates.
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${p.agentId}, 7))`;
      const [c] = await tx`SELECT count(*)::int AS n FROM requests r WHERE r.status = 'draft' AND EXISTS (
        SELECT 1 FROM request_messages m WHERE m.request_id = r.id AND m.kind = 'ask' AND m.author_agent_id = ${p.agentId})`;
      if ((c?.n ?? 0) >= MAX_OPEN_DRAFTS_PER_AGENT)
        throw new HubError(
          "rate_limited",
          `Too many open drafts: this agent already has ${MAX_OPEN_DRAFTS_PER_AGENT} drafts waiting for the orchestrator. Wait until some are forwarded or cancelled.`,
          429,
        );
    }
    if (input.receiverRoleId) {
      const [rcv] = await tx`SELECT id, key FROM roles WHERE id = ${input.receiverRoleId}`;
      if (!rcv) throw new HubError("validation_failed", "Receiver is not a role of this workspace", 400);
      if (input.kind === "contract_change" && rcv.key !== "leader")
        throw new HubError("validation_failed", "contract_change requests go to the Leader role", 400);
    } else if (input.kind === "contract_change") throw new HubError("validation_failed", "contract_change requests go to the Leader role", 400);
    if (input.taskId && !(await tx`SELECT id FROM tasks WHERE id = ${input.taskId}`)[0]) throw new HubError("validation_failed", "Unknown task", 400);
    const status = p.kind === "human" ? "sent" : "draft";
    const [r] = await tx`INSERT INTO requests (workspace_id, asker_role_id, receiver_role_id, kind, task_id, title, status, due_at)
      VALUES (${p.workspaceId}, ${askerRoleId}, ${input.receiverRoleId}, ${input.kind}, ${input.taskId}, ${input.title}, ${status}, ${input.dueAt})
      RETURNING *`;
    const [m] =
      p.kind === "human"
        ? await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, sent_by_id)
            VALUES (${p.workspaceId}, ${r!.id}, 'ask', ${input.body}, 'human', ${p.memberId}, ${p.memberId}) RETURNING id`
        : await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_role_id, author_agent_id)
            VALUES (${p.workspaceId}, ${r!.id}, 'ask', ${input.body}, 'agent', ${p.roleId}, ${p.agentId}) RETURNING id`;
    await markSeen(tx, p.workspaceId, readerOf(p), r!.id, r!.updated_at);
    await emitEvent(tx, p, p.workspaceId, "request.created", { requestId: r!.id, messageId: m!.id }, { taskId: input.taskId });
    if (status === "sent") await emitEvent(tx, p, p.workspaceId, "request.sent", { requestId: r!.id, messageId: m!.id }, { taskId: input.taskId });
    await audit(tx, p.workspaceId, actorOf(p), { action: "request.create", targetKind: "request", targetId: r!.id, meta: { kind: input.kind, status } });
    return (await loadViews(tx, [r!], p))[0]!;
  });
}

const ACTION_EVENT: Record<RequestAction, EventType> = {
  send: "request.sent",
  draft_reply: "request.reply_drafted",
  send_reply: "request.replied",
  follow_up: "request.followed_up",
  accept: "request.closed",
  cancel: "request.cancelled",
};

const STATUS_FOR_ERROR = { invalid_state: 409, human_only: 403, wrong_side: 403 } as const;

export async function actOnRequest(
  p: Principal,
  requestId: string,
  action: RequestAction,
  body?: string,
  opts: { autoForwardReply?: boolean } = {},
): Promise<RequestView> {
  requireScope(p, "request:draft");
  await guardSecrets(p, "request_message", { body });
  const actor = actorFor(p);
  const viewer = viewerOf(p);
  return withWorkspace(p.workspaceId, async (tx) => {
    const [r] = await tx`SELECT * FROM requests WHERE id = ${requestId} FOR UPDATE`;
    if (!r || !isParty(sides(r), viewer)) throw notFound("request");
    // C13: another role's unsent draft does not exist for you
    if (r.status === "draft" && viewer.kind === "role" && viewer.roleId !== r.asker_role_id) throw notFound("request");
    // The ONLY place a status changes. Orchestrator-only steps are enforced here, not in the UI.
    const t = canTransition({ status: r.status, ...sides(r) }, action, actor);
    if (!t.ok) {
      await audit(tx, p.workspaceId, actorOf(p), { action: `request.${action}`, targetKind: "request", targetId: requestId, outcome: "denied", meta: { code: t.code } });
      throw new HubError(t.code, t.message, STATUS_FOR_ERROR[t.code]);
    }
    if (opts.autoForwardReply && (action !== "send" || !canAutoForward(r.kind)))
      throw new HubError("validation_failed", "autoForwardReply is only for forwarding a question", 400);
    const need = bodyRequirement(action, r.status);
    if (need === "required" && !body) throw new HubError("validation_failed", `${action} requires a body`, 400);
    const text = need === "ignored" ? undefined : body;
    const unsent = async (kind: "ask" | "reply") =>
      (await tx`SELECT * FROM request_messages WHERE request_id = ${requestId} AND kind = ${kind} AND sent_by_id IS NULL ORDER BY created_at DESC LIMIT 1`)[0];
    let messageId: string | null = null;
    let to = t.to;
    let autoForwarded = false;

    if (action === "send" || action === "send_reply") {
      const humanId = (p as Extract<Principal, { kind: "human" }>).memberId; // human-only (canTransition)
      const m = await unsent(action === "send" ? "ask" : "reply");
      if (m) {
        const edited = text !== undefined && text !== m.body;
        await tx`UPDATE request_messages SET sent_by_id = ${humanId}, body = ${edited ? text! : m.body},
          edited_before_send = ${m.edited_before_send || edited} WHERE id = ${m.id}`;
        messageId = m.id;
      } else {
        if (!text) throw new HubError("validation_failed", `${action} requires a body (no draft exists)`, 400);
        const [n] = await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, sent_by_id)
          VALUES (${p.workspaceId}, ${requestId}, ${action === "send" ? "ask" : "reply"}, ${text}, 'human', ${humanId}, ${humanId}) RETURNING id`;
        messageId = n!.id;
      }
    } else if (action === "draft_reply") {
      const m = await unsent("reply");
      const author =
        p.kind === "human"
          ? { by: "human", member: p.memberId, role: null, agent: null }
          : { by: "agent", member: null, role: p.roleId, agent: p.agentId };
      if (m) {
        const humanEditedAgent = p.kind === "human" && m.authored_by === "agent" && text !== m.body;
        await tx`UPDATE request_messages SET body = ${text!}, authored_by = ${author.by}, author_member_id = ${author.member},
          author_role_id = ${author.role}, author_agent_id = ${author.agent},
          edited_before_send = ${m.edited_before_send || humanEditedAgent} WHERE id = ${m.id}`;
        messageId = m.id;
      } else {
        const [n] = await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, author_role_id, author_agent_id)
          VALUES (${p.workspaceId}, ${requestId}, 'reply', ${text!}, ${author.by}, ${author.member}, ${author.role}, ${author.agent}) RETURNING id`;
        messageId = n!.id;
      }
      // Pre-approved at "send" (kind question only): the reply goes straight back, signed by the orchestrator who approved.
      if (p.kind === "agent" && r.auto_forward_reply && canAutoForward(r.kind)) {
        const [ask] = await tx`SELECT sent_by_id FROM request_messages WHERE request_id = ${requestId} AND kind = 'ask' AND sent_by_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`;
        if (ask?.sent_by_id) {
          await tx`UPDATE request_messages SET sent_by_id = ${ask.sent_by_id} WHERE id = ${messageId}`;
          to = "replied";
          autoForwarded = true;
        }
      }
    } else if (action === "follow_up") {
      const humanId = (p as Extract<Principal, { kind: "human" }>).memberId;
      const [n] = await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, sent_by_id)
        VALUES (${p.workspaceId}, ${requestId}, 'follow_up', ${text!}, 'human', ${humanId}, ${humanId}) RETURNING id`;
      messageId = n!.id;
    }

    const autoFlag = action === "send" ? !!opts.autoForwardReply : action === "follow_up" ? false : r.auto_forward_reply;
    const [u] = await tx`UPDATE requests SET status = ${to}, auto_forward_reply = ${autoFlag}, updated_at = now() WHERE id = ${requestId} RETURNING *`;
    await markSeen(tx, p.workspaceId, readerOf(p), requestId, u!.updated_at); // my own action never makes it "unread" for me
    // EventRefs: ids only — never draft text
    const refs = { requestId, ...(messageId ? { messageId } : {}) };
    await emitEvent(tx, p, p.workspaceId, ACTION_EVENT[action], refs, { taskId: r.task_id });
    if (autoForwarded) await emitEvent(tx, p, p.workspaceId, "request.replied", { ...refs, autoForwarded: true }, { taskId: r.task_id });
    await audit(tx, p.workspaceId, actorOf(p), {
      action: `request.${action}`,
      targetKind: "request",
      targetId: requestId,
      meta: { from: r.status, to, ...(action === "send" && opts.autoForwardReply ? { autoForwardReply: true } : {}), ...(autoForwarded ? { autoForwarded: true } : {}) },
    });
    return (await loadViews(tx, [u!], p))[0]!;
  });
}

export interface InboxItem extends RequestView {
  side: "asker" | "receiver";
  needsMyAction: boolean;
  unread: boolean;
}

/**
 * An agent's inbox: open requests its role is a party to, unread first. `actionOnly` keeps those where the role
 * must act next (receiver of sent/reply_drafted; asker of replied — read the answer). `markRead` records them as read.
 */
export async function listInbox(
  p: Principal,
  opts: { unreadOnly?: boolean; markRead?: boolean; actionOnly?: boolean } = {},
): Promise<InboxItem[]> {
  requireScope(p, "inbox:read");
  if (p.kind !== "agent") throw new HubError("validation_failed", "The orchestrator uses the approval queue", 400);
  return withWorkspace(p.workspaceId, async (tx) => {
    const rows = await tx`SELECT * FROM requests WHERE (asker_role_id = ${p.roleId} OR receiver_role_id = ${p.roleId})
      AND status NOT IN ('closed','cancelled') ORDER BY updated_at DESC LIMIT 100`;
    const views = await loadViews(tx, rows, p);
    let items: InboxItem[] = views.map((v) => {
      const side = v.askerRoleId === p.roleId ? "asker" : "receiver";
      const needsMyAction =
        (side === "receiver" && (v.status === "sent" || v.status === "reply_drafted")) || (side === "asker" && v.status === "replied");
      return { ...v, side, needsMyAction, unread: v.unreadForViewer };
    });
    if (opts.actionOnly) items = items.filter((i) => i.needsMyAction);
    if (opts.unreadOnly) items = items.filter((i) => i.unread);
    items.sort((a, b) => Number(b.unread) - Number(a.unread)); // stable: keeps updated_at DESC within groups
    if (opts.markRead) for (const i of items.filter((x) => x.unread)) await markSeen(tx, p.workspaceId, readerOf(p), i.id, i.updatedAt);
    return items;
  });
}

const URGENCY: Record<string, number> = { blocker: 0, contract_change: 1, review: 2, question: 3, handoff: 4 };

/**
 * The orchestrator's approval queue: drafts to forward, replies to forward, answers to close, requests addressed to
 * the orchestrator, and pending decision proposals. Blockers first, then oldest first.
 */
export async function approvalQueue(p: Principal) {
  if (p.kind !== "human") throw new HubError("human_only", "The approval queue is for the orchestrator", 403);
  return withWorkspace(p.workspaceId, async (tx) => {
    const rows = await tx`SELECT * FROM requests WHERE status IN ('draft','reply_drafted','replied')
      OR (status = 'sent' AND receiver_role_id IS NULL) ORDER BY updated_at ASC LIMIT 300`;
    const requests = (await loadViews(tx, rows, p)).sort((a, b) => (URGENCY[a.kind] ?? 9) - (URGENCY[b.kind] ?? 9));
    const proposals = (await tx`SELECT * FROM decision_proposals WHERE status = 'pending' ORDER BY created_at ASC`).map(mapProposal);
    return { requests, proposals };
  });
}
