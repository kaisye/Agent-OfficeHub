/** Malformed / hostile input at the API and MCP boundary. */
import { beforeAll, describe, expect, it } from "vitest";
import { MCP, MEMBER, W, act, api, createAgent, draftRequest, login, raw, sentRequest, sql, tool, uniq, type Session } from "../src/helpers.js";
import { known } from "../src/known.js";

let bao: Session, trang: Session;
beforeAll(async () => {
  [bao, trang] = await Promise.all([login(MEMBER.bao), login(MEMBER.trang)]);
});
const mk = (over: Record<string, unknown> = {}) => ({ receiverId: MEMBER.trang, title: uniq("QA-E2E-in"), body: "b", taskId: null, dueAt: null, ...over });

describe("validation", () => {
  it("invalid ids in the path never reach SQL: 404", async () => {
    for (const id of ["abc", "' OR 1=1--", "00000000-0000-4000-8000-00000000000", "../../etc/passwd", "%00"]) {
      expect((await api(bao, "POST", W(`/requests/${encodeURIComponent(id)}/actions`), { action: "cancel" })).status, id).toBe(404);
      expect((await api(bao, "GET", W(`/tasks/${encodeURIComponent(id)}/handoff`))).status, id).toBe(404);
      expect((await api(bao, "DELETE", W(`/agents/${encodeURIComponent(id)}`))).status, id).toBe(404);
      expect((await api(bao, "POST", W(`/requests/${encodeURIComponent(id)}/read`))).status, id).toBe(404);
    }
  });
  it("field limits: title 200, body 8000, rationale 5000, label 60, doing 280", async () => {
    expect((await api(bao, "POST", W("/requests"), mk({ title: "t".repeat(201) }))).status).toBe(400);
    expect((await api(bao, "POST", W("/requests"), mk({ title: "" }))).status).toBe(400);
    expect((await api(bao, "POST", W("/requests"), mk({ body: "b".repeat(8001) }))).status).toBe(400);
    expect((await api(bao, "POST", W("/requests"), mk({ body: "" }))).status).toBe(400);
    expect((await api(bao, "POST", W("/decisions"), { title: "QA-E2E-x", body: "", rationale: "r".repeat(5001), taskId: null })).status).toBe(400);
    expect((await api(bao, "POST", W("/agents"), { kind: "codex", label: "l".repeat(61), scopes: [] })).status).toBe(400);
    expect((await api(bao, "PUT", W("/status"), { presence: "idle", doing: "d".repeat(281), branch: null, waitingOn: [] })).status).toBe(400);
    expect((await api(bao, "PUT", W("/status"), { presence: "hacker", doing: null, branch: null, waitingOn: [] })).status).toBe(400);
  });
  it("body type confusion / bad JSON / wrong shapes -> 400 (never 500)", async () => {
    for (const b of ["{bad", "null", "[]", '"str"', JSON.stringify({ receiverId: { $ne: null }, title: 1, body: [], taskId: 5, dueAt: "tomorrow" })]) {
      const r = await api(bao, "POST", W("/requests"), b);
      expect(r.status, b).toBe(400);
    }
    expect((await api(bao, "POST", W("/requests"), mk({ dueAt: "not-a-date" }))).status).toBe(400);
    expect((await api(bao, "POST", W("/requests"), mk({ receiverId: "x" }))).status).toBe(400);
  });
  it("cannot send a request to yourself or to a ghost; draft actions need a body", async () => {
    expect((await api(bao, "POST", W("/requests"), mk({ receiverId: MEMBER.bao }))).status).toBe(400);
    expect((await api(bao, "POST", W("/requests"), mk({ receiverId: "00000000-0000-4000-8000-000000000001" }))).status).toBe(400);
    const rq = await sentRequest(bao, MEMBER.trang, { title: uniq("QA-E2E-body") });
    expect((await act(trang, rq.id, "draft_reply")).status).toBe(400);
    expect((await act(trang, rq.id, "unknown_action")).status).toBe(400);
  });
  it("mascot param is strictly enum-validated (no markup injection through the buddy name)", async () => {
    const ok = { buddy: "pip" };
    for (const bad of [{ buddy: "dragon" }, { buddy: "<script>" }, { buddy: 'x" onload="alert(1)' }, { buddy: 1 }, { buddy: null }, {}, { species: "cat" }]) {
      expect((await api(bao, "PUT", W("/me/mascot"), bad)).status, JSON.stringify(bad)).toBe(400);
    }
    const r = await api(bao, "PUT", W("/me/mascot"), { ...ok, extra: "<svg onload=1>" });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body.mascot)).not.toContain("svg"); // unknown keys are stripped, not stored
    // restore a pleasant default for the demo workspace
    expect((await api(bao, "PUT", W("/me/mascot"), (await api(bao, "GET", "/me")).body.mascot)).status).toBe(200);
  });
});

describe("hostile text is stored/returned as inert data", () => {
  it("SQL-ish and HTML/script strings round-trip verbatim; tables survive", async () => {
    const title = `QA-E2E ' OR 1=1; DROP TABLE requests;-- <img src=x onerror=alert(1)>`;
    const body = `<script>alert(1)</script> "><svg/onload=alert(2)> {{7*7}} \${7*7} \\u0000`;
    const r = await api(bao, "POST", W("/requests"), mk({ title, body }));
    expect(r.status).toBe(201);
    expect(r.body.title).toBe(title);
    expect(r.body.messages[0].body).toBe(body);
    expect((await sql()`SELECT count(*)::int AS n FROM requests`)[0]!.n).toBeGreaterThan(0);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
  });
  it("extremely long unicode (emoji / RTL override / combining) within limits is accepted, not 500", async () => {
    const t = "QA-E2E ‮evil‬ " + "👩‍👩‍👧‍👦".repeat(10) + "ź".repeat(20);
    expect((await api(bao, "POST", W("/requests"), mk({ title: t }))).status).toBe(201);
  });
});

describe("size and robustness", () => {
  it("API: bodies over 512KB are refused (400) and the server stays healthy", async () => {
    const r = await api(bao, "POST", W("/requests"), mk({ body: "a".repeat(600_000) }));
    expect([400, 413]).toContain(r.status);
    expect((await raw("GET", "/health")).status).toBe(200);
  });
  known("BUG-01", "a NUL character in text must be a 400 validation error, not an unhandled 500 (Postgres 22021)", async () => {
    const r = await api(bao, "POST", W("/requests"), mk({ title: "QA-E2E a\u0000b" }));
    expect(r.status).toBe(400);
  });
  known("BUG-01", "NUL in a status line / decision is a 400 as well", async () => {
    expect((await api(bao, "PUT", W("/status"), { presence: "idle", doing: "a\u0000b", branch: null, waitingOn: [] })).status).toBe(400);
    expect((await api(bao, "POST", W("/decisions"), { title: "QA-E2E d\u0000", body: "", rationale: "r", taskId: null })).status).toBe(400);
  });
  known("SEC-07", "MCP endpoint enforces a request body limit (5MB JSON-RPC body is accepted today)", async () => {
    const a = await createAgent(bao);
    const r = await raw(
      "POST",
      "/mcp",
      { authorization: `Bearer ${a.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "a".repeat(5_000_000) } }),
      MCP.replace("/mcp", ""),
    );
    expect([400, 413]).toContain(r.status);
  });
  it("MCP: oversize tool arguments are rejected by schema", async () => {
    const a = await createAgent(bao);
    expect((await tool(a.token, "send_request", { receiverId: MEMBER.trang, title: "t".repeat(201), body: "b" })).isError).toBe(true);
    expect((await tool(a.token, "send_request", { receiverId: MEMBER.trang, title: "t", body: "b".repeat(8001) })).isError).toBe(true);
    expect((await tool(a.token, "post_status", { presence: "idle", doing: "d".repeat(281) })).isError).toBe(true);
    expect((await tool(a.token, "post_status", { presence: "not-a-state" })).isError).toBe(true);
    expect((await tool(a.token, "reply_draft", { requestId: "'; DROP TABLE requests;--", body: "x" })).isError).toBe(true);
  });
  it("malformed JSON-RPC on MCP is a 4xx, not a crash", async () => {
    const a = await createAgent(bao);
    const r = await raw("POST", "/mcp", { authorization: `Bearer ${a.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, "{nope", MCP.replace("/mcp", ""));
    expect(r.status).toBe(400);
    expect((await raw("GET", "/health", {}, undefined, MCP.replace("/mcp", ""))).status).toBe(200);
  });
  it("draft limits do not leak: an agent-created draft stays invisible while status is draft", async () => {
    const a = await createAgent(bao);
    const t = uniq("QA-E2E-agentdraft");
    const r = await tool(a.token, "send_request", { receiverId: MEMBER.trang, title: t, body: "b" });
    expect(r.data.status).toBe("draft");
    expect((await api(trang, "GET", W("/requests"))).text).not.toContain(t);
    await draftRequest(bao, MEMBER.trang); // human drafts remain independent
  });
});
