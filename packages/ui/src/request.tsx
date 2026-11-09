import type { Actor, Member, Request, RequestAction, RequestMessage, RequestStatus } from "@officehub/shared";
import { canTransition } from "@officehub/shared";
import { Badge, Button, Card, Icon, cn, type BadgeTone, type ButtonVariant, type IconName } from "./primitives.js";
import { Mascot } from "./presence.js";
import { DraftBlock, UntrustedQuote } from "./trust.js";
import { relativeTimeVi } from "./board.js";

export const REQUEST_STATUS_LABEL_VI: Record<RequestStatus, string> = {
  draft: "Nháp",
  sent: "Đã gửi, chờ trả lời",
  reply_drafted: "Có bản nháp trả lời",
  replied: "Đã trả lời, chờ bạn xem",
  closed: "Đã đóng",
  cancelled: "Đã huỷ",
};
const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  draft: "agent", sent: "warning", reply_drafted: "agent", replied: "human", closed: "success", cancelled: "neutral",
};
const STATUS_ICON: Record<RequestStatus, IconName> = {
  draft: "draft", sent: "send", reply_drafted: "draft", replied: "reply", closed: "check", cancelled: "cancel",
};

export const ACTION_LABEL_VI: Record<RequestAction, string> = {
  send: "Gửi yêu cầu",
  draft_reply: "Soạn trả lời",
  send_reply: "Gửi trả lời",
  accept: "Chấp nhận",
  follow_up: "Hỏi lại",
  cancel: "Huỷ yêu cầu",
};
const ACTION_VARIANT: Record<RequestAction, ButtonVariant> = {
  send: "primary", send_reply: "primary", accept: "primary", follow_up: "secondary", draft_reply: "secondary", cancel: "ghost",
};
const ACTION_ICON: Partial<Record<RequestAction, IconName>> = {
  send: "send", send_reply: "send", accept: "check", follow_up: "reply", draft_reply: "draft", cancel: "cancel",
};
/** Display order: the main human decision first. */
const ACTION_ORDER: RequestAction[] = ["send", "send_reply", "accept", "follow_up", "draft_reply", "cancel"];

/** Which actions this actor may take now. Delegates entirely to the shared state machine. */
export function availableActions(request: Pick<Request, "status" | "askerId" | "receiverId">, actor: Actor): RequestAction[] {
  return ACTION_ORDER.filter((a) => canTransition(request, a, actor).ok);
}

function messageAuthorId(request: Request, m: RequestMessage): string {
  return m.kind === "reply" ? request.receiverId : request.askerId;
}

export interface RequestCardProps {
  request: Request;
  asker: Member;
  receiver: Member;
  /** The viewing human (UI always acts as a human). */
  viewerMemberId: string;
  onAction?: (action: RequestAction, request: Request) => void;
  /** Open the edit box for an agent draft. */
  onEditDraft?: (message: RequestMessage) => void;
  now?: Date | number;
  className?: string;
}

export function RequestCard({ request, asker, receiver, viewerMemberId, onAction, onEditDraft, now, className }: RequestCardProps) {
  const actor: Actor = { kind: "human", memberId: viewerMemberId };
  const actions = availableActions(request, actor);
  const last = request.messages[request.messages.length - 1];
  const authorId = last ? messageAuthorId(request, last) : null;
  const authorMember = authorId === asker.id ? asker : receiver;
  const unsent = !!last && last.sentById === null;
  const agentDraft = unsent && last?.authoredBy === "agent";
  const mine = authorId === viewerMemberId;

  // primary action that matches an unsent agent draft is shown inside the DraftBlock instead of the footer
  const draftAction: RequestAction | null = agentDraft ? (last!.kind === "reply" ? "send_reply" : "send") : null;
  const inlineDraftAction = draftAction && actions.includes(draftAction) ? draftAction : null;
  const footerActions = actions.filter((a) => a !== inlineDraftAction);

  return (
    <Card as="article" aria-label={`Yêu cầu: ${request.title}`} data-status={request.status} className={cn("space-y-3", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-oh-base font-semibold">{request.title}</h3>
        <Badge tone={STATUS_TONE[request.status]} icon={STATUS_ICON[request.status]}>
          {REQUEST_STATUS_LABEL_VI[request.status]}
        </Badge>
      </header>

      <div className="flex items-center gap-2 text-oh-sm" aria-label={`${asker.displayName} hỏi ${receiver.displayName}`}>
        <Mascot mascot={asker.mascot} mood="relaxed" size={32} title={asker.displayName} />
        <span className="font-medium">{asker.displayName}</span>
        <Icon name="reply" size={14} className="rotate-180 text-oh-ink-muted" />
        <Mascot mascot={receiver.mascot} mood="relaxed" size={32} title={receiver.displayName} />
        <span className="font-medium">{receiver.displayName}</span>
        {request.dueAt && (
          <span className="ml-auto text-oh-xs text-oh-ink-muted">Hạn {new Date(request.dueAt).toLocaleDateString("vi-VN")}</span>
        )}
      </div>

      {last &&
        (agentDraft && mine ? (
          <DraftBlock
            owner={authorMember}
            onEdit={onEditDraft ? () => onEditDraft(last) : undefined}
            onSend={inlineDraftAction ? () => onAction?.(inlineDraftAction, request) : undefined}
            sendLabel={inlineDraftAction ? ACTION_LABEL_VI[inlineDraftAction] : "Gửi"}
          >
            {last.body}
          </DraftBlock>
        ) : mine ? (
          <p className="whitespace-pre-wrap rounded-oh-md bg-oh-surface-2 p-3 text-oh-sm">{last.body}</p>
        ) : (
          <UntrustedQuote authorName={authorMember.displayName} author={authorMember} fromAgent={last.authoredBy === "agent"}>
            {last.body}
          </UntrustedQuote>
        ))}

      {footerActions.length > 0 && (
        <footer className="flex flex-wrap gap-2">
          {footerActions.map((a) => (
            <Button key={a} variant={ACTION_VARIANT[a]} icon={ACTION_ICON[a]} onClick={() => onAction?.(a, request)}>
              {ACTION_LABEL_VI[a]}
            </Button>
          ))}
        </footer>
      )}
      <p className="text-oh-xs text-oh-ink-muted">Cập nhật {relativeTimeVi(request.updatedAt, now)}</p>
    </Card>
  );
}
