import { afterAll, describe, expect, it } from "vitest";
import { AgentRateLimiter, adminSql, closeAll, createRequestDraft, withWorkspace } from "@officehub/db";
import { makeAgent, makeAgentToken, makeWorkspace } from "@officehub/db/testing";
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
const mkReq = (receiverRoleId: string, title: string, body: string, kind = "question") => ({ receiverRoleId, kind, title, body, taskId: null, dueAt: null });

describe("v0.3 routes (v0.6 model)", () => {
  it("/me and dev-login return the Me shape", async () => {
    const h = setup();
    const w = await makeWorkspace("v3");
    const c = await login(h, w.orchestrator);
    const me = await (await call(h, c, "GET", "/me")).json();
    expect(Routes.me.res.safeParse(me).success).toBe(true);
    expect(me).toMatchObject({ workspaceSlug: w.slug, id: w.orchestrator });
  });

  it("GET /auth/dev-members: list when DEV_LOGIN_ENABLED, 404 otherwise; no secrets in it", async () => {
    const w = await makeWorkspace("v3");
    const on = await setup().app.request("/auth/dev-members");
    expect(on.status).toBe(200);
    const list = await on.json();
    expect(Routes.devMembers.res.safeParse(list).success).toBe(true);
    expect(list.find((m: { id: string }) => m.id === w.orchestrator)).toMatchObject({ displayName: "Orchestrator", workspaceSlug: w.slug });
    expect(Object.keys(list[0]).sort()).toEqual(["displayName", "id", "mascot", "workspaceSlug"]);
    const off = await setup({ devLoginEnabled: false }).app.request("/auth/dev-members");
    expect(off.status).toBe(404);
  });

  it("getRequest: the orchestrator sees everything (drafts and reply drafts too) with role authorship; other workspace 404; agent token 403; unauthenticated 401; Request schema", async () => {
    const h = setup();
    const w = await makeWorkspace("v3");
    const other = await makeWorkspace("v3");
    const [a, o] = [await login(h, w.orchestrator), await login(h, other.orchestrator)];
    const fe = await makeAgent(w, "frontend");
    const be = await makeAgent(w, "backend");
    const draft = await createRequestDraft(fe.principal, mkReq(w.roles.backend, "GR-TITLE", "GR-BODY"));
    // an unsent draft is visible to the orchestrator (it is theirs to review)
    const asOrch = await call(h, a, "GET", `/w/${w.slug}/requests/${draft.id}`);
    expect(asOrch.status).toBe(200);
    const j = await asOrch.json();
    expect(RequestSchema.safeParse(j).success).toBe(true);
    expect(j).toMatchObject({ status: "draft", askerRoleId: w.roles.frontend });
    expect(j.messages[0]).toMatchObject({ authoredBy: "agent", authorRoleId: w.roles.frontend, authorAgentId: fe.agent.id, sentById: null });
    await call(h, a, "POST", `/w/${w.slug}/requests/${draft.id}/actions`, { action: "send" });
    await call(h, a, "POST", `/w/${w.slug}/requests/${draft.id}/actions`, { action: "draft_reply", body: "REPLY-DRAFT" }); // orchestrator may act for the receiver too
    const full = await (await call(h, a, "GET", `/w/${w.slug}/requests/${draft.id}`)).json();
    expect(full.messages.map((m: { kind: string }) => m.kind)).toEqual(["ask", "reply"]);
    expect(full.messages.every((m: { authorRoleId: string | null; authorMemberId?: string | null }) => m.authorRoleId !== undefined)).toBe(true);
    // the same agent-written request, listed
    const list = await (await call(h, a, "GET", `/w/${w.slug}/requests`)).json();
    expect(list.map((r: { id: string }) => r.id)).toContain(draft.id);
    // role-level redaction is enforced for agents (their view never includes the other role's unsent draft)
    await createRequestDraft(be.principal, mkReq(w.roles.qa, "BE-PRIVATE-DRAFT", "x"));
    const inbox = await (await h.app.request("/agent/inbox", { headers: { authorization: `Bearer ${fe.token}` } })).json();
    expect(JSON.stringify(inbox)).not.toContain("BE-PRIVATE-DRAFT");
    expect(JSON.stringify(inbox)).not.toContain("REPLY-DRAFT"); // receiver's unsent reply is hidden from the asking role
    // other workspace / no session / agent token / malformed id
    expect((await call(h, o, "GET", `/w/${w.slug}/requests/${draft.id}`)).status).toBe(404);
    expect((await call(h, o, "GET", `/w/${other.slug}/requests/${draft.id}`)).status).toBe(404);
    expect((await h.app.request(`/w/${w.slug}/requests/${draft.id}`)).status).toBe(401);
    const viaAgent = await h.app.request(`/w/${w.slug}/requests/${draft.id}`, { headers: { authorization: `Bearer ${fe.token}` } });
    expect(viaAgent.status).toBe(403);
    expect((await viaAgent.json()).error.code).toBe("human_only");
    expect((await call(h, a, "GET", `/w/${w.slug}/requests/not-a-uuid`)).status).toBe(404);
  });

  it("markRead returns {ok:true}; revokeAgent returns the revoked Agent (with its role)", async () => {
    const h = setup();
    const w = await makeWorkspace("v3");
    const a = await login(h, w.orchestrator);
    const req = await (await call(h, a, "POST", `/w/${w.slug}/requests`, mkReq(w.roles.backend, "t", "b"))).json();
    const mr = await call(h, a, "POST", `/w/${w.slug}/requests/${req.id}/read`);
    expect(await mr.json()).toEqual({ ok: true });
    const created = await (await call(h, a, "POST", `/w/${w.slug}/agents`, { roleId: w.roles.design, kind: "codex", label: "x", scopes: ["board:read"] })).json();
    const rv = await call(h, a, "DELETE", `/w/${w.slug}/agents/${created.agent.id}`);
    const body = await rv.json();
    expect(Agent.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ id: created.agent.id, roleId: w.roles.design });
    expect(body.revokedAt).not.toBeNull();
  });

  it("audit entries parse as AuditEntry with string targetId", async () => {
    const h = setup();
    const w = await makeWorkspace("v3");
    const a = await login(h, w.orchestrator);
    const req = await (await call(h, a, "POST", `/w/${w.slug}/requests`, mkReq(w.roles.backend, "t", "b"))).json();
    const rows = await (await call(h, a, "GET", `/w/${w.slug}/audit`)).json();
    expect(Routes.audit.res.safeParse(rows).success).toBe(true);
    expect(rows.find((r: { action: string }) => r.action === "request.create").targetId).toBe(req.id);
  });

  it("secret_detected message format stays '... (rule: <id>) ...' (the web toast parses it)", async () => {
    const h = setup();
    const w = await makeWorkspace("v3");
    const a = await login(h, w.orchestrator);
    const key = "ghp_" + "a1B2c3D4e5".repeat(4);
    const r = await call(h, a, "POST", `/w/${w.slug}/requests`, mkReq(w.roles.backend, "t", key));
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

  it("a workspace's stream never carries another workspace's requests, drafts, cards or proposals; kinds are ChangeKind; payloads hold ids only", async () => {
    const h = setup();
    await h.hub.start();
    const w1 = await makeWorkspace("sse");
    const w2 = await makeWorkspace("sse");
    const [a, b] = [await login(h, w1.orchestrator), await login(h, w2.orchestrator)];
    const s1 = await collect(h, a, w1.slug);
    const s2 = await collect(h, b, w2.slug);
    await new Promise((r) => setTimeout(r, 300));
    // activity in workspace 2 only: an agent draft, a card, a proposal, a decision
    const fe2 = await makeAgent(w2, "frontend");
    const d2 = await createRequestDraft(fe2.principal, mkReq(w2.roles.backend, "SSE-T", "SSE-B"));
    const { proposeDecision, updateRoleStatus } = await import("@officehub/db");
    const p2 = await proposeDecision(fe2.principal, { title: "SSE-PROPOSAL", body: "", rationale: "r" });
    await updateRoleStatus(fe2.principal, { presence: "working", doing: "SSE-DOING", branch: null, waitingOn: [] });
    await new Promise((r) => setTimeout(r, 800));
    expect(changes(s1.text())).toEqual([]); // nothing at all leaked into workspace 1
    // activity in workspace 1
    const fe1 = await makeAgent(w1, "frontend");
    const d1 = await createRequestDraft(fe1.principal, mkReq(w1.roles.backend, "OWN-T", "OWN-B"));
    await call(h, a, "POST", `/w/${w1.slug}/requests/${d1.id}/actions`, { action: "send" });
    await call(h, a, "PUT", `/w/${w1.slug}/roles/${w1.roles.qa}/status`, { presence: "working", doing: "x", branch: null, waitingOn: [] });
    await new Promise((r) => setTimeout(r, 900));
    await Promise.all([s1.stop(), s2.stop()]);
    const m1 = changes(s1.text());
    const m2 = changes(s2.text());
    expect(m1.some((m) => m.kind === "request" && m.id === d1.id)).toBe(true);
    expect(m1.some((m) => m.kind === "card" && m.id === w1.roles.qa)).toBe(true);
    expect(m1.some((m) => m.id === d2.id || m.id === p2.id)).toBe(false);
    expect(m2.some((m) => m.kind === "request" && m.id === d2.id)).toBe(true);
    expect(m2.some((m) => m.kind === "proposal" && m.id === p2.id)).toBe(true);
    expect(m2.some((m) => m.id === d1.id)).toBe(false);
    for (const m of [...m1, ...m2]) expect(ChangeKind.safeParse(m.kind).success).toBe(true);
    expect(s1.text() + s2.text()).not.toMatch(/SSE-T|SSE-B|SSE-PROPOSAL|SSE-DOING|OWN-T|OWN-B/); // ids only, never content
    await h.hub.stop();
  });
});

describe("shared rate limit between API and MCP", () => {
  it("one agent's budget is shared: API calls + MCP calls together cannot exceed the limit", async () => {
    const limiter = () => new AgentRateLimiter({ perMinute: 4 });
    const api = setup({ limiter: limiter() });
    const mcp = createMcpApp({ limiter: limiter() });
    const w = await makeWorkspace("shared");
    const t = await makeAgentToken(w, "frontend");
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

  it("a second agent of the same role has its own budget (limits are per token)", async () => {
    const api = setup({ limiter: new AgentRateLimiter({ perMinute: 2 }) });
    const w = await makeWorkspace("shared");
    const t1 = await makeAgentToken(w, "qa");
    const t2 = await makeAgentToken(w, "qa");
    const get = (tok: string) => api.app.request("/agent/inbox", { headers: { authorization: `Bearer ${tok}` } });
    expect([(await get(t1.token)).status, (await get(t1.token)).status, (await get(t1.token)).status]).toEqual([200, 200, 429]);
    expect((await get(t2.token)).status).toBe(200);
  });
});
