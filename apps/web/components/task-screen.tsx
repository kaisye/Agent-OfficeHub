"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, DecisionCard, EmptyState, EventRow, Icon, Mascot, TaskChip, relativeTimeVi, requestStatusText } from "@officehub/ui";
import { eventDetail } from "@/lib/events";
import { useBoard, useDecisions, useHandoff, useRequests } from "@/lib/hooks";
import { memberMap } from "@/lib/requests";
import { Markdown } from "./markdown";
import { NewRequestDialog } from "./new-request-dialog";
import { ListSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace";

/** Bàn giao: a task, its events, related requests and decisions, plus the generated handoff pack (HOF-01, HOF-02). */
export function TaskScreen() {
  const { id } = useParams<{ id: string }>();
  const { slug, me } = useWorkspace();
  const board = useBoard(slug);
  const requests = useRequests(slug);
  const decisions = useDecisions(slug);
  const handoff = useHandoff(slug, id);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!board.data || !requests.data || !decisions.data) return <ListSkeleton rows={3} label="Đang tải việc…" />;
  const task = board.data.tasks.find((t) => t.id === id);
  if (!task) {
    return (
      <EmptyState
        title="Không tìm thấy việc này"
        mood="curious"
        mascot={me.mascot}
        description="Việc có thể thuộc văn phòng khác hoặc đã bị gỡ."
        action={
          <Link href={`/w/${slug}`} className="rounded-oh-md bg-oh-primary px-4 py-2 text-oh-primary-fg">
            Về văn phòng
          </Link>
        }
      />
    );
  }
  const map = memberMap(board.data.members);
  const owner = task.assigneeId ? map.get(task.assigneeId) : null;
  const events = board.data.recentEvents.filter((e) => e.taskId === id);
  const related = requests.data.filter((r) => r.taskId === id);
  const decs = decisions.data.filter((d) => d.taskId === id);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handoff.data?.markdown ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href={`/w/${slug}`} className="inline-flex items-center gap-1 text-oh-sm text-oh-ink-muted hover:text-oh-ink focus-visible:outline-3 focus-visible:outline-oh-focus">
          <Icon name="reply" size={14} />
          Văn phòng
        </Link>
        <h1 className="text-oh-2xl font-bold">Bàn giao: {task.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <TaskChip task={task} />
          <span className="inline-flex items-center gap-1.5 text-oh-sm text-oh-ink-muted">
            {owner && <Mascot mascot={owner.mascot} mood="relaxed" size={24} decorative />}
            {owner ? `${owner.displayName} phụ trách` : "Chưa giao ai"}
          </span>
          {task.syncedAt && <span className="text-oh-xs text-oh-ink-muted">Đồng bộ {relativeTimeVi(task.syncedAt)}</span>}
          <Button size="sm" variant="secondary" icon="request" onClick={() => setCreating(true)}>
            Hỏi về việc này
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="pack-h" className="min-w-0">
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="pack-h" className="text-oh-lg font-semibold">
                Gói bàn giao
              </h2>
              <Button size="sm" variant="secondary" icon={copied ? "check" : "copy"} onClick={copy} disabled={!handoff.data}>
                {copied ? "Đã chép" : "Sao chép markdown"}
              </Button>
            </div>
            {handoff.isError ? (
              <p role="alert" className="text-oh-sm text-oh-danger-soft-fg">
                Chưa tạo được gói bàn giao. Thử lại sau nhé.
              </p>
            ) : !handoff.data ? (
              <ListSkeleton rows={2} label="Đang tạo gói bàn giao…" />
            ) : (
              <Markdown source={handoff.data.markdown} />
            )}
          </Card>
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="rel-h">
            <h2 id="rel-h" className="mb-2 text-oh-lg font-semibold">
              Yêu cầu liên quan
            </h2>
            {related.length === 0 ? (
              <p className="text-oh-sm text-oh-ink-muted">Chưa có yêu cầu nào gắn với việc này.</p>
            ) : (
              <ul className="space-y-2">
                {related.map((r) => {
                  const side = r.askerId === me.id ? "asker" : r.receiverId === me.id ? "receiver" : "observer";
                  const other = map.get(side === "receiver" ? r.askerId : r.receiverId);
                  const { label } = requestStatusText(r, side, other?.displayName ?? "");
                  return (
                    <li key={r.id}>
                      <Link href={`/w/${slug}/requests/${r.id}`} className="flex items-center gap-2 rounded-oh-lg border border-oh-border bg-oh-surface p-2.5 hover:shadow-oh-md focus-visible:outline-3 focus-visible:outline-oh-focus">
                        {other && <Mascot mascot={other.mascot} mood="relaxed" size={32} decorative />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-oh-sm font-medium">{r.title}</span>
                          <span className="text-oh-xs text-oh-ink-muted">{label}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="dec-h">
            <h2 id="dec-h" className="mb-2 text-oh-lg font-semibold">
              Quyết định
            </h2>
            {decs.length === 0 ? (
              <p className="text-oh-sm text-oh-ink-muted">Chưa có quyết định nào.</p>
            ) : (
              <ul className="space-y-3">
                {decs.map((d) => {
                  const by = map.get(d.decidedById);
                  return by ? (
                    <li key={d.id}>
                      <DecisionCard decision={d} decidedBy={by} />
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="ev-h">
            <h2 id="ev-h" className="mb-1 flex items-center gap-2 text-oh-lg font-semibold">
              Sự kiện <Badge>{events.length}</Badge>
            </h2>
            {events.length === 0 ? (
              <p className="text-oh-sm text-oh-ink-muted">Chưa có sự kiện nào.</p>
            ) : (
              <ul className="divide-y divide-oh-border">
                {events.map((e) => (
                  <EventRow key={e.id} event={e} actorName={e.actorMemberId ? map.get(e.actorMemberId)?.displayName : undefined} detail={eventDetail(e, board.data!)} />
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <NewRequestDialog open={creating} onClose={() => setCreating(false)} slug={slug} members={board.data.members} tasks={board.data.tasks} meId={me.id} defaultTaskId={task.id} defaultReceiverId={owner && owner.id !== me.id ? owner.id : null} />
    </div>
  );
}
