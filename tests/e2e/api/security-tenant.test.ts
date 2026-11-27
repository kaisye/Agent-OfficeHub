/** Cross-tenant isolation (v0.6): two workspaces (each its own orchestrator + 6 roles), id/slug swapping, RLS at the DB level, SSE, MCP. */
import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { W, act, agentDraft, agentSent, api, assign, board, createAgent, createWorld, roleStatus, sql, sseCollect, tool, toolErrCode, uniq, type AgentCred, type World } from "../src/helpers.js";

let a: World, b: World; // a = "home", b = the other tenant
let aFe: AgentCred, aBe: AgentCred, bFe: AgentCred, bBe: AgentCred;
let reqId: string; // a sent request in A
let bReq: string; // a sent request in B
let bDraft: string; // an unsent draft in B
let taskId: string;
let aProposal: string;

beforeAll(async () => {
  [a, b] = await Promise.all([createWorld("tenant-a"), createWorld("tenant-b")]);
  [aFe, aBe, bFe, bBe] = await Promise.all([createAgent(a, "frontend"), createAgent(a, "backend"), createAgent(b, "frontend"), createAgent(b, "backend")]);
  reqId = (await agentSent(a, aFe, "backend", { title: uniq("QA-E2E-tenant") })).id;
  bReq = (await agentSent(b, bFe, "backend", { title: uniq("QA-E2E-t2req") })).id;
  bDraft = (await agentDraft(bFe, "backend", { title: uniq("QA-E2E-t2draft") })).id;
  const [t] = await sql()`INSERT INTO tasks (workspace_id, source, title, state) VALUES (${a.id}, 'manual', 'QA-E2E tenant task', 'open') RETURNING id`;
  taskId = t!.id as string;
  aProposal = (await tool(aBe.token, "propose_decision", { title: uniq("QA-E2E-tprop"), body: "b", rationale: "r" })).data.proposalId;
});

describe("session / slug swapping", () => {
  it("each tenant sees only its own roles and board; no member list exists any more", async () => {
    const bb = await board(b);
    expect(bb.workspace.slug).toBe(b.slug);
    expect(bb.orchestrator.id).toBe(b.orchestratorId);
    expect(bb.roles.map((r: any) => r.id).sort()).toEqual(Object.values(b.roles).sort());
    expect(bb.roles.every((r: any) => r.workspaceId === b.id)).toBe(true);
    expect(JSON.stringify(bb)).not.toContain(a.slug);
    expect(JSON.stringify(bb)).not.toContain(a.orchestratorId);
    expect(JSON.stringify(await board(a))).not.toContain(b.orchestratorId);
  });
  it("a session never works under another workspace's slug (every read route)", async () => {
    for (const p of ["/board", "/roles", "/queue", "/proposals", "/requests", "/decisions", "/agents", "/audit", "/stream"]) {
      expect((await api(b.orch, "GET", W(a, p))).status, `b->a ${p}`).toBe(404);
      expect((await api(a.orch, "GET", W(b, p))).status, `a->b ${p}`).toBe(404);
    }
    expect((await api(b.orch, "GET", W(a, `/tasks/${taskId}/handoff`))).status).toBe(404);
  });
  it("A's ids replayed on B's routes (and the reverse) are 404 (actions, read, getRequest, handoff, revoke, proposals, roles)", async () => {
    expect((await act(b, reqId, "cancel")).status).toBe(404); // B's session under B's slug, A's request id
    expect((await api(b.orch, "POST", W(b, `/requests/${reqId}/actions`), { action: "send_reply", body: "x" })).status).toBe(404);
    expect((await api(b.orch, "POST", W(b, `/requests/${reqId}/read`))).status).toBe(404);
    expect((await api(b.orch, "GET", W(b, `/requests/${reqId}`))).status).toBe(404);
    expect((await api(b.orch, "GET", W(b, `/tasks/${taskId}/handoff`))).status).toBe(404);
    expect((await api(b.orch, "POST", W(b, `/proposals/${aProposal}`), { action: "accept" })).status).toBe(404);
    expect((await api(b.orch, "DELETE", W(b, `/agents/${aFe.id}`))).status).toBe(404);
    expect((await api(b.orch, "PUT", W(b, `/roles/${a.roles.qa}`), { mission: "x" })).status).toBe(404);
    expect((await api(b.orch, "PUT", W(b, `/roles/${a.roles.qa}/status`), { presence: "idle", doing: null, branch: null, waitingOn: [] })).status).toBe(404);
    // and the reverse, including B's unsent draft
    expect((await api(a.orch, "GET", W(a, `/requests/${bReq}`))).status).toBe(404);
    expect((await api(a.orch, "GET", W(a, `/requests/${bDraft}`))).status).toBe(404);
    expect((await api(a.orch, "POST", W(a, `/requests/${bDraft}/actions`), { action: "send" })).status).toBe(404);
    expect((await api(a.orch, "POST", W(a, `/requests/${bReq}/actions`), { action: "cancel" })).status).toBe(404);
    // nothing changed
    expect((await api(a.orch, "GET", W(a, `/requests/${reqId}`))).body.status).toBe("sent");
    expect((await api(b.orch, "GET", W(b, `/requests/${bDraft}`))).body.status).toBe("draft");
  });
  it("foreign ids as payload references are rejected: receiver role, taskId (request + decision), roleIds, waitingOn, agent role", async () => {
    const post = (body: any) => api(b.orch, "POST", W(b, "/requests"), { kind: "question", title: "QA-E2E-x", body: "b", taskId: null, dueAt: null, receiverRoleId: b.roles.qa, ...body });
    expect((await post({ receiverRoleId: a.roles.backend })).status).toBe(400);
    expect((await post({ taskId })).status).toBe(400);
    expect((await api(b.orch, "POST", W(b, "/decisions"), { title: "QA-E2E-d", body: "", rationale: "r", taskId })).status).toBe(400);
    expect((await api(b.orch, "POST", W(b, "/decisions"), { title: "QA-E2E-d", body: "", rationale: "r", taskId: null, roleIds: [a.roles.backend] })).status).toBe(400);
    expect((await roleStatus(b, "qa", { presence: "waiting", waitingOn: [a.roles.backend] })).status).toBe(400);
    expect((await api(b.orch, "POST", W(b, "/agents"), { roleId: a.roles.qa, kind: "codex", label: "qa-e2e-x", scopes: [] })).status).toBe(400);
  });
  it("login is by member id: A's session cannot be pointed at B by cookie or slug tricks", async () => {
    for (const p of [`/w/${b.slug}/board`, `/w/${b.slug.replace("qa", "%71a")}/board`, `/w/${a.slug}%2f..%2f${b.slug}/board`]) expect((await api(a.orch, "GET", p)).status, p).toBe(404);
  });
});

describe("MCP across tenants", () => {
  it("B's agent cannot read, draft against or address A", async () => {
    const tok = bFe.token;
    const bd = JSON.stringify((await tool(tok, "read_board")).data) + JSON.stringify((await tool(tok, "list_inbox")).data);
    expect(bd).not.toContain(reqId);
    expect(bd).not.toContain(a.slug);
    expect(toolErrCode(await tool(tok, "reply_draft", { requestId: reqId, body: "x" }))).toBe("not_found");
    expect(toolErrCode(await tool(tok, "send_request", { to: "backend", title: "x", body: "y", taskId }))).toBe("validation_failed");
    expect((await tool(tok, "read_decisions")).data.decisions).toEqual([]);
  });
  it("tool role keys resolve inside the caller's own workspace only (same key, different role id)", async () => {
    // B's frontend drafts to "backend": it must land on B's backend role, never A's
    const d = await agentDraft(bFe, "backend", { title: uniq("QA-E2E-keyscope") });
    const r = (await api(b.orch, "GET", W(b, `/requests/${d.id}`))).body;
    expect(r.receiverRoleId).toBe(b.roles.backend);
    expect((await api(a.orch, "GET", W(a, "/requests"))).text).not.toContain(d.id);
  });
  it("A's agent cannot reach B's requests or proposals", async () => {
    expect(toolErrCode(await tool(aBe.token, "reply_draft", { requestId: bReq, body: "x" }))).toBe("not_found");
    expect(JSON.stringify((await tool(aBe.token, "list_inbox")).data)).not.toContain(bReq);
  });
});

describe("SSE across tenants", () => {
  it("B's subscriber gets nothing from A's activity, and vice versa", async () => {
    const [bSse, aSse] = await Promise.all([
      sseCollect(b.orch, 3500),
      sseCollect(a.orch, 3500, async () => {
        const r = await assign(a, "backend", { title: uniq("QA-E2E-ssecross") });
        await act(a, r.id, "send_reply", "ans");
        await roleStatus(a, "qa", { presence: "working", doing: "QA-E2E sse" });
        await assign(b, "backend", { title: uniq("QA-E2E-ssecross2") });
      }),
    ]);
    expect(bSse.status).toBe(200);
    expect(bSse.text.match(/event: change/g)?.length ?? 0).toBeGreaterThanOrEqual(1); // its own activity arrives
    expect(bSse.text).not.toContain(reqId);
    expect(bSse.text).not.toContain(a.roles.qa);
    const ids = [...aSse.text.matchAll(/"id":"([0-9a-f-]{36})"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(bReq);
    expect(ids).not.toContain(bDraft);
    expect(ids).not.toContain(b.roles.backend);
  });
});

describe("Postgres RLS (officehub_app role) — the last line of defence", () => {
  const url = process.env.OH_APP_DB ?? "postgres://officehub_app:officehub_app@localhost:5433/officehub";
  const tables = ["members", "roles", "status_cards", "agents", "tasks", "events", "requests", "request_messages", "decisions", "decision_proposals", "audit_log", "sessions", "inbox_reads", "role_reads"];
  it("no workspace GUC -> zero rows from every tenant table", async () => {
    const app = postgres(url, { max: 1 });
    try {
      for (const t of tables) expect((await app.unsafe(`SELECT count(*)::int AS n FROM ${t}`))[0]!.n, t).toBe(0);
      expect((await app`SELECT count(*)::int AS n FROM workspaces`)[0]!.n).toBe(0);
    } finally {
      await app.end();
    }
  });
  it("with workspace B set, only B's rows are visible, cross-workspace writes fail (WITH CHECK) or touch 0 rows", async () => {
    const app = postgres(url, { max: 1 });
    try {
      await app.begin(async (tx) => {
        await tx`SELECT set_config('app.workspace_id', ${b.id}, true)`;
        for (const t of ["roles", "agents", "requests", "decision_proposals"]) {
          expect((await tx.unsafe(`SELECT count(*)::int AS n FROM ${t} WHERE workspace_id <> $1`, [b.id]))[0]!.n, t).toBe(0);
        }
        expect((await tx`SELECT count(*)::int AS n FROM roles`)[0]!.n).toBe(6);
        expect((await tx`SELECT count(*)::int AS n FROM requests WHERE id = ${reqId}`)[0]!.n).toBe(0);
        expect((await tx`UPDATE requests SET status = 'cancelled' WHERE id = ${reqId} RETURNING id`).length).toBe(0);
        expect((await tx`UPDATE roles SET mission = 'pwned' WHERE id = ${a.roles.qa} RETURNING id`).length).toBe(0);
        expect((await tx`UPDATE decision_proposals SET status = 'accepted' WHERE id = ${aProposal} RETURNING id`).length).toBe(0);
      });
      await expect(
        app.begin(async (tx) => {
          await tx`SELECT set_config('app.workspace_id', ${b.id}, true)`;
          await tx`INSERT INTO decisions (workspace_id, title, body, rationale, decided_by_id) VALUES (${a.id}, 'QA-E2E x', '', 'r', ${a.orchestratorId})`;
        }),
      ).rejects.toThrow(/row-level security/);
      await expect(
        app.begin(async (tx) => {
          await tx`SELECT set_config('app.workspace_id', ${b.id}, true)`;
          await tx`INSERT INTO status_cards (role_id, workspace_id, presence, updated_by) VALUES (${a.roles.qa}, ${a.id}, 'idle', 'human')`;
        }),
      ).rejects.toThrow(/row-level security/);
      const left = (await sql()`SELECT (SELECT count(*)::int FROM requests WHERE id = ${reqId}) AS r, (SELECT mission FROM roles WHERE id = ${a.roles.qa}) AS m`)[0]!;
      expect(left.r).toBe(1);
      expect(left.m).not.toBe("pwned");
    } finally {
      await app.end();
    }
  });
  it("the app role is not a superuser and cannot bypass RLS", async () => {
    const app = postgres(url, { max: 1 });
    try {
      const [r] = await app`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
      expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
    } finally {
      await app.end();
    }
  });
});
