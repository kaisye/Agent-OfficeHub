/**
 * Request service — the single implementation of the request rules (used by the API AND the MCP gateway).
 * Every transition goes through canTransition() from @officehub/shared; body rules through bodyRequirement();
 * visibility through canSeeMessage() (contract C13).
 */
import {
  bodyRequirement,
  canSeeMessage,
  canTransition,
  type Actor,
  type EventType,
  type RequestAction,
} from "@officehub/shared";
import type { Row, Tx } from "./client.js";
import { withWorkspace } from "./client.js";
import { audit, actorOf, auditStandalone, emitEvent, isoReq, principalMemberId, requireScope, type Principal } from "./core.js";
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
  p.kind === "human" ? { kind: "human", memberId: p.memberId } : { kind: "agent", agentId: p.agentId, ownerId: p.ownerId };

export interface MessageView {
  id: string;
  requestId: string;
  kind: "ask" | "reply" | "follow_up";
  body: string;
  authoredBy: "human" | "agent";
  authorAgentId: string | null;
  sentById: string | null;
  editedBeforeSend: boolean;
  createdAt: string;
  /** extra (not in shared contract): who owns the text — needed to label untrusted content */
  authorMemberId: string;
}
export interface RequestView {
  id: string;
  workspaceId: string;
  askerId: string;
  receiverId: string;
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
  authorAgentId: r.author_agent_id,
  sentById: r.sent_by_id,
  editedBeforeSend: r.edited_before_send,
  createdAt: isoReq(r.created_at),
  authorMemberId: r.author_member_id,
});

export interface Viewer {
  id: string;
  /** admins may read (never act on) requests they are not part of; agents are never admin-viewers (least privilege) */
  admin: boolean;
}
export const viewerOf = (p: Principal): Viewer => ({ id: principalMemberId(p), admin: p.kind === "human" && p.role === "admin" });

/**
 * C13 visibility: a request is visible to asker, receiver and admins (read-only). Never visible: someone else's
 * unsent draft request. Message-level filtering uses shared canSeeMessage(). Returns null when invisible.
 */
export function viewFor(r: Row, msgs: Row[], viewer: Viewer, seenAt?: Date): RequestView | null {
  const party = viewer.id === r.asker_id || viewer.id === r.receiver_id;
  if (!party && !viewer.admin) return null;
  if (viewer.id !== r.asker_id && !msgs.some((m) => m.sent_by_id)) return null; // draft / cancelled-draft: asker only
  const ref = { askerId: r.asker_id as string, receiverId: r.receiver_id as string };
  const messages = msgs.filter((m) => canSeeMessage(ref, { kind: m.kind, sentById: m.sent_by_id }, viewer.id)).map(mapMessage);
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    askerId: r.asker_id,
    receiverId: r.receiver_id,
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

async function loadViews(tx: Tx, rows: Row[], viewer: Viewer): Promise<RequestView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const msgs = await tx`SELECT * FROM request_messages WHERE request_id = ANY(${ids}::uuid[]) ORDER BY created_at, id`;
  const by = new Map<string, Row[]>();
  for (const m of msgs) (by.get(m.request_id) ?? by.set(m.request_id, []).get(m.request_id)!).push(m);
  const seen = new Map<string, Date>(
    (await tx`SELECT request_id, seen_updated_at FROM inbox_reads WHERE member_id = ${viewer.id}`).map((s) => [s.request_id, new Date(s.seen_updated_at)]),
  );
  return rows.map((r) => viewFor(r, by.get(r.id) ?? [], viewer, seen.get(r.id))).filter((v): v is RequestView => !!v);
}

async function markSeen(tx: Tx, workspaceId: string, memberId: string, requestId: string, updatedAt: string | Date) {
  await tx`INSERT INTO inbox_reads (member_id, request_id, workspace_id, seen_updated_at) VALUES (${memberId}, ${requestId}, ${workspaceId}, ${updatedAt})
    ON CONFLICT (member_id, request_id) DO UPDATE SET seen_updated_at = GREATEST(inbox_reads.seen_updated_at, EXCLUDED.seen_updated_at)`;
}

/** All requests the principal may see (C13), newest first. */
export async function listRequests(p: Principal, opts: { openOnly?: boolean; taskId?: string } = {}): Promise<RequestView[]> {
  requireScope(p, "board:read");
  const viewer = viewerOf(p);
  return withWorkspace(p.workspaceId, async (tx) => {
    const rows = opts.taskId
      ? await tx`SELECT * FROM requests WHERE task_id = ${opts.taskId} ORDER BY created_at LIMIT 300`
      : opts.openOnly
      ? await tx`SELECT * FROM requests WHERE status NOT IN ('closed','cancelled') ORDER BY updated_at DESC LIMIT 300`
      : await tx`SELECT * FROM requests ORDER BY updated_at DESC LIMIT 300`;
    return loadViews(tx, rows, viewer);
  });
}

export async function getRequest(p: Principal, id: string): Promise<RequestView> {
  const viewer = viewerOf(p);
  return withWorkspace(p.workspaceId, async (tx) => {
    const rows = await tx`SELECT * FROM requests WHERE id = ${id}`;
    const v = (await loadViews(tx, rows, viewer))[0];
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

/** Human marks a request as read (web). */
export async function markRead(p: Principal, id: string): Promise<void> {
  const v = await getRequest(p, id);
  await withWorkspace(p.workspaceId, async (tx) => {
    await markSeen(tx, p.workspaceId, principalMemberId(p), id, v.updatedAt);
    await audit(tx, p.workspaceId, actorOf(p), { action: "request.read", targetKind: "request", targetId: id });
  });
}

export interface CreateRequestInput {
  receiverId: string;
  title: string;
  body: string;
  taskId: string | null;
  dueAt: string | null;
}

export const MAX_OPEN_DRAFTS_PER_AGENT = 10;

/** Creates a DRAFT only (status 'draft'). Sending is a separate human action. */
export async function createRequestDraft(p: Principal, input: CreateRequestInput): Promise<RequestView> {
  requireScope(p, "request:draft");
  await guardSecrets(p, "request", { title: input.title, body: input.body });
  const me = principalMemberId(p);
  if (input.receiverId === me) throw new HubError("validation_failed", "Cannot send a request to yourself", 400);
  return withWorkspace(p.workspaceId, async (tx) => {
    if (p.kind === "agent") {
      // Business matrix: at most MAX_OPEN_DRAFTS_PER_AGENT unsent drafts per agent. The advisory lock serializes concurrent creates.
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${p.agentId}, 7))`;
      const [c] = await tx`SELECT count(*)::int AS n FROM requests r WHERE r.status = 'draft' AND EXISTS (
        SELECT 1 FROM request_messages m WHERE m.request_id = r.id AND m.kind = 'ask' AND m.author_agent_id = ${p.agentId})`;
      if ((c?.n ?? 0) >= MAX_OPEN_DRAFTS_PER_AGENT)
        throw new HubError(
          "rate_limited",
          `Too many open drafts: this agent already has ${MAX_OPEN_DRAFTS_PER_AGENT} unsent draft requests. Ask your owner to send or cancel some in the Office Hub web app, then try again.`,
          429,
        );
    }
    const rcv = await tx`SELECT id FROM members WHERE id = ${input.receiverId}`;
    if (!rcv[0]) throw new HubError("validation_failed", "Receiver is not a member of this workspace", 400);
    if (input.taskId && !(await tx`SELECT id FROM tasks WHERE id = ${input.taskId}`)[0]) throw new HubError("validation_failed", "Unknown task", 400);
    const [r] = await tx`INSERT INTO requests (workspace_id, asker_id, receiver_id, task_id, title, status, due_at)
      VALUES (${p.workspaceId}, ${me}, ${input.receiverId}, ${input.taskId}, ${input.title}, 'draft', ${input.dueAt})
      RETURNING *`;
    const [m] = await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, author_agent_id)
      VALUES (${p.workspaceId}, ${r!.id}, 'ask', ${input.body}, ${p.kind}, ${me}, ${p.kind === "agent" ? p.agentId : null}) RETURNING id`;
    await markSeen(tx, p.workspaceId, me, r!.id, r!.updated_at);
    await emitEvent(tx, p, p.workspaceId, "request.created", { requestId: r!.id, messageId: m!.id }, { taskId: input.taskId });
    await audit(tx, p.workspaceId, actorOf(p), { action: "request.create", targetKind: "request", targetId: r!.id });
    return (await loadViews(tx, [r!], viewerOf(p)))[0]!;
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

export async function actOnRequest(p: Principal, requestId: string, action: RequestAction, body?: string): Promise<RequestView> {
  requireScope(p, "request:draft");
  await guardSecrets(p, "request_message", { body });
  const me = principalMemberId(p);
  const actor = actorFor(p);
  return withWorkspace(p.workspaceId, async (tx) => {
    const [r] = await tx`SELECT * FROM requests WHERE id = ${requestId} FOR UPDATE`;
    if (!r || (me !== r.asker_id && me !== r.receiver_id)) throw notFound("request");
    if (r.status === "draft" && me !== r.asker_id) throw notFound("request"); // C13: someone else's unsent draft does not exist for you
    // The ONLY place a status changes. Human-only steps are enforced here, not in the UI.
    const t = canTransition({ status: r.status, askerId: r.asker_id, receiverId: r.receiver_id }, action, actor);
    if (!t.ok) {
      await audit(tx, p.workspaceId, actorOf(p), { action: `request.${action}`, targetKind: "request", targetId: requestId, outcome: "denied", meta: { code: t.code } });
      throw new HubError(t.code, t.message, STATUS_FOR_ERROR[t.code]);
    }
    const need = bodyRequirement(action, r.status);
    if (need === "required" && !body) throw new HubError("validation_failed", `${action} requires a body`, 400);
    const text = need === "ignored" ? undefined : body;
    const agentId = p.kind === "agent" ? p.agentId : null;
    const unsent = async (kind: "ask" | "reply") =>
      (await tx`SELECT * FROM request_messages WHERE request_id = ${requestId} AND kind = ${kind} AND sent_by_id IS NULL ORDER BY created_at DESC LIMIT 1`)[0];
    let messageId: string | null = null;

    if (action === "send" || action === "send_reply") {
      const m = await unsent(action === "send" ? "ask" : "reply");
      if (m) {
        const edited = text !== undefined && text !== m.body;
        await tx`UPDATE request_messages SET sent_by_id = ${me}, body = ${edited ? text! : m.body},
          edited_before_send = ${m.edited_before_send || edited} WHERE id = ${m.id}`;
        messageId = m.id;
      } else {
        if (!text) throw new HubError("validation_failed", `${action} requires a body (no draft exists)`, 400);
        const [n] = await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, sent_by_id)
          VALUES (${p.workspaceId}, ${requestId}, ${action === "send" ? "ask" : "reply"}, ${text}, 'human', ${me}, ${me}) RETURNING id`;
        messageId = n!.id;
      }
    } else if (action === "draft_reply") {
      const m = await unsent("reply");
      if (m) {
        const humanEditedAgent = p.kind === "human" && m.authored_by === "agent" && text !== m.body;
        await tx`UPDATE request_messages SET body = ${text!}, authored_by = ${p.kind}, author_member_id = ${me}, author_agent_id = ${agentId},
          edited_before_send = ${m.edited_before_send || humanEditedAgent} WHERE id = ${m.id}`;
        messageId = m.id;
      } else {
        const [n] = await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, author_agent_id)
          VALUES (${p.workspaceId}, ${requestId}, 'reply', ${text!}, ${p.kind}, ${me}, ${agentId}) RETURNING id`;
        messageId = n!.id;
      }
    } else if (action === "follow_up") {
      const [n] = await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, sent_by_id)
        VALUES (${p.workspaceId}, ${requestId}, 'follow_up', ${text!}, 'human', ${me}, ${me}) RETURNING id`;
      messageId = n!.id;
    }

    const [u] = await tx`UPDATE requests SET status = ${t.to}, updated_at = now() WHERE id = ${requestId} RETURNING *`;
    await markSeen(tx, p.workspaceId, me, requestId, u!.updated_at); // my own action never makes it "unread" for me
    // EventRefs: ids only — never draft text
    await emitEvent(tx, p, p.workspaceId, ACTION_EVENT[action], { requestId, ...(messageId ? { messageId } : {}) }, { taskId: r.task_id });
    await audit(tx, p.workspaceId, actorOf(p), { action: `request.${action}`, targetKind: "request", targetId: requestId, meta: { from: r.status, to: t.to } });
    return (await loadViews(tx, [u!], viewerOf(p)))[0]!;
  });
}

export interface InboxItem extends RequestView {
  role: "asker" | "receiver";
  needsMyAction: boolean;
  unread: boolean;
}

/**
 * Open requests the caller is a party to, unread first. `actionOnly` keeps just those where the caller must act next
 * (receiver of sent/reply_drafted, asker of replied). `markRead` records them as read (agent hook / MCP list_inbox).
 */
export async function listInbox(
  p: Principal,
  opts: { unreadOnly?: boolean; markRead?: boolean; actionOnly?: boolean } = {},
): Promise<InboxItem[]> {
  requireScope(p, "inbox:read");
  const me = principalMemberId(p);
  return withWorkspace(p.workspaceId, async (tx) => {
    const rows = await tx`SELECT * FROM requests WHERE (asker_id = ${me} OR receiver_id = ${me})
      AND status NOT IN ('closed','cancelled') ORDER BY updated_at DESC LIMIT 100`;
    const views = await loadViews(tx, rows, { id: me, admin: false });
    let items: InboxItem[] = views.map((v) => {
      const role = v.askerId === me ? "asker" : "receiver";
      const needsMyAction =
        (role === "receiver" && (v.status === "sent" || v.status === "reply_drafted")) || (role === "asker" && v.status === "replied");
      return { ...v, role, needsMyAction, unread: v.unreadForViewer };
    });
    if (opts.actionOnly) items = items.filter((i) => i.needsMyAction);
    if (opts.unreadOnly) items = items.filter((i) => i.unread);
    items.sort((a, b) => Number(b.unread) - Number(a.unread)); // stable: keeps updated_at DESC within groups
    if (opts.markRead) for (const i of items.filter((x) => x.unread)) await markSeen(tx, p.workspaceId, me, i.id, i.updatedAt);
    return items;
  });
}
