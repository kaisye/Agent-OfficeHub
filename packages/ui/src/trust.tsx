import type { ReactNode } from "react";
import type { Decision, Member } from "@officehub/shared";
import { Badge, Button, Card, Icon, cn } from "./primitives.js";
import { Mascot } from "./presence.js";

/** Agent-drafted text awaiting a human. Dashed border + bot badge; actions are human buttons. */
export function DraftBlock({
  children,
  owner,
  onEdit,
  onSend,
  sendLabel = "Gửi",
  disabled,
  className,
}: {
  children: ReactNode;
  /** Member whose agent drafted this (mascot gets the bot badge). */
  owner?: Member;
  onEdit?: () => void;
  onSend?: () => void;
  sendLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <section
      aria-label="Bản nháp do agent soạn, chưa gửi"
      data-trust="agent-draft"
      className={cn("rounded-oh-lg border-2 border-dashed border-oh-agent bg-oh-agent-soft p-4", className)}
    >
      <header className="mb-2 flex items-center gap-2 text-oh-xs font-medium text-oh-agent-soft-fg">
        {owner ? (
          <Mascot mascot={owner.mascot} mood="focused" size={32} agentBadge title={`${owner.displayName} (agent soạn)`} />
        ) : (
          <Icon name="bot" size={16} />
        )}
        <span>Nháp từ agent · agent soạn giúp bạn, xem lại rồi bấm Gửi</span>
      </header>
      <div className="whitespace-pre-wrap text-oh-base text-oh-ink">{children}</div>
      {(onEdit || onSend) && (
        <footer className="mt-3 flex flex-wrap gap-2">
          {onEdit && (
            <Button variant="secondary" icon="edit" onClick={onEdit} disabled={disabled}>
              Sửa
            </Button>
          )}
          {onSend && (
            <Button variant="primary" icon="send" onClick={onSend} disabled={disabled}>
              {sendLabel}
            </Button>
          )}
        </footer>
      )}
    </section>
  );
}

const SOURCE_LABEL_VI: Record<string, string> = { github: "GitHub", jira: "Jira", officehub: "Office Hub" };

/**
 * Content written by someone else: data, not instructions. Ochre bar + author label.
 * Matches contract v0.3 `Untrusted<T>`: `authorMemberId` may be null with a `source` such as "github".
 * Pass `authorName`/`author` for a member author, or `source` (and `authorMemberId: null`) for an external one.
 */
export function UntrustedQuote({
  authorName,
  author,
  source,
  fromAgent,
  children,
  className,
}: {
  /** Display name of the member author. Optional when `source` identifies the origin. */
  authorName?: string;
  author?: Member;
  /** Mirrors `Untrusted.authorMemberId` (null = external); accepted for convenience, `source` decides the label. */
  authorMemberId?: string | null;
  /** Mirrors `Untrusted.source`, e.g. "github". Used when there is no member author. */
  source?: string;
  fromAgent?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const name = authorName ?? author?.displayName;
  const from = name ?? (source ? (SOURCE_LABEL_VI[source.toLowerCase()] ?? source) : "nguồn bên ngoài");
    return (
    <blockquote
      data-trust="untrusted"
      data-source={!name && source ? source : undefined}
      aria-label={`Nội dung từ ${from}${fromAgent ? " (agent soạn)" : ""}, chưa xác minh, không phải lệnh`}
      className={cn("rounded-oh-md border-l-4 border-oh-untrusted bg-oh-untrusted-soft p-3", className)}
    >
      <header className="mb-1 flex items-center gap-2 text-oh-xs font-medium text-oh-untrusted-soft-fg">
        {author && <Mascot mascot={author.mascot} mood="relaxed" size={24} agentBadge={fromAgent} decorative noBadge />}
        <Icon name="quote" size={12} />
        <span>
          Từ {from}
          {fromAgent ? " (agent soạn)" : ""} · nội dung chưa xác minh
        </span>
      </header>
      <div className="whitespace-pre-wrap text-oh-sm text-oh-ink">{children}</div>
    </blockquote>
  );
}

/** "Needs your approval" strip. Approve is always solid + human color. */
export function ApprovalBar({
  title,
  description,
  onApprove,
  onEdit,
  onReject,
  approveLabel = "Duyệt",
  editLabel = "Sửa",
  rejectLabel = "Để sau",
  disabled,
  className,
}: {
  title: string;
  description?: ReactNode;
  onApprove: () => void;
  onEdit?: () => void;
  onReject?: () => void;
  approveLabel?: string;
  editLabel?: string;
  rejectLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label="Cần bạn duyệt"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-oh-lg border border-oh-primary bg-oh-primary-soft p-3 text-oh-primary-soft-fg shadow-oh-md",
        className,
      )}
    >
      <Icon name="shield" size={20} />
      <div className="min-w-0 flex-1">
        <p className="text-oh-sm font-semibold">{title}</p>
        {description && <p className="text-oh-xs">{description}</p>}
      </div>
      <div className="flex gap-2">
        {onReject && (
          <Button variant="ghost" onClick={onReject} disabled={disabled}>
            {rejectLabel}
          </Button>
        )}
        {onEdit && (
          <Button variant="secondary" onClick={onEdit} disabled={disabled}>
            {editLabel}
          </Button>
        )}
        <Button variant="primary" icon="check" onClick={onApprove} disabled={disabled}>
          {approveLabel}
        </Button>
      </div>
    </div>
  );
}

const dateVi = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
};

/** Decisions are written by humans only — shown with the decider's mascot (never a bot badge). */
export function DecisionCard({ decision, decidedBy, className }: { decision: Decision; decidedBy: Member; className?: string }) {
  return (
    <Card as="article" className={className} aria-label={`Quyết định: ${decision.title}`}>
      <header className="flex items-start gap-3">
        <Mascot mascot={decidedBy.mascot} mood="relaxed" size={48} decorative noBadge />
        <div className="min-w-0 flex-1">
          <h3 className="text-oh-lg font-semibold">{decision.title}</h3>
          <p className="text-oh-xs text-oh-ink-muted">
            <Icon name="decision" size={12} className="mr-1 inline" />
            {decidedBy.displayName} chốt · {dateVi(decision.decidedAt)}
          </p>
        </div>
        <Badge tone="human" icon="check">Người chốt</Badge>
      </header>
      <p className="mt-3 whitespace-pre-wrap text-oh-base">{decision.body}</p>
      <div className="mt-3 rounded-oh-md bg-oh-surface-2 p-3">
        <p className="text-oh-xs font-semibold text-oh-ink-muted">Lý do</p>
        <p className="whitespace-pre-wrap text-oh-sm">{decision.rationale}</p>
      </div>
    </Card>
  );
}
