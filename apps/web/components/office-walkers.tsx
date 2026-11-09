"use client";

/**
 * Mascots walking between desks on the office map.
 *
 * - A real exchange (request sent / replied / accepted) makes the sender's buddy walk to the other desk,
 *   say the title in a bubble, then walk back. Driven by board.recentEvents (already filtered per viewer
 *   by the server, so nobody sees walks for requests they can't see).
 * - An agent draft never walks: nothing left the owner's hands yet. The buddy just "thinks" at its desk.
 * - Demo traffic (dev / mock only) is visual-only: random walks with generic bubbles, no data written.
 * - prefers-reduced-motion: no walking; the bubble appears at the target desk instead.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { mascotSrc } from "@officehub/brand";
import type { Board, Member } from "@officehub/shared";

export type Walk = {
  id: string;
  from: string; // member id
  to: string | null; // null = think at own desk
  text: string;
  agent?: boolean;
};

const SPEED = 260; // px per second
const HOLD_MS = 2400;
const MAX_ACTIVE = 3;

/* ---------------- queue: one walk per member at a time, max 3 at once ---------------- */
export function useWalkQueue() {
  const [active, setActive] = useState<Walk[]>([]);
  const pending = useRef<Walk[]>([]);

  const pump = useCallback((cur: Walk[]) => {
    const busy = new Set(cur.flatMap((w) => [w.from, w.to ?? ""]));
    const next = [...cur];
    pending.current = pending.current.filter((w) => {
      if (next.length >= MAX_ACTIVE || busy.has(w.from) || (w.to && busy.has(w.to))) return true;
      next.push(w);
      busy.add(w.from);
      if (w.to) busy.add(w.to);
      return false;
    });
    return next;
  }, []);

  const enqueue = useCallback(
    (w: Walk) => {
      if (pending.current.length > 12) return; // never build an endless backlog
      pending.current.push(w);
      setActive((cur) => pump(cur));
    },
    [pump],
  );
  const done = useCallback((id: string) => setActive((cur) => pump(cur.filter((w) => w.id !== id))), [pump]);
  return { active, enqueue, done };
}

/* ---------------- real traffic from events ---------------- */
const short = (s: string, n = 42) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function useRequestTraffic(board: Board, enqueue: (w: Walk) => void) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const events = board.recentEvents;
    if (!seen.current) {
      seen.current = new Set(events.map((e) => e.id)); // don't replay history on first paint
      return;
    }
    const fresh = events.filter((e) => !seen.current!.has(e.id)).reverse(); // oldest first
    for (const e of fresh) {
      seen.current.add(e.id);
      const reqId = typeof e.data.requestId === "string" ? e.data.requestId : null;
      const req = reqId ? board.openRequests.find((r) => r.id === reqId) : undefined;
      const title = req ? short(req.title) : "";
      switch (e.type) {
        case "request.sent":
        case "request.followed_up":
          if (req) enqueue({ id: e.id, from: req.askerId, to: req.receiverId, text: e.type === "request.sent" ? title : `Hỏi thêm: ${title}` });
          break;
        case "request.replied":
          if (req) enqueue({ id: e.id, from: req.receiverId, to: req.askerId, text: `Trả lời: ${title}` });
          break;
        case "request.created":
        case "request.reply_drafted":
          if (e.actorAgentId && e.actorMemberId) enqueue({ id: e.id, from: e.actorMemberId, to: null, text: "Agent đang soạn nháp…", agent: true });
          break;
      }
    }
  }, [board.recentEvents, board.openRequests, enqueue]);
}

/* ---------------- demo traffic (visual only) ---------------- */
const DEMO_LINES = [
  "PR #219 xong review chưa?",
  "Server staging ghim tag nào?",
  "Cho mình tên biến môi trường",
  "Xem giúp CI đỏ với",
  "Chốt tách tag theo app nhé",
  "Rebase deploy/ trước giúp mình",
  "Cảm ơn nha!",
  "Ok, mình làm tiếp",
];

export function useDemoTraffic(enabled: boolean, members: Member[], enqueue: (w: Walk) => void) {
  const list = useRef(members);
  list.current = members; // read the latest list without restarting the timer
  useEffect(() => {
    if (!enabled) return;
    let n = 0;
    const tick = () => {
      const ms = list.current;
      if (ms.length < 2) return;
      const a = ms[Math.floor(Math.random() * ms.length)]!;
      const others = ms.filter((m) => m.id !== a.id);
      const b = others[Math.floor(Math.random() * others.length)]!;
      enqueue({ id: `demo-${Date.now()}-${n++}`, from: a.id, to: b.id, text: DEMO_LINES[Math.floor(Math.random() * DEMO_LINES.length)]! });
    };
    const first = setTimeout(tick, 150);
    const t = setInterval(tick, 2600);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [enabled, enqueue]);
}

/* ---------------- geometry ---------------- */
type Pt = { x: number; y: number };

function deskAnchor(el: HTMLElement, floor: DOMRect) {
  const r = el.getBoundingClientRect();
  return {
    left: r.left - floor.left,
    right: r.right - floor.left,
    top: r.top - floor.top,
    bottom: r.bottom - floor.top,
    cx: r.left - floor.left + r.width / 2,
    feet: r.top - floor.top + 128, // where the seated buddy's feet are
  };
}

/** Desk → aisle under own row → column gap beside target → up/down to stand next to target desk. */
function route(from: HTMLElement, to: HTMLElement, floorEl: HTMLElement): Pt[] {
  const floor = floorEl.getBoundingClientRect();
  const a = deskAnchor(from, floor);
  const b = deskAnchor(to, floor);
  const gap = 22;
  let side = b.cx >= a.cx ? -1 : 1; // approach from the side facing the walker
  let gx = side < 0 ? b.left - gap : b.right + gap;
  if (gx < 16 || gx > floor.width - 16) {
    side = -side;
    gx = side < 0 ? b.left - gap : b.right + gap;
  }
  const aisle = a.bottom + 14;
  return [
    { x: a.cx, y: a.feet },
    { x: a.cx, y: aisle },
    { x: gx, y: aisle },
    { x: gx, y: b.feet },
  ];
}

/* ---------------- a single walker ---------------- */
function Walker({
  walk,
  member,
  floorRef,
  deskRef,
  reduced,
  onAway,
  onDone,
}: {
  walk: Walk;
  member: Member | undefined;
  floorRef: RefObject<HTMLDivElement | null>;
  deskRef: (id: string) => HTMLElement | undefined;
  reduced: boolean;
  onAway: (id: string, away: boolean) => void;
  onDone: (id: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bubble, setBubble] = useState<{ at: Pt; flip: boolean } | null>(null);

  useLayoutEffect(() => {
    const floorEl = floorRef.current;
    const fromEl = deskRef(walk.from);
    const toEl = walk.to ? deskRef(walk.to) : undefined;
    const body = bodyRef.current;
    if (!floorEl || !fromEl || !member || (walk.to && !toEl) || !body) {
      onDone(walk.id); // desk not on screen (other room tab) — skip silently
      return;
    }
    const floor = floorEl.getBoundingClientRect();
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = () => {
      if (cancelled) return;
      onAway(walk.from, false);
      onDone(walk.id);
    };

    // Thinking (agent draft) or reduced motion: no movement, just a bubble.
    if (!toEl || reduced) {
      const target = deskAnchor(toEl ?? fromEl, floor);
      setBubble({ at: { x: target.cx, y: target.top + 24 }, flip: false });
      body.style.display = "none";
      timers.push(setTimeout(finish, HOLD_MS + 600));
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    const pts = route(fromEl, toEl, floorEl);
    const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
    const total = lens.reduce((s, l) => s + l, 0) || 1;
    let acc = 0;
    const offsets = [0, ...lens.map((l) => (acc += l) / total)];
    const flip = pts[pts.length - 1]!.x < pts[0]!.x;
    const frames = (list: Pt[], offs: number[], mirror: boolean) =>
      list.map((p, i) => ({ transform: `translate(${p.x - 36}px, ${p.y - 72}px) scaleX(${mirror ? -1 : 1})`, offset: offs[i] }));
    const dur = Math.max(900, (total / SPEED) * 1000);

    onAway(walk.from, true);
    const go = body.animate(frames(pts, offsets, flip), { duration: dur, easing: "linear", fill: "forwards" });
    go.onfinish = () => {
      if (cancelled) return;
      const end = pts[pts.length - 1]!;
      setBubble({ at: { x: end.x, y: end.y - 80 }, flip });
      body.dataset.walking = "false";
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setBubble(null);
          body.dataset.walking = "true";
          const back = [...pts].reverse();
          const backOffsets = [...offsets].reverse().map((o) => 1 - o);
          const ret = body.animate(frames(back, backOffsets, !flip), { duration: dur, easing: "linear", fill: "forwards" });
          ret.onfinish = finish;
        }, HOLD_MS),
      );
    };
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      body.getAnimations().forEach((a) => a.cancel());
      onAway(walk.from, false);
    };
    // walk is immutable for a given id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk.id]);

  if (!member) return null;
  return (
    <>
      <div ref={bodyRef} className="oh-walker" data-walking="true" aria-hidden="true">
        <img src={mascotSrc(member.mascot.buddy, 128)} alt="" width={72} height={72} draggable={false} />
      </div>
      {bubble && (
        <div className="oh-speech" data-agent={walk.agent ? "true" : "false"} style={{ left: bubble.at.x, top: bubble.at.y }} role="status">
          <b>{member.displayName}</b>
          {walk.agent && <span className="oh-speech-bot" aria-label="agent">⚙︎</span>}
          <span>{walk.text}</span>
        </div>
      )}
    </>
  );
}

export function WalkerLayer({
  walks,
  members,
  floorRef,
  deskRef,
  onAway,
  onDone,
}: {
  walks: Walk[];
  members: Member[];
  floorRef: RefObject<HTMLDivElement | null>;
  deskRef: (id: string) => HTMLElement | undefined;
  onAway: (id: string, away: boolean) => void;
  onDone: (id: string) => void;
}) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <div className="oh-walkers">
      {walks.map((w) => (
        <Walker key={w.id} walk={w} member={byId.get(w.from)} floorRef={floorRef} deskRef={deskRef} reduced={reduced} onAway={onAway} onDone={onDone} />
      ))}
    </div>
  );
}
