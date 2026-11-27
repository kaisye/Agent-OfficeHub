"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Icon, Mascot, StatusBadge, cn, relativeTimeVi } from "@officehub/ui";
import { outOfArea, type Board, type PresenceState, type Role } from "@officehub/shared";
import { roleMap } from "@/lib/requests";
import { PulseOnChange } from "./pulse";
import { ORCHESTRATOR_SEAT, WalkerLayer, useDemoTraffic, useRequestTraffic, useWalkQueue, type Seat } from "./office-walkers";
import { API_MODE, SHOW_DEV_LOGIN } from "@/lib/api";

/** Visual-only demo traffic is offered in development builds and in mock mode, never in a production http build. */
const DEMO_ALLOWED = API_MODE === "mock" || SHOW_DEV_LOGIN;
const BOOK = ["var(--oh-brand-forest)", "var(--oh-brand-cobalt)", "#b87a50", "#94815f"];

/**
 * 2D office (v0.6): the orchestrator's desk, then one desk per role in build order (wave).
 * Each desk shows the role card: presence → mascot mood, doing, branch, files being edited
 * (with an out-of-area warning naming the owner) and who it waits on.
 */
export function OfficeMap({ board, queueCount, onOpen, onOpenQueue }: { board: Board; queueCount: number; onOpen: (r: Role) => void; onOpenQueue: () => void }) {
  const roles = board.roles;
  const byId = roleMap(roles);
  const cards = new Map(board.cards.map((c) => [c.roleId, c]));
  const presenceOf = (r: Role): PresenceState => cards.get(r.id)?.presence ?? "offline";
  const online = roles.filter((r) => presenceOf(r) !== "offline").length;
  const me = board.orchestrator;
  const seats = useMemo<Seat[]>(
    () => [{ id: ORCHESTRATOR_SEAT, displayName: "Bạn", mascot: me.mascot }, ...roles.map((r) => ({ id: r.id, displayName: r.name, mascot: r.mascot }))],
    [roles, me.mascot],
  );

  const floorRef = useRef<HTMLDivElement>(null);
  const desks = useRef(new Map<string, HTMLElement>());
  const deskRef = useCallback((id: string) => desks.current.get(id), []);
  const setDesk = (id: string) => (el: HTMLElement | null) => {
    if (el) desks.current.set(id, el);
    else desks.current.delete(id);
  };
  const [away, setAway] = useState<Set<string>>(new Set());
  const onAway = useCallback((id: string, isAway: boolean) => {
    setAway((cur) => {
      if (cur.has(id) === isAway) return cur;
      const next = new Set(cur);
      if (isAway) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const [demo, setDemo] = useState(false);
  const { active, enqueue, done } = useWalkQueue();
  useRequestTraffic(board, enqueue);
  useDemoTraffic(demo, seats, enqueue);

  return (
    <section aria-labelledby="office-h" className="overflow-hidden rounded-oh-lg border border-oh-border bg-oh-surface shadow-oh-md">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pb-3 pt-5">
        <div className="min-w-[12rem] flex-1">
          <h2 id="office-h" className="text-oh-lg font-semibold">Bản đồ văn phòng</h2>
          <p className="mt-1 flex items-center gap-1.5 text-oh-xs text-oh-ink-muted">
            <span aria-hidden="true" className="size-1.5 rounded-oh-full bg-oh-success" />
            {online}/{roles.length} vai trò đang hoạt động · xếp theo đợt · cập nhật trực tiếp
          </p>
        </div>
        {DEMO_ALLOWED && (
          <button
            type="button"
            aria-pressed={demo}
            onClick={() => setDemo((d) => !d)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-oh-md border px-3 py-1.5 text-oh-xs font-medium focus-visible:outline-3 focus-visible:outline-oh-focus",
              demo ? "border-oh-primary bg-oh-primary-soft text-oh-primary-soft-fg" : "border-oh-border text-oh-ink-muted hover:bg-oh-surface-2",
            )}
            title="Chỉ hiệu ứng hình ảnh, không tạo dữ liệu"
          >
            <Icon name="office" size={13} />
            {demo ? "Dừng mô phỏng" : "Mô phỏng trao đổi"}
          </button>
        )}
      </div>

      <div className="oh-floorplan" ref={floorRef}>
        <span className="absolute left-5 top-3 z-[2] flex items-center gap-1.5 text-xs" style={{ color: "var(--oh-ink-muted)" }}>
          <span aria-hidden="true" className="size-1.5 rounded-oh-full bg-oh-success" />
          Cả văn phòng
          <small className="ml-1 border-l pl-2 text-[11px]" style={{ borderColor: "var(--oh-border-strong)" }}>Chọn một bàn để xem vai trò</small>
        </span>
        <div aria-hidden="true" className="oh-window" style={{ left: "25%" }} />
        <div aria-hidden="true" className="oh-window" style={{ right: "18%" }} />
        <div aria-hidden="true" className="oh-rug" />
        <div aria-hidden="true" className="oh-plant" style={{ left: 18, top: 62 }} />
        <div aria-hidden="true" className="oh-plant" style={{ right: 18, top: 62 }} />

        <ul className="oh-desks">
          <li className="min-w-0">
            <button
              type="button"
              className="oh-ws h-full w-full"
              data-me="true"
              data-presence="reviewing"
              data-away={away.has(ORCHESTRATOR_SEAT)}
              ref={setDesk(ORCHESTRATOR_SEAT)}
              onClick={onOpenQueue}
              aria-label={`Bàn điều phối (bạn): ${queueCount} việc chờ duyệt. Mở hàng chờ`}
            >
              <span className="oh-tag">
                {me.displayName}
                <span className="font-normal text-oh-ink-muted">· điều phối</span>
              </span>
              <Mascot className="oh-desk-mascot" mascot={me.mascot} mood="curious" size={96} decorative />
              <span className="oh-desk" aria-hidden="true">
                <i className="oh-monitor" />
                <i className="oh-keyboard" />
                <i className="oh-mug" />
              </span>
              <span className="mt-4 flex w-full min-w-0 flex-col items-center gap-1.5">
                <span className={cn("inline-flex items-center gap-1 rounded-oh-full px-2.5 py-0.5 text-oh-xs font-semibold", queueCount ? "bg-oh-primary text-oh-primary-fg" : "bg-oh-success-soft text-oh-success-soft-fg")}>
                  <Icon name="shield" size={12} />
                  {queueCount ? `${queueCount} chờ duyệt` : "Không có gì chờ"}
                </span>
                <span className="text-oh-xs text-oh-ink-muted">Mọi tin giữa các vai trò đi qua bàn này.</span>
              </span>
            </button>
          </li>
          {roles.map((r, i) => {
            const status = cards.get(r.id) ?? null;
            const presence = presenceOf(r);
            const waiting = (status?.waitingOn ?? []).map((id) => byId.get(id)?.name).filter(Boolean) as string[];
            const out = outOfArea(r, status?.paths ?? [], roles);
            const byAgent = status?.updatedBy === "agent";
            const paths = status?.paths ?? [];
            return (
              <li key={r.id} className="min-w-0">
                <PulseOnChange value={presence} className="h-full">
                  <button
                    type="button"
                    className="oh-ws h-full w-full"
                    data-presence={presence}
                    data-away={away.has(r.id)}
                    data-out-of-area={out.length > 0}
                    ref={setDesk(r.id)}
                    onClick={() => onOpen(r)}
                    aria-label={`${r.name}, đợt ${r.wave}. ${out.length ? `Đang sửa ${out.length} file ngoài vùng. ` : ""}Mở vai trò`}
                  >
                    <span className="oh-tag">
                      {r.name}
                      <span className="font-normal text-oh-ink-muted">· đợt {r.wave}</span>
                    </span>
                    <Mascot className="oh-desk-mascot" mascot={r.mascot} presence={presence} size={96} agentBadge={byAgent} decorative />
                    <span className="oh-desk" aria-hidden="true">
                      <i className="oh-monitor" />
                      <i className="oh-keyboard" />
                      <i className="oh-mug" />
                      <i className="oh-book" style={{ background: BOOK[i % BOOK.length] }} />
                    </span>
                    <span className="mt-4 flex w-full min-w-0 flex-col items-center gap-1">
                      <StatusBadge presence={presence} />
                      <span className="line-clamp-2 text-oh-xs text-oh-ink">{status?.doing ?? <span className="text-oh-ink-muted">Chưa có cập nhật.</span>}</span>
                      <span className="line-clamp-1 text-[11px] text-oh-ink-muted" title={r.mission}>{r.mission}</span>
                      {status?.branch && (
                        <span className="inline-flex max-w-full items-center gap-1 font-mono text-[11px] text-oh-ink-muted">
                          <Icon name="pr" size={11} className="shrink-0" />
                          <span className="truncate">{status.branch}</span>
                        </span>
                      )}
                      {paths.length > 0 && (
                        <span className="flex max-w-full flex-wrap justify-center gap-1" aria-label="File đang sửa">
                          {paths.slice(0, 2).map((p) => (
                            <code key={p} title={p} className={cn("max-w-full truncate rounded-oh-sm px-1 text-[10.5px]", out.some((o) => o.path === p) ? "bg-oh-warning-soft text-oh-warning-soft-fg" : "bg-oh-surface-2 text-oh-ink-muted")}>
                              {p.split("/").slice(-2).join("/")}
                            </code>
                          ))}
                          {paths.length > 2 && <span className="text-[10.5px] text-oh-ink-muted">+{paths.length - 2}</span>}
                        </span>
                      )}
                      {out.length > 0 && (
                        <span className="inline-flex max-w-full items-center gap-1 rounded-oh-sm bg-oh-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-oh-warning-soft-fg">
                          <Icon name="alert" size={11} className="shrink-0" />
                          <span className="truncate">Ngoài vùng: {[...new Set(out.map((o) => o.owner?.name ?? "chưa ai"))].join(", ")}</span>
                        </span>
                      )}
                      {waiting.length > 0 && (
                        <span className="inline-flex max-w-full items-center gap-1 truncate rounded-oh-sm bg-oh-surface-2 px-1.5 py-0.5 text-[11px] text-oh-ink-muted">
                          <Icon name="reply" size={11} className="shrink-0 rotate-180" />
                          <span className="truncate">Đang chờ {waiting.join(", ")}</span>
                        </span>
                      )}
                      {byAgent && status && <span className="text-[11px] text-oh-agent">agent cập nhật · {relativeTimeVi(status.updatedAt)}</span>}
                    </span>
                  </button>
                </PulseOnChange>
              </li>
            );
          })}
        </ul>

        <WalkerLayer walks={active} members={seats} floorRef={floorRef} deskRef={deskRef} onAway={onAway} onDone={done} />

        <div aria-hidden="true" className="oh-lounge">
          <div className="oh-sofa"><span /><span /><span /></div>
          <div className="oh-coffee" />
        </div>
        <div aria-hidden="true" className="oh-shelf"><i /><i /><i /></div>
      </div>
      <div className="flex items-center gap-1.5 px-5 py-3 text-oh-xs text-oh-ink-muted">
        <Icon name="leaf" size={13} />
        Mỗi bàn là một vai trò, có thể nhiều phiên agent cùng giữ. Chip vàng: đang sửa file thuộc vùng của vai trò khác.
      </div>
    </section>
  );
}
