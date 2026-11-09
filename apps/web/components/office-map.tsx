"use client";

import { useCallback, useRef, useState } from "react";
import { BUDDIES } from "@officehub/brand";
import { Icon, Mascot, StatusBadge, cn, relativeTimeVi } from "@officehub/ui";
import type { Board, Member, PresenceState, StatusCard } from "@officehub/shared";
import { memberMap } from "@/lib/requests";
import { PulseOnChange } from "./pulse";
import { WalkerLayer, useDemoTraffic, useRequestTraffic, useWalkQueue } from "./office-walkers";
import { API_MODE, SHOW_DEV_LOGIN } from "@/lib/api";

/** Visual-only demo traffic is offered in development builds and in mock mode, never in a production http build. */
const DEMO_ALLOWED = API_MODE === "mock" || SHOW_DEV_LOGIN;

type Room = "all" | "focus" | "wait" | "rest";
const ROOMS: { id: Room; label: string; hint: string; match: (p: PresenceState) => boolean }[] = [
  { id: "all", label: "Cả văn phòng", hint: "Chọn một người để xem hồ sơ", match: () => true },
  { id: "focus", label: "Khu tập trung", hint: "Đang làm hoặc đang xem", match: (p) => p === "working" || p === "reviewing" },
  { id: "wait", label: "Góc chờ", hint: "Đang chờ hoặc bị kẹt", match: (p) => p === "waiting" || p === "blocked" },
  { id: "rest", label: "Sảnh nghỉ", hint: "Rảnh hoặc ngoại tuyến", match: (p) => p === "idle" || p === "offline" },
];
const ORDER: PresenceState[] = ["blocked", "waiting", "working", "reviewing", "idle", "offline"];
const BOOK = ["var(--oh-brand-forest)", "var(--oh-brand-cobalt)", "#b87a50", "#94815f"];

/** 2D office: CSS grid + furniture divs + one workstation button per member. Buddies walk between desks on exchanges. */
export function OfficeMap({ board, meId, onOpen }: { board: Board; meId: string; onOpen: (m: Member) => void }) {
  const [room, setRoom] = useState<Room>("all");
  const map = memberMap(board.members);
  const cards = new Map<string, StatusCard>(board.cards.map((c) => [c.memberId, c]));
  const presenceOf = (m: Member): PresenceState => cards.get(m.id)?.presence ?? "offline";
  const def = ROOMS.find((r) => r.id === room)!;
  const members = [...board.members]
    .filter((m) => def.match(presenceOf(m)))
    .sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : ORDER.indexOf(presenceOf(a)) - ORDER.indexOf(presenceOf(b))));
  const online = board.cards.filter((c) => c.presence !== "offline").length;

  const floorRef = useRef<HTMLDivElement>(null);
  const desks = useRef(new Map<string, HTMLElement>());
  const deskRef = useCallback((id: string) => desks.current.get(id), []);
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
  useDemoTraffic(demo, members, enqueue);

  return (
    <section aria-labelledby="office-h" className="overflow-hidden rounded-oh-lg border border-oh-border bg-oh-surface shadow-oh-md">
      <div className="flex items-start justify-between gap-2 px-5 pb-3 pt-5">
        <div>
          <h2 id="office-h" className="text-oh-lg font-semibold">Bản đồ văn phòng</h2>
          <p className="mt-1 flex items-center gap-1.5 text-oh-xs text-oh-ink-muted">
            <span aria-hidden="true" className="size-1.5 rounded-oh-full bg-oh-success" />
            {online}/{board.members.length} người đang online · cập nhật trực tiếp
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
      <div role="tablist" aria-label="Phòng" className="flex flex-wrap gap-1 px-5 pb-3.5">
        {ROOMS.map((r) => {
          const n = board.members.filter((m) => r.match(presenceOf(m))).length;
          return (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={room === r.id}
              onClick={() => setRoom(r.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-oh-md px-3 py-1.5 text-oh-xs font-medium focus-visible:outline-3 focus-visible:outline-oh-focus",
                room === r.id ? "bg-oh-primary-soft text-oh-primary-soft-fg" : "text-oh-ink-muted hover:bg-oh-surface-2",
              )}
            >
              {r.label}
              <span className="rounded-oh-sm bg-oh-surface-2 px-1.5 text-[11px] text-oh-ink-muted">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="oh-floorplan" role="tabpanel" ref={floorRef}>
        <span className="absolute left-5 top-3 z-[2] flex items-center gap-1.5 text-xs" style={{ color: "var(--oh-ink-muted)" }}>
          <span aria-hidden="true" className="size-1.5 rounded-oh-full bg-oh-success" />
          {def.label}
          <small className="ml-1 border-l pl-2 text-[11px]" style={{ borderColor: "var(--oh-border-strong)" }}>{def.hint}</small>
        </span>
        <div aria-hidden="true" className="oh-window" style={{ left: "25%" }} />
        <div aria-hidden="true" className="oh-window" style={{ right: "18%" }} />
        <div aria-hidden="true" className="oh-rug" />
        <div aria-hidden="true" className="oh-plant" style={{ left: 18, top: 62 }} />
        <div aria-hidden="true" className="oh-plant" style={{ right: 18, top: 62 }} />

        {members.length === 0 ? (
          <p className="py-16 text-center text-oh-sm text-oh-ink-muted">Chưa có ai ở phòng này.</p>
        ) : (
          <ul className="oh-desks">
            {members.map((m, i) => {
              const status = cards.get(m.id) ?? null;
              const presence = presenceOf(m);
              const waiting = (status?.waitingOn ?? []).map((id) => map.get(id)).filter((x): x is Member => !!x);
              const byAgent = status?.updatedBy === "agent";
              const buddy = BUDDIES[m.mascot.buddy];
              return (
                <li key={m.id} className="min-w-0">
                  <PulseOnChange value={presence} className="h-full">
                    <button
                      type="button"
                      className="oh-ws h-full w-full"
                      data-me={m.id === meId}
                      data-presence={presence}
                      data-away={away.has(m.id)}
                      ref={(el) => {
                        if (el) desks.current.set(m.id, el);
                        else desks.current.delete(m.id);
                      }}
                      onClick={() => onOpen(m)}
                      aria-label={`${m.displayName}${m.id === meId ? " (bạn)" : ""}, ${buddy?.name ?? ""}. Mở hồ sơ`}
                    >
                      <span className="oh-tag">
                        {m.displayName}
                        {m.id === meId && <span className="font-normal text-oh-ink-muted">(bạn)</span>}
                      </span>
                      <Mascot className="oh-desk-mascot" mascot={m.mascot} presence={presence} size={96} agentBadge={byAgent} decorative />
                      <span className="oh-desk" aria-hidden="true">
                        <i className="oh-monitor" />
                        <i className="oh-keyboard" />
                        <i className="oh-mug" />
                        <i className="oh-book" style={{ background: BOOK[i % BOOK.length] }} />
                      </span>
                      <span className="mt-4 flex w-full min-w-0 flex-col items-center gap-1">
                        <StatusBadge presence={presence} />
                        <span className="line-clamp-2 text-oh-xs text-oh-ink">{status?.doing ?? <span className="text-oh-ink-muted">Chưa có cập nhật.</span>}</span>
                        {waiting.length > 0 && (
                          <span className="inline-flex max-w-full items-center gap-1 truncate rounded-oh-sm bg-oh-warning-soft px-1.5 py-0.5 text-[11px] text-oh-warning-soft-fg">
                            <Icon name="reply" size={11} className="shrink-0 rotate-180" />
                            <span className="truncate">Chờ {waiting.map((w) => w.displayName).join(", ")}</span>
                          </span>
                        )}
                        {byAgent && <span className="text-[11px] text-oh-agent">agent soạn · {status ? relativeTimeVi(status.updatedAt) : ""}</span>}
                      </span>
                    </button>
                  </PulseOnChange>
                </li>
              );
            })}
          </ul>
        )}

        <WalkerLayer walks={active} members={board.members} floorRef={floorRef} deskRef={deskRef} onAway={onAway} onDone={done} />

        <div aria-hidden="true" className="oh-lounge">
          <div className="oh-sofa"><span /><span /><span /></div>
          <div className="oh-coffee" />
        </div>
        <div aria-hidden="true" className="oh-shelf"><i /><i /><i /></div>
      </div>
      <div className="flex items-center gap-1.5 px-5 py-3 text-oh-xs text-oh-ink-muted">
        <Icon name="leaf" size={13} />
        Một chỗ ấm áp để làm việc cùng nhau. Huy hiệu nhỏ trên mỗi buddy là tâm trạng theo trạng thái.
      </div>
    </section>
  );
}
