import { useState } from "react";
import type { Actor, Member, Request, RequestAction, RequestMessage, RequestStatus } from "@officehub/shared";
import { bodyRequirement, canSeeMessage, canTransition } from "@officehub/shared";
import { Badge, Button, Card, Icon, cn, type BadgeTone, type ButtonVariant, type IconName } from "./primitives.js";
import { Mascot } from "./presence.js";
import { DraftBlock, UntrustedQuote } from "./trust.js";
import { relativeTimeVi } from "./board.js";

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

const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  draft: "agent", sent: "warning", reply_drafted: "agent", replied: "human", closed: "success", cancelled: "neutral",
};
const STATUS_ICON: Record<RequestStatus, IconName> = {
  draft: "draft", sent: "send", reply_drafted: "draft", replied: "reply", closed: "check", cancelled: "cancel",
};

export const ACTION_LABEL_VI: Record<RequestAction, string> = {
  send: "Gửi",
  draft_reply: "Soạn trả lời",
  send_reply: "Gửi trả lời",
  accept: "Chấp nhận",
  follow_up: "Hỏi lại",
  cancel: "Hủy yêu cầu",
};
/** Optional caption under the button group. */
const ACTION_HINT_VI: Partial<Record<RequestAction, (name: string) => string>> = {
  send: (n) => `Chỉ khi bạn bấm, yêu cầu mới tới ${n}.`,
  send_reply: (n) => `Câu trả lời tới ${n} khi bạn bấm.`,
  follow_up: (n) => `Gửi lại cho ${n} kèm câu hỏi thêm.`,
};
const ACTION_VARIANT: Record<RequestAction, ButtonVariant> = {
  send: "primary", send_reply: "primary", accept: "primary", follow_up: "secondary", draft_reply: "secondary", cancel: "ghost",
};
const ACTION_ICON: Partial<Record<RequestAction, IconName>> = {
  send: "send", send_reply: "send", accept: "check", follow_up: "reply", draft_reply: "draft", cancel: "cancel",
};
const ACTION_ORDER: RequestAction[] = ["send", "send_reply", "accept", "follow_up", "draft_reply", "cancel"];

/** Which actions this actor may take now. Delegates entirely to the shared state machine. */
export function availableActions(request: Pick<Request, "status" | "askerId" | "receiverId">, actor: Actor): RequestAction[] {
  return ACTION_ORDER.filter((a) => canTransition(request, a, actor).ok);
}

export type RequestActionHandler = (action: RequestAction, request: Request, body?: string) => void;

export interface RequestCardProps {
  request: Request;
  asker: Member;
  receiver: Member;
  /** The viewing human (UI always acts as a human). */
  viewerMemberId: string;
  /** `body` is provided when the user typed one (required for follow_up / draft_reply / send_reply from sent). */
  onAction?: RequestActionHandler;
  /** Open the edit box for an agent draft. */
  onEditDraft?: (message: RequestMessage) => void;
  now?: Date | number;
  className?: string;
}

export function RequestCard({ request, asker, receiver, viewerMemberId, onAction, onEditDraft, now, className }: RequestCardProps) {
  const [composing, setComposing] = useState<RequestAction | null>(null);
  const [text, setText] = useState("");
  const actor: Actor = { kind: "human", memberId: viewerMemberId };
  const actions = availableActions(request, actor);
  const side = viewerMemberId === request.askerId ? "asker" : viewerMemberId === request.receiverId ? "receiver" : "observer";
  const other = side === "receiver" ? asker : receiver;

  // Drafts are visible only to their owning side (canSeeMessage); never render a hidden one.
  const visible = request.messages.filter((m) => canSeeMessage(request, m, viewerMemberId));
  const last = visible[visible.length - 1];
  const authorId = last ? (last.kind === "reply" ? request.receiverId : request.askerId) : null;
  const authorMember = authorId === asker.id ? asker : receiver;
  const unsent = !!last && last.sentById === null;
  const agentDraft = unsent && last?.authoredBy === "agent";
  const mine = authorId === viewerMemberId;
  const approver = last?.sentById ? (last.sentById === asker.id ? asker : receiver) : null;

  const draftAction: RequestAction | null = agentDraft ? (last!.kind === "reply" ? "send_reply" : "send") : null;
  const inlineDraftAction =
    draftAction && actions.includes(draftAction) && bodyRequirement(draftAction, request.status) !== "required" ? draftAction : null;
  const footerActions = actions.filter((a) => a !== inlineDraftAction);

  const { label, help } = requestStatusText(request, side, other.displayName);
  const overdue = !!request.dueAt && ["sent", "reply_drafted", "replied"].includes(request.status) && new Date(request.dueAt).getTime() < +(now ?? Date.now());

  const fire = (a: RequestAction, body?: string) =>
    body === undefined ? onAction?.(a, request) : onAction?.(a, request, body);
  const click = (a: RequestAction) => {
    if (bodyRequirement(a, request.status) === "required") {
      setComposing(a);
      setText("");
    } else fire(a);
  };
  const submit = () => {
    if (!composing || !text.trim()) return;
    fire(composing, text.trim());
    setComposing(null);
    setText("");
  };
  const hint = footerActions.map((a) => ACTION_HINT_VI[a]?.(other.displayName)).find(Boolean);

  return (
    <Card as="article" aria-label={`Yêu cầu: ${request.title}`} data-status={request.status} className={cn("space-y-3", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex min-w-0 flex-1 items-center gap-2 text-oh-base font-semibold">
          {request.unreadForViewer && (
            <span role="img" aria-label="Chưa đọc" data-unread className="inline-block size-2.5 shrink-0 rounded-oh-full bg-oh-primary ring-2 ring-oh-primary-soft" />
          )}
          {request.title}
        </h3>
        <div className="flex gap-1.5">
          {overdue && <Badge tone="danger" icon="alert">Quá hạn</Badge>}
          <Badge tone={STATUS_TONE[request.status]} icon={STATUS_ICON[request.status]}>
            {label}
          </Badge>
        </div>
      </header>
      <p className="text-oh-xs text-oh-ink-muted">{help}</p>

      <div className="flex items-center gap-2 text-oh-sm" aria-label={`${asker.displayName} hỏi ${receiver.displayName}`}>
        <Mascot mascot={asker.mascot} mood="relaxed" size={32} title={asker.displayName} />
        <span className="font-medium">{asker.displayName}</span>
        <Icon name="reply" size={14} className="rotate-180 text-oh-ink-muted" />
        <Mascot mascot={receiver.mascot} mood="relaxed" size={32} title={receiver.displayName} />
        <span className="font-medium">{receiver.displayName}</span>
        {request.dueAt && <span className="ml-auto text-oh-xs text-oh-ink-muted">Hạn {new Date(request.dueAt).toLocaleDateString("vi-VN")}</span>}
      </div>

      {last &&
        (agentDraft && mine ? (
          <DraftBlock
            owner={authorMember}
            onEdit={onEditDraft ? () => onEditDraft(last) : undefined}
            onSend={inlineDraftAction ? () => fire(inlineDraftAction) : undefined}
            sendLabel={inlineDraftAction ? ACTION_LABEL_VI[inlineDraftAction] : "Gửi"}
          >
            {last.body}
          </DraftBlock>
        ) : mine ? (
          <p className="whitespace-pre-wrap rounded-oh-md bg-oh-surface-2 p-3 text-oh-sm">
            {last.body}
            {last.editedBeforeSend && <span className="mt-1 block text-oh-xs text-oh-ink-muted">Đã chỉnh sửa</span>}
          </p>
        ) : (
          <>
            <UntrustedQuote authorName={authorMember.displayName} author={authorMember} fromAgent={last.authoredBy === "agent"}>
              {last.body}
            </UntrustedQuote>
            {last.authoredBy === "agent" && approver && (
              <p className="text-oh-xs text-oh-ink-muted">
                Agent soạn · đã duyệt bởi {approver.displayName}
                {last.editedBeforeSend ? " · Đã chỉnh sửa" : ""}
              </p>
            )}
          </>
        ))}

      {composing && (
        <div className="space-y-2">
          <label htmlFor={`body-${request.id}`} className="text-oh-sm font-medium">
            {composing === "follow_up" ? `Câu hỏi thêm cho ${other.displayName}` : "Nội dung trả lời"}
          </label>
          <textarea
            id={`body-${request.id}`}
            data-autofocus
            autoFocus
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-oh-md border border-oh-border-strong bg-oh-surface p-3 text-oh-base text-oh-ink"
          />
          <p className="text-oh-xs text-oh-ink-muted">Không dán khóa bí mật (API key, token) vào đây.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setComposing(null)}>Để sau</Button>
            <Button variant={ACTION_VARIANT[composing]} icon={ACTION_ICON[composing]} disabled={!text.trim()} onClick={submit}>
              {ACTION_LABEL_VI[composing]}
            </Button>
          </div>
        </div>
      )}

      {!composing && footerActions.length > 0 && (
        <footer className="space-y-1">
          <div className="flex flex-wrap gap-2">
            {footerActions.map((a) => (
              <Button key={a} variant={ACTION_VARIANT[a]} icon={ACTION_ICON[a]} onClick={() => click(a)}>
                {ACTION_LABEL_VI[a]}
              </Button>
            ))}
          </div>
          {hint && <p className="text-oh-xs text-oh-ink-muted">{hint}</p>}
        </footer>
      )}
      <p className="text-oh-xs text-oh-ink-muted">Cập nhật {relativeTimeVi(request.updatedAt, now)}</p>
    </Card>
  );
}
