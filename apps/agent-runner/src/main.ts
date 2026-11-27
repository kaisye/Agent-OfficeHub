/**
 * Office Hub agent runner: keeps every role of one workspace "on duty". Each poll, per role:
 * list_inbox → for a request sent to the role, run the model and draft a reply; for an answer to something
 * the leader delegated, store it and, when all parts are back, let the leader draft the combined reply.
 * Every outgoing text is still a DRAFT the orchestrator approves in the web app.
 *
 * Config: OFFICEHUB_RUNNER_CONFIG (default ~/.config/officehub/runner.json, keep it chmod 600):
 *   { "mcpUrl": "http://127.0.0.1:8788/mcp", "model": "...", "tokens": { "leader": "oh_agent_..." , ... },
 *     "apiKeyFile": "~/.config/vietnote/openrouter.env", "knowledgeDir": "...", "artifactsDir": "...",
 *     "stateDir": "...", "pollSeconds": 20, "dailyBudgetUsd": 2 }
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runAgent, synthesisPrompt, systemPrompt, taskPrompt, type RoleInfo } from "./agent.js";
import { hubFor, type Hub } from "./hub.js";
import { openRouter, type Llm } from "./llm.js";
import type { ToolContext } from "./tools.js";
import { emptyState, latestReply, markDone, parentOf, parentReady, pickWork, signature, type InboxItem, type RunnerState } from "./work.js";

const home = (p: string) => p.replace(/^~(?=\/|$)/, homedir());

interface Config {
  mcpUrl: string;
  model: string;
  tokens: Record<string, string>;
  apiKeyFile: string;
  knowledgeDir: string;
  artifactsDir: string;
  stateDir: string;
  pollSeconds?: number;
  dailyBudgetUsd?: number;
  leader?: string;
}

const cfgPath = home(process.env.OFFICEHUB_RUNNER_CONFIG ?? "~/.config/officehub/runner.json");
const cfg: Config = JSON.parse(readFileSync(cfgPath, "utf8"));
const apiKey = readFileSync(home(cfg.apiKeyFile), "utf8").match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error(`OPENROUTER_API_KEY missing in ${cfg.apiKeyFile}`);
const llm: Llm = openRouter(apiKey, cfg.model);
const knowledgeDir = home(cfg.knowledgeDir);
const artifactsDir = home(cfg.artifactsDir);
const stateDir = home(cfg.stateDir);
mkdirSync(stateDir, { recursive: true });
mkdirSync(artifactsDir, { recursive: true });
// One runner per state folder: two would answer the same request twice.
const lockPath = join(stateDir, "runner.lock");
if (existsSync(lockPath)) {
  const pid = Number(readFileSync(lockPath, "utf8"));
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = pid !== process.pid;
  } catch {}
  if (alive) {
    console.error(`another runner (pid ${pid}) already uses ${stateDir}; stop it first`);
    process.exit(1);
  }
}
writeFileSync(lockPath, String(process.pid));
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    try {
      if (readFileSync(lockPath, "utf8") === String(process.pid)) unlinkSync(lockPath);
    } catch {}
    process.exit(0);
  });
const leaderKey = cfg.leader ?? "leader";
const budget = cfg.dailyBudgetUsd ?? 2;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

const hubs: Record<string, Hub> = Object.fromEntries(Object.entries(cfg.tokens).map(([k, t]) => [k, hubFor(cfg.mcpUrl, t)]));
const statePath = (k: string) => join(stateDir, `${k}.json`);
const states: Record<string, RunnerState> = Object.fromEntries(
  Object.keys(cfg.tokens).map((k) => [k, existsSync(statePath(k)) ? { ...emptyState(), ...JSON.parse(readFileSync(statePath(k), "utf8")) } : emptyState()]),
);
const save = (k: string) => writeFileSync(statePath(k), JSON.stringify(states[k], null, 1), { mode: 0o600 });
const spentToday = () => Object.values(states).reduce((s, st) => s + (st.spend[today()] ?? 0), 0);

let team: RoleInfo[] = [];
const brief = () => {
  const p = join(knowledgeDir, "brief.md");
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

async function loadTeam(): Promise<void> {
  const b = await hubs[leaderKey]!.call("read_board", {});
  team = (b.roles ?? []).map((r: any) => ({ key: r.key, name: r.name, mission: r.mission }));
}

async function status(k: string, presence: string, doing: string | null, waitingOn: string[] = []) {
  await hubs[k]!.call("post_status", { presence, doing: doing?.slice(0, 280) ?? null, waitingOn }).catch((e) => log(k, "post_status failed:", e.message));
}

function ctxFor(k: string, delegate: boolean): ToolContext {
  return { hub: hubs[k]!, roleKey: k, isLeader: delegate, knowledgeDir, artifactsDir, created: [], saved: [] };
}

function withArtifacts(text: string, saved: string[]): string {
  const note = saved.length ? `\n\n---\nĐã lưu ấn phẩm: ${saved.map((s) => `\`${s}\``).join(", ")}` : "";
  return (text || "(không có nội dung)").slice(0, 8000 - note.length) + note;
}

async function handleTask(k: string, item: InboxItem): Promise<number> {
  const me = team.find((r) => r.key === k) ?? { key: k, name: k, mission: "" };
  const isLeader = k === leaderKey;
  await status(k, "working", `Đang làm: ${item.title.content}`);
  const ctx = ctxFor(k, isLeader);
  const r = await runAgent(llm, systemPrompt(me, team, brief(), isLeader), taskPrompt(item), ctx);
  const st = states[k]!;
  if (isLeader && r.created.length) {
    st.children[item.requestId] = [...(st.children[item.requestId] ?? []), ...r.created];
    if (r.createdTo.includes("review") && !st.reviewed.includes(item.requestId)) st.reviewed.push(item.requestId);
    await status(k, "waiting", `Đã chia ${r.created.length} phần việc, chờ người điều phối duyệt và team làm`);
    log(k, `delegated ${r.created.length} part(s) for ${item.requestId}`);
  } else {
    if (!r.final) throw new Error("empty final answer");
    await hubs[k]!.call("reply_draft", { requestId: item.requestId, body: withArtifacts(r.final, r.saved) });
    await status(k, "idle", null);
    log(k, `reply drafted for ${item.requestId} (${r.saved.length} artifact(s))`);
  }
  return r.cost;
}

function storeAnswer(k: string, item: InboxItem): void {
  if (!parentOf(states[k]!, item.requestId)) return; // only answers the leader still has to combine
  states[k]!.answers[item.requestId] = { title: item.title.content, to: item.to, answer: latestReply(item) };
}

/** Leader: every delegated task whose parts are all back (answered, accepted or cancelled) gets one combined reply. */
async function synthesize(k: string, parentId: string, inbox: InboxItem[]): Promise<number> {
  const st = states[k]!;
  const parent = inbox.find((i) => i.requestId === parentId)!;
  const me = team.find((r) => r.key === k) ?? { key: k, name: k, mission: "" };
  await status(k, "working", `Đang tổng hợp: ${parent.title.content}`);
  const answers = (st.children[parentId] ?? []).map((c) => st.answers[c] ?? { title: c, to: "?", answer: null });
  const canReview = !st.reviewed.includes(parentId) && team.some((t) => t.key === "review");
  const ctx = { ...ctxFor(k, canReview), allowTo: ["review"] };
  const r = await runAgent(llm, systemPrompt(me, team, brief(), true), synthesisPrompt(parent, answers, canReview), ctx);
  if (r.created.length) {
    st.children[parentId] = [...(st.children[parentId] ?? []), ...r.created];
    st.reviewed.push(parentId);
    await status(k, "waiting", `Đã gửi bản tổng hợp cho Phản biện soát: ${parent.title.content}`, ["review"]);
    log(k, `sent combined draft of ${parentId} to review`);
    return r.cost;
  }
  if (!r.final) throw new Error("empty synthesis");
  await hubs[k]!.call("reply_draft", { requestId: parentId, body: withArtifacts(r.final, r.saved) });
  for (const c of st.children[parentId] ?? []) delete st.answers[c];
  delete st.children[parentId];
  st.reviewed = st.reviewed.filter((x) => x !== parentId);
  await status(k, "idle", null);
  log(k, `combined reply drafted for ${parentId}`);
  return r.cost;
}

async function pollRole(k: string): Promise<void> {
  const st = states[k]!;
  let inbox: InboxItem[] = (await hubs[k]!.call("list_inbox", {})).items ?? [];
  const work = pickWork(inbox, st);
  for (const w of work) {
    if (spentToday() >= budget) {
      log(`daily budget $${budget} reached, pausing until tomorrow`);
      return;
    }
    const sig = signature(w.item);
    try {
      const cost = w.type === "task" ? await handleTask(k, w.item) : (storeAnswer(k, w.item), 0);
      st.spend[today()] = (st.spend[today()] ?? 0) + cost;
      markDone(st, sig);
    } catch (e) {
      st.failures[sig] = (st.failures[sig] ?? 0) + 1;
      log(k, `failed on ${w.item.requestId} (attempt ${st.failures[sig]}):`, (e as Error).message);
      if (st.failures[sig]! >= 3) {
        markDone(st, sig);
        await status(k, "blocked", `Không xử lý được yêu cầu "${w.item.title.content}" sau 3 lần thử`);
      }
    }
    save(k);
  }
  if (!Object.keys(st.children).length) return;
  // Re-read after this poll's work: requests delegated just now are not in the first snapshot, and a
  // missing child would otherwise look accepted or cancelled.
  if (work.length) inbox = (await hubs[k]!.call("list_inbox", {})).items ?? [];
  for (const parentId of Object.keys(st.children)) {
    if (!inbox.some((i) => i.requestId === parentId)) {
      delete st.children[parentId]; // the orchestrator closed or cancelled the original request
      save(k);
      continue;
    }
    if (!parentReady(st, parentId, inbox) || spentToday() >= budget) continue;
    const key = `synth:${parentId}`;
    try {
      st.spend[today()] = (st.spend[today()] ?? 0) + (await synthesize(k, parentId, inbox));
    } catch (e) {
      st.failures[key] = (st.failures[key] ?? 0) + 1;
      log(k, `synthesis failed for ${parentId} (attempt ${st.failures[key]}):`, (e as Error).message);
      if (st.failures[key]! >= 3) delete st.children[parentId];
    }
    save(k);
  }
}

log(`runner up: roles ${Object.keys(cfg.tokens).join(", ")} · model ${cfg.model} · budget $${budget}/day`);
for (;;) {
  try {
    if (!team.length) await loadTeam();
    for (const k of Object.keys(cfg.tokens)) await pollRole(k).catch((e) => log(k, "poll failed:", e.message));
  } catch (e) {
    log("loop error:", (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, (cfg.pollSeconds ?? 20) * 1000));
}
