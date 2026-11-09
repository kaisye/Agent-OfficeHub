/** Auth/session/CSRF/CORS/cookie flags, token storage, rate limits, append-only logs. */
import { beforeAll, describe, expect, it } from "vitest";
import { API, MCP, MEMBER, ORIGIN, SLUG, W, api, board, createAgent, login, raw, rpc, sha256, sql, tool, toolErrCode, uniq, type Session } from "../src/helpers.js";
import { known } from "../src/known.js";

let bao: Session, phong: Session;
beforeAll(async () => {
  [bao, phong] = await Promise.all([login(MEMBER.bao), login(MEMBER.phong)]);
});

describe("CSRF + CORS", () => {
  const decision = { title: uniq("QA-E2E-csrf"), body: "", rationale: "r", taskId: null };
  it("state-changing cookie request without the custom header -> 403 csrf_failed", async () => {
    const r = await api(phong, "POST", W("/decisions"), decision, { "x-officehub-csrf": undefined });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("csrf_failed");
  });
  it("wrong header value -> 403", async () => {
    expect((await api(phong, "POST", W("/decisions"), decision, { "x-officehub-csrf": "0" })).status).toBe(403);
  });
  it("foreign / null Origin -> 403 even with the header", async () => {
    expect((await api(phong, "POST", W("/decisions"), decision, { origin: "http://evil.example" })).status).toBe(403);
    expect((await api(phong, "POST", W("/decisions"), decision, { origin: "null" })).status).toBe(403);
    expect((await api(phong, "POST", W("/decisions"), decision, { origin: ORIGIN + ".evil.example" })).status).toBe(403);
  });
  it("simple cross-site form post (text/plain, no custom header) cannot change state", async () => {
    const r = await raw("POST", W("/decisions"), { cookie: phong.cookie, "content-type": "text/plain", origin: "http://evil.example" }, JSON.stringify(decision));
    expect(r.status).toBe(403);
  });
  it("login itself is CSRF-protected (login-CSRF)", async () => {
    const r = await raw("POST", "/auth/dev-login", { "content-type": "application/json", origin: "http://evil.example", "x-officehub-csrf": "1" }, JSON.stringify({ memberId: MEMBER.bao }));
    expect(r.status).toBe(403);
  });
  it("CORS: evil origin gets no Access-Control-Allow-Origin; the web origin does, with credentials", async () => {
    const evil = await raw("OPTIONS", W("/board"), { origin: "http://evil.example", "access-control-request-method": "GET", "access-control-request-headers": "x-officehub-csrf" });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const good = await raw("OPTIONS", W("/board"), { origin: ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "x-officehub-csrf,content-type" });
    expect(good.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(good.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

describe("session cookie", () => {
  it("HttpOnly, SameSite=Lax, Path=/, expiring; value is high entropy", async () => {
    const r = await raw("POST", "/auth/dev-login", { "content-type": "application/json", "x-officehub-csrf": "1", origin: ORIGIN }, JSON.stringify({ memberId: MEMBER.lan }));
    const sc = r.headers.get("set-cookie")!;
    expect(sc).toMatch(/^oh_session=[A-Za-z0-9_-]{40,};/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Path=\//);
    expect(sc).toMatch(/Expires=/i);
    // Secure is only set when WEB_ORIGIN is https (dev runs on http): documented in the report, not asserted here.
  });
  it("no session fixation: a pre-set cookie value is never adopted; each login mints a fresh token", async () => {
    const r = await raw("POST", "/auth/dev-login", { "content-type": "application/json", "x-officehub-csrf": "1", origin: ORIGIN, cookie: "oh_session=ATTACKERCHOSENVALUE" }, JSON.stringify({ memberId: MEMBER.minh }));
    expect(r.headers.get("set-cookie")).not.toContain("ATTACKERCHOSENVALUE");
    expect((await raw("GET", "/me", { cookie: "oh_session=ATTACKERCHOSENVALUE" })).status).toBe(401);
    const a = await login(MEMBER.minh);
    const b = await login(MEMBER.minh);
    expect(a.cookie).not.toBe(b.cookie);
  });
  it("sessions are stored only as sha256 hashes", async () => {
    const s = await login(MEMBER.lan);
    const token = s.cookie.split("=")[1]!;
    const db = sql();
    expect((await db`SELECT count(*)::int AS n FROM sessions WHERE id_hash = ${sha256(token)}`)[0]!.n).toBe(1);
    expect((await db`SELECT count(*)::int AS n FROM sessions WHERE id_hash = ${token}`)[0]!.n).toBe(0);
  });
  it("logout kills the session server-side (replaying the old cookie fails)", async () => {
    const s = await login(MEMBER.lan);
    expect((await api(s, "GET", "/me")).status).toBe(200);
    expect((await api(s, "POST", "/auth/logout")).status).toBe(200);
    expect((await api(s, "GET", "/me")).status).toBe(401);
    expect((await api(s, "GET", W("/board"))).status).toBe(401);
  });
  it("dev-login: unknown member 404, non-uuid 400, and it is a dev-only switch (see report: DEV_LOGIN_ENABLED)", async () => {
    const h = { "content-type": "application/json", "x-officehub-csrf": "1", origin: ORIGIN };
    expect((await raw("POST", "/auth/dev-login", h, JSON.stringify({ memberId: "00000000-0000-4000-8000-000000000000" }))).status).toBe(404);
    expect((await raw("POST", "/auth/dev-login", h, JSON.stringify({ memberId: "nope" }))).status).toBe(400);
  });
  it("wrong workspace slug in the URL is 404, never someone else's data", async () => {
    expect((await api(bao, "GET", "/w/other-co/board")).status).toBe(404);
    expect((await api(bao, "GET", "/w/TRIPFLIX/board")).status).toBe(404);
  });
});

describe("agent tokens at rest and in transit", () => {
  it("only the sha256 hash is stored; the plaintext is not in any column; listing never returns it", async () => {
    const a = await createAgent(bao);
    const db = sql();
    const rows = await db`SELECT * FROM agents WHERE id = ${a.id}`;
    expect(rows[0]!.token_hash).toBe(sha256(a.token));
    expect(JSON.stringify(rows[0])).not.toContain(a.token);
    expect((await api(bao, "GET", W("/agents"))).text).not.toContain(a.token);
    expect((await api(phong, "GET", W("/agents"))).text).not.toContain(a.token);
    // the displayed prefix is the first 8 chars of the secret part only
    expect(rows[0]!.token_prefix).toHaveLength(8);
  });
  it("revoke: only the owner or an admin; others get 403/404; second revoke is idempotent", async () => {
    const a = await createAgent(bao);
    const minh = await login(MEMBER.minh);
    expect([403, 404]).toContain((await api(minh, "DELETE", W(`/agents/${a.id}`))).status);
    expect((await tool(a.token, "read_board")).status).toBe(200);
    expect((await api(phong, "DELETE", W(`/agents/${a.id}`))).status).toBe(200);
    expect((await api(bao, "DELETE", W(`/agents/${a.id}`))).status).toBe(200);
    const after = await tool(a.token, "read_board");
    expect(after.status).toBe(401);
    expect(toolErrCode(after)).toBe("token_revoked");
  });
  it("revocation is immediate on /agent/inbox and for every tool (no cache window)", async () => {
    const a = await createAgent(bao);
    await api(bao, "DELETE", W(`/agents/${a.id}`));
    for (const name of ["read_board", "list_inbox", "post_status", "send_request", "reply_draft"]) {
      expect((await tool(a.token, name, {})).status, name).toBe(401);
    }
    expect((await raw("GET", "/agent/inbox", { authorization: `Bearer ${a.token}` })).status).toBe(401);
  });
  it("revoked-token attempts are audited for the owner", async () => {
    const a = await createAgent(bao);
    await api(bao, "DELETE", W(`/agents/${a.id}`));
    await tool(a.token, "read_board");
    const audit = (await api(bao, "GET", W("/audit"))).body as any[];
    expect(audit.some((e) => e.actorAgentId === a.id && /auth_rejected|auth\.rejected/.test(e.action))).toBe(true);
  });
});

describe("rate limits (rule 8): per-agent, shared by API + MCP", () => {
  it("/agent/inbox: 60/min then 429 + Retry-After; the MCP server draws from the SAME bucket", async () => {
    const a = await createAgent(bao);
    let first429 = -1;
    let retry: string | null = null;
    for (let i = 0; i < 64; i++) {
      const r = await raw("GET", "/agent/inbox", { authorization: `Bearer ${a.token}` });
      if (r.status === 429) {
        first429 = i;
        retry = r.headers.get("retry-after");
        break;
      }
    }
    expect(first429).toBeGreaterThanOrEqual(55);
    expect(first429).toBeLessThanOrEqual(62);
    expect(Number(retry)).toBeGreaterThan(0);
    const viaMcp = await tool(a.token, "read_board");
    expect(viaMcp.status).toBe(429); // combined buckets: API+MCP cannot double the quota
    expect(toolErrCode(viaMcp)).toBe("rate_limited");
    // another agent of the same owner is unaffected
    const b = await createAgent(bao);
    expect((await tool(b.token, "read_board")).status).toBe(200);
  });
  it("post_status: 6/min", async () => {
    const a = await createAgent(bao);
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await tool(a.token, "post_status", { presence: "idle", doing: `QA-E2E rate ${i}` })).status);
    expect(codes.slice(0, 6).every((c) => c === 200)).toBe(true);
    expect(codes.slice(6)).toEqual([429, 429]);
  });
  it("drafts: 20/hour (send_request + reply_draft share it); a JSON-RPC batch cannot dodge the limit", async () => {
    const a = await createAgent(bao);
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push((await tool(a.token, "send_request", { receiverId: MEMBER.trang, title: `QA-E2E-rate-${i}`, body: "b" })).status);
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes[20]).toBe(429);
    const b = await createAgent(bao);
    const batch = Array.from({ length: 8 }, (_, i) => ({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name: "post_status", arguments: { presence: "idle", doing: "QA-E2E batch" } } }));
    const r = await raw("POST", "/mcp", { authorization: `Bearer ${b.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, JSON.stringify(batch), MCP.replace("/mcp", ""));
    expect(r.status).toBe(429);
  });
});

describe("append-only logs", () => {
  it("audit_log and events reject UPDATE/DELETE even for the DB owner (trigger) — checked on a throwaway insert-free probe", async () => {
    const db = sql();
    await expect(db`UPDATE audit_log SET action = 'tampered' WHERE id = (SELECT min(id) FROM audit_log)`).rejects.toThrow(/append-only/);
    await expect(db`DELETE FROM audit_log WHERE id = (SELECT min(id) FROM audit_log)`).rejects.toThrow(/append-only/);
    await expect(db`UPDATE events SET type = 'x' WHERE id = (SELECT id FROM events LIMIT 1)`).rejects.toThrow(/append-only/);
    await expect(db`DELETE FROM events WHERE id = (SELECT id FROM events LIMIT 1)`).rejects.toThrow(/append-only/);
  });
  it("the app DB role (RLS-subject) cannot UPDATE/DELETE audit_log or events (grants)", async () => {
    const postgres = (await import("postgres")).default;
    const app = postgres(process.env.OH_APP_DB ?? "postgres://officehub_app:officehub_app@localhost:5433/officehub", { max: 1 });
    try {
      await expect(app`UPDATE audit_log SET action = 'x'`).rejects.toThrow();
      await expect(app`DELETE FROM events`).rejects.toThrow();
    } finally {
      await app.end();
    }
  });
});

describe("misc hardening", () => {
  known("SEC-05", "API responses carry X-Content-Type-Options: nosniff", async () => {
    const r = await raw("GET", "/health");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });
  known("SEC-05", "web app sets CSP / frame-ancestors (X-Frame-Options) so the Send button cannot be framed", async () => {
    const r = await raw("GET", "/login", {}, undefined, process.env.OH_WEB ?? "http://localhost:3000");
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(/frame-ancestors/.test(csp) || !!r.headers.get("x-frame-options")).toBe(true);
  });
  known("SEC-06", "API refuses to run with the default SESSION_SECRET / dev login when NODE_ENV=production (fail closed) — config surface check", async () => {
    // Black-box proxy: the live /auth/dev-members is reachable unauthenticated, i.e. dev login is ON. In production this must be off.
    // This test documents the pilot gate: it must be 404 on the pilot deployment.
    const r = await raw("GET", "/auth/dev-members");
    expect(r.status).toBe(404);
  });
});
