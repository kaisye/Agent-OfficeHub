/** Black-box helpers for the live Office Hub stack. No imports from product code: this suite only speaks HTTP / SQL. */
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

export const API = process.env.OH_API ?? "http://localhost:8787";
export const MCP = process.env.OH_MCP ?? "http://localhost:8788/mcp";
export const WEB = process.env.OH_WEB ?? "http://localhost:3000";
export const DB_URL = process.env.OH_DB ?? "postgres://officehub:officehub@localhost:5433/officehub";
export const SLUG = "tripflix";
export const ORIGIN = "http://localhost:3000";
/** Everything this suite creates is tagged so teardown can remove it. */
export const TAG = "QA-E2E";
export const AGENT_LABEL = "qa-e2e";

export const MEMBER = {
  phong: "adcf8a47-7647-4b1f-952a-76723d7a3413", // admin
  trang: "97c2557b-189e-4b54-8c73-a89dfa40e274",
  bao: "7f7870ee-bc43-47b5-84fc-001dc3081d57",
  minh: "3c343b90-4f1b-4be5-a283-34c921c55092",
  lan: "ed5375c3-a3b1-400c-a0c3-70593a3824e6",
} as const;

export const ALL_SCOPES = ["board:read", "inbox:read", "status:write:self", "request:draft"];

export const uniq = (p = TAG) => `${p}-${randomUUID().slice(0, 8)}`;
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let _sql: ReturnType<typeof postgres> | undefined;
/** Superuser connection (bypasses RLS). Used to set up a 2nd workspace and to inspect storage. */
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

export const W = (path: string, slug = SLUG) => `/w/${slug}${path}`;

export const board = async (s: Session) => (await api(s, "GET", W("/board", s.slug))).body;

/* ---------------- agents / MCP ---------------- */
export interface AgentCred {
  id: string;
  token: string;
  ownerId: string;
}
/** Creates an agent through the real API (human click equivalent). Tagged for teardown. */
export async function createAgent(s: Session, scopes: string[] = ALL_SCOPES, kind = "codex"): Promise<AgentCred> {
  const r = await api(s, "POST", W("/agents", s.slug), { kind, label: `${AGENT_LABEL}-${randomUUID().slice(0, 6)}`, scopes });
  if (r.status !== 201) throw new Error(`createAgent ${r.status} ${r.text}`);
  return { id: r.body.agent.id, token: r.body.token, ownerId: s.memberId };
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

/* ---------------- requests ---------------- */
export async function draftRequest(asker: Session, receiverId: string, over: Partial<{ title: string; body: string; taskId: string | null; dueAt: string | null }> = {}) {
  const r = await api(asker, "POST", W("/requests", asker.slug), { receiverId, title: over.title ?? uniq(`${TAG}-t`), body: over.body ?? uniq(`${TAG}-b`), taskId: over.taskId ?? null, dueAt: over.dueAt ?? null });
  if (r.status !== 201) throw new Error(`draftRequest ${r.status} ${r.text}`);
  return r.body;
}
export const act = (s: Session, id: string, action: string, body?: string) => api(s, "POST", W(`/requests/${id}/actions`, s.slug), body === undefined ? { action } : { action, body });
export async function sentRequest(asker: Session, receiverId: string, over: Parameters<typeof draftRequest>[2] = {}) {
  const d = await draftRequest(asker, receiverId, over);
  const s = await act(asker, d.id, "send");
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
