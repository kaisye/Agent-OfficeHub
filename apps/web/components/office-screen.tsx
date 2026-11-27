"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Drawer, EmptyState, EventRow, Icon, Mascot, TaskChip } from "@officehub/ui";
import { outOfArea, type Board, type Role } from "@officehub/shared";
import { eventDetail } from "@/lib/events";
import { useAgents, useBoard, useQueue } from "@/lib/hooks";
import { agentRoleName, queueCount, roleMap } from "@/lib/requests";
import { NewRequestDialog } from "./new-request-dialog";
import { OfficeMap } from "./office-map";
import { RoleDrawer } from "./role-drawer";
import { PageSkeleton } from "./skeletons";
import { TaskScreen } from "./task-screen";
import { useWorkspace } from "./workspace";

/** Văn phòng: six role desks + the orchestrator's desk, and a "Hôm nay" panel (queue, open tasks, events). */
export function OfficeScreen() {
  const { slug } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const board = useBoard(slug);
  const queue = useQueue(slug);
  const [assigning, setAssigning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);

  if (board.isError) {
    return <EmptyState title="Chưa tải được văn phòng" mood="worried" description="Chưa kết nối được. Thử lại sau nhé." action={<Button onClick={() => void board.refetch()}>Thử lại</Button>} />;
  }
  if (!board.data) return <PageSkeleton label="Đang tải văn phòng…" />;
  const b = board.data;
  const opened = b.roles.find((r) => r.id === params.get("role")) ?? null;
  const setOpen = (r: Role | null) => router.replace(r ? `/w/${slug}/office?role=${r.id}` : `/w/${slug}/office`, { scroll: false });
  const active = b.cards.filter((c) => c.presence !== "offline").length;
  const openTasks = b.tasks.filter((t) => t.state !== "done" && t.state !== "closed");
  const qn = queueCount(queue.data);
  const outCount = b.roles.filter((r) => outOfArea(r, b.cards.find((c) => c.roleId === r.id)?.paths ?? [], b.roles).length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.15em] text-oh-ink-muted">
            <Icon name="leaf" size={13} />
            MỘT NGƯỜI ĐIỀU PHỐI, SÁU VAI TRÒ
          </p>
          <h1 className="text-oh-3xl font-bold tracking-tight">Văn phòng {b.workspace.name}</h1>
          <p className="mt-1 text-oh-sm text-oh-ink-muted">Thấy từng vai trò đang làm gì, sửa file nào, chờ ai.</p>
        </div>
        <Button variant="primary" icon="request" onClick={() => setAssigning(true)}>
          Giao việc
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Stat label="vai trò đang hoạt động" value={`${active}/${b.roles.length}`} />
        <Stat label="chờ bạn duyệt" value={String(qn)} href={`/w/${slug}`} />
        <Stat label="sửa ngoài vùng" value={String(outCount)} warn={outCount > 0} />
        <Stat label="việc đang mở" value={String(openTasks.length)} />
      </dl>

      <div className="oh-office-layout">
        <OfficeMap board={b} queueCount={qn} onOpen={setOpen} onOpenQueue={() => router.push(`/w/${slug}`)} />
        <aside className="oh-today space-y-6 rounded-oh-lg border border-oh-border bg-oh-surface p-5 shadow-oh-md" aria-label="Hôm nay">
          <h2 className="text-oh-lg font-semibold">Hôm nay</h2>
          <QueueSummary n={qn} blockers={queue.data?.requests.filter((r) => r.kind === "blocker").length ?? 0} slug={slug} />
          <OpenTasks board={b} onOpen={setTaskId} />
          <Events board={b} />
        </aside>
      </div>

      <RoleDrawer role={opened} board={b} onClose={() => setOpen(null)} />
      <Drawer open={!!taskId} onClose={() => setTaskId(null)} title="Bàn giao">
        {taskId && <TaskScreen id={taskId} embedded />}
      </Drawer>
      <NewRequestDialog open={assigning} onClose={() => setAssigning(false)} slug={slug} roles={b.roles} tasks={b.tasks} />
    </div>
  );
}

function Stat({ label, value, href, warn }: { label: string; value: string; href?: string; warn?: boolean }) {
  const inner = (
    <>
      <dd className={warn ? "text-oh-2xl font-bold leading-none text-oh-warning-soft-fg" : "text-oh-2xl font-bold leading-none"}>{value}</dd>
      <dt className="mt-1.5 text-oh-xs text-oh-ink-muted">{label}</dt>
    </>
  );
  const cls = "block rounded-oh-lg border border-oh-border bg-oh-surface p-4 shadow-oh-md";
  return href ? (
    <Link href={href} className={`${cls} hover:border-oh-border-strong focus-visible:outline-3 focus-visible:outline-oh-focus`}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function QueueSummary({ n, blockers, slug }: { n: number; blockers: number; slug: string }) {
  if (n === 0) {
    return (
      <section aria-label="Chờ duyệt" className="flex items-center gap-2.5 rounded-oh-md bg-oh-success-soft p-3 text-oh-sm text-oh-success-soft-fg">
        <Icon name="check" size={18} />
        Không có gì chờ bạn duyệt.
      </section>
    );
  }
  return (
    <section aria-label="Chờ duyệt" className="space-y-2 rounded-oh-md border border-oh-primary bg-oh-primary-soft p-3 text-oh-primary-soft-fg">
      <p className="flex items-center gap-2 text-oh-sm font-semibold">
        <Icon name="shield" size={16} />
        {n} việc chờ bạn duyệt
      </p>
      {blockers > 0 && <Badge tone="danger" icon="alert">{blockers} đang kẹt</Badge>}
      <Link href={`/w/${slug}`} className="block text-oh-xs font-medium underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-oh-focus">
        Mở hàng chờ duyệt
      </Link>
    </section>
  );
}

function OpenTasks({ board, onOpen }: { board: Board; onOpen: (id: string) => void }) {
  const roles = roleMap(board.roles);
  const open = board.tasks.filter((t) => t.state !== "done" && t.state !== "closed");
  return (
    <section aria-labelledby="tasks-h">
      <h3 id="tasks-h" className="mb-2 text-oh-sm font-semibold">Việc đang mở</h3>
      {open.length === 0 ? (
        <p className="text-oh-sm text-oh-ink-muted">Chưa có việc nào đang mở.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((t) => {
            const owner = t.roleId ? roles.get(t.roleId) : null;
            return (
              <li key={t.id} className="min-w-0 overflow-hidden rounded-oh-md border border-oh-border bg-oh-bg p-2.5">
                <TaskChip task={t} className="max-w-full [&_.font-mono]:whitespace-nowrap" />
                <div className="mt-1.5 flex items-center justify-between gap-2 text-oh-xs text-oh-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    {owner && <Mascot mascot={owner.mascot} mood="relaxed" size={24} decorative noBadge />}
                    {owner?.name ?? "Chưa giao"}
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

function Events({ board }: { board: Board }) {
  const { slug } = useWorkspace();
  const agents = useAgents(slug);
  const roles = roleMap(board.roles);
  return (
    <section aria-labelledby="events-h">
      <h3 id="events-h" className="mb-1 text-oh-sm font-semibold">Gần đây</h3>
      {board.recentEvents.length === 0 ? (
        <p className="text-oh-sm text-oh-ink-muted">Chưa có sự kiện nào.</p>
      ) : (
        <ul className="divide-y divide-oh-border">
          {board.recentEvents.slice(0, 10).map((e) => (
            <EventRow key={e.id} event={e} actorName={e.actorAgentId ? agentRoleName(e.actorAgentId, agents.data, roles) ?? "agent" : e.actorMemberId ? "Bạn" : undefined} detail={eventDetail(e, board)} />
          ))}
        </ul>
      )}
    </section>
  );
}
