/** UI-level checks of C13 visibility and redirect safety. */
import { test } from "@playwright/test";
import { MEMBER, SLUG, apiCall, apiLogin, expect, loginAs, settled, uniq } from "./helpers";

test("UI-6 an outsider opening a request URL gets 'not found' and no text (C13 in the UI)", async ({ browser }) => {
  const title = uniq("QA-E2E-ui-private");
  const bao = await apiLogin(MEMBER.bao);
  const r = await apiCall(bao.cookie, "POST", `/w/${SLUG}/requests`, { receiverId: MEMBER.trang, title, body: "QA-E2E private body", taskId: null, dueAt: null });
  await apiCall(bao.cookie, "POST", `/w/${SLUG}/requests/${r.body.id}/actions`, { action: "send" });
  const { ctx, page } = await loginAs(browser, MEMBER.minh, `/w/${SLUG}/requests/${r.body.id}`);
  await page.waitForTimeout(800);
  await expect(page.getByText("Không tìm thấy yêu cầu này")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(title);
  await expect(page.locator("body")).not.toContainText("QA-E2E private body");
  await page.goto(`/w/${SLUG}/requests`);
  await settled(page);
  await expect(page.locator("body")).not.toContainText(title);
  await ctx.close();
});

test("UI-7 dev-login 'next' cannot be used as an open redirect", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/dev-login?member=${MEMBER.lan}&next=${encodeURIComponent("//other.example/x")}`);
  await page.waitForURL((u) => !u.pathname.startsWith("/dev-login"), { timeout: 45_000 });
  expect(new URL(page.url()).hostname).toBe("localhost");
  await page.goto(`/dev-login?member=${MEMBER.lan}&next=${encodeURIComponent("https://other.example/")}`);
  await page.waitForTimeout(2500);
  expect(new URL(page.url()).hostname).toBe("localhost");
  await ctx.close();
});
