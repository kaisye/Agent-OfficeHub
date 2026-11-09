/** Seed the Tripflix workspace. Uses docs/business/seed-tripflix.json when present, else a built-in minimal seed. */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Agent, Decision, HubEvent, Member, Request, StatusCard, Task, Workspace } from "@officehub/shared";
import { adminSql } from "./client.js";
import { generateAgentToken } from "./tokens.js";

const SeedFile = z.object({
  workspace: Workspace,
  members: z.array(Member),
  cards: z.array(StatusCard).default([]),
  tasks: z.array(Task).default([]),
  events: z.array(HubEvent).default([]),
  requests: z.array(Request).default([]),
  decisions: z.array(Decision).default([]),
  agents: z.array(Agent).default([]),
});
type Seed = z.infer<typeof SeedFile>;

function findSeedFile(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const f = join(dir, "docs", "business", "seed-tripflix.json");
    if (existsSync(f)) return f;
    dir = resolve(dir, "..");
  }
  return null;
}

const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();

function builtinSeed(): Seed {
  const ws = randomUUID();
  const mk = (displayName: string, login: string | null, role: "admin" | "member", areas: string[], species: string, palette: string, accessory: string | null, seed: number) => ({
    id: randomUUID(),
    workspaceId: ws,
    displayName,
    githubLogin: login,
    role,
    areas,
    mascot: { species, palette, accessory, seed },
  });
  const phong = mk("Phong", "phong-tripflix", "admin", ["deploy", "backend"], "blob", "sunrise", "headphones", 11);
  const trang = mk("Trang", "trang-tripflix", "member", ["feed", "mobile"], "cat", "ocean", "glasses", 22);
  const bao = mk("Bảo", "bao-tripflix", "member", ["ai", "backend"], "owl", "forest", null, 33);
  const minh = mk("Minh", "minh-tripflix", "member", ["web"], "bot", "grape", null, 44);
  const lan = mk("Lan", "lan-tripflix", "member", ["design"], "fox", "coral", "headphones", 55);
  const hung = mk("Hùng", "hung-tripflix", "member", ["qa"], "bear", "slate", null, 66);
  const vy = mk("Vy", "vy-tripflix", "member", ["data"], "cat", "sand", "glasses", 77);
  const members = [phong, trang, bao, minh, lan, hung, vy];
  const card = (m: { id: string }, presence: StatusCard["presence"], doing: string | null, branch: string | null, waitingOn: string[] = []) => ({
    memberId: m.id,
    presence,
    doing,
    branch,
    waitingOn,
    updatedAt: ago(20),
    updatedBy: "human" as const,
  });
  const pr1 = { id: randomUUID(), workspaceId: ws, source: "github_pr" as const, externalUrl: "https://github.com/tripflix/app/pull/214", externalKey: "#214", title: "Tách tag theo app", assigneeId: phong.id, state: "in_review" as const, syncedAt: ago(30) };
  const pr2 = { id: randomUUID(), workspaceId: ws, source: "github_pr" as const, externalUrl: "https://github.com/tripflix/app/pull/219", externalKey: "#219", title: "Giảm bộ đếm bình luận khi ẩn", assigneeId: trang.id, state: "in_progress" as const, syncedAt: ago(50) };
  const reqId = randomUUID();
  const ev = (type: HubEvent["type"], taskId: string | null, actor: string | null, mins: number, data: Record<string, unknown> = {}) => ({
    id: randomUUID(), workspaceId: ws, specversion: "1.0" as const, source: type.startsWith("pr.") || type.startsWith("ci.") ? "github" : "officehub", type, time: ago(mins), taskId, actorMemberId: actor, actorAgentId: null, data,
  });
  return {
    workspace: { id: ws, name: "Tripflix", slug: "tripflix", connectors: ["github"], createdAt: ago(60 * 24 * 30) },
    members,
    cards: [
      card(phong, "working", "Review PR #214 tách tag theo app", "feat/split-tags"),
      card(trang, "waiting", "Chờ Phong báo tên biến môi trường", "feat/hide-counter", [phong.id]),
      card(bao, "blocked", "Chờ key OpenAI cho thử nghiệm tóm tắt", null, [phong.id]),
      card(minh, "idle", null, null),
    ],
    tasks: [pr1, pr2],
    events: [ev("pr.opened", pr1.id, phong.id, 120, { number: 214 }), ev("ci.passed", pr1.id, null, 100, { conclusion: "success" }), ev("pr.opened", pr2.id, trang.id, 60, { number: 219 })],
    requests: [
      {
        id: reqId, workspaceId: ws, askerId: trang.id, receiverId: phong.id, taskId: pr2.id, title: "Tên biến môi trường cho bộ đếm bình luận?", status: "sent" as const, dueAt: null, createdAt: ago(45), updatedAt: ago(45),
        messages: [{ id: randomUUID(), requestId: reqId, kind: "ask" as const, body: "Phong ơi, server đang ghim biến nào cho bộ đếm bình luận khi ẩn? Mình cần tên chính xác để mở PR.", authoredBy: "human" as const, authorAgentId: null, sentById: trang.id, editedBeforeSend: false, createdAt: ago(45) }],
      },
    ],
    decisions: [
      { id: randomUUID(), workspaceId: ws, title: "Tách tag theo app", body: "Mỗi app có bộ tag riêng, không dùng chung.", rationale: "Tránh xung đột khi deploy độc lập.", decidedById: phong.id, taskId: pr1.id, decidedAt: ago(200) },
    ],
    agents: [
      { id: randomUUID(), workspaceId: ws, ownerId: phong.id, kind: "claude-code" as const, label: "Claude Code của Phong", scopes: ["board:read", "inbox:read", "status:write:self", "request:draft"], tokenPrefix: "", revokedAt: null, lastSeenAt: null },
    ],
  };
}

export interface SeedResult {
  source: string;
  workspaceId: string;
  slug: string;
  skipped: boolean;
  memberIds: Record<string, string>;
  agentTokens: { label: string; owner: string; token: string }[];
}

export async function seed(opts: { reset?: boolean } = {}): Promise<SeedResult> {
  const file = findSeedFile();
  const data: Seed = file ? SeedFile.parse(JSON.parse(readFileSync(file, "utf8"))) : builtinSeed();
  const sql = adminSql();
  const memberIds = Object.fromEntries(data.members.map((m) => [m.displayName, m.id]));
  const base = { source: file ?? "built-in", workspaceId: data.workspace.id, slug: data.workspace.slug, memberIds };
  if (opts.reset) {
    await sql`TRUNCATE workspaces CASCADE`;
  } else {
    const ex = await sql`SELECT id FROM workspaces WHERE slug = ${data.workspace.slug}`;
    if (ex[0]) return { ...base, workspaceId: ex[0].id, skipped: true, agentTokens: [], memberIds: Object.fromEntries((await sql`SELECT id, display_name FROM members WHERE workspace_id = ${ex[0].id}`).map((m) => [m.display_name, m.id])) };
  }
  const agentTokens: SeedResult["agentTokens"] = [];
  await sql.begin(async (tx) => {
    const w = data.workspace;
    await tx`INSERT INTO workspaces (id, name, slug, connectors, created_at) VALUES (${w.id}, ${w.name}, ${w.slug}, ${w.connectors}::text[], ${w.createdAt})`;
    for (const m of data.members)
      await tx`INSERT INTO members (id, workspace_id, display_name, github_login, role, areas, mascot) VALUES (${m.id}, ${w.id}, ${m.displayName}, ${m.githubLogin}, ${m.role}, ${m.areas}::text[], ${tx.json(m.mascot as never)})`;
    for (const c of data.cards)
      await tx`INSERT INTO status_cards (member_id, workspace_id, presence, doing, branch, waiting_on, updated_at, updated_by) VALUES (${c.memberId}, ${w.id}, ${c.presence}, ${c.doing}, ${c.branch}, ${c.waitingOn}::uuid[], ${c.updatedAt}, ${c.updatedBy})`;
    for (const a of data.agents) {
      const t = generateAgentToken();
      await tx`INSERT INTO agents (id, workspace_id, owner_id, kind, label, scopes, token_hash, token_prefix, revoked_at, last_seen_at) VALUES (${a.id}, ${w.id}, ${a.ownerId}, ${a.kind}, ${a.label}, ${a.scopes}::text[], ${t.hash}, ${t.prefix}, ${a.revokedAt}, ${a.lastSeenAt})`;
      agentTokens.push({ label: a.label, owner: data.members.find((m) => m.id === a.ownerId)?.displayName ?? a.ownerId, token: t.token });
    }
    for (const t of data.tasks)
      await tx`INSERT INTO tasks (id, workspace_id, source, external_url, external_key, title, assignee_id, state, synced_at) VALUES (${t.id}, ${w.id}, ${t.source}, ${t.externalUrl}, ${t.externalKey}, ${t.title}, ${t.assigneeId}, ${t.state}, ${t.syncedAt})`;
    const agentIds = new Set(data.agents.map((a) => a.id));
    for (const e of data.events)
      await tx`INSERT INTO events (id, workspace_id, source, type, time, task_id, actor_member_id, actor_agent_id, data) VALUES (${e.id}, ${w.id}, ${e.source}, ${e.type}, ${e.time}, ${e.taskId}, ${e.actorMemberId}, ${e.actorAgentId && agentIds.has(e.actorAgentId) ? e.actorAgentId : null}, ${tx.json(e.data as never)})`;
    for (const r of data.requests) {
      await tx`INSERT INTO requests (id, workspace_id, asker_id, receiver_id, task_id, title, status, due_at, created_at, updated_at) VALUES (${r.id}, ${w.id}, ${r.askerId}, ${r.receiverId}, ${r.taskId}, ${r.title}, ${r.status}, ${r.dueAt}, ${r.createdAt}, ${r.updatedAt})`;
      for (const m of r.messages) {
        const author = m.kind === "reply" ? r.receiverId : r.askerId;
        await tx`INSERT INTO request_messages (id, workspace_id, request_id, kind, body, authored_by, author_member_id, author_agent_id, sent_by_id, edited_before_send, created_at) VALUES (${m.id}, ${w.id}, ${r.id}, ${m.kind}, ${m.body}, ${m.authoredBy}, ${author}, ${m.authorAgentId && agentIds.has(m.authorAgentId) ? m.authorAgentId : null}, ${m.sentById}, ${m.editedBeforeSend}, ${m.createdAt})`;
      }
    }
    for (const d of data.decisions)
      await tx`INSERT INTO decisions (id, workspace_id, title, body, rationale, decided_by_id, task_id, decided_at) VALUES (${d.id}, ${w.id}, ${d.title}, ${d.body}, ${d.rationale}, ${d.decidedById}, ${d.taskId}, ${d.decidedAt})`;
  });
  return { ...base, skipped: false, agentTokens };
}
