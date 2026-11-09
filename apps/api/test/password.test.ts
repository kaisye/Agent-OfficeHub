import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AgentRateLimiter, appSql, closeAll, hashPassword, verifyPassword } from "@officehub/db";
import { makeAgentToken, makeWorkspace } from "@officehub/db/testing";
import { Me } from "@officehub/shared";
import { createApp } from "../src/app.js";

afterAll(closeAll);
// Tests run in-process (no socket), so every request shares the "unknown" IP bucket: reset it per test.
beforeEach(async () => {
  await appSql()`DELETE FROM rate_buckets WHERE key LIKE 'login:%' OR key LIKE 'invite:%'`;
});

const ORIGIN = "http://localhost:3000";
const setup = () => createApp({ devLoginEnabled: true, webOrigin: ORIGIN, limiter: new AgentRateLimiter() });
const H = { "content-type": "application/json", "x-officehub-csrf": "1", origin: ORIGIN };
const post = (h: ReturnType<typeof setup>, path: string, body: unknown, cookie?: string) =>
  h.app.request(path, { method: "POST", headers: { ...H, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (r: Response) => r.headers.get("set-cookie")!.split(";")[0]!;
async function devLogin(h: ReturnType<typeof setup>, memberId: string) {
  return cookieOf(await post(h, "/auth/dev-login", { memberId }));
}
const email = () => `u-${randomUUID().slice(0, 8)}@example.test`;
const PW = "correct horse battery";

async function invited() {
  const h = setup();
  const w = await makeWorkspace("pw");
  const admin = await devLogin(h, w.alice);
  const r = await post(h, `/w/${w.slug}/members/${w.bob}/invite`, {}, admin);
  expect(r.status).toBe(200);
  const { url } = (await r.json()) as { url: string };
  return { h, w, admin, url, token: url.split("/invite/")[1]! };
}

describe("passwords", () => {
  it("scrypt hash verifies, rejects wrong password, is salted", async () => {
    const a = await hashPassword(PW);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword(PW, a)).toBe(true);
    expect(await verifyPassword("wrong password!!", a)).toBe(false);
    expect(await hashPassword(PW)).not.toBe(a);
  });
});

describe("invite → set password → login", () => {
  it("full flow; the link is single-use; the session works", async () => {
    const { h, w, url, token } = await invited();
    expect(url.startsWith(`${ORIGIN}/invite/`)).toBe(true);

    const info = await h.app.request(`/auth/invite/${token}`);
    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({ displayName: "Bob", email: null });

    const mail = email();
    const acc = await post(h, "/auth/invite/accept", { token, email: mail.toUpperCase(), password: PW });
    expect(acc.status).toBe(200);
    expect(Me.safeParse(await acc.json()).success).toBe(true);
    const session = cookieOf(acc);
    expect((await h.app.request("/me", { headers: { cookie: session } })).status).toBe(200);

    expect((await post(h, "/auth/invite/accept", { token, email: email(), password: PW })).status).toBe(404); // burned
    expect((await h.app.request(`/auth/invite/${token}`)).status).toBe(404);

    const ok = await post(h, "/auth/login", { email: mail, password: PW });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { id: string }).id).toBe(w.bob);
  });

  it("wrong password and unknown email give the same 401", async () => {
    const { h, token } = await invited();
    const mail = email();
    await post(h, "/auth/invite/accept", { token, email: mail, password: PW });
    const a = await post(h, "/auth/login", { email: mail, password: "not the password" });
    const b = await post(h, "/auth/login", { email: email(), password: "not the password" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
  });

  it("only admins can invite; short passwords and reused emails are rejected", async () => {
    const h = setup();
    const w = await makeWorkspace("pw");
    const bob = await devLogin(h, w.bob);
    expect((await post(h, `/w/${w.slug}/members/${w.alice}/invite`, {}, bob)).status).toBe(403);

    const first = await invited();
    expect((await post(first.h, "/auth/invite/accept", { token: first.token, email: email(), password: "short" })).status).toBe(400);
    const mail = email();
    expect((await post(first.h, "/auth/invite/accept", { token: first.token, email: mail, password: PW })).status).toBe(200);
    const second = await invited();
    const dup = await post(second.h, "/auth/invite/accept", { token: second.token, email: mail, password: PW });
    expect(dup.status).toBe(400);
  });

  it("a new link revokes the older unused one", async () => {
    const { h, w, admin, token } = await invited();
    await post(h, `/w/${w.slug}/members/${w.bob}/invite`, {}, admin);
    expect((await h.app.request(`/auth/invite/${token}`)).status).toBe(404);
  });

  it("login is rate limited per email", async () => {
    const { h, token } = await invited();
    const mail = email();
    await post(h, "/auth/invite/accept", { token, email: mail, password: PW });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await post(h, "/auth/login", { email: mail, password: "bad password" })).status);
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it("agent tokens cannot log in or invite", async () => {
    const { h, w } = await invited();
    const tok = (await makeAgentToken(w, "alice")).token;
    const r = await h.app.request("/auth/login", { method: "POST", headers: { ...H, authorization: `Bearer ${tok}` }, body: JSON.stringify({ email: email(), password: PW }) });
    expect(r.status).toBe(403);
  });

  it("change password needs the current one and keeps only this session", async () => {
    const { h, w, token } = await invited();
    const mail = email();
    const s1 = cookieOf(await post(h, "/auth/invite/accept", { token, email: mail, password: PW }));
    const s2 = cookieOf(await post(h, "/auth/login", { email: mail, password: PW }));
    expect((await post(h, `/w/${w.slug}/me/password`, { current: "wrong one!!", next: "another long pass" }, s1)).status).toBe(401);
    expect((await post(h, `/w/${w.slug}/me/password`, { current: PW, next: "another long pass" }, s1)).status).toBe(200);
    expect((await h.app.request("/me", { headers: { cookie: s1 } })).status).toBe(200);
    expect((await h.app.request("/me", { headers: { cookie: s2 } })).status).toBe(401);
    expect((await post(h, "/auth/login", { email: mail, password: "another long pass" })).status).toBe(200);
  });
});
