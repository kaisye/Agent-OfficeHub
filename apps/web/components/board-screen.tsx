"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, EventRow, Icon, Mascot, MemberCard, TaskChip, relativeTimeVi } from "@officehub/ui";
import type { Board, Member, Request, StatusCard } from "@officehub/shared";
import { eventDetail } from "@/lib/events";
import { useBoard, useInbox } from "@/lib/hooks";
import { memberMap, needsMe } from "@/lib/requests";
import { requestStatusText } from "@officehub/ui";
import { NewRequestDialog } from "./new-request-dialog";
import { PulseOnChange } from "./pulse";
import { SimulateTeammate } from "./simulate-teammate";
import { PageSkeleton } from "./skeletons";
import { StatusEditor } from "./status-editor";
import { useWorkspace } from "./workspace";

const ORDER = ["blocked", "waiting", "working", "reviewing", "idle", "offline"] as const;

export function BoardScreen() {
  const { slug, me } = useWorkspace();
  const board = useBoard(slug);
  const inbox = useInbox(slug);
  const [creating, setCreating] = useState(false);

  if (board.isError) {
    return (
      <EmptyState
        title="Chưa tải được văn phòng"
        mood="worried"
        description="Chưa kết nối được. Thử lại sau nhé."
        action={<Button onClick={() => void board.refetch()}>Thử lại</Button>}
      />
    );
  }
  if (!board.data) return <PageSkeleton label="Đang tải văn phòng…" />;
  const b = board.data;
  const mine = needsMe(inbox.data, b, me.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-oh-2xl font-bold">Văn phòng {b.workspace.name}</h1>
          <p className="text-oh-sm text-oh-ink-muted">
            {summary(b)} · cập nhật trực tiếp, không cần tải lại.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SimulateTeammate slug={slug} />
          <Button variant="primary" icon="request" onClick={() => setCreating(true)}>
            Tạo yêu cầu
          </Button>
        </div>
      </div>

      <NeedsYou requests={mine} members={b.members} slug={slug} meId={me.id} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-labelledby="floor-h" className="min-w-0 space-y-4">
          <h2 id="floor-h" className="sr-only">
            Mọi người trong văn phòng
          </h2>
          <WaitingStrip board={b} />
          <OfficeFloor board={b} />
        </section>
        <aside className="min-w-0 space-y-6" aria-label="Việc và sự kiện">
          <OpenTasks board={b} slug={slug} />
          <Events board={b} />
        </aside>
      </div>

      <NewRequestDialog open={creating} onClose={() => setCreating(false)} slug={slug} members={b.members} tasks={b.tasks} meId={me.id} />
    </div>
  );
}

function summary(b: Board) {
  const online = b.cards.filter((c) => c.presence !== "offline").length;
  return `${online}/${b.members.length} người đang online`;
}

/* ---------- Cần bạn xử lý ---------- */
function NeedsYou({ requests, members, slug, meId }: { requests: Request[]; members: Member[]; slug: string; meId: string }) {
  const map = memberMap(members);
  if (requests.length === 0) {
    return (
      <Card as="section" aria-label="Cần bạn xử lý" className="flex items-center gap-3 bg-oh-success-soft text-oh-success-soft-fg">
        <Icon name="check" size={18} />
        <p className="text-oh-sm">Hộp thư trống. Không ai đang chờ bạn.</p>
      </Card>
    );
  }
  // My own unsent drafts (agent-drafted asks) are kept apart from things other people are waiting on.
  const drafts = requests.filter((r) => r.askerId === meId && r.status === "draft");
  const others = requests.filter((r) => !(r.askerId === meId && r.status === "draft"));
  return (
    <Card as="section" aria-labelledby="needs-h" className="border-oh-primary bg-oh-primary-soft/40">
      <div className="flex items-center justify-between gap-2">
        <h2 id="needs-h" className="flex items-center gap-2 text-oh-lg font-semibold">
          Cần bạn xử lý
          <Badge tone="human">{requests.length}</Badge>
        </h2>
        <Link href={`/w/${slug}/requests`} className="text-oh-sm font-medium underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-oh-focus">
          Xem tất cả
        </Link>
      </div>
      {others.length > 0 && <NeedsList items={others.slice(0, 4)} map={map} slug={slug} meId={meId} labelledBy="needs-h" />}
      {drafts.length > 0 && (
        <div className={others.length > 0 ? "mt-4" : "mt-3"}>
          <h3 id="drafts-h" className="mb-2 flex items-center gap-2 text-oh-sm font-semibold text-oh-ink-muted">
            <Icon name="draft" size={14} />
            Nháp agent chờ bạn gửi
            <Badge tone="agent">{drafts.length}</Badge>
          </h3>
          <NeedsList items={drafts.slice(0, 4)} map={map} slug={slug} meId={meId} labelledBy="drafts-h" />
        </div>
      )}
    </Card>
  );
}

function NeedsList({ items, map, slug, meId, labelledBy }: { items: Request[]; map: Map<string, Member>; slug: string; meId: string; labelledBy: string }) {
  return (
    <ul aria-labelledby={labelledBy} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
      {items.map((r) => {
        const side = r.askerId === meId ? "asker" : "receiver";
        const other = map.get(side === "asker" ? r.receiverId : r.askerId);
        const { label } = requestStatusText(r, side, other?.displayName ?? "");
        return (
          <li key={r.id} className="min-w-0">
            <Link
              href={`/w/${slug}/requests/${r.id}`}
              className="flex min-w-0 items-center gap-3 rounded-oh-lg border border-oh-border bg-oh-surface p-3 hover:shadow-oh-md focus-visible:outline-3 focus-visible:outline-oh-focus"
            >
              {other && <Mascot mascot={other.mascot} mood="relaxed" size={32} title={other.displayName} />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  {r.unreadForViewer && <span role="img" aria-label="Chưa đọc" className="size-2.5 shrink-0 rounded-oh-full bg-oh-primary" />}
                  <span className="truncate text-oh-sm font-medium">{r.title}</span>
                </span>
                <span className="block truncate text-oh-xs text-oh-ink-muted">
                  {label} · {other?.displayName} · {relativeTimeVi(r.updatedAt)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Ai đang chờ ai ---------- */
function WaitingStrip({ board }: { board: Board }) {
  const map = memberMap(board.members);
  const pairs = board.cards.flatMap((c) => c.waitingOn.map((w) => ({ from: map.get(c.memberId), to: map.get(w), presence: c.presence })));
  const valid = pairs.filter((p) => p.from && p.to);
  if (valid.length === 0) return null;
  return (
    <section aria-label="Ai đang chờ ai" className="rounded-oh-lg border border-oh-border bg-oh-surface p-3">
      <h3 className="mb-2 text-oh-xs font-semibold uppercase tracking-wide text-oh-ink-muted">Ai đang chờ ai</h3>
      <ul className="flex flex-wrap gap-2">
        {valid.map((p, i) => (
          <li
            key={i}
            className="inline-flex items-center gap-1.5 rounded-oh-full bg-oh-warning-soft py-0.5 pl-0.5 pr-3 text-oh-sm text-oh-warning-soft-fg"
            aria-label={`${p.from!.displayName} đang chờ ${p.to!.displayName}`}
          >
            <PulseOnChange value={p.presence} className="rounded-oh-full">
              <Mascot mascot={p.from!.mascot} presence={p.presence} size={24} title={p.from!.displayName} />
            </PulseOnChange>
            <span className="font-medium">{p.from!.displayName}</span>
            <Icon name="reply" size={14} className="rotate-180" />
            <Mascot mascot={p.to!.mascot} mood="relaxed" size={24} title={p.to!.displayName} />
            <span className="font-medium">{p.to!.displayName}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Sàn văn phòng ---------- */
function OfficeFloor({ board }: { board: Board }) {
  const { slug, me } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const map = memberMap(board.members);
  const cards = new Map<string, StatusCard>(board.cards.map((c) => [c.memberId, c]));

  const members = useMemo(() => {
    const rank = (m: Member) => (m.id === me.id ? -1 : ORDER.indexOf(cards.get(m.id)?.presence ?? "offline"));
    return [...board.members].sort((a, b) => rank(a) - rank(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.members, board.cards, me.id]);

  const quiet = board.cards.every((c) => c.presence === "offline") && !board.cards.some((c) => c.doing);
  if (quiet && board.members.length <= 1) {
    return <EmptyState title="Chưa ai báo gì hôm nay" description="Văn phòng đang yên tĩnh." mascot={me.mascot} mood="sleeping" />;
  }

  return (
    <div className="oh-floor rounded-oh-xl border border-oh-border p-3 sm:p-4">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => {
          const status = cards.get(m.id) ?? null;
          const waiting = (status?.waitingOn ?? []).map((id) => map.get(id)).filter((x): x is Member => !!x);
          const mineCard = m.id === me.id;
          return (
            <li key={m.id} className={mineCard && editing ? "sm:col-span-2 xl:col-span-3" : undefined}>
              {mineCard ? (
                <div className="space-y-2">
                  <PulseOnChange value={status?.presence ?? "offline"}>
                    <MemberCard member={m} status={status} waitingOnMembers={waiting} className="ring-2 ring-oh-primary ring-offset-2 ring-offset-transparent" />
                  </PulseOnChange>
                  {editing ? (
                    <StatusEditor slug={slug} me={me} members={board.members} current={status} onClose={() => setEditing(false)} />
                  ) : (
                    <div className="space-y-1.5">
                      <p className="px-1 text-oh-xs text-oh-ink-muted">
                        Thẻ của bạn{status ? ` · cập nhật ${relativeTimeVi(status.updatedAt)}` : ""}
                      </p>
                      <Button size="sm" variant="secondary" icon="edit" className="w-full bg-oh-surface" onClick={() => setEditing(true)}>
                        Cập nhật trạng thái
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <PulseOnChange value={status?.presence ?? "offline"} className="h-full">
                    <MemberCard member={m} status={status} waitingOnMembers={waiting} className="h-full" />
                  </PulseOnChange>
                  {status && <p className="px-1 text-oh-xs text-oh-ink-muted">Cập nhật {relativeTimeVi(status.updatedAt)}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Việc đang mở ---------- */
function OpenTasks({ board, slug }: { board: Board; slug: string }) {
  const map = memberMap(board.members);
  const open = board.tasks.filter((t) => t.state !== "done" && t.state !== "closed");
  return (
    <section aria-labelledby="tasks-h">
      <h2 id="tasks-h" className="mb-2 text-oh-lg font-semibold">
        Việc đang mở
      </h2>
      {open.length === 0 ? (
        <p className="text-oh-sm text-oh-ink-muted">Chưa có việc nào đang mở.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((t) => {
            const owner = t.assigneeId ? map.get(t.assigneeId) : null;
            return (
              <li key={t.id} className="min-w-0 overflow-hidden rounded-oh-lg border border-oh-border bg-oh-surface p-2.5">
                <TaskChip task={t} className="max-w-full [&_.font-mono]:whitespace-nowrap" />
                <div className="mt-1.5 flex items-center justify-between gap-2 text-oh-xs text-oh-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    {owner && <Mascot mascot={owner.mascot} mood="relaxed" size={24} title={owner.displayName} />}
                    {owner?.displayName ?? "Chưa giao"}
                  </span>
                  <Link href={`/w/${slug}/tasks/${t.id}`} className="font-medium underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-oh-focus">
                    Bàn giao
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------- Sự kiện gần đây ---------- */
function Events({ board }: { board: Board }) {
  const map = memberMap(board.members);
  return (
    <section aria-labelledby="events-h">
      <h2 id="events-h" className="mb-1 text-oh-lg font-semibold">
        Gần đây
      </h2>
      {board.recentEvents.length === 0 ? (
        <p className="text-oh-sm text-oh-ink-muted">Chưa có sự kiện nào.</p>
      ) : (
        <ul className="divide-y divide-oh-border">
          {board.recentEvents.slice(0, 12).map((e) => (
            <EventRow key={e.id} event={e} actorName={e.actorMemberId ? map.get(e.actorMemberId)?.displayName : undefined} detail={eventDetail(e, board)} />
          ))}
        </ul>
      )}
    </section>
  );
}
