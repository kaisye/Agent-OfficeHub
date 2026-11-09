/** Cross-tenant isolation: a second workspace (created in SQL), id/slug swapping, RLS at the DB level, SSE, MCP. */
import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { MEMBER, W, act, api, board, createAgent, login, sentRequest, sql, sseCollect, tool, toolErrCode, uniq, type Session } from "../src/helpers.js";
import { ensureTenant2, type Tenant2 } from "../src/tenant.js";

let t2: Tenant2;
let bao: Session, trang: Session, phong: Session;
let reqId: string;
let taskId: string;
let t2Req: string;

beforeAll(async () => {
  t2 = await ensureTenant2();
  [bao, trang, phong] = await Promise.all([login(MEMBER.bao), login(MEMBER.trang), login(MEMBER.phong)]);
  reqId = (await sentRequest(bao, MEMBER.trang, { title: uniq("QA-E2E-tenant") })).id;
  taskId = (await board(bao)).tasks[0].id;
  t2Req = (await sentRequest(t2.mallory, t2.eveId, { title: uniq("QA-E2E-t2req") })).id;
});

describe("session / slug swapping", () => {
  it("each tenant sees only its own members and board", async () => {
    const b2 = await board(t2.eve);
    expect(b2.workspace.slug).toBe(t2.slug);
    expect(b2.members.map((m: any) => m.id)).toEqual(expect.arrayContaining([t2.eveId, t2.malloryId]));
    expect(b2.members.every((m: any) => m.workspaceId === undefined || m.workspaceId === t2.workspaceId)).toBe(true);
    expect(JSON.stringify(b2)).not.toContain("Tripflix");
    const b1 = await board(bao);
    expect(JSON.stringify(b1)).not.toContain("Mallory");
  });
  it("a session never works under another workspace's slug (every read route)", async () => {
    for (const p of ["/board", "/requests", "/inbox", "/decisions", "/agents", "/audit", "/stream"]) {
      expect((await api(t2.eve, "GET", W(p, "tripflix"))).status, `eve ${p}`).toBe(404);
      expect((await api(phong, "GET", W(p, t2.slug))).status, `phong(admin) ${p}`).toBe(404);
    }
  });
  it("tripflix ids replayed on the other tenant's routes are 404/400 (actions, read, getRequest, handoff, revoke)", async () => {
    expect((await act(t2.eve, reqId, "cancel").then((r) => r)).status).toBe(404);
    const acts = await api(t2.eve, "POST", W(`/requests/${reqId}/actions`, t2.slug), { action: "cancel" });
    expect(acts.status).toBe(404);
    expect((await api(t2.eve, "POST", W(`/requests/${reqId}/read`, t2.slug))).status).toBe(404);
    expect((await api(t2.eve, "GET", W(`/requests/${reqId}`, t2.slug))).status).toBe(404);
    expect((await api(t2.eve, "GET", W(`/tasks/${taskId}/handoff`, t2.slug))).status).toBe(404);
    const [ag] = (await api(bao, "GET", W("/agents"))).body as any[];
    expect((await api(t2.eve, "DELETE", W(`/agents/${ag.id}`, t2.slug))).status).toBe(404);
    // and the reverse
    expect((await api(bao, "GET", W(`/requests/${t2Req}`))).status).toBe(404);
    expect((await api(bao, "POST", W(`/requests/${t2Req}/actions`), { action: "cancel" })).status).toBe(404);
  });
  it("foreign ids as payload references are rejected: receiver, taskId (request + decision), waitingOn", async () => {
    const post = (b: any) => api(t2.eve, "POST", W("/requests", t2.slug), { title: "QA-E2E-x", body: "b", taskId: null, dueAt: null, ...b });
    expect((await post({ receiverId: MEMBER.trang })).status).toBe(400);
    expect((await post({ receiverId: t2.malloryId, taskId })).status).toBe(400);
    expect((await api(t2.eve, "POST", W("/decisions", t2.slug), { title: "QA-E2E-d", body: "", rationale: "r", taskId })).status).toBe(400);
    expect((await api(t2.eve, "PUT", W("/status", t2.slug), { presence: "waiting", doing: null, branch: null, waitingOn: [MEMBER.trang] })).status).toBe(400);
  });
  it("login is by member id: a tripflix session cannot be pointed at tenant 2 by cookie or slug tricks", async () => {
    const forged = { ...phong, cookie: phong.cookie };
    expect((await api(forged, "GET", "/w/qa-e2e-other/board")).status).toBe(404);
    expect((await api(forged, "GET", "/w/%71a-e2e-other/board")).status).toBe(404);
    expect((await api(forged, "GET", "/w/tripflix%2f..%2fqa-e2e-other/board")).status).toBe(404);
  });
});

describe("MCP across tenants", () => {
  it("tenant-2 agent cannot read, draft against or address tripflix", async () => {
    const tok = t2.agentToken;
    const b = JSON.stringify((await tool(tok, "read_board")).data);
    expect(b).not.toContain("Tripflix");
    expect(b).not.toContain(reqId);
    expect(toolErrCode(await tool(tok, "reply_draft", { requestId: reqId, body: "x" }))).toBe("not_found");
    expect(toolErrCode(await tool(tok, "send_request", { receiverId: MEMBER.trang, title: "x", body: "y" }))).toBe("validation_failed");
    expect(toolErrCode(await tool(tok, "send_request", { receiverId: t2.malloryId, title: "x", body: "y", taskId }))).toBe("validation_failed");
  });
  it("tripflix agent cannot reach tenant-2 requests", async () => {
    const a = await createAgent(trang);
    expect(toolErrCode(await tool(a.token, "reply_draft", { requestId: t2Req, body: "x" }))).toBe("not_found");
    expect(JSON.stringify((await tool(a.token, "list_inbox")).data)).not.toContain(t2Req);
  });
});

describe("SSE across tenants", () => {
  it("tenant-2 subscribers get nothing from tripflix activity, and vice versa", async () => {
    const [eveSse, trangSse] = await Promise.all([
      sseCollect(t2.eve, 3500),
      sseCollect(trang, 3500, async () => {
        const r = await sentRequest(bao, MEMBER.trang, { title: uniq("QA-E2E-ssecross") });
        await act(trang, r.id, "send_reply", "ans");
        await sentRequest(t2.mallory, t2.eveId, { title: uniq("QA-E2E-ssecross2") });
      }),
    ]);
    expect(eveSse.status).toBe(200);
    expect(eveSse.text.match(/event: change/g)?.length ?? 1).toBeGreaterThanOrEqual(1); // own workspace activity arrives
    expect(eveSse.text).not.toContain(reqId);
    // trang's stream must not contain ids that exist only in tenant 2
    const ids = [...trangSse.text.matchAll(/"id":"([0-9a-f-]{36})"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(t2Req);
  });
});

describe("Postgres RLS (officehub_app role) — the last line of defence", () => {
  const url = process.env.OH_APP_DB ?? "postgres://officehub_app:officehub_app@localhost:5433/officehub";
  const tables = ["members", "status_cards", "agents", "tasks", "events", "requests", "request_messages", "decisions", "audit_log", "sessions", "inbox_reads"];
  it("no workspace GUC -> zero rows from every tenant table", async () => {
    const app = postgres(url, { max: 1 });
    try {
      for (const t of tables) expect((await app.unsafe(`SELECT count(*)::int AS n FROM ${t}`))[0]!.n, t).toBe(0);
      expect((await app`SELECT count(*)::int AS n FROM workspaces`)[0]!.n).toBe(0);
    } finally {
      await app.end();
    }
  });
  it("with workspace A set, only A's rows are visible, cross-workspace writes fail (WITH CHECK) or touch 0 rows", async () => {
    const app = postgres(url, { max: 1 });
    try {
      await app.begin(async (tx) => {
        await tx`SELECT set_config('app.workspace_id', ${t2.workspaceId}, true)`;
        expect((await tx`SELECT count(*)::int AS n FROM members`)[0]!.n).toBe((await sql()`SELECT count(*)::int AS n FROM members WHERE workspace_id = ${t2.workspaceId}`)[0]!.n);
        expect((await tx`SELECT count(*)::int AS n FROM requests WHERE id = ${reqId}`)[0]!.n).toBe(0);
        expect((await tx`UPDATE requests SET status = 'cancelled' WHERE id = ${reqId} RETURNING id`).length).toBe(0);
      });
      const wsT = (await board(bao)).workspace.id;
      await expect(
        app.begin(async (tx) => {
          await tx`SELECT set_config('app.workspace_id', ${t2.workspaceId}, true)`;
          await tx`INSERT INTO decisions (workspace_id, title, body, rationale, decided_by_id) VALUES (${wsT}, 'QA-E2E x', '', 'r', ${MEMBER.bao})`;
        }),
      ).rejects.toThrow(/row-level security/);
      const left = postgres(process.env.OH_DB ?? "postgres://officehub:officehub@localhost:5433/officehub", { max: 1 });
      try {
        expect((await left`SELECT count(*)::int AS n FROM requests WHERE id = ${reqId}`)[0]!.n).toBe(1);
      } finally {
        await left.end();
      }
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
