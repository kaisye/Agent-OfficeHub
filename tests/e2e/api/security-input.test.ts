/** Malformed / hostile input at the API and MCP boundary (v0.6). */
import { beforeAll, describe, expect, it } from "vitest";
import { MCP, W, act, agentDraft, api, assign, createAgent, createWorld, raw, roleStatus, sql, tool, uniq, type AgentCred, type World } from "../src/helpers.js";
import { known } from "../src/known.js";

let w: World;
let fe: AgentCred;
beforeAll(async () => {
  w = await createWorld("input");
  fe = await createAgent(w, "frontend");
});
const mk = (over: Record<string, unknown> = {}) => ({ receiverRoleId: w.roles.backend, kind: "question", title: uniq("QA-E2E-in"), body: "b", taskId: null, dueAt: null, ...over });

describe("validation", () => {
  it("invalid ids in the path never reach SQL: 404", async () => {
    for (const id of ["abc", "' OR 1=1--", "00000000-0000-4000-8000-00000000000", "../../etc/passwd", "%00"]) {
      const e = encodeURIComponent(id);
      expect((await api(w.orch, "POST", W(w, `/requests/${e}/actions`), { action: "cancel" })).status, id).toBe(404);
      expect((await api(w.orch, "GET", W(w, `/requests/${e}`))).status, id).toBe(404);
      expect((await api(w.orch, "GET", W(w, `/tasks/${e}/handoff`))).status, id).toBe(404);
      expect((await api(w.orch, "DELETE", W(w, `/agents/${e}`))).status, id).toBe(404);
      expect((await api(w.orch, "POST", W(w, `/requests/${e}/read`))).status, id).toBe(404);
      expect((await api(w.orch, "POST", W(w, `/proposals/${e}`), { action: "reject" })).status, id).toBe(404);
      expect((await api(w.orch, "PUT", W(w, `/roles/${e}`), { name: "x" })).status, id).toBe(404);
      expect((await api(w.orch, "PUT", W(w, `/roles/${e}/status`), { presence: "idle", doing: null, branch: null, waitingOn: [] })).status, id).toBe(404);
    }
  });
  it("field limits: title 200, body 8000, rationale 5000, label 60, doing 280, mission 500", async () => {
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ title: "t".repeat(201) }))).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ title: "" }))).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ body: "b".repeat(8001) }))).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ body: "" }))).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/decisions"), { title: "QA-E2E-x", body: "", rationale: "r".repeat(5001), taskId: null })).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/agents"), { roleId: w.roles.qa, kind: "codex", label: "l".repeat(61), scopes: [] })).status).toBe(400);
    expect((await roleStatus(w, "qa", { doing: "d".repeat(281) })).status).toBe(400);
    expect((await roleStatus(w, "qa", { presence: "hacker" })).status).toBe(400);
    expect((await api(w.orch, "PUT", W(w, `/roles/${w.roles.qa}`), { mission: "m".repeat(501) })).status).toBe(400);
  });
  it("body type confusion / bad JSON / wrong shapes -> 400 (never 500)", async () => {
    for (const b of ["{bad", "null", "[]", '"str"', JSON.stringify({ receiverRoleId: { $ne: null }, title: 1, body: [], taskId: 5, dueAt: "tomorrow" })]) {
      const r = await api(w.orch, "POST", W(w, "/requests"), b);
      expect(r.status, b).toBe(400);
    }
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ dueAt: "not-a-date" }))).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ receiverRoleId: "x" }))).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ kind: "command" }))).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ receiverRoleId: null }))).status).toBe(400);
  });
  it("orchestrator cannot assign to a ghost role, send contract_change to a non-leader, or pass a ghost task", async () => {
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ receiverRoleId: "00000000-0000-4000-8000-000000000001" }))).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ kind: "contract_change" }))).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ kind: "contract_change", receiverRoleId: w.roles.leader }))).status).toBe(201);
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ taskId: "00000000-0000-4000-8000-000000000002" }))).status).toBe(400);
  });
  it("actions: draft_reply needs a body; unknown action 400; autoForwardReply must be boolean", async () => {
    const rq = await assign(w, "backend", { title: uniq("QA-E2E-body") });
    expect((await act(w, rq.id, "draft_reply")).status).toBe(400);
    expect((await act(w, rq.id, "unknown_action")).status).toBe(400);
    expect((await act(w, rq.id, "cancel", undefined, { autoForwardReply: "yes" })).status).toBe(400);
  });
  it("role / status: owned paths and waitingOn are validated; waitingOn must be roles of this workspace", async () => {
    expect((await api(w.orch, "PUT", W(w, `/roles/${w.roles.qa}`), { ownedPaths: Array.from({ length: 51 }, (_, i) => `p${i}/**`) })).status).toBe(400);
    expect((await api(w.orch, "PUT", W(w, `/roles/${w.roles.qa}`), { ownedPaths: [""] })).status).toBe(400);
    expect((await api(w.orch, "PUT", W(w, `/roles/${w.roles.qa}`), { wave: 10 })).status).toBe(400);
    expect((await roleStatus(w, "qa", { presence: "waiting", waitingOn: ["00000000-0000-4000-8000-000000000009"] })).status).toBe(400);
    expect((await roleStatus(w, "qa", { presence: "waiting", waitingOn: [w.roles.backend] })).status).toBe(200);
  });
  it("proposals: unknown action 400; a handled proposal cannot be handled twice (409)", async () => {
    const a = await createAgent(w, "design");
    const p = (await tool(a.token, "propose_decision", { title: "QA-E2E-p", body: "", rationale: "r" })).data.proposalId;
    expect((await api(w.orch, "POST", W(w, `/proposals/${p}`), { action: "nuke" })).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, `/proposals/${p}`), { action: "reject" })).status).toBe(200);
    expect((await api(w.orch, "POST", W(w, `/proposals/${p}`), { action: "accept" })).status).toBe(409);
  });
  it("mascot param is strictly enum-validated (no markup injection through the buddy name)", async () => {
    for (const bad of [{ buddy: "dragon" }, { buddy: "<script>" }, { buddy: 'x" onload="alert(1)' }, { buddy: 1 }, { buddy: null }, {}, { species: "cat" }]) {
      expect((await api(w.orch, "PUT", W(w, "/me/mascot"), bad)).status, JSON.stringify(bad)).toBe(400);
      expect((await api(w.orch, "PUT", W(w, `/roles/${w.roles.qa}`), { mascot: bad })).status, JSON.stringify(bad)).toBe(400);
    }
    const r = await api(w.orch, "PUT", W(w, "/me/mascot"), { buddy: "pip", extra: "<svg onload=1>" });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body.mascot)).not.toContain("svg"); // unknown keys are stripped, not stored
  });
});

describe("hostile text is stored/returned as inert data", () => {
  it("SQL-ish and HTML/script strings round-trip verbatim; tables survive", async () => {
    const title = `QA-E2E ' OR 1=1; DROP TABLE requests;-- <img src=x onerror=alert(1)>`;
    const body = `<script>alert(1)</script> "><svg/onload=alert(2)> {{7*7}} \${7*7} \\u0000`;
    const r = await api(w.orch, "POST", W(w, "/requests"), mk({ title, body }));
    expect(r.status).toBe(201);
    expect(r.body.title).toBe(title);
    expect(r.body.messages[0].body).toBe(body);
    expect((await sql()`SELECT count(*)::int AS n FROM requests`)[0]!.n).toBeGreaterThan(0);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    // and the same through the agent path: a role's drafted text comes back verbatim, wrapped as untrusted data
    const d = await agentDraft(fe, "backend", { title, body });
    expect((await api(w.orch, "GET", W(w, `/requests/${d.id}`))).body.messages[0].body).toBe(body);
  });
  it("extremely long unicode (emoji / RTL override / combining) within limits is accepted, not 500", async () => {
    const t = "QA-E2E ‮evil‬ " + "👩‍👩‍👧‍👦".repeat(10) + "ź".repeat(20);
    expect((await api(w.orch, "POST", W(w, "/requests"), mk({ title: t }))).status).toBe(201);
  });
});

describe("size and robustness", () => {
  it("API: bodies over 512KB are refused (400) and the server stays healthy", async () => {
    const r = await api(w.orch, "POST", W(w, "/requests"), mk({ body: "a".repeat(600_000) }));
    expect([400, 413]).toContain(r.status);
    expect((await raw("GET", "/health")).status).toBe(200);
  });
  it("[BUG-01] a NUL character in text must be a 400 validation error, not an unhandled 500 (Postgres 22021)", async () => {
    const r = await api(w.orch, "POST", W(w, "/requests"), mk({ title: "QA-E2E a\u0000b" }));
    expect(r.status).toBe(400);
  });
  it("[BUG-01] NUL in a role status line / decision is a 400 as well", async () => {
    expect((await roleStatus(w, "qa", { doing: "a\u0000b" })).status).toBe(400);
    expect((await api(w.orch, "POST", W(w, "/decisions"), { title: "QA-E2E d\u0000", body: "", rationale: "r", taskId: null })).status).toBe(400);
  });
  it("[SEC-07] MCP endpoint enforces a request body limit (5MB JSON-RPC body is accepted today)", async () => {
    const a = await createAgent(w, "qa");
    const r = await raw(
      "POST",
      "/mcp",
      { authorization: `Bearer ${a.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "a".repeat(5_000_000) } }),
      MCP.replace("/mcp", ""),
    );
    expect([400, 413]).toContain(r.status);
  });
  it("MCP: oversize / malformed tool arguments are rejected by schema", async () => {
    const a = await createAgent(w, "qa");
    expect((await tool(a.token, "send_request", { to: "backend", title: "t".repeat(201), body: "b" })).isError).toBe(true);
    expect((await tool(a.token, "send_request", { to: "backend", title: "t", body: "b".repeat(8001) })).isError).toBe(true);
    expect((await tool(a.token, "send_request", { to: "backend", kind: "command", title: "t", body: "b" })).isError).toBe(true);
    expect((await tool(a.token, "post_status", { presence: "idle", doing: "d".repeat(281) })).isError).toBe(true);
    expect((await tool(a.token, "post_status", { presence: "not-a-state" })).isError).toBe(true);
    expect((await tool(a.token, "post_status", { presence: "idle", paths: Array.from({ length: 51 }, (_, i) => `p${i}`) })).isError).toBe(true);
    expect((await tool(a.token, "check_paths", { paths: [] })).isError).toBe(true);
    expect((await tool(a.token, "check_paths", { paths: Array.from({ length: 101 }, (_, i) => `p${i}`) })).isError).toBe(true);
    expect((await tool(a.token, "read_decisions", { limit: 51 })).isError).toBe(true);
    expect((await tool(a.token, "propose_decision", { title: "t", body: "b", rationale: "" })).isError).toBe(true);
    expect((await tool(a.token, "propose_decision", { title: "t", body: "b".repeat(5001), rationale: "r" })).isError).toBe(true);
    expect((await tool(a.token, "reply_draft", { requestId: "'; DROP TABLE requests;--", body: "x" })).isError).toBe(true);
  });
  it("check_paths treats paths as data: traversal / glob / weird strings only return an owner or null", async () => {
    const a = await createAgent(w, "qa");
    const r = await tool(a.token, "check_paths", { paths: ["../../etc/passwd", "apps/web/../api/x.ts", "**", "apps/*/x", "a".repeat(200), "'; DROP TABLE roles;--"] });
    expect(r.isError).toBe(false);
    expect(r.data.paths).toHaveLength(6);
    for (const p of r.data.paths) expect(p).toHaveProperty("ownerRole");
    expect((await sql()`SELECT count(*)::int AS n FROM roles WHERE workspace_id = ${w.id}`)[0]!.n).toBe(6);
  });
  it("malformed JSON-RPC on MCP is a 4xx, not a crash", async () => {
    const a = await createAgent(w, "qa");
    const r = await raw("POST", "/mcp", { authorization: `Bearer ${a.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, "{nope", MCP.replace("/mcp", ""));
    expect(r.status).toBe(400);
    expect((await raw("GET", "/health", {}, undefined, MCP.replace("/mcp", ""))).status).toBe(200);
  });
  it("an agent-created draft stays invisible to the receiving role while it is a draft", async () => {
    const t = uniq("QA-E2E-agentdraft");
    const d = await agentDraft(fe, "backend", { title: t });
    const be = await createAgent(w, "backend");
    expect(JSON.stringify((await tool(be.token, "list_inbox")).data)).not.toContain(t);
    expect(JSON.stringify((await tool(be.token, "read_board")).data)).not.toContain(t);
    expect(d.status).toBe("draft");
  });
});
