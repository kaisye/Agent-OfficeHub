import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { type World } from "../src/helpers";

export { API, MCP, WEB, uniq, createWorld, createAgent, agentDraft, agentSent, assign, act, api, W, tool, queue, board, roleStatus, FAKE, sql, closeSql } from "../src/helpers";
export { expect };
export type { World } from "../src/helpers";

/** A fresh browser context signed in as the world's orchestrator through the web app's own dev-login page (the real API session cookie). */
export async function loginAs(browser: Browser, w: Pick<World, "orchestratorId" | "slug">, next = `/w/${w.slug}`): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  (page as any).__dialogs = [] as string[];
  page.on("dialog", async (d) => {
    (page as any).__dialogs.push(d.message());
    await d.dismiss();
  });
  await page.goto(`/dev-login?member=${w.orchestratorId}&next=${encodeURIComponent(next)}`);
  await page.waitForURL((u) => !u.pathname.startsWith("/dev-login"), { timeout: 60_000 });
  await settled(page);
  return { ctx, page };
}

/** Wait until the app stopped showing its loading placeholders. */
export async function settled(page: Page) {
  await page.waitForFunction(() => !/Đang tải|Đang đăng nhập|Đang mở văn phòng/.test(document.body.innerText), null, { timeout: 60_000 });
}

export const dialogsSeen = (page: Page): string[] => (page as any).__dialogs ?? [];

/** The queue card (article) of a request, found by its exact title. */
export const card = (page: Page, title: string) => page.locator("article").filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) });
