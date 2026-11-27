import type { Board, Mascot, Member, Request, RequestKind, RequestMessage, Role } from "@officehub/shared";
import type { Queue } from "./api";

/** One side of a request as the UI shows it: a role, or the orchestrator ("Bạn"). */
export interface Party {
  displayName: string;
  mascot: Mascot;
  human: boolean;
  role: Role | null;
}

export function roleMap(roles: Role[]): Map<string, Role> {
  return new Map(roles.map((r) => [r.id, r]));
}

export function partyOf(roleId: string | null, roles: Map<string, Role>, orchestrator: Member): Party {
  const role = roleId ? roles.get(roleId) : null;
  if (role) return { displayName: role.name, mascot: role.mascot, human: false, role };
  return { displayName: roleId ? "Vai trò đã xoá" : "Bạn", mascot: orchestrator.mascot, human: !roleId, role: null };
}

/** "Frontend → Backend", "Bạn → Backend", "Frontend → bạn". */
export function directionLabel(r: Pick<Request, "askerRoleId" | "receiverRoleId">, roles: Map<string, Role>): string {
  const name = (id: string | null, lower: boolean) => (id ? (roles.get(id)?.name ?? "?") : lower ? "bạn" : "Bạn");
  return `${name(r.askerRoleId, false)} → ${name(r.receiverRoleId, true)}`;
}

/** Who wrote a message: "Bạn" for the orchestrator, else the role the agent spoke for. */
export function authorOf(m: RequestMessage, r: Pick<Request, "askerRoleId" | "receiverRoleId">, roles: Map<string, Role>, orchestrator: Member): Party {
  if (m.authoredBy === "human") return partyOf(null, roles, orchestrator);
  return partyOf(m.authorRoleId ?? (m.kind === "reply" ? r.receiverRoleId : r.askerRoleId), roles, orchestrator);
}

export const KIND_LABEL: Record<RequestKind, string> = {
  question: "Câu hỏi",
  contract_change: "Đổi contract",
  review: "Nhờ xem",
  handoff: "Bàn giao",
  blocker: "Đang kẹt",
};
export const KIND_HINT: Record<RequestKind, string> = {
  question: "Hỏi thông tin.",
  contract_change: "Đổi contract chung, luôn gửi Leader.",
  review: "Nhờ xem PR hoặc thiết kế.",
  handoff: "Báo đã bàn giao.",
  blocker: "Đang kẹt, cần vai trò khác.",
};

export type QueueSection = "drafts" | "replies" | "askingMe" | "answered";
/** Which approval-queue section a request belongs to (null = not waiting on the orchestrator). */
export function queueSection(r: Pick<Request, "status" | "receiverRoleId">): QueueSection | null {
  if (r.status === "draft") return "drafts";
  if (r.status === "reply_drafted") return "replies";
  if (r.status === "sent" && r.receiverRoleId === null) return "askingMe";
  if (r.status === "replied") return "answered";
  return null;
}

export const queueCount = (q: Queue | undefined) => (q ? q.requests.length + q.proposals.length : 0);

/** Last unsent message of a kind (the draft the orchestrator is about to forward). */
export const draftOf = (r: Request, kind?: RequestMessage["kind"]) =>
  [...r.messages].reverse().find((m) => m.sentById === null && (!kind || m.kind === kind)) ?? null;
/** Last forwarded ask / follow-up (the question a reply answers). */
export const lastQuestion = (r: Request) => [...r.messages].reverse().find((m) => m.sentById !== null && m.kind !== "reply") ?? null;
export const lastReply = (r: Request) => [...r.messages].reverse().find((m) => m.sentById !== null && m.kind === "reply") ?? null;

export const isOverdue = (r: Pick<Request, "dueAt" | "status">, now = Date.now()) =>
  !!r.dueAt && ["sent", "reply_drafted", "replied"].includes(r.status) && new Date(r.dueAt).getTime() < now;

/** Agent id -> role, for labelling events and drafts. */
export function agentRoleName(agentId: string | null, agents: { id: string; roleId: string }[] | undefined, roles: Map<string, Role>): string | undefined {
  if (!agentId) return undefined;
  const a = agents?.find((x) => x.id === agentId);
  return a ? roles.get(a.roleId)?.name : undefined;
}

export const cardOf = (board: Pick<Board, "cards">, roleId: string) => board.cards.find((c) => c.roleId === roleId) ?? null;

export function isoDateOnly(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("vi-VN") : "";
}

/** Local `YYYY-MM-DD` date (from <input type=date>) to an end-of-day ISO timestamp with offset. */
export function dateInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}T17:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
