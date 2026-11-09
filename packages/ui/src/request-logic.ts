import type { Actor, Request, RequestAction, RequestStatus } from "@officehub/shared";
import { canTransition } from "@officehub/shared";

// Pure logic and Vietnamese labels for requests. No React, no "use client": safe to import from server components.

/** Neutral labels (no viewer context). See docs/business/request-flow.md §6 for per-viewer labels. */
export const REQUEST_STATUS_LABEL_VI: Record<RequestStatus, string> = {
  draft: "Bản nháp",
  sent: "Đã gửi",
  reply_drafted: "Nháp trả lời",
  replied: "Đã có trả lời",
  closed: "Đã xong",
  cancelled: "Đã hủy",
};

/** Label + one-line helper, per viewer side (request-flow.md §6). */
export function requestStatusText(
  request: Pick<Request, "status" | "messages">,
  side: "asker" | "receiver" | "observer",
  otherName: string,
): { label: string; help: string } {
  const lastDraftByAgent = [...request.messages].reverse().find((m) => m.sentById === null)?.authoredBy === "agent";
  switch (request.status) {
    case "draft":
      return lastDraftByAgent
        ? { label: "Nháp từ agent", help: "Agent đã soạn giúp bạn; xem lại rồi bấm Gửi." }
        : { label: "Bản nháp", help: "Chưa gửi, chỉ mình bạn thấy." };
    case "sent":
      return side === "receiver"
        ? { label: "Chờ bạn trả lời", help: `${otherName} đang chờ bạn; soạn hoặc nhờ agent soạn nháp.` }
        : { label: "Đã gửi", help: `Đang chờ ${otherName} trả lời.` };
    case "reply_drafted":
      return side === "receiver"
        ? { label: "Nháp trả lời", help: "Đã có nháp, xem lại rồi bấm Gửi trả lời." }
        : { label: "Đã gửi", help: `Đang chờ ${otherName} trả lời.` };
    case "replied":
      return side === "asker"
        ? { label: "Đã có trả lời", help: "Chấp nhận để đóng, hoặc hỏi lại nếu chưa đủ." }
        : { label: "Đã trả lời", help: `Đang chờ ${otherName} chấp nhận.` };
    case "closed":
      return { label: "Đã xong", help: "Yêu cầu đã được chấp nhận." };
    case "cancelled":
      return { label: "Đã hủy", help: "Người hỏi đã hủy; không cần trả lời nữa." };
  }
}

export const ACTION_LABEL_VI: Record<RequestAction, string> = {
  send: "Gửi",
  draft_reply: "Soạn trả lời",
  send_reply: "Gửi trả lời",
  accept: "Chấp nhận",
  follow_up: "Hỏi lại",
  cancel: "Hủy yêu cầu",
};
const ACTION_ORDER: RequestAction[] = ["send", "send_reply", "accept", "follow_up", "draft_reply", "cancel"];

/** Which actions this actor may take now. Delegates entirely to the shared state machine. */
export function availableActions(request: Pick<Request, "status" | "askerId" | "receiverId">, actor: Actor): RequestAction[] {
  return ACTION_ORDER.filter((a) => canTransition(request, a, actor).ok);
}

/**
 * Direction-aware heading for a request ("Nháp agent của bạn · gửi Dũng", "Dũng hỏi bạn", "Bạn hỏi Dũng").
 * Unsent drafts are visible only to their owner (canSeeMessage), so the draft wording is only used for that side.
 */
export function requestDirectionLabel(
  request: Pick<Request, "status" | "askerId" | "receiverId" | "messages">,
  viewerMemberId: string,
  askerName: string,
  receiverName: string,
): string {
  const side = viewerMemberId === request.askerId ? "asker" : viewerMemberId === request.receiverId ? "receiver" : "observer";
  const last = request.messages[request.messages.length - 1];
  const unsentByAgent = !!last && last.sentById === null && last.authoredBy === "agent";
  if (side === "asker") {
    if (request.status === "draft") return `${unsentByAgent ? "Nháp agent của bạn" : "Nháp của bạn"} · gửi ${receiverName}`;
    return `Bạn hỏi ${receiverName}`;
  }
  if (side === "receiver") {
    if (request.status === "reply_drafted") return `${unsentByAgent ? "Nháp agent của bạn" : "Nháp của bạn"} · trả lời ${askerName}`;
    return `${askerName} hỏi bạn`;
  }
  return `${askerName} hỏi ${receiverName}`;
}
