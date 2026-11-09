/**
 * Kiểm tra seed-tripflix.json theo zod schema của @officehub/shared.
 * Chạy (từ gốc repo, sau `pnpm install`):
 *   node node_modules/.pnpm/vite-node@2.1.9/node_modules/vite-node/vite-node.mjs docs/business/scripts/validate-seed.ts
 * (vite-node đi kèm vitest; nếu đổi phiên bản vitest thì sửa đường dẫn, hoặc dùng: pnpm dlx tsx docs/business/scripts/validate-seed.ts)
 * Kết quả mong đợi: "OK: seed hợp lệ, 0 lỗi".
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { Workspace, Member, StatusCard, Task, HubEvent, Decision, Agent, Request, canTransition } from "../../../packages/shared/src/index.ts";

const seed = JSON.parse(readFileSync(new URL("../seed-tripflix.json", import.meta.url), "utf8"));
let errors = 0;
const check = (name: string, schema: z.ZodTypeAny, value: unknown) => {
  const r = schema.safeParse(value);
  if (!r.success) { errors++; console.error(`FAIL ${name}`, JSON.stringify(r.error.issues)); }
};
check("workspace", Workspace, seed.workspace);
seed.members.forEach((x: unknown, i: number) => check(`members[${i}]`, Member, x));
seed.cards.forEach((x: unknown, i: number) => check(`cards[${i}]`, StatusCard, x));
seed.tasks.forEach((x: unknown, i: number) => check(`tasks[${i}]`, Task, x));
seed.events.forEach((x: unknown, i: number) => check(`events[${i}]`, HubEvent, x));
seed.requests.forEach((x: unknown, i: number) => check(`requests[${i}]`, Request, x));
seed.decisions.forEach((x: unknown, i: number) => check(`decisions[${i}]`, Decision, x));
seed.agents.forEach((x: unknown, i: number) => check(`agents[${i}]`, Agent, x));

// id không trùng
const ids = new Set<string>();
const all: string[] = [
  ...["members", "tasks", "events", "requests", "decisions", "agents"].flatMap((k) => seed[k].map((r: { id: string }) => r.id)),
  ...seed.requests.flatMap((r: { messages: { id: string }[] }) => r.messages.map((m) => m.id)),
];
for (const i of all) { if (ids.has(i)) { errors++; console.error(`DUP id ${i}`); } ids.add(i); }

// Tham chiếu chéo
const memberIds = new Set<string>(seed.members.map((m: { id: string }) => m.id));
const taskIds = new Set<string>(seed.tasks.map((t: { id: string }) => t.id));
const ref = (what: string, v: string | null, set: Set<string>) => { if (v && !set.has(v)) { errors++; console.error(`BAD REF ${what}=${v}`); } };
seed.cards.forEach((c: any) => { ref("card.memberId", c.memberId, memberIds); c.waitingOn.forEach((w: string) => ref("waitingOn", w, memberIds)); });
seed.requests.forEach((r: any) => {
  ref("asker", r.askerId, memberIds); ref("receiver", r.receiverId, memberIds); ref("task", r.taskId, taskIds);
  if (r.askerId === r.receiverId) { errors++; console.error("asker==receiver"); }
  r.messages.forEach((m: any) => { if (m.requestId !== r.id) { errors++; console.error("message.requestId lệch", m.id); } });
});
seed.events.forEach((e: any) => ref("event.task", e.taskId, taskIds));
seed.decisions.forEach((d: any) => ref("decision.decidedById", d.decidedById, memberIds));

// Phủ đủ trạng thái
const statuses = new Set(seed.requests.map((r: any) => r.status));
const presences = new Set(seed.cards.map((c: any) => c.presence));
if (statuses.size !== 6) { errors++; console.error("requests chưa phủ đủ 6 status", [...statuses]); }
if (presences.size !== 6) { errors++; console.error("cards chưa phủ đủ 6 presence", [...presences]); }

// Sanity state machine
const sent = seed.requests.find((r: any) => r.status === "sent");
const t = canTransition(sent, "send_reply", { kind: "human", memberId: sent.receiverId });
if (!t.ok) { errors++; console.error("sent->send_reply không hợp lệ", t); }

console.log(errors === 0 ? "OK: seed hợp lệ, 0 lỗi" : `${errors} lỗi`);
process.exit(errors === 0 ? 0 : 1);
