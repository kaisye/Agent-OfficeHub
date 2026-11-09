import type { Board, Member, Request } from "@officehub/shared";

/** Requests waiting on me: the server inbox plus my own unsent drafts (e.g. drafted by my agent), unread first. */
export function needsMe(inbox: Request[] | undefined, board: Board | undefined, meId: string): Request[] {
  const map = new Map<string, Request>();
  for (const r of inbox ?? []) map.set(r.id, r);
  for (const r of board?.openRequests ?? []) {
    if (r.askerId === meId && r.status === "draft") map.set(r.id, r);
  }
  return [...map.values()].sort(
    (a, b) => Number(!!b.unreadForViewer) - Number(!!a.unreadForViewer) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function memberMap(members: Member[]): Map<string, Member> {
  return new Map(members.map((m) => [m.id, m]));
}

export function isoDateOnly(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("vi-VN") : "";
}

/** Local `YYYY-MM-DD` date (from <input type=date>) to an end-of-day ISO timestamp with offset. */
export function dateInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}T17:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
