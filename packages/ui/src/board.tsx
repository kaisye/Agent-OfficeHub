import type { EventType, HubEvent, Member, StatusCard, Task } from "@officehub/shared";

type TaskState = Task["state"];
import { Badge, Card, Icon, cn, type IconName } from "./primitives.js";
import { Mascot, PRESENCE_LABEL_VI, PresencePill } from "./presence.js";

/** "3 phút trước" style time. `now` is injectable for tests/SSR. */
export function relativeTimeVi(iso: string, now: Date | number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.round((+now - t) / 1000);
  if (s < 45) return "vừa xong";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(t).toLocaleDateString("vi-VN");
}

/* ---------- TaskChip ---------- */
export const TASK_STATE_LABEL_VI: Record<TaskState, string> = {
  open: "Mở", in_progress: "Đang làm", in_review: "Đang review", blocked: "Đang vướng", done: "Xong", closed: "Đã đóng",
};
const TASK_ICON: Record<Task["source"], IconName> = { github_pr: "pr", github_issue: "issue", jira: "issue", manual: "draft" };

export function TaskChip({ task, className }: { task: Pick<Task, "source" | "externalKey" | "externalUrl" | "title" | "state">; className?: string }) {
  const body = (
    <>
      <Icon name={TASK_ICON[task.source]} size={14} />
      {task.externalKey && <span className="font-mono text-oh-xs">{task.externalKey}</span>}
      <span className="max-w-48 truncate text-oh-sm">{task.title}</span>
      <Badge tone={task.state === "blocked" ? "danger" : task.state === "done" ? "success" : "neutral"}>{TASK_STATE_LABEL_VI[task.state]}</Badge>
    </>
  );
  const cls = cn("inline-flex items-center gap-1.5 rounded-oh-full border border-oh-border bg-oh-surface px-2.5 py-1 text-oh-ink", className);
  return task.externalUrl ? (
    <a
      href={task.externalUrl}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Mở việc ${task.externalKey ?? task.title} ở nguồn gốc`}
      className={cn(cls, "hover:bg-oh-surface-2 focus-visible:outline-3 focus-visible:outline-oh-focus")}
    >
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/* ---------- MemberCard ---------- */
export function MemberCard({
  member,
  status,
  waitingOnMembers = [],
  className,
}: {
  member: Member;
  status: StatusCard | null;
  /** Resolved members from status.waitingOn. */
  waitingOnMembers?: Member[];
  className?: string;
}) {
  const presence = status?.presence ?? "offline";
  const byAgent = status?.updatedBy === "agent";
  return (
    <Card as="article" interactive aria-label={`${member.displayName}: ${presence}`} className={className}>
      <div className="flex items-start gap-3">
        <Mascot mascot={member.mascot} presence={presence} size={48} agentBadge={byAgent} title={`${member.displayName}, ${PRESENCE_LABEL_VI[presence].toLowerCase()}${byAgent ? ", agent soạn" : ""}`} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-oh-base font-semibold">{member.displayName}</h3>
          <PresencePill presence={presence} />
        </div>
      </div>
      <p className="mt-3 text-oh-sm text-oh-ink">{status?.doing ?? <span className="text-oh-ink-muted">Chưa có cập nhật.</span>}</p>
      {byAgent && <p className="mt-1 text-oh-xs text-oh-agent">Agent soạn · cập nhật hộ</p>}
      {status?.branch && (
        <p className="mt-2 font-mono text-oh-xs text-oh-ink-muted">
          <Icon name="pr" size={12} className="mr-1 inline" />
          {status.branch}
        </p>
      )}
      {waitingOnMembers.length > 0 && (
        <ul className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Đang chờ">
          <li className="text-oh-xs text-oh-ink-muted">Chờ:</li>
          {waitingOnMembers.map((m) => (
            <li key={m.id} className="inline-flex items-center gap-1 rounded-oh-full bg-oh-warning-soft py-0.5 pl-0.5 pr-2 text-oh-xs text-oh-warning-soft-fg">
              <Mascot mascot={m.mascot} mood="relaxed" size={24} title={m.displayName} />
              {m.displayName}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- EventRow ---------- */
export const EVENT_ICON: Record<EventType, IconName> = {
  "pr.opened": "pr", "pr.merged": "merge", "pr.closed": "close", "pr.review_requested": "review",
  "ci.failed": "ciFail", "ci.passed": "ciPass", "deploy.succeeded": "deploy", "deploy.failed": "alert",
  "issue.opened": "issue", "issue.closed": "check", "request.created": "request", "request.sent": "send",
  "request.reply_drafted": "draft", "request.replied": "reply", "request.followed_up": "reply",
  "request.closed": "check", "request.reminded": "bell", "request.cancelled": "cancel", "decision.recorded": "decision", "status.updated": "status",
};
export const EVENT_LABEL_VI: Record<EventType, string> = {
  "pr.opened": "Mở PR", "pr.merged": "Đã merge PR", "pr.closed": "Đóng PR", "pr.review_requested": "Cần review PR",
  "ci.failed": "CI lỗi", "ci.passed": "CI qua", "deploy.succeeded": "Deploy xong", "deploy.failed": "Deploy lỗi",
  "issue.opened": "Mở ticket", "issue.closed": "Đóng ticket", "request.created": "Tạo yêu cầu", "request.sent": "Đã gửi yêu cầu",
  "request.reply_drafted": "Có bản nháp trả lời", "request.replied": "Đã trả lời", "request.followed_up": "Hỏi lại",
  "request.closed": "Đã chấp nhận, đóng yêu cầu", "request.reminded": "Nhắc yêu cầu", "request.cancelled": "Huỷ yêu cầu", "decision.recorded": "Ghi quyết định",
  "status.updated": "Cập nhật trạng thái",
};
const EVENT_BAD = new Set<EventType>(["ci.failed", "deploy.failed"]);

export function EventRow({ event, actorName, detail, now, className }: { event: HubEvent; actorName?: string; detail?: string; now?: Date | number; className?: string }) {
  const bad = EVENT_BAD.has(event.type);
  return (
    <li className={cn("flex items-start gap-3 py-2", className)}>
      <span
        className={cn("mt-0.5 inline-flex size-7 items-center justify-center rounded-oh-full", bad ? "bg-oh-danger-soft text-oh-danger-soft-fg" : "bg-oh-surface-2 text-oh-ink-muted")}
      >
        <Icon name={EVENT_ICON[event.type]} size={14} />
      </span>
      <div className="min-w-0 flex-1 text-oh-sm">
        <p>
          <span className="font-medium">{EVENT_LABEL_VI[event.type]}</span>
          {actorName && <span className="text-oh-ink-muted"> · {actorName}{event.actorAgentId ? " (agent)" : ""}</span>}
        </p>
        {detail && <p className="truncate text-oh-xs text-oh-ink-muted">{detail}</p>}
      </div>
      <time dateTime={event.time} className="shrink-0 text-oh-xs text-oh-ink-muted">
        {relativeTimeVi(event.time, now)}
      </time>
    </li>
  );
}
