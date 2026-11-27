/** UI-level security checks (v0.6): tenant isolation in the web, session/redirect/CSRF/CSP behaviour that still applies. */
import { test } from "@playwright/test";
import { ensureTenant2 } from "../src/tenant";
import { API, WEB, agentDraft, api, closeSql, createAgent, createWorld, expect, loginAs, settled, tool, uniq, W } from "./helpers";

test.afterAll(async () => {
  await closeSql();
});

test("SECUI-1 another workspace's orchestrator opening a request URL gets 'not found' and no text (tenant isolation in the UI)", async ({ browser }) => {
  const t2 = await ensureTenant2();
  const w = await createWorld("secui1");
  const fe = await createAgent(w, "frontend");
  const title = uniq("QA-E2E-ui-private");
  const d = await agentDraft(fe, "backend", { title, body: "QA-E2E private body" });
  expect((await api(w.orch, "POST", W(w, `/requests/${d.id}/actions`), { action: "send" })).status).toBe(200);

  // 1. B's real session aimed at A's slug + request id
  const { ctx, page } = await loginAs(browser, { orchestratorId: t2.eveId, slug: t2.slug }, `/w/${w.slug}/requests/${d.id}`);
  await page.waitForTimeout(1500);
  await expect(page.locator("body")).not.toContainText(title);
  await expect(page.locator("body")).not.toContainText("QA-E2E private body");
  await expect(page.getByText(/Không tìm thấy|Chưa tải được|không có quyền/i).first()).toBeVisible();
  // the API behind it: 404 for every read of A's data, with B's cookie
  for (const p of ["/board", "/requests", `/requests/${d.id}`, "/queue", "/agents", "/decisions"]) {
    expect((await api(t2.eve, "GET", W(w, p))).status, p).toBe(404);
  }
  // 2. B's own workspace list never contains A's request
  await page.goto(`/w/${t2.slug}/requests?tab=all`);
  await settled(page);
  await expect(page.locator("body")).not.toContainText(title);
  await ctx.close();

  // 3. B's agent token cannot read it either
  expect(JSON.stringify((await tool(t2.agentToken, "list_inbox")).data)).not.toContain(d.id);
});

test("SECUI-2 no session: workspace pages send you to /login and show no data", async ({ browser }) => {
  const w = await createWorld("secui2");
  const fe = await createAgent(w, "frontend");
  const title = uniq("QA-E2E-nosession");
  await agentDraft(fe, "backend", { title });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/w/${w.slug}`);
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(title);
  await ctx.close();
});

test("SECUI-3 logout kills the server session: the old cookie no longer works and the app returns to /login", async ({ browser }) => {
  const w = await createWorld("secui3");
  const { ctx, page } = await loginAs(browser, w);
  const cookies = await ctx.cookies(API);
  const session = cookies.find((c) => c.httpOnly);
  expect(session, "session cookie is HttpOnly").toBeTruthy();
  expect(await page.evaluate(() => document.cookie)).not.toContain(session!.value); // not readable from JS
  const cookieHeader = `${session!.name}=${session!.value}`;
  expect((await api({ ...w.orch, cookie: cookieHeader }, "GET", W(w, "/board"))).status).toBe(200);
  await page.getByRole("button", { name: /menu|tài khoản|Phong|QA Orchestrator/i }).first().click().catch(() => {});
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  expect((await api({ ...w.orch, cookie: cookieHeader }, "GET", W(w, "/board"))).status).toBe(401);
  await ctx.close();
});

test("SECUI-4 dev-login 'next' cannot be used as an open redirect", async ({ browser }) => {
  const w = await createWorld("secui4");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/dev-login?member=${w.orchestratorId}&next=${encodeURIComponent("//other.example/x")}`);
  await page.waitForURL((u) => !u.pathname.startsWith("/dev-login"), { timeout: 45_000 });
  expect(new URL(page.url()).hostname).toBe("localhost");
  await page.goto(`/dev-login?member=${w.orchestratorId}&next=${encodeURIComponent("https://other.example/")}`);
  await page.waitForTimeout(2500);
  expect(new URL(page.url()).hostname).toBe("localhost");
  await page.goto(`/dev-login?member=${w.orchestratorId}&next=${encodeURIComponent("/\\other.example")}`);
  await page.waitForTimeout(2500);
  expect(new URL(page.url()).hostname).toBe("localhost");
  await ctx.close();
});

test("SECUI-5 CSRF from the browser: a cookie-authenticated write without the custom header is refused (the web app's own writes carry it)", async ({ browser }) => {
  const w = await createWorld("secui5");
  const { ctx, page } = await loginAs(browser, w);
  const title = uniq("QA-E2E-csrf");
  const out = await page.evaluate(
    async ({ api, path, title, role }) => {
      const noHeader = await fetch(api + path, { method: "POST", credentials: "include", headers: { "content-type": "text/plain" }, body: JSON.stringify({ receiverRoleId: role, kind: "question", title, body: "x", taskId: null, dueAt: null }) }).then((r) => r.status, () => -1);
      return { noHeader };
    },
    { api: API, path: W(w, "/requests"), title, role: w.roles.backend },
  );
  // either the CORS preflight blocks it (network error) or the server answers 403 csrf_failed: never a created request
  expect([-1, 403]).toContain(out.noHeader);
  expect(JSON.stringify((await api(w.orch, "GET", W(w, "/requests"))).body)).not.toContain(title);
  // the same write through the UI works (header present)
  await page.getByRole("button", { name: "Giao việc", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("radio", { name: "Backend" }).click();
  await dlg.getByLabel("Tiêu đề").fill(title);
  await dlg.getByLabel("Nội dung").fill("QA-E2E: csrf ok");
  await dlg.getByRole("button", { name: "Giao việc" }).last().click();
  await expect(page.getByText("Đã giao cho Backend.")).toBeVisible();
  expect(JSON.stringify((await api(w.orch, "GET", W(w, "/requests"))).body)).toContain(title);
  await ctx.close();
});

test("SECUI-6 the web sets CSP (frame-ancestors none, no object-src), nosniff and a referrer policy (SEC-05)", async ({ request }) => {
  const r = await request.get(`${WEB}/login`);
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBeTruthy();
});

test("SECUI-7 agent tokens never reach the page: not after creation, not in storage, not in the agents list", async ({ browser }) => {
  const w = await createWorld("secui7");
  const a = await createAgent(w, "design");
  const { ctx, page } = await loginAs(browser, w, `/w/${w.slug}/agents`);
  await expect(page.getByText(/qa-e2e-/).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(a.token);
  await expect(page.locator("body")).not.toContainText(/oh_agent_[A-Za-z0-9]{20,}/);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain("oh_agent_");
  expect(await page.content()).not.toContain(a.token);
  await ctx.close();
});
