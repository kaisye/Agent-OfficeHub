"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Drawer, EmptyState, EventRow, Icon, Mascot, TaskChip, relativeTimeVi, requestDirectionLabel } from "@officehub/ui";
import type { Board, Member, Request } from "@officehub/shared";
import { eventDetail } from "@/lib/events";
import { useBoard, useInbox } from "@/lib/hooks";
import { memberMap, needsMe } from "@/lib/requests";
import { NewRequestDialog } from "./new-request-dialog";
import { OfficeMap } from "./office-map";
import { ProfileDrawer } from "./profile-drawer";
import { SimulateTeammate } from "./simulate-teammate";
import { PageSkeleton } from "./skeletons";
import { TaskScreen } from "./task-screen";
import { useWorkspace } from "./workspace";

/** Văn phòng: 2D office map + "Hôm nay" panel (inbox, open tasks, recent events). */
export function BoardScreen() {
  const { slug, me } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const board = useBoard(slug);
  const inbox = useInbox(slug);
  const [creating, setCreating] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);

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
  const openId = params.get("member");
  const opened = b.members.find((m) => m.id === openId) ?? null;
  const setOpen = (m: Member | null) => router.replace(m ? `/w/${slug}?member=${m.id}` : `/w/${slug}`, { scroll: false });
  const online = b.cards.filter((c) => c.presence !== "offline").length;
  const openTasks = b.tasks.filter((t) => t.state !== "done" && t.state !== "closed");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.15em] text-oh-ink-muted">
            <Icon name="leaf" size={13} />
            MỘT CHỖ ẤM ÁP ĐỂ LÀM VIỆC CÙNG NHAU
          </p>
          <h1 className="text-oh-3xl font-bold tracking-tight">Văn phòng {b.workspace.name}</h1>
          <p className="mt-1 text-oh-sm text-oh-ink-muted">Thấy nhau đang làm gì. Agent chỉ soạn nháp, bạn là người bấm gửi.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SimulateTeammate slug={slug} />
          <Button variant="primary" icon="request" onClick={() => setCreating(true)}>
            Tạo yêu cầu
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="đang online" value={`${online}/${b.members.length}`} />
        <Stat label="cần bạn xử lý" value={String(mine.length)} />
        <Stat label="việc đang mở" value={String(openTasks.length)} />
      </dl>

      <div className="oh-office-layout">
        <OfficeMap board={b} meId={me.id} onOpen={setOpen} />
        <aside className="oh-today space-y-6 rounded-oh-lg border border-oh-border bg-oh-surface p-5 shadow-oh-md" aria-label="Hôm nay">
          <h2 className="text-oh-lg font-semibold">Hôm nay</h2>
          <NeedsYou requests={mine} members={b.members} slug={slug} meId={me.id} />
          <OpenTasks board={b} onOpen={setTaskId} />
          <Events board={b} />
        </aside>
      </div>

      <ProfileDrawer member={opened} board={b} onClose={() => setOpen(null)} />
      <Drawer open={!!taskId} onClose={() => setTaskId(null)} title="Bàn giao">
        {taskId && <TaskScreen id={taskId} embedded />}
      </Drawer>
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} slug={slug} members={b.members} tasks={b.tasks} meId={me.id} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-oh-lg border border-oh-border bg-oh-surface p-4 shadow-oh-md">
      <dd className="text-oh-2xl font-bold leading-none">{value}</dd>
      <dt className="mt-1.5 text-oh-xs text-oh-ink-muted">{label}</dt>
    </div>
  );
}

/* ---------- Cần bạn xử lý (nháp agent tách riêng) ---------- */
function NeedsYou({ requests, members, slug, meId }: { requests: Request[]; members: Member[]; slug: string; meId: string }) {
  const map = memberMap(members);
  if (requests.length === 0) {
    return (
      <section aria-label="Cần bạn xử lý" className="flex items-center gap-2.5 rounded-oh-md bg-oh-success-soft p-3 text-oh-sm text-oh-success-soft-fg">
        <Icon name="check" size={18} />
        Hộp thư trống. Không ai đang chờ bạn.
      </section>
    );
  }
  const drafts = requests.filter((r) => r.askerId === meId && r.status === "draft");
  const others = requests.filter((r) => !(r.askerId === meId && r.status === "draft"));
  return (
    <section aria-labelledby="needs-h">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 id="needs-h" className="flex items-center gap-2 text-oh-sm font-semibold">
          Cần bạn xử lý
          <Badge tone="human">{requests.length}</Badge>
        </h3>
        <Link href={`/w/${slug}/requests`} className="text-oh-xs font-medium text-oh-primary underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-oh-focus">
          Xem tất cả
        </Link>
      </div>
      {others.length > 0 && <NeedsList items={others.slice(0, 4)} map={map} slug={slug} meId={meId} labelledBy="needs-h" />}
      {drafts.length > 0 && (
        <div className="mt-3">
          <h3 id="drafts-h" className="mb-1 flex items-center gap-2 text-oh-xs font-semibold text-oh-ink-muted">
            <Icon name="draft" size={13} />
            Nháp agent chờ bạn gửi
            <Badge tone="agent">{drafts.length}</Badge>
          </h3>
          <NeedsList items={drafts.slice(0, 4)} map={map} slug={slug} meId={meId} labelledBy="drafts-h" />
        </div>
      )}
    </section>
  );
}

function NeedsList({ items, map, slug, meId, labelledBy }: { items: Request[]; map: Map<string, Member>; slug: string; meId: string; labelledBy: string }) {
  return (
    <ul aria-labelledby={labelledBy}>
      {items.map((r) => {
        const asker = map.get(r.askerId);
        const receiver = map.get(r.receiverId);
        const other = r.askerId === meId ? receiver : asker;
        return (
          <li key={r.id} className="min-w-0 border-b border-oh-border last:border-0">
            <Link href={`/w/${slug}/requests?open=${r.id}`} className="flex min-w-0 items-center gap-2.5 py-2.5 hover:text-oh-primary focus-visible:outline-3 focus-visible:outline-oh-focus">
              {other && <Mascot mascot={other.mascot} mood="relaxed" size={32} decorative noBadge />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {r.unreadForViewer && <span role="img" aria-label="Chưa đọc" className="size-2 shrink-0 rounded-oh-full bg-oh-primary" />}
                  <span className="truncate text-oh-sm font-medium">{r.title}</span>
                </span>
                <span className="block truncate text-oh-xs text-oh-ink-muted">
                  {requestDirectionLabel(r, meId, asker?.displayName ?? "", receiver?.displayName ?? "")} · {relativeTimeVi(r.updatedAt)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Việc đang mở ---------- */
function OpenTasks({ board, onOpen }: { board: Board; onOpen: (id: string) => void }) {
  const map = memberMap(board.members);
  const open = board.tasks.filter((t) => t.state !== "done" && t.state !== "closed");
  return (
    <section aria-labelledby="tasks-h">
      <h3 id="tasks-h" className="mb-2 text-oh-sm font-semibold">
        Việc đang mở
      </h3>
      {open.length === 0 ? (
        <p className="text-oh-sm text-oh-ink-muted">Chưa có việc nào đang mở.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((t) => {
            const owner = t.assigneeId ? map.get(t.assigneeId) : null;
            return (
              <li key={t.id} className="min-w-0 overflow-hidden rounded-oh-md border border-oh-border bg-oh-bg p-2.5">
                <TaskChip task={t} className="max-w-full [&_.font-mono]:whitespace-nowrap" />
                <div className="mt-1.5 flex items-center justify-between gap-2 text-oh-xs text-oh-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    {owner && <Mascot mascot={owner.mascot} mood="relaxed" size={24} decorative noBadge />}
                    {owner?.displayName ?? "Chưa giao"}
                  </span>
                  <button type="button" onClick={() => onOpen(t.id)} className="font-medium text-oh-primary underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-oh-focus">
                    Bàn giao
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------- Gần đây ---------- */
function Events({ board }: { board: Board }) {
  const map = memberMap(board.members);
  return (
    <section aria-labelledby="events-h">
      <h3 id="events-h" className="mb-1 text-oh-sm font-semibold">
        Gần đây
      </h3>
      {board.recentEvents.length === 0 ? (
        <p className="text-oh-sm text-oh-ink-muted">Chưa có sự kiện nào.</p>
      ) : (
        <ul className="divide-y divide-oh-border">
          {board.recentEvents.slice(0, 10).map((e) => (
            <EventRow key={e.id} event={e} actorName={e.actorMemberId ? map.get(e.actorMemberId)?.displayName : undefined} detail={eventDetail(e, board)} />
          ))}
        </ul>
      )}
    </section>
  );
}
