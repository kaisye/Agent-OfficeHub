/**
 * Request (Yêu cầu) and its state machine — the heart of the product.
 *
 * v0.6: the two sides are PARTIES — a role (its agents) or the human orchestrator (roleId = null).
 * The orchestrator is the approval gate for every step marked HUMAN:
 *   1. compose      draft          (orchestrator, or an agent of the asking role)      -> "draft"
 *   2. send         draft -> sent  (HUMAN — "Chuyển"; optionally autoForwardReply for kind "question")
 *   3. draft reply  sent -> reply_drafted (orchestrator, or an agent of the receiving role)
 *   4. send reply   reply_drafted|sent -> replied (HUMAN — skipped when autoForwardReply was approved at step 2)
 *   5a. accept      replied -> closed  (HUMAN)
 *   5b. follow up   replied -> sent    (HUMAN; goes back to the receiving role)
 * Plus: cancel (HUMAN, from draft|sent|reply_drafted) -> cancelled.
 * No path lets an agent's text reach another role without an orchestrator click (or its pre-approval at step 2).
 * Overdue requests are NEVER auto-closed.
 */
import { z } from "zod";
import { Id, IsoDate } from "./domain.js";

export const RequestStatus = z.enum([
  "draft",
  "sent",
  "reply_drafted",
  "replied",
  "closed",
  "cancelled",
]);
export type RequestStatus = z.infer<typeof RequestStatus>;

export const RequestAction = z.enum([
  "send",
  "draft_reply",
  "send_reply",
  "accept",
  "follow_up",
  "cancel",
]);
export type RequestAction = z.infer<typeof RequestAction>;

/** v0.6: what the request is for. contract_change always goes to the Leader role. */
export const RequestKind = z.enum(["question", "contract_change", "review", "handoff", "blocker"]);
export type RequestKind = z.infer<typeof RequestKind>;
/** Only plain questions may be approved in one click (reply auto-forwarded). Everything else needs both clicks. */
export const canAutoForward = (kind: RequestKind) => kind === "question";

/** The orchestrator acts as a human; an agent acts for its role. */
export type Actor = { kind: "human"; memberId: string } | { kind: "agent"; agentId: string; roleId: string };

/** Who reads a request: the orchestrator sees everything; a role sees requests it is a party to. */
export type Viewer = { kind: "human" } | { kind: "role"; roleId: string };

export const RequestMessage = z.object({
  id: Id,
  requestId: Id,
  kind: z.enum(["ask", "reply", "follow_up"]),
  body: z.string().min(1).max(8000),
  authoredBy: z.enum(["human", "agent"]), // who wrote the text
  /** Set when a human wrote it (the orchestrator). */
  authorMemberId: Id.nullable().optional(),
  /** v0.6: set when an agent wrote it — the role it spoke for. */
  authorRoleId: Id.nullable(),
  authorAgentId: Id.nullable(),
  sentById: Id.nullable(), // member who pressed send (null while still a draft)
  editedBeforeSend: z.boolean(), // for metric "gửi luôn" vs "sửa rồi gửi"
  createdAt: IsoDate,
});
export type RequestMessage = z.infer<typeof RequestMessage>;

export const Request = z.object({
  id: Id,
  workspaceId: Id,
  /** v0.6 parties: a role id, or null for the human orchestrator. Never both null; never equal. */
  askerRoleId: Id.nullable(),
  receiverRoleId: Id.nullable(),
  kind: RequestKind,
  /** Approved at "send": the receiver's reply draft is forwarded without a second click (kind "question" only). */
  autoForwardReply: z.boolean(),
  taskId: Id.nullable(),
  title: z.string().min(1).max(200),
  status: RequestStatus,
  dueAt: IsoDate.nullable(),
  messages: z.array(RequestMessage),
  /** Computed per viewer by the server (C8): true when it changed since the viewer last read it
   *  (via web markRead, or via the viewer's agent calling list_inbox). */
  unreadForViewer: z.boolean().optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Request = z.infer<typeof Request>;

type Rule = {
  from: readonly RequestStatus[];
  to: RequestStatus;
  humanOnly: boolean;
  /** which side may perform it */
  side: "asker" | "receiver";
};

export const TRANSITIONS: Record<RequestAction, Rule> = {
  send: { from: ["draft"], to: "sent", humanOnly: true, side: "asker" },
  draft_reply: { from: ["sent", "reply_drafted"], to: "reply_drafted", humanOnly: false, side: "receiver" },
  send_reply: { from: ["sent", "reply_drafted"], to: "replied", humanOnly: true, side: "receiver" },
  accept: { from: ["replied"], to: "closed", humanOnly: true, side: "asker" },
  follow_up: { from: ["replied"], to: "sent", humanOnly: true, side: "asker" },
  cancel: { from: ["draft", "sent", "reply_drafted"], to: "cancelled", humanOnly: true, side: "asker" },
};

export type TransitionResult =
  | { ok: true; to: RequestStatus }
  | { ok: false; code: "invalid_state" | "human_only" | "wrong_side"; message: string };

/**
 * Pure guard. Server MUST call this; UI uses it to show/hide buttons.
 * The orchestrator may perform any action (it is the gate for both sides). An agent may only perform the
 * non-human steps, and only on the side its role holds.
 */
export function canTransition(
  req: Pick<Request, "status" | "askerRoleId" | "receiverRoleId">,
  action: RequestAction,
  actor: Actor,
): TransitionResult {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(req.status)) {
    return { ok: false, code: "invalid_state", message: `Cannot ${action} from ${req.status}` };
  }
  if (rule.humanOnly && actor.kind !== "human") {
    return { ok: false, code: "human_only", message: `${action} requires the orchestrator's click` };
  }
  if (actor.kind === "agent") {
    const sideRole = rule.side === "asker" ? req.askerRoleId : req.receiverRoleId;
    if (sideRole !== actor.roleId) {
      return { ok: false, code: "wrong_side", message: `${action} is for the ${rule.side} role` };
    }
  }
  return { ok: true, to: rule.to };
}

/** True when the viewer's role is one side of the request (the orchestrator is a party to everything). */
export function isParty(req: Pick<Request, "askerRoleId" | "receiverRoleId">, viewer: Viewer): boolean {
  return viewer.kind === "human" || viewer.roleId === req.askerRoleId || viewer.roleId === req.receiverRoleId;
}

/**
 * Body rules per action (contract change C6):
 *  - draft_reply, follow_up: body REQUIRED.
 *  - send_reply: body required when there is no reply draft (status "sent"); optional from
 *    "reply_drafted" — if given and different from the draft, the draft is replaced and
 *    editedBeforeSend = true.
 *  - send: body optional — if given and different from the ask draft, editedBeforeSend = true.
 *  - accept, cancel: body ignored.
 */
export function bodyRequirement(
  action: RequestAction,
  status: RequestStatus,
): "required" | "optional" | "ignored" {
  switch (action) {
    case "draft_reply":
    case "follow_up":
      return "required";
    case "send_reply":
      return status === "sent" ? "required" : "optional";
    case "send":
      return "optional";
    default:
      return "ignored";
  }
}

/**
 * Visibility (C13, v0.6), enforced by the SERVER on every read (API, SSE, MCP):
 *  - The orchestrator sees every request and every draft (it approves them).
 *  - A role sees requests it is a party to. Unsent drafts are visible only to the side that owns them
 *    (ask/follow_up drafts → asker role; reply drafts → receiver role). The other role never sees unapproved text.
 */
export function canSeeMessage(
  req: Pick<Request, "askerRoleId" | "receiverRoleId">,
  msg: Pick<RequestMessage, "kind" | "sentById">,
  viewer: Viewer,
): boolean {
  if (viewer.kind === "human") return true;
  if (!isParty(req, viewer)) return false;
  if (msg.sentById !== null) return true;
  const owner = msg.kind === "reply" ? req.receiverRoleId : req.askerRoleId;
  return viewer.roleId === owner;
}

export const HUMAN_ONLY_ACTIONS =(Object.keys(TRANSITIONS) as RequestAction[]).filter(
  (a) => TRANSITIONS[a].humanOnly,
);
