import { afterAll, describe, expect, it } from "vitest";
import { AgentRateLimiter, adminSql, closeAll, withWorkspace } from "@officehub/db";
import { makeAgentToken, makeWorkspace } from "@officehub/db/testing";
import { Agent, ChangeKind, Me, Request as RequestSchema, Routes } from "@officehub/shared";
import { createApp } from "../src/app.js";
import { createMcpApp } from "../../mcp/src/app.js";

afterAll(closeAll);
const ORIGIN = "http://localhost:3000";
const setup = (over = {}) => createApp({ devLoginEnabled: true, webOrigin: ORIGIN, limiter: new AgentRateLimiter(), ...over });
type H = ReturnType<typeof setup>;

async function login(h: H, memberId: string) {
  const res = await h.app.request("/auth/dev-login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-officehub-csrf": "1", origin: ORIGIN },
    body: JSON.stringify({ memberId }),
  });
  expect(res.status).toBe(200);
  expect(Me.safeParse(await res.json()).success).toBe(true);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}
const call = (h: H, cookie: string, method: string, path: string, body?: unknown) =>
  h.app.request(path, {
    method,
    headers: { cookie, "content-type": "application/json", "x-officehub-csrf": "1", origin: ORIGIN },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const mkReq = (rcv: string, title: string, body: string) => ({ receiverId: rcv, title, body, taskId: null, dueAt: null });

describe("v0.3 routes", () => {
  it("/me and dev-login return the Me shape", async () => {
    const h = setup();
    const w = await makeWorkspace("v3");
    const c = await login(h, w.alice);
    const me = await (await call(h, c, "GET", "/me")).json();
    expect(Routes.me.res.safeParse(me).success).toBe(true);
    expect(me).toMatchObject({ workspaceSlug: w.slug, id: w.alice });
  });

  it("GET /auth/dev-members: list when DEV_LOGIN_ENABLED, 404 otherwise; no secrets in it", async () => {
    const w = await makeWorkspace("v3");
    const on = await setup().app.request("/auth/dev-members");
    expect(on.status).toBe(200);
    const list = await on.json();
    expect(Routes.devMembers.res.safeParse(list).success).toBe(true);
    expect(list.find((m: { id: string }) => m.id === w.bob)).toMatchObject({ displayName: "Bob", workspaceSlug: w.slug });
    expect(Object.keys(list[0]).sort()).toEqual(["displayName", "id", "mascot", "workspaceSlug"]);
    const off = await setup({ devLoginEnabled: false }).app.request("/auth/dev-members");
    expect(off.status).toBe(404);
  });

  it("getRequest: parties see it; draft hidden from the receiver (404); non-party 404; admin sees sent only; unauthenticated 401; Request schema", async () => {
    const h = setup();
    const w = await makeWorkspace("v3");
    const [a, b, c] = [await login(h, w.alice), await login(h, w.bob), await login(h, w.carol)];
    const req = await (await call(h, a, "POST", `/w/${w.slug}/requests`, mkReq(w.bob, "GR-TITLE", "GR-BODY"))).json();
    expect((await call(h, a, "GET", `/w/${w.slug}/requests/${req.id}`)).status).toBe(200);
    for (const who of [b, c]) expect((await call(h, who, "GET", `/w/${w.slug}/requests/${req.id}`)).status).toBe(404);
    await call(h, a, "POST", `/w/${w.slug}/requests/${req.id}/actions`, { action: "send" });
    await call(h, b, "POST", `/w/${w.slug}/requests/${req.id}/actions`, { action: "draft_reply", body: "REPLY-DRAFT-SECRET" });
    const asBob = await call(h, b, "GET", `/w/${w.slug}/requests/${req.id}`);
    const bobJson = await asBob.json();
    expect(RequestSchema.safeParse(bobJson).success).toBe(true);
    expect(bobJson.messages.every((m: { authorMemberId?: string }) => typeof m.authorMemberId === "string")).toBe(true);
    const asAlice = await (await call(h, a, "GET", `/w/${w.slug}/requests/${req.id}`)).json();
    expect(JSON.stringify(asAlice)).not.toContain("REPLY-DRAFT-SECRET"); // receiver's reply draft is redacted for the asker
    expect(asAlice.messages).toHaveLength(1);
    expect((await call(h, c, "GET", `/w/${w.slug}/requests/${req.id}`)).status).toBe(404);
    await adminSql()`UPDATE members SET role = 'admin' WHERE id = ${w.carol}`;
    const adm = await call(h, c, "GET", `/w/${w.slug}/requests/${req.id}`);
    expect(adm.status).toBe(200);
    expect(JSON.stringify(await adm.json())).not.toContain("REPLY-DRAFT-SECRET");
    expect((await h.app.request(`/w/${w.slug}/requests/${req.id}`)).status).toBe(401);
    expect((await call(h, a, "GET", `/w/${w.slug}/requests/not-a-uuid`)).status).toBe(404);
  });

  it("markRead returns {ok:true}; revokeAgent returns the revoked Agent", async () => {
    const h = setup();
    const w = await makeWorkspace("v3");
    const [a, b] = [await login(h, w.alice), await login(h, w.bob)];
    const req = await (await call(h, a, "POST", `/w/${w.slug}/requests`, mkReq(w.bob, "t", "b"))).json();
    await call(h, a, "POST", `/w/${w.slug}/requests/${req.id}/actions`, { action: "send" });
    const mr = await call(h, b, "POST", `/w/${w.slug}/requests/${req.id}/read`);
    expect(await mr.json()).toEqual({ ok: true });
    const created = await (await call(h, b, "POST", `/w/${w.slug}/agents`, { kind: "codex", label: "x", scopes: ["board:read"] })).json();
    const rv = await call(h, b, "DELETE", `/w/${w.slug}/agents/${created.agent.id}`);
    const body = await rv.json();
    expect(Agent.safeParse(body).success).toBe(true);
    expect(body.id).toBe(created.agent.id);
    expect(body.revokedAt).not.toBeNull();
  });

  it("audit entries parse as AuditEntry with string targetId", async () => {
    const h = setup();
    const w = await makeWorkspace("v3");
    const a = await login(h, w.alice);
    const req = await (await call(h, a, "POST", `/w/${w.slug}/requests`, mkReq(w.bob, "t", "b"))).json();
    const rows = await (await call(h, a, "GET", `/w/${w.slug}/audit`)).json();
    expect(Routes.audit.res.safeParse(rows).success).toBe(true);
    expect(rows.find((r: { action: string }) => r.action === "request.create").targetId).toBe(req.id);
  });

  it("secret_detected message format stays '... (rule: <id>) ...' (the web toast parses it)", async () => {
    const h = setup();
    const w = await makeWorkspace("v3");
    const a = await login(h, w.alice);
    const key = "ghp_" + "a1B2c3D4e5".repeat(4);
    const r = await call(h, a, "POST", `/w/${w.slug}/requests`, mkReq(w.bob, "t", key));
    const j = await r.json();
    expect(j.error.code).toBe("secret_detected");
    expect(j.error.message).toMatch(/\(rule: ([\w.-]+)\)/);
    expect(j.error.message.match(/\(rule: ([\w.-]+)\)/)[1]).toBe("github-token");
  });
});

describe("SSE", () => {
  async function collect(h: H, cookie: string, slug: string) {
    const res = await h.app.request(`/w/${slug}/stream`, { headers: { cookie } });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    const done = (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          text += dec.decode(value);
        }
      } catch {
        /* cancelled */
      }
    })();
    return {
      text: () => text,
      stop: async () => {
        await reader.cancel().catch(() => {});
        await done;
      },
    };
  }
  const changes = (t: string) =>
    [...t.matchAll(/event: change\ndata: (.*)\n/g)].map((m) => JSON.parse(m[1]!) as { kind: string; id: string });

  it("change payload kinds are ChangeKind; non-parties never get notifications about someone's draft or request events", async () => {
    const h = setup();
    await h.hub.start();
    const w = await makeWorkspace("sse");
    const [a, b, c] = [await login(h, w.alice), await login(h, w.bob), await login(h, w.carol)];
    const sb = await collect(h, b, w.slug);
    const sc = await collect(h, c, w.slug);
    await new Promise((r) => setTimeout(r, 300));
    const req = await (await call(h, a, "POST", `/w/${w.slug}/requests`, mkReq(w.bob, "SSE-T", "SSE-B"))).json(); // draft: bob must not hear
    await new Promise((r) => setTimeout(r, 700));
    expect(changes(sb.text()).filter((m) => m.kind === "request" || m.kind === "event")).toEqual([]);
    await call(h, a, "POST", `/w/${w.slug}/requests/${req.id}/actions`, { action: "send" });
    await call(h, a, "PUT", `/w/${w.slug}/status`, { presence: "working", doing: "x", branch: null, waitingOn: [] });
    await new Promise((r) => setTimeout(r, 900));
    await Promise.all([sb.stop(), sc.stop()]);
    const bm = changes(sb.text());
    const cm = changes(sc.text());
    expect(bm.some((m) => m.kind === "request" && m.id === req.id)).toBe(true);
    expect(cm.some((m) => m.kind === "request")).toBe(false);
    expect(cm.some((m) => m.kind === "card")).toBe(true); // public changes still reach everyone
    for (const m of [...bm, ...cm]) expect(ChangeKind.safeParse(m.kind).success).toBe(true);
    expect(sb.text() + sc.text()).not.toMatch(/SSE-T|SSE-B/);
    await h.hub.stop();
  });
});

describe("shared rate limit between API and MCP", () => {
  it("one agent's budget is shared: API calls + MCP calls together cannot exceed the limit", async () => {
    const limiter = () => new AgentRateLimiter({ perMinute: 4 });
    const api = setup({ limiter: limiter() });
    const mcp = createMcpApp({ limiter: limiter() });
    const w = await makeWorkspace("shared");
    const t = await makeAgentToken(w, "alice");
    const viaApi = () => api.app.request("/agent/inbox", { headers: { authorization: `Bearer ${t.token}` } });
    const viaMcp = () =>
      mcp.request("/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${t.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_board", arguments: {} } }),
      });
    const statuses = [(await viaApi()).status, (await viaMcp()).status, (await viaApi()).status, (await viaMcp()).status];
    expect(statuses).toEqual([200, 200, 200, 200]);
    expect((await viaApi()).status).toBe(429);
    expect((await viaMcp()).status).toBe(429);
    const row = await withWorkspace(w.id, async () => (await adminSql()`SELECT key FROM rate_buckets WHERE key = ${t.agent.id + ":any"}`).length);
    expect(row).toBe(1);
  });
});
