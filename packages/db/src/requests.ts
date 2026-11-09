/**
 * Request service — the single implementation of the request rules (used by the API AND the MCP gateway).
 * Every transition goes through canTransition() from @officehub/shared.
 */
import { canTransition, type Actor, type EventType, type RequestAction } from "@officehub/shared";
import type { Row, Tx } from "./client.js";
import { withWorkspace } from "./client.js";
import {
  audit,
  actorOf,
  auditStandalone,
  emitEvent,
  isoReq,
  principalMemberId,
  requireScope,
  type Principal,
} from "./core.js";
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
  status: Row["status"];
  dueAt: string | null;
  messages: MessageView[];
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

/**
 * Visibility policy (see docs/tech/security.md):
 *  - a draft request is visible only to its asker;
 *  - messages are visible only to the asker and receiver (others see title + status, messages: []);
 *  - an UNSENT draft message is visible only to the side that is writing it (ask -> asker, reply -> receiver).
 */
export function viewFor(r: Row, msgs: Row[], viewerId: string): RequestView | null {
  const party = viewerId === r.asker_id || viewerId === r.receiver_id;
  if (r.status === "draft" && viewerId !== r.asker_id) return null;
  if (r.status === "cancelled" && viewerId !== r.asker_id) return null;
  const messages = party
    ? msgs
        .filter((m) => m.sent_by_id || (m.kind === "reply" ? viewerId === r.receiver_id : viewerId === r.asker_id))
        .map(mapMessage)
    : [];
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
    createdAt: isoReq(r.created_at),
    updatedAt: isoReq(r.updated_at),
  };
}

async function loadViews(tx: Tx, rows: Row[], viewerId: string): Promise<RequestView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const msgs = await tx`SELECT * FROM request_messages WHERE request_id = ANY(${ids}::uuid[]) ORDER BY created_at, id`;
  const by = new Map<string, Row[]>();
  for (const m of msgs) (by.get(m.request_id) ?? by.set(m.request_id, []).get(m.request_id)!).push(m);
  return rows.map((r) => viewFor(r, by.get(r.id) ?? [], viewerId)).filter((v): v is RequestView => !!v);
}

export async function listRequests(p: Principal, opts: { openOnly?: boolean } = {}): Promise<RequestView[]> {
  requireScope(p, "board:read");
  const me = principalMemberId(p);
  return withWorkspace(p.workspaceId, async (tx) => {
    const rows = opts.openOnly
      ? await tx`SELECT * FROM requests WHERE status NOT IN ('closed','cancelled') ORDER BY updated_at DESC LIMIT 200`
      : await tx`SELECT * FROM requests ORDER BY updated_at DESC LIMIT 200`;
    return loadViews(tx, rows, me);
  });
}

export async function getRequest(p: Principal, id: string): Promise<RequestView> {
  const me = principalMemberId(p);
  return withWorkspace(p.workspaceId, async (tx) => {
    const rows = await tx`SELECT * FROM requests WHERE id = ${id}`;
    const v = (await loadViews(tx, rows, me))[0];
    if (!v) throw notFound("request");
    return v;
  });
}

export interface CreateRequestInput {
  receiverId: string;
  title: string;
  body: string;
  taskId: string | null;
  dueAt: string | null;
}

/** Creates a DRAFT only (status 'draft'). Sending is a separate human action. */
export async function createRequestDraft(p: Principal, input: CreateRequestInput): Promise<RequestView> {
  requireScope(p, "request:draft");
  await guardSecrets(p, "request", { title: input.title, body: input.body });
  const me = principalMemberId(p);
  if (input.receiverId === me) throw new HubError("invalid_receiver", "Cannot send a request to yourself", 422);
  return withWorkspace(p.workspaceId, async (tx) => {
    const rcv = await tx`SELECT id FROM members WHERE id = ${input.receiverId}`;
    if (!rcv[0]) throw new HubError("invalid_receiver", "Receiver is not a member of this workspace", 422);
    if (input.taskId && !(await tx`SELECT id FROM tasks WHERE id = ${input.taskId}`)[0]) throw new HubError("invalid_task", "Unknown task", 422);
    const [r] = await tx`INSERT INTO requests (workspace_id, asker_id, receiver_id, task_id, title, status, due_at)
      VALUES (${p.workspaceId}, ${me}, ${input.receiverId}, ${input.taskId}, ${input.title}, 'draft', ${input.dueAt})
      RETURNING *`;
    await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, author_agent_id)
      VALUES (${p.workspaceId}, ${r!.id}, 'ask', ${input.body}, ${p.kind}, ${me}, ${p.kind === "agent" ? p.agentId : null})`;
    await emitEvent(tx, p, p.workspaceId, "request.created", { requestId: r!.id, receiverId: input.receiverId }, { taskId: input.taskId });
    await audit(tx, p.workspaceId, actorOf(p), { action: "request.create", targetKind: "request", targetId: r!.id });
    return (await loadViews(tx, [r!], me))[0]!;
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
    // The ONLY place a status changes. Human-only steps are enforced here, not in the UI.
    const t = canTransition({ status: r.status, askerId: r.asker_id, receiverId: r.receiver_id }, action, actor);
    if (!t.ok) {
      await audit(tx, p.workspaceId, actorOf(p), { action: `request.${action}`, targetKind: "request", targetId: requestId, outcome: t.code });
      throw new HubError(t.code, t.message, STATUS_FOR_ERROR[t.code]);
    }
    const authored = p.kind;
    const agentId = p.kind === "agent" ? p.agentId : null;
    const unsent = async (kind: "ask" | "reply") =>
      (await tx`SELECT * FROM request_messages WHERE request_id = ${requestId} AND kind = ${kind} AND sent_by_id IS NULL ORDER BY created_at DESC LIMIT 1`)[0];

    if (action === "send") {
      const m = await unsent("ask");
      if (!m) throw new HubError("no_draft", "No draft message to send", 409);
      const edited = body !== undefined && body !== m.body;
      await tx`UPDATE request_messages SET sent_by_id = ${me}, body = ${edited ? body! : m.body},
        edited_before_send = ${m.edited_before_send || edited} WHERE id = ${m.id}`;
    } else if (action === "draft_reply") {
      if (!body) throw new HubError("body_required", "A reply body is required", 422);
      const m = await unsent("reply");
      if (m) {
        const humanEditedAgent = p.kind === "human" && m.authored_by === "agent" && body !== m.body;
        await tx`UPDATE request_messages SET body = ${body}, authored_by = ${authored}, author_member_id = ${me}, author_agent_id = ${agentId},
          edited_before_send = ${m.edited_before_send || humanEditedAgent} WHERE id = ${m.id}`;
      } else {
        await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, author_agent_id)
          VALUES (${p.workspaceId}, ${requestId}, 'reply', ${body}, ${authored}, ${me}, ${agentId})`;
      }
    } else if (action === "send_reply") {
      const m = await unsent("reply");
      if (m) {
        const edited = body !== undefined && body !== m.body;
        await tx`UPDATE request_messages SET sent_by_id = ${me}, body = ${edited ? body! : m.body},
          edited_before_send = ${m.edited_before_send || edited} WHERE id = ${m.id}`;
      } else {
        if (!body) throw new HubError("body_required", "A reply body is required", 422);
        await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, sent_by_id)
          VALUES (${p.workspaceId}, ${requestId}, 'reply', ${body}, 'human', ${me}, ${me})`;
      }
    } else if (action === "follow_up") {
      if (!body) throw new HubError("body_required", "A follow-up body is required", 422);
      await tx`INSERT INTO request_messages (workspace_id, request_id, kind, body, authored_by, author_member_id, sent_by_id)
        VALUES (${p.workspaceId}, ${requestId}, 'follow_up', ${body}, 'human', ${me}, ${me})`;
    }

    const [u] = await tx`UPDATE requests SET status = ${t.to}, updated_at = now() WHERE id = ${requestId} RETURNING *`;
    await emitEvent(tx, p, p.workspaceId, ACTION_EVENT[action], { requestId, from: r.status, to: t.to }, { taskId: r.task_id });
    await audit(tx, p.workspaceId, actorOf(p), { action: `request.${action}`, targetKind: "request", targetId: requestId, meta: { from: r.status, to: t.to } });
    return (await loadViews(tx, [u!], me))[0]!;
  });
}

export interface InboxItem extends RequestView {
  role: "asker" | "receiver";
  needsMyAction: boolean;
  unread: boolean;
}

/** Requests that involve the caller's member and are still open. Optionally marks them seen. */
export async function listInbox(p: Principal, opts: { unreadOnly?: boolean; markSeen?: boolean } = {}): Promise<InboxItem[]> {
  requireScope(p, "inbox:read");
  const me = principalMemberId(p);
  return withWorkspace(p.workspaceId, async (tx) => {
    const rows = await tx`SELECT * FROM requests WHERE (asker_id = ${me} OR receiver_id = ${me})
      AND status NOT IN ('closed','cancelled') ORDER BY updated_at DESC LIMIT 100`;
    const views = await loadViews(tx, rows, me);
    const seen = new Map<string, Date>(
      (await tx`SELECT request_id, seen_updated_at FROM inbox_reads WHERE member_id = ${me}`).map((s) => [s.request_id, new Date(s.seen_updated_at)]),
    );
    let items: InboxItem[] = views.map((v) => {
      const role = v.askerId === me ? "asker" : "receiver";
      const needsMyAction =
        (role === "receiver" && (v.status === "sent" || v.status === "reply_drafted")) ||
        (role === "asker" && (v.status === "replied" || v.status === "draft"));
      const s = seen.get(v.id);
      return { ...v, role, needsMyAction, unread: !s || s.getTime() < new Date(v.updatedAt).getTime() };
    });
    if (opts.unreadOnly) items = items.filter((i) => i.unread);
    if (opts.markSeen) {
      for (const i of items.filter((x) => x.unread)) {
        await tx`INSERT INTO inbox_reads (member_id, request_id, workspace_id, seen_updated_at)
          VALUES (${me}, ${i.id}, ${p.workspaceId}, ${i.updatedAt})
          ON CONFLICT (member_id, request_id) DO UPDATE SET seen_updated_at = EXCLUDED.seen_updated_at`;
      }
    }
    return items;
  });
}
