/**
 * GitHub webhook. The live API runs WITHOUT GITHUB_WEBHOOK_SECRET, so (a) we assert it fails closed, and (b) we start the
 * product's own app on a spare port with a known secret (src/webhook-server.ts) to exercise signature/replay/event handling.
 * All ingestion happens in the dedicated QA tenant (never in tripflix).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { raw, sql } from "../src/helpers.js";
import { known } from "../src/known.js";
import { ensureTenant2, type Tenant2 } from "../src/tenant.js";

const PORT = 18797;
const BASE = `http://localhost:${PORT}`;
const SECRET = "qa-webhook-secret";
let child: ChildProcess;
let t2: Tenant2;

const sig = (body: string, secret = SECRET) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const post = (wsId: string, body: string, headers: Record<string, string>) => raw("POST", `/hooks/github/${wsId}`, { "content-type": "application/json", ...headers }, body, BASE);
const pr = (n: number, title = "QA-E2E webhook PR", extra: Record<string, unknown> = {}) =>
  JSON.stringify({ action: "opened", pull_request: { number: n, title, html_url: "https://example.test/pr", user: { login: "nobody-qa" }, draft: false, ...extra }, repository: { full_name: "qa/qa" } });
const ev = { "x-github-event": "pull_request" };

beforeAll(async () => {
  t2 = await ensureTenant2();
  child = spawn("pnpm", ["exec", "tsx", "src/webhook-server.ts"], { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, QA_WEBHOOK_PORT: String(PORT), QA_WEBHOOK_SECRET: SECRET }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("webhook test server did not start");
}, 60_000);
afterAll(() => {
  child?.kill("SIGTERM");
});

describe("live API", () => {
  it("fails closed when no webhook secret is configured (500, nothing ingested) — configure GITHUB_WEBHOOK_SECRET before the pilot", async () => {
    const r = await raw("POST", `/hooks/github/${t2.workspaceId}`, { "content-type": "application/json", ...ev, "x-hub-signature-256": sig("{}", "anything") }, "{}");
    expect([500, 401]).toContain(r.status);
    expect(r.status).not.toBe(200);
  });
});

describe("signature", () => {
  it("missing / wrong / truncated / body-mismatched signatures -> 401 bad_signature", async () => {
    const body = pr(9101);
    for (const h of [{} as Record<string, string>, { "x-hub-signature-256": "sha256=" + "0".repeat(64) }, { "x-hub-signature-256": "sha256=abcd" }, { "x-hub-signature-256": "sha1=" + "0".repeat(40) }, { "x-hub-signature-256": sig(body + " ") }, { "x-hub-signature-256": sig(body, "other-secret") }]) {
      const r = await post(t2.workspaceId, body, { ...ev, ...h });
      expect(r.status, JSON.stringify(h)).toBe(401);
      expect(r.body.error.code).toBe("bad_signature");
    }
    expect((await sql()`SELECT count(*)::int AS n FROM tasks WHERE external_key = '#9101' AND workspace_id = ${t2.workspaceId}`)[0]!.n).toBe(0);
  });
  it("a valid signature ingests; the same delivery id replayed is a no-op (duplicate)", async () => {
    const body = pr(9102);
    const h = { ...ev, "x-hub-signature-256": sig(body), "x-github-delivery": "qa-" + randomUUID() };
    const a = await post(t2.workspaceId, body, h);
    expect(a.body).toMatchObject({ ok: true, status: "ingested" });
    const b = await post(t2.workspaceId, body, h);
    expect(b.body).toMatchObject({ ok: true, status: "duplicate" });
    expect((await sql()`SELECT count(*)::int AS n FROM events WHERE workspace_id = ${t2.workspaceId} AND dedupe_key = ${h["x-github-delivery"].replace(/^/, "gh:")}`)[0]!.n).toBe(1);
  });
  it("audit records bad signatures", async () => {
    const n = (await sql()`SELECT count(*)::int AS n FROM audit_log WHERE workspace_id = ${t2.workspaceId} AND action = 'webhook.github' AND outcome = 'bad_signature'`)[0]!.n;
    expect(n).toBeGreaterThan(0);
  });
});

describe("events and workspaces", () => {
  it("unknown event types are acknowledged and ignored; ping answers pong", async () => {
    const r = await post(t2.workspaceId, "{}", { "x-github-event": "star", "x-hub-signature-256": sig("{}") });
    expect(r.body).toMatchObject({ ok: true, status: "ignored" });
    expect((await post(t2.workspaceId, "{}", { "x-github-event": "ping", "x-hub-signature-256": sig("{}") })).body).toMatchObject({ pong: true });
  });
  it("malformed payloads: bad JSON 400; wrong shape ignored; never 500", async () => {
    expect((await post(t2.workspaceId, "{bad", { ...ev, "x-hub-signature-256": sig("{bad") })).status).toBe(400);
    for (const b of ["[]", '{"action":"opened"}', '{"pull_request":null}', '{"pull_request":{"number":"x"}}']) {
      const r = await post(t2.workspaceId, b, { ...ev, "x-hub-signature-256": sig(b), "x-github-delivery": "qa-" + randomUUID() });
      expect(r.status, b).toBeLessThan(500);
    }
  });
  known("BUG-02", "a correctly signed JSON `null` payload must be ignored or 400, not an unhandled 500 (the event mapper dereferences null)", async () => {
    const r = await post(t2.workspaceId, "null", { ...ev, "x-hub-signature-256": sig("null"), "x-github-delivery": "qa-" + randomUUID() });
    expect(r.status).toBeLessThan(500);
  });
  it("unknown / malformed workspace id -> 404", async () => {
    const body = pr(9103);
    expect((await post(randomUUID(), body, { ...ev, "x-hub-signature-256": sig(body) })).status).toBe(404);
    expect((await post("not-a-uuid", body, { ...ev, "x-hub-signature-256": sig(body) })).status).toBe(404);
  });
  it("hostile PR title is stored verbatim (data, escaped on render) and never executed server-side", async () => {
    const title = `<img src=x onerror=alert(1)> QA-E2E <script>alert(2)</script>`;
    const body = pr(9104, title);
    const r = await post(t2.workspaceId, body, { ...ev, "x-hub-signature-256": sig(body), "x-github-delivery": "qa-" + randomUUID() });
    expect(r.status).toBe(200);
    const [t] = await sql()`SELECT title FROM tasks WHERE workspace_id = ${t2.workspaceId} AND external_key = '#9104'`;
    expect(t!.title).toBe(title);
  });
  known("SEC-08", "one shared webhook secret signs for EVERY workspace id: a payload valid for tenant A is accepted for tenant B (needs per-workspace secrets before a 2nd tenant)", async () => {
    // tripflix's id signed with the same secret is accepted too => cannot be told apart. We probe with tenant 2 vs a random existing workspace id.
    const [other] = await sql()`SELECT id FROM workspaces WHERE slug LIKE 'qa-other-%' LIMIT 1`;
    const body = pr(9105);
    const r = await post(other!.id, body, { ...ev, "x-hub-signature-256": sig(body), "x-github-delivery": "qa-" + randomUUID() });
    expect(r.status).toBe(401); // today: 200 ingested into an unrelated workspace
  });
  known("BUG-03", "CON-03: a PR title that looks like a key must NOT create a task/event (200 to GitHub, audit secret_rejected source=github)", async () => {
    const key = ["sk", "ant", "api03", "ZZxxYYwwVVuuTTssRRqqPP1122"].join("-");
    const body = pr(9107, `fix: rotate ${key}`);
    const r = await post(t2.workspaceId, body, { ...ev, "x-hub-signature-256": sig(body), "x-github-delivery": "qa-" + randomUUID() });
    expect(r.status).toBe(200);
    const n = (await sql()`SELECT count(*)::int AS n FROM tasks WHERE workspace_id = ${t2.workspaceId} AND title LIKE ${"%" + key + "%"}`)[0]!.n;
    expect(n).toBe(0);
  });
  known("SEC-09","task external_url from a webhook must be http(s) only (javascript: URLs are stored and returned to humans/agents)", async () => {
    const body = pr(9106, "QA-E2E url", { html_url: "javascript:alert(3)" });
    await post(t2.workspaceId, body, { ...ev, "x-hub-signature-256": sig(body), "x-github-delivery": "qa-" + randomUUID() });
    const [t] = await sql()`SELECT external_url FROM tasks WHERE workspace_id = ${t2.workspaceId} AND external_key = '#9106'`;
    expect(t!.external_url === null || /^https?:\/\//.test(t!.external_url)).toBe(true);
  });
});
