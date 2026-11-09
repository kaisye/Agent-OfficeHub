import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const MEMBER = {
  phong: "adcf8a47-7647-4b1f-952a-76723d7a3413",
  trang: "97c2557b-189e-4b54-8c73-a89dfa40e274",
  bao: "7f7870ee-bc43-47b5-84fc-001dc3081d57",
  minh: "3c343b90-4f1b-4be5-a283-34c921c55092",
  lan: "ed5375c3-a3b1-400c-a0c3-70593a3824e6",
};
export const API = process.env.OH_API ?? "http://localhost:8787";
export const MCP = process.env.OH_MCP ?? "http://localhost:8788/mcp";
export const SLUG = "tripflix";

/** A fresh browser context logged in as `memberId` through the web app's own dev-login page. */
export async function loginAs(browser: Browser, memberId: string, next = `/w/${SLUG}`): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  (page as any).__dialogs = [] as string[];
  page.on("dialog", async (d) => {
    (page as any).__dialogs.push(d.message());
    await d.dismiss();
  });
  await page.goto(`/dev-login?member=${memberId}&next=${encodeURIComponent(next)}`);
  await page.waitForURL((u) => !u.pathname.startsWith("/dev-login"), { timeout: 45_000 });
  await settled(page);
  return { ctx, page };
}

/** Wait until the app stopped showing its loading placeholders. */
export async function settled(page: Page) {
  await page.waitForFunction(() => !/Đang tải|Đang đăng nhập/.test(document.body.innerText), null, { timeout: 45_000 });
}

export const dialogsSeen = (page: Page): string[] => (page as any).__dialogs ?? [];

export async function apiLogin(memberId: string) {
  const r = await fetch(`${API}/auth/dev-login`, { method: "POST", headers: { "content-type": "application/json", "x-officehub-csrf": "1", origin: "http://localhost:3000" }, body: JSON.stringify({ memberId }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0]!;
  return { cookie, me: (await r.json()) as any };
}
export async function apiCall(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, { method, headers: { cookie, "content-type": "application/json", "x-officehub-csrf": "1", origin: "http://localhost:3000" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
}
export async function mcpTool(token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(MCP, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const j: any = await r.json().catch(() => null);
  const blocks: string[] = (j?.result?.content ?? []).map((c: any) => c.text);
  let data: any;
  try {
    data = JSON.parse(blocks.at(-1) ?? "");
  } catch {
    data = blocks.at(-1);
  }
  return { status: r.status, data };
}
export const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
export { expect };
