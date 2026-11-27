"use client";

import { useState, type ElementType } from "react";
import type { Actor, Mascot as MascotTraits, Request, RequestAction, RequestMessage, RequestStatus } from "@officehub/shared";
import { bodyRequirement, canSeeMessage } from "@officehub/shared";
import { Badge, Button, Card, Icon, cn, type BadgeTone, type ButtonVariant, type IconName } from "./primitives.js";
import { Mascot } from "./presence.js";
import { DraftBlock, UntrustedQuote } from "./trust.js";
import { relativeTimeVi } from "./board.js";
import { ACTION_LABEL_VI, availableActions, requestStatusText } from "./request-logic.js";

const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  draft: "agent", sent: "warning", reply_drafted: "agent", replied: "human", closed: "success", cancelled: "neutral",
};
const STATUS_ICON: Record<RequestStatus, IconName> = {
  draft: "draft", sent: "send", reply_drafted: "draft", replied: "reply", closed: "check", cancelled: "cancel",
};

/** Optional caption under the button group. */
const ACTION_HINT_VI: Partial<Record<RequestAction, (name: string) => string>> = {
  send: (n) => `Chỉ khi bạn bấm, yêu cầu mới tới ${n}.`,
  send_reply: (n) => `Câu trả lời tới ${n} khi bạn bấm.`,
  follow_up: (n) => `Hỏi lại ${n} kèm câu hỏi thêm.`,
};
const ACTION_VARIANT: Record<RequestAction, ButtonVariant> = {
  send: "primary", send_reply: "primary", accept: "primary", follow_up: "secondary", draft_reply: "secondary", cancel: "ghost",
};
const ACTION_ICON: Partial<Record<RequestAction, IconName>> = {
  send: "send", send_reply: "send", accept: "check", follow_up: "reply", draft_reply: "draft", cancel: "cancel",
};
export type RequestActionHandler = (action: RequestAction, request: Request, body?: string) => void;

/** One side of a request as shown in the UI: a role ("Backend") or the orchestrator ("Bạn"). */
export interface PartyDisplay {
  displayName: string;
  mascot: MascotTraits;
  /** true for the human orchestrator (text it wrote is not "untrusted"). */
  human?: boolean;
}

export interface RequestCardProps {
  request: Request;
  asker: PartyDisplay;
  receiver: PartyDisplay;
  /** The orchestrator (UI always acts as the human gate). */
  viewerMemberId: string;
  /** `body` is provided when the user typed one (required for follow_up / draft_reply / send_reply from sent). */
  onAction?: RequestActionHandler;
  /** Open the edit box for an agent draft. */
  onEditDraft?: (message: RequestMessage) => void;
  /** When set, the card footer shows a quiet "open details" link to this URL. */
  detailHref?: string;
  /** Link label; default "Mở chi tiết và chuỗi trao đổi". */
  detailLabel?: string;
  /** Link component, e.g. next/link, so navigation stays client-side. Default: "a". */
  linkAs?: ElementType;
  now?: Date | number;
  className?: string;
}

export function RequestCard({ request, asker, receiver, viewerMemberId, onAction, onEditDraft, detailHref, detailLabel = "Mở chi tiết và chuỗi trao đổi", linkAs: LinkTag = "a", now, className }: RequestCardProps) {
  const [composing, setComposing] = useState<RequestAction | null>(null);
  const [text, setText] = useState("");
  const actor: Actor = { kind: "human", memberId: viewerMemberId };
  const actions = availableActions(request, actor);
  // v0.6: the orchestrator answers to both sides; "other" is the party the next click moves the text to.
  const other = request.status === "reply_drafted" || request.status === "replied" ? asker : receiver;

  const visible = request.messages.filter((m) => canSeeMessage(request, m, { kind: "human" }));
  const last = visible[visible.length - 1];
  const authorMember = last ? (last.authoredBy === "human" ? null : last.kind === "reply" ? receiver : asker) : null;
  const unsent = !!last && last.sentById === null;
  const agentDraft = unsent && last?.authoredBy === "agent";
  const mine = !!last && last.authoredBy === "human";
  const approver = last?.sentById ? "bạn" : null;

  const draftAction: RequestAction | null = agentDraft ? (last!.kind === "reply" ? "send_reply" : "send") : null;
  const inlineDraftAction =
    draftAction && actions.includes(draftAction) && bodyRequirement(draftAction, request.status) !== "required" ? draftAction : null;
  const footerActions = actions.filter((a) => a !== inlineDraftAction);

  const { label, help } = requestStatusText(request, { asker: asker.displayName, receiver: receiver.displayName });
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
        <Mascot mascot={asker.mascot} mood="relaxed" size={32} decorative noBadge />
        <span className="font-medium">{asker.displayName}</span>
        <Icon name="reply" size={14} className="rotate-180 text-oh-ink-muted" />
        <span className="sr-only">hỏi</span>
        <Mascot mascot={receiver.mascot} mood="relaxed" size={32} decorative noBadge />
        <span className="font-medium">{receiver.displayName}</span>
        {request.dueAt && <span className="ml-auto text-oh-xs text-oh-ink-muted">Hạn {new Date(request.dueAt).toLocaleDateString("vi-VN")}</span>}
      </div>

      {last &&
        (agentDraft && authorMember ? (
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
            <UntrustedQuote authorName={authorMember?.displayName} author={authorMember ?? undefined} fromAgent={last.authoredBy === "agent"}>
              {last.body}
            </UntrustedQuote>
            {last.authoredBy === "agent" && approver && (
              <p className="text-oh-xs text-oh-ink-muted">
                Agent soạn · đã duyệt bởi {approver}
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
        <div className="space-y-1">
          <div className="flex flex-wrap gap-2">
            {footerActions.map((a) => (
              <Button key={a} variant={ACTION_VARIANT[a]} icon={ACTION_ICON[a]} onClick={() => click(a)}>
                {ACTION_LABEL_VI[a]}
              </Button>
            ))}
          </div>
          {hint && <p className="text-oh-xs text-oh-ink-muted">{hint}</p>}
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-oh-border pt-3 text-oh-xs text-oh-ink-muted">
        <span>Cập nhật {relativeTimeVi(request.updatedAt, now)}</span>
        {detailHref && (
          <LinkTag
            href={detailHref}
            className="group inline-flex items-center gap-1 rounded-oh-sm text-oh-sm font-medium text-oh-ink-muted underline-offset-2 hover:text-oh-ink hover:underline focus-visible:outline-3 focus-visible:outline-oh-focus"
          >
            {detailLabel}
            <Icon name="arrowRight" size={14} className="transition-transform group-hover:translate-x-0.5" />
          </LinkTag>
        )}
      </footer>
    </Card>
  );
}
