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

/**
 * Label + one-line helper from the orchestrator's point of view (v0.6: the human is the gate for both sides).
 * `asker` / `receiver` are display names of the two parties ("Frontend", or "bạn" for the orchestrator).
 */
export function requestStatusText(
  request: Pick<Request, "status" | "messages" | "receiverRoleId">,
  names: { asker: string; receiver: string },
): { label: string; help: string } {
  const toMe = request.receiverRoleId === null;
  switch (request.status) {
    case "draft":
      return { label: "Nháp chờ chuyển", help: `${names.asker} đã soạn nháp. Xem, sửa nếu cần, rồi bấm Chuyển tới ${names.receiver}.` };
    case "sent":
      return toMe
        ? { label: "Chờ bạn trả lời", help: `${names.asker} đang hỏi bạn.` }
        : { label: "Đã chuyển", help: `Đang chờ ${names.receiver} soạn trả lời.` };
    case "reply_drafted":
      return { label: "Trả lời chờ chuyển", help: `${names.receiver} đã soạn trả lời. Duyệt rồi bấm Chuyển trả lời.` };
    case "replied":
      return { label: "Đã có trả lời", help: "Đóng nếu đủ, hoặc hỏi lại." };
    case "closed":
      return { label: "Đã xong", help: "Yêu cầu đã đóng." };
    case "cancelled":
      return { label: "Đã hủy", help: "Yêu cầu đã bị hủy; không cần trả lời nữa." };
  }
}

export const ACTION_LABEL_VI: Record<RequestAction, string> = {
  send: "Chuyển",
  draft_reply: "Soạn trả lời",
  send_reply: "Chuyển trả lời",
  accept: "Đóng",
  follow_up: "Hỏi lại",
  cancel: "Hủy",
};
const ACTION_ORDER: RequestAction[] = ["send", "send_reply", "accept", "follow_up", "draft_reply", "cancel"];

/** Which actions this actor may take now. Delegates entirely to the shared state machine. */
export function availableActions(request: Pick<Request, "status" | "askerRoleId" | "receiverRoleId">, actor: Actor): RequestAction[] {
  return ACTION_ORDER.filter((a) => canTransition(request, a, actor).ok);
}

/** "Frontend → Backend", "Bạn → Backend", "Frontend → bạn". `roleName` resolves a role id; null = the orchestrator. */
export function requestDirectionLabel(
  request: Pick<Request, "askerRoleId" | "receiverRoleId">,
  roleName: (roleId: string) => string,
): string {
  const asker = request.askerRoleId ? roleName(request.askerRoleId) : "Bạn";
  const receiver = request.receiverRoleId ? roleName(request.receiverRoleId) : "bạn";
  return `${asker} → ${receiver}`;
}
