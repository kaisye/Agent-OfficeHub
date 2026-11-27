import type { Board, HubEvent, PresenceState } from "@officehub/shared";
import { PRESENCE_LABEL_VI } from "@officehub/ui";

/** One-line detail for an EventRow, built only from data the viewer is allowed to see. Never includes message text. */
export function eventDetail(e: HubEvent, board: Pick<Board, "tasks" | "openRequests"> & Partial<Pick<Board, "roles" | "pendingProposals">>): string | undefined {
  const d = e.data as Record<string, unknown>;
  const parts: string[] = [];
  const reqId = typeof d.requestId === "string" ? d.requestId : null;
  if (reqId) {
    const r = board.openRequests.find((x) => x.id === reqId);
    if (r) parts.push(r.title);
  }
  const task = e.taskId ? board.tasks.find((t) => t.id === e.taskId) : null;
  const propId = typeof d.proposalId === "string" ? d.proposalId : null;
  const prop = propId ? board.pendingProposals?.find((p) => p.id === propId) : null;
  if (prop) return prop.title;
  const roleId = typeof d.roleId === "string" ? d.roleId : null;
  if (!reqId && roleId && !task) {
    const role = board.roles?.find((r) => r.id === roleId);
    if (role) return typeof d.presence === "string" ? `${role.name} · ${(PRESENCE_LABEL_VI[d.presence as PresenceState] ?? d.presence).toLowerCase()}` : role.name;
  }
  if (!reqId) {
    if (typeof d.number === "number") parts.push(`#${d.number}${typeof d.title === "string" ? " " + d.title : ""}`);
    else if (typeof d.title === "string") parts.push(d.title);
    else if (task) parts.push(task.title);
  } else if (task && parts.length === 0) {
    parts.push(task.title);
  }
  return parts.length ? parts.join(" · ") : undefined;
}
