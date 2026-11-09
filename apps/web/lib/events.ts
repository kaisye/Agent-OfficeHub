import type { Board, HubEvent } from "@officehub/shared";

/** One-line detail for an EventRow, built only from data the viewer is allowed to see. Never includes message text. */
export function eventDetail(e: HubEvent, board: Pick<Board, "tasks" | "openRequests">): string | undefined {
  const d = e.data as Record<string, unknown>;
  const parts: string[] = [];
  const reqId = typeof d.requestId === "string" ? d.requestId : null;
  if (reqId) {
    const r = board.openRequests.find((x) => x.id === reqId);
    if (r) parts.push(r.title);
  }
  const task = e.taskId ? board.tasks.find((t) => t.id === e.taskId) : null;
  if (!reqId) {
    if (typeof d.number === "number") parts.push(`#${d.number}${typeof d.title === "string" ? " " + d.title : ""}`);
    else if (typeof d.title === "string") parts.push(d.title);
    else if (task) parts.push(task.title);
  } else if (task && parts.length === 0) {
    parts.push(task.title);
  }
  return parts.length ? parts.join(" · ") : undefined;
}
