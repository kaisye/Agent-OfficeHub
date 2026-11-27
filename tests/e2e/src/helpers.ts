/**
 * Black-box helpers for the live Office Hub stack (v0.6: ONE orchestrator + six role seats).
 * No imports from product code: this suite only speaks HTTP / SQL.
 * Every test file builds its own isolated workspace with createWorld(), so nothing here depends on seeded data.
 */
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

export const API = process.env.OH_API ?? "http://localhost:8787";
export const MCP = process.env.OH_MCP ?? "http://localhost:8788/mcp";
export const WEB = process.env.OH_WEB ?? "http://localhost:3000";
export const DB_URL = process.env.OH_DB ?? "postgres://officehub:officehub@localhost:5433/officehub";
export const ORIGIN = "http://localhost:3000";
/** Everything this suite creates is tagged so teardown can remove it. */
export const TAG = "QA-E2E";
export const AGENT_LABEL = "qa-e2e";
/** Workspaces created by this suite all have a slug starting with this prefix (cleanup.ts relies on it). */
export const WS_PREFIX = "qa-e2e";

export const ROLE_KEYS = ["leader", "business", "design", "backend", "frontend", "qa"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ALL_SCOPES = ["board:read", "inbox:read", "status:write:self", "request:draft", "decision:read", "decision:propose"];

/** The default seats (docs/ARCHITECTURE.md "Directory ownership"), copied here so the suite stays black-box. */
const SEATS: { key: RoleKey; name: string; wave: number; buddy: string; paths: string[] }[] = [
  { key: "leader", name: "Leader", wave: 0, buddy: "sage", paths: ["packages/shared/**", "package.json", "docs/ARCHITECTURE.md"] },
  { key: "business", name: "Business", wave: 1, buddy: "mocha", paths: ["docs/business/**"] },
  { key: "design", name: "Design", wave: 1, buddy: "pip", paths: ["packages/brand/**", "packages/ui/**", "docs/design/**"] },
  { key: "backend", name: "Backend", wave: 1, buddy: "blu", paths: ["packages/db/**", "apps/api/**", "apps/mcp/**", "docs/tech/**"] },
  { key: "frontend", name: "Frontend", wave: 2, buddy: "milo", paths: ["apps/web/**"] },
  { key: "qa", name: "QA & Security", wave: 3, buddy: "fern", paths: ["tests/e2e/**", "docs/qa/**"] },
];

export const uniq = (p = TAG) => `${p}-${randomUUID().slice(0, 8)}`;
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let _sql: ReturnType<typeof postgres> | undefined;
/** Superuser connection (bypasses RLS). Used to create workspaces and to inspect storage. */
export const sql = () => (_sql ??= postgres(DB_URL, { max: 3, onnotice: () => {} }));
export const closeSql = async () => {
  await _sql?.end();
  _sql = undefined;
};

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
  text: string;
}

async function doFetch(url: string, init: RequestInit): Promise<Res> {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, init);
      const text = await r.text();
      let body: any = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* not json */
      }
      return { status: r.status, body, headers: r.headers, text };
    } catch (e) {
      lastErr = e; // keep-alive reset after an early 4xx on a big body: retry on a fresh socket
    }
  }
  throw lastErr;
}

export interface Session {
  cookie: string;
  memberId: string;
  slug: string;
  me: any;
}

export async function login(memberId: string): Promise<Session> {
  const r = await doFetch(`${API}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-officehub-csrf": "1", origin: ORIGIN },
    body: JSON.stringify({ memberId }),
  });
  if (r.status !== 200) throw new Error(`dev-login failed ${r.status} ${r.text}`);
  const sc = r.headers.get("set-cookie") ?? "";
  return { cookie: sc.split(";")[0]!, memberId, slug: r.body.workspaceSlug, me: r.body };
}

/* ---------------- worlds (isolated workspaces) ---------------- */
export interface World {
  id: string;
  slug: string;
  /** member id of the human orchestrator (the only member) */
  orchestratorId: string;
  /** role key -> role id */
  roles: Record<RoleKey, string>;
  /** the orchestrator's logged-in session */
  orch: Session;
}

/** Creates (in SQL, as superuser) a fresh workspace with one orchestrator and the six default roles, and logs the orchestrator in. */
export async function createWorld(prefix = "t", slug?: string): Promise<World> {
  const db = sql();
  const id = randomUUID();
  const ws = slug ?? `${WS_PREFIX}-${prefix}-${id.slice(0, 8)}`;
  await db`INSERT INTO workspaces (id, name, slug, connectors) VALUES (${id}, ${"QA " + ws}, ${ws}, ${["github"]}::text[])`;
  const orchestratorId = randomUUID();
  await db`INSERT INTO members (id, workspace_id, display_name, github_login, role, areas, mascot)
    VALUES (${orchestratorId}, ${id}, 'QA Orchestrator', ${`qa-orch-${id.slice(0, 6)}`}, 'admin', '{}'::text[], ${db.json({ buddy: "blu" })})`;
  const roles = {} as Record<RoleKey, string>;
  for (const s of SEATS) {
    const rid = randomUUID();
    roles[s.key] = rid;
    await db`INSERT INTO roles (id, workspace_id, key, name, mission, owned_paths, handoff_path, wave, mascot)
      VALUES (${rid}, ${id}, ${s.key}, ${s.name}, '', ${s.paths}::text[], null, ${s.wave}, ${db.json({ buddy: s.buddy })})`;
  }
  return { id, slug: ws, orchestratorId, roles, orch: await login(orchestratorId) };
}

/** Human-session request (cookie + CSRF header + Origin, like the web app). `extra` can override/remove headers. */
export function api(s: Session | null, method: string, path: string, body?: unknown, extra: Record<string, string | undefined> = {}): Promise<Res> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-officehub-csrf": "1", origin: ORIGIN };
  if (s) headers.cookie = s.cookie;
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete headers[k];
    else headers[k] = v;
  }
  return doFetch(API + path, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}

/** Raw request with exact headers (no defaults). */
export const raw = (method: string, path: string, headers: Record<string, string> = {}, body?: string, base = API) => doFetch(base + path, { method, headers, body });

/** Workspace-scoped path. `w` is a world, a session, or a slug. */
export const W = (w: { slug: string } | string, path: string) => `/w/${typeof w === "string" ? w : w.slug}${path}`;

export const board = async (w: World) => (await api(w.orch, "GET", W(w, "/board"))).body;
export const queue = async (w: World) => (await api(w.orch, "GET", W(w, "/queue"))).body as { requests: any[]; proposals: any[] };
export const roleStatus = (w: World, roleKey: RoleKey, over: Record<string, unknown> = {}) =>
  api(w.orch, "PUT", W(w, `/roles/${w.roles[roleKey]}/status`), { presence: "idle", doing: null, branch: null, waitingOn: [], ...over });

/* ---------------- agents / MCP ---------------- */
export interface AgentCred {
  id: string;
  token: string;
  roleKey: RoleKey;
  roleId: string;
}
/** Creates an agent for a role through the real API (the orchestrator's click). Tagged for teardown. */
export async function createAgent(w: World, roleKey: RoleKey, scopes: string[] = ALL_SCOPES, kind = "codex"): Promise<AgentCred> {
  const r = await api(w.orch, "POST", W(w, "/agents"), { roleId: w.roles[roleKey], kind, label: `${AGENT_LABEL}-${randomUUID().slice(0, 6)}`, scopes });
  if (r.status !== 201) throw new Error(`createAgent ${r.status} ${r.text}`);
  return { id: r.body.agent.id, token: r.body.token, roleKey, roleId: w.roles[roleKey] };
}

let rpcId = 1;
export async function rpc(token: string | null, method: string, params: unknown = {}, extraHeaders: Record<string, string> = {}, base = MCP): Promise<Res> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  return doFetch(base, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }) });
}

export interface ToolResult {
  status: number;
  /** transport/protocol level error (401/403/429, -32602 ...) */
  rpcError?: any;
  isError: boolean;
  /** parsed last text block (the JSON payload) */
  data: any;
  /** all text blocks */
  blocks: string[];
  res: Res;
}
export async function tool(token: string | null, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const res = await rpc(token, "tools/call", { name, arguments: args });
  const content: { text: string }[] = res.body?.result?.content ?? [];
  const blocks = content.map((c) => c.text);
  let data: any = undefined;
  if (blocks.length) {
    try {
      data = JSON.parse(blocks[blocks.length - 1]!);
    } catch {
      data = blocks[blocks.length - 1];
    }
  }
  return { status: res.status, rpcError: res.body?.error, isError: !!res.body?.result?.isError || !!res.body?.error, data, blocks, res };
}
export const toolErrCode = (r: ToolResult): string | undefined => r.data?.error?.code ?? r.rpcError?.data?.code;

/** Bearer-token request to the API (what agent hooks do). */
export const asAgent = (token: string, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) =>
  raw(method, path, { authorization: `Bearer ${token}`, "content-type": "application/json", "x-officehub-csrf": "1", ...extra }, body === undefined ? undefined : JSON.stringify(body));

/* ---------------- requests ---------------- */
type ReqOver = Partial<{ title: string; body: string; kind: string; taskId: string | null; dueAt: string | null }>;

/** The orchestrator assigns work to a role: created already `sent`. */
export async function assign(w: World, to: RoleKey, over: ReqOver = {}) {
  const r = await api(w.orch, "POST", W(w, "/requests"), {
    receiverRoleId: w.roles[to],
    kind: over.kind ?? "question",
    title: over.title ?? uniq(`${TAG}-t`),
    body: over.body ?? uniq(`${TAG}-b`),
    taskId: over.taskId ?? null,
    dueAt: over.dueAt ?? null,
  });
  if (r.status !== 201) throw new Error(`assign ${r.status} ${r.text}`);
  return r.body;
}
/** An agent drafts a request through MCP send_request (status `draft`, waits in the approval queue). */
export async function agentDraft(a: AgentCred, to: RoleKey | "orchestrator", over: ReqOver = {}) {
  const r = await tool(a.token, "send_request", { to, kind: over.kind ?? "question", title: over.title ?? uniq(`${TAG}-t`), body: over.body ?? uniq(`${TAG}-b`), taskId: over.taskId ?? null, dueAt: over.dueAt ?? null });
  if (r.isError) throw new Error(`agentDraft ${r.status} ${r.blocks.join(" ")}`);
  return { id: r.data.requestId as string, status: r.data.status as string };
}
export const act = (w: World, id: string, action: string, body?: string, extra: Record<string, unknown> = {}) =>
  api(w.orch, "POST", W(w, `/requests/${id}/actions`), { action, ...(body === undefined ? {} : { body }), ...extra });
/** agent drafts, orchestrator forwards (`send`). Returns the sent request. */
export async function agentSent(w: World, a: AgentCred, to: RoleKey | "orchestrator", over: ReqOver = {}) {
  const d = await agentDraft(a, to, over);
  const s = await act(w, d.id, "send");
  if (s.status !== 200) throw new Error(`send ${s.status} ${s.text}`);
  return s.body;
}

/* ---------------- SSE ---------------- */
export async function sseCollect(s: Session, ms: number, whileOpen?: () => Promise<void>, slug = s.slug, base = API): Promise<{ status: number; text: string }> {
  const ctl = new AbortController();
  const r = await fetch(`${base}/w/${slug}/stream`, { headers: { cookie: s.cookie }, signal: ctl.signal });
  if (r.status !== 200 || !r.body) return { status: r.status, text: await r.text() };
  const rd = r.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  const timer = setTimeout(() => ctl.abort(), ms);
  const reading = (async () => {
    try {
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        text += dec.decode(value);
      }
    } catch {
      /* aborted */
    }
  })();
  await new Promise((r2) => setTimeout(r2, 600));
  if (whileOpen) await whileOpen();
  await reading;
  clearTimeout(timer);
  return { status: 200, text };
}

/** Test fake secrets are assembled at runtime so the source tree never contains a scannable key. */
export const FAKE = {
  anthropic: () => ["sk", "ant", "api03", "A1b2C3d4E5f6G7h8I9j0K1l2M3"].join("-"),
  openai: () => "sk-" + "abcdefghijklmnopqrstuvwxyz" + "0123456789ABCD",
  github: () => "ghp_" + "abcdefghijklmnopqrstuvwxyz" + "0123456789",
  aws: () => "AKIA" + "IOSFODNN7EXAMPLE",
  pem: () => ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" "),
  stripe: () => "sk_live_" + "4eC39HqLyjWDarjtT1zdp7dc",
  dbUrl: () => "postgres://admin:" + "SuperS3cretPw" + "@db.internal:5432/prod",
  jwt: () => ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"].join("."),
};
