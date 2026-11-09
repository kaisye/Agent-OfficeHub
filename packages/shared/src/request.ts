/**
 * Request (Yêu cầu) and its state machine — the heart of the product.
 *
 * 6 steps, 4 human-only:
 *   1. compose      draft          (human or asker's agent)          -> "draft"
 *   2. send         draft -> sent  (HUMAN asker only)
 *   3. draft reply  sent -> reply_drafted (human or receiver's agent)
 *   4. send reply   reply_drafted|sent -> replied (HUMAN receiver only)
 *   5a. accept      replied -> closed  (HUMAN asker only)
 *   5b. follow up   replied -> sent    (HUMAN asker only; goes back to receiver's agent)
 * Plus: cancel (HUMAN asker, from draft|sent|reply_drafted) -> cancelled.
 * Overdue requests are NEVER auto-closed; both sides get reminded.
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

export type Actor =
  | { kind: "human"; memberId: string }
  | { kind: "agent"; agentId: string; ownerId: string };

export const RequestMessage = z.object({
  id: Id,
  requestId: Id,
  kind: z.enum(["ask", "reply", "follow_up"]),
  body: z.string().min(1).max(8000),
  authoredBy: z.enum(["human", "agent"]), // who wrote the text
  authorAgentId: Id.nullable(),
  sentById: Id.nullable(), // member who pressed send (null while still a draft)
  editedBeforeSend: z.boolean(), // for metric "gửi luôn" vs "sửa rồi gửi"
  createdAt: IsoDate,
});
export type RequestMessage = z.infer<typeof RequestMessage>;

export const Request = z.object({
  id: Id,
  workspaceId: Id,
  askerId: Id,
  receiverId: Id,
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

/** Pure guard. Server MUST call this; UI uses it to show/hide buttons. */
export function canTransition(
  req: Pick<Request, "status" | "askerId" | "receiverId">,
  action: RequestAction,
  actor: Actor,
): TransitionResult {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(req.status)) {
    return { ok: false, code: "invalid_state", message: `Cannot ${action} from ${req.status}` };
  }
  if (rule.humanOnly && actor.kind !== "human") {
    return { ok: false, code: "human_only", message: `${action} requires a human click` };
  }
  const actingMember = actor.kind === "human" ? actor.memberId : actor.ownerId;
  const sideMember = rule.side === "asker" ? req.askerId : req.receiverId;
  if (actingMember !== sideMember) {
    return { ok: false, code: "wrong_side", message: `${action} is for the ${rule.side}` };
  }
  return { ok: true, to: rule.to };
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
 * Visibility (contract change C13), enforced by the SERVER on every read (API, SSE, MCP):
 *  - A request is visible to its asker, its receiver, and workspace admins (admins: read-only).
 *  - Unsent drafts (messages with sentById === null) are visible ONLY to the side that owns them
 *    (asker's ask/follow_up drafts → asker; reply drafts → receiver). Admins do not see drafts.
 */
export function canSeeMessage(
  req: Pick<Request, "askerId" | "receiverId">,
  msg: Pick<RequestMessage, "kind" | "sentById">,
  viewerId: string,
): boolean {
  if (viewerId !== req.askerId && viewerId !== req.receiverId) {
    return msg.sentById !== null; // admins: sent messages only (request-level check happens upstream)
  }
  if (msg.sentById !== null) return true;
  const owner = msg.kind === "reply" ? req.receiverId : req.askerId;
  return viewerId === owner;
}

export const HUMAN_ONLY_ACTIONS =(Object.keys(TRANSITIONS) as RequestAction[]).filter(
  (a) => TRANSITIONS[a].humanOnly,
);
