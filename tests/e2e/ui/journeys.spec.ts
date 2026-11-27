/**
 * P0 UI journeys (v0.6: one orchestrator, six role agents) in real Chrome against the web in HTTP mode + the real API/MCP.
 * Every test builds its own isolated workspace (slug qa-e2e-*) and drives agents through MCP, exactly as Claude Code would.
 */
import { test } from "@playwright/test";
import { act, agentDraft, api, card, closeSql, createAgent, createWorld, expect, loginAs, queue, settled, tool, uniq, W, type World, API, MCP } from "./helpers";

test.afterAll(async () => {
  await closeSql();
});

const reqById = async (w: World, id: string) => (await api(w.orch, "GET", W(w, `/requests/${id}`))).body;
const section = (page: import("@playwright/test").Page, id: string) => page.locator(`section#q-${id}`);

test("UI-1 orchestrator logs in and lands on Chờ duyệt (empty queue, six roles in the nav targets)", async ({ browser }) => {
  const w = await createWorld("ui1");
  const { ctx, page } = await loginAs(browser, w);
  await expect(page).toHaveURL(new RegExp(`/w/${w.slug}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Chờ duyệt" })).toBeVisible();
  await expect(page.getByText("BẠN LÀ CỔNG DUYỆT")).toBeVisible();
  await expect(page.getByText("Không có gì chờ bạn").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Giao việc", exact: true })).toBeVisible();
  // the session is the real API cookie: /me answers for this workspace
  const me = await page.evaluate(async (api) => (await fetch(`${api}/me`, { credentials: "include" })).json(), API);
  expect(me.workspaceSlug).toBe(w.slug);
  await ctx.close();
});

test("UI-2 agent draft -> orchestrator edits it, ticks 'Tự chuyển câu trả lời', clicks Chuyển -> reply goes straight back; Đóng", async ({ browser }) => {
  const w = await createWorld("ui2");
  const fe = await createAgent(w, "frontend");
  const be = await createAgent(w, "backend");
  const title = uniq("QA-E2E-draft");
  const d = await agentDraft(fe, "backend", { title, body: "QA-E2E: route nào trả hàng chờ duyệt?" });
  expect(d.status).toBe("draft");
  const { ctx, page } = await loginAs(browser, w);

  const c = card(page, title);
  await expect(c).toBeVisible();
  await expect(section(page, "drafts")).toContainText(title);
  // agent text is clearly agent text, and nothing has reached Backend yet
  await expect(c.locator('[data-trust="agent-draft"]')).toBeVisible();
  await expect(c.getByText("agent", { exact: true }).first()).toBeVisible();
  expect(JSON.stringify((await tool(be.token, "list_inbox")).data)).not.toContain(d.id);

  await c.getByLabel(/Nháp gửi Backend/).fill("QA-E2E: route nào trả hàng chờ duyệt? (đã sửa)");
  await expect(c.getByText("bạn đã sửa")).toBeVisible();
  await c.getByLabel(/Tự chuyển câu trả lời/).check();
  await c.getByRole("button", { name: "Chuyển", exact: true }).click();
  await expect(page.getByText("Đã chuyển cho Backend.")).toBeVisible();
  await expect(card(page, title)).toHaveCount(0);

  const sent = await reqById(w, d.id);
  expect(sent.status).toBe("sent");
  expect(sent.autoForwardReply).toBe(true);
  expect(JSON.stringify(sent.messages)).toContain("(đã sửa)");
  // Backend now sees it (sent), answers with a draft -> auto-forwarded: no second approval
  expect(JSON.stringify((await tool(be.token, "list_inbox")).data)).toContain(d.id);
  const rd = await tool(be.token, "reply_draft", { requestId: d.id, body: "QA-E2E: GET /queue" });
  expect(rd.isError).toBe(false);
  await expect.poll(async () => (await reqById(w, d.id)).status).toBe("replied");

  // it waits in "Đã có trả lời" with the agent's answer as untrusted data, and the auto-forward note
  await page.reload();
  await settled(page);
  const a = card(page, title);
  await expect(section(page, "answered")).toContainText(title);
  await expect(a.locator('[data-trust="untrusted"]').filter({ hasText: "GET /queue" })).toBeVisible();
  await expect(a.getByText(/tự chuyển/i).first()).toBeVisible();
  await a.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(page.getByText("Đã đóng yêu cầu.")).toBeVisible();
  await expect.poll(async () => (await reqById(w, d.id)).status).toBe("closed");
  await ctx.close();
});

test("UI-3 without auto-forward the reply draft waits in the queue, is forwarded with Chuyển trả lời; Hỏi lại sends it back", async ({ browser }) => {
  const w = await createWorld("ui3");
  const fe = await createAgent(w, "frontend");
  const be = await createAgent(w, "backend");
  const title = uniq("QA-E2E-reply");
  const d = await agentDraft(fe, "backend", { title, body: "QA-E2E: tên route?" });
  expect((await act(w, d.id, "send")).status).toBe(200);
  expect((await tool(be.token, "reply_draft", { requestId: d.id, body: "QA-E2E: nháp trả lời GET /queue" })).isError).toBe(false);
  expect((await reqById(w, d.id)).status).toBe("reply_drafted");

  const { ctx, page } = await loginAs(browser, w);
  const c = card(page, title);
  await expect(section(page, "replies")).toContainText(title);
  // edit the reply draft before it goes to Frontend
  await c.getByLabel(/Trả lời gửi Frontend/).fill("QA-E2E: GET /queue (đã duyệt)");
  await c.getByRole("button", { name: "Chuyển trả lời" }).click();
  await expect(page.getByText("Đã chuyển trả lời cho Frontend.")).toBeVisible();
  await expect.poll(async () => (await reqById(w, d.id)).status).toBe("replied");
  expect(JSON.stringify((await tool(fe.token, "list_inbox")).data)).toContain("đã duyệt");

  const a = card(page, title);
  await expect(section(page, "answered")).toContainText(title);
  await a.getByRole("button", { name: "Hỏi lại", exact: true }).click();
  await a.getByLabel(/Hỏi lại Backend/).fill("QA-E2E: còn route nào khác?");
  await a.getByRole("button", { name: "Gửi câu hỏi lại" }).click();
  await expect(page.getByText("Đã hỏi lại Backend.")).toBeVisible();
  await expect.poll(async () => (await reqById(w, d.id)).status).toBe("sent");
  await ctx.close();
});

test("UI-4 blockers get a top alert and sort first; cancel is confirmed first", async ({ browser }) => {
  const w = await createWorld("ui4");
  const fe = await createAgent(w, "frontend");
  const calm = uniq("QA-E2E-calm");
  const stuck = uniq("QA-E2E-stuck");
  await agentDraft(fe, "backend", { title: calm, kind: "question" });
  const b = await agentDraft(fe, "backend", { title: stuck, kind: "blocker" });
  const { ctx, page } = await loginAs(browser, w);
  const alert = page.getByRole("alert").filter({ hasText: "việc đang kẹt cần bạn trước" });
  await expect(alert).toContainText(stuck);
  const first = section(page, "drafts").locator("article").first();
  await expect(first).toHaveAttribute("data-kind", "blocker");
  await expect(first).toContainText(stuck);

  await card(page, calm).getByRole("button", { name: "Hủy" }).click();
  await expect(page.getByRole("dialog").getByText("Hủy yêu cầu này?")).toBeVisible();
  expect((await queue(w)).requests.some((r: any) => r.title === calm)).toBe(true); // nothing happened yet
  await page.getByRole("dialog").getByRole("button", { name: "Giữ lại" }).click();
  await card(page, calm).getByRole("button", { name: "Hủy" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Hủy yêu cầu" }).click();
  await expect(page.getByText("Đã hủy yêu cầu.")).toBeVisible();
  await expect.poll(async () => (await queue(w)).requests.some((r: any) => r.title === calm)).toBe(false);
  expect((await reqById(w, b.id)).status).toBe("draft");
  await ctx.close();
});

test("UI-5 agent asks the orchestrator: Trả lời luôn forwards and answers in one click", async ({ browser }) => {
  const w = await createWorld("ui5");
  const be = await createAgent(w, "backend");
  const title = uniq("QA-E2E-ask-human");
  const d = await agentDraft(be, "orchestrator", { title, body: "QA-E2E: chọn Postgres hay SQLite?" });
  const { ctx, page } = await loginAs(browser, w);
  const c = card(page, title);
  await expect(section(page, "drafts")).toContainText(title);
  const button = c.getByRole("button", { name: "Trả lời luôn" });
  await expect(button).toBeDisabled(); // an empty answer cannot be sent
  await c.getByLabel(/Trả lời Backend/).fill("QA-E2E: Postgres.");
  await button.click();
  await expect(page.getByText("Đã trả lời Backend.")).toBeVisible();
  const r = await reqById(w, d.id);
  expect(r.status).toBe("replied");
  expect(JSON.stringify(r.messages)).toContain("Postgres.");
  // Backend (the asker) reads the orchestrator's answer
  expect(JSON.stringify((await tool(be.token, "list_inbox")).data)).toContain("Postgres.");
  await ctx.close();
});

test("UI-6 request detail: draft is edited and forwarded only after the confirm dialog", async ({ browser }) => {
  const w = await createWorld("ui6");
  const fe = await createAgent(w, "frontend");
  const title = uniq("QA-E2E-detail");
  const d = await agentDraft(fe, "backend", { title, body: "QA-E2E: nháp ở trang chi tiết" });
  const { ctx, page } = await loginAs(browser, w, `/w/${w.slug}/requests/${d.id}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.locator('[data-trust="agent-draft"]')).toBeVisible();
  await page.getByLabel("Sửa nháp trước khi chuyển").fill("QA-E2E: nháp đã sửa ở chi tiết");
  await page.getByRole("button", { name: "Chuyển", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText("Chuyển cho Backend?")).toBeVisible();
  await expect(dlg).toContainText("nháp đã sửa ở chi tiết");
  expect((await reqById(w, d.id)).status).toBe("draft"); // the click on Chuyển only opened the confirm
  await dlg.getByRole("button", { name: "Chuyển", exact: true }).click();
  await expect(page.getByText("Đã chuyển cho Backend.")).toBeVisible();
  await expect.poll(async () => (await reqById(w, d.id)).status).toBe("sent");
  await ctx.close();
});

test("UI-7 decision proposal: agent proposes via MCP, orchestrator edits + records it (from the queue); a second one is rejected", async ({ browser }) => {
  const w = await createWorld("ui7");
  const fe = await createAgent(w, "frontend");
  const t1 = uniq("QA-E2E-prop");
  const t2 = uniq("QA-E2E-prop-no");
  expect((await tool(fe.token, "propose_decision", { title: t1, body: "dùng TanStack Query", rationale: "đã có sẵn trong repo" })).isError).toBe(false);
  expect((await tool(fe.token, "propose_decision", { title: t2, body: "đổi sang Redux", rationale: "thích hơn" })).isError).toBe(false);
  expect((await api(w.orch, "GET", W(w, "/decisions"))).body).toEqual([]); // proposals never record by themselves
  const { ctx, page } = await loginAs(browser, w);
  const p1 = page.getByRole("article", { name: `Đề xuất: ${t1}` });
  await expect(p1.getByLabel("Tiêu đề")).toHaveValue(t1);
  await expect(p1.locator('[data-trust="agent-draft"]')).toBeVisible();
  await p1.getByLabel("Lý do (bắt buộc)").fill("   ");
  await expect(p1.getByRole("button", { name: "Ghi quyết định" })).toBeDisabled(); // whitespace is not a rationale
  await p1.getByLabel("Lý do (bắt buộc)").fill("đã có sẵn trong repo, đổi là tốn công");
  await p1.getByRole("button", { name: "Ghi quyết định" }).click();
  await expect(page.getByText("Đã ghi quyết định.")).toBeVisible();
  const decs = (await api(w.orch, "GET", W(w, "/decisions"))).body;
  expect(decs).toHaveLength(1);
  expect(decs[0]).toMatchObject({ title: t1, rationale: "đã có sẵn trong repo, đổi là tốn công" });

  const p2 = page.getByRole("article", { name: `Đề xuất: ${t2}` });
  await p2.getByRole("button", { name: "Từ chối" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Từ chối" }).click();
  await expect(page.getByText(/Đã từ chối đề xuất/)).toBeVisible();
  expect((await api(w.orch, "GET", W(w, "/decisions"))).body).toHaveLength(1);

  await page.goto(`/w/${w.slug}/decisions`);
  await settled(page);
  await expect(page.getByText(t1).first()).toBeVisible();
  await expect(page.getByText("Từ đề xuất của Frontend")).toBeVisible();
  await page.getByRole("tab", { name: /Đề xuất/ }).click();
  await expect(page.getByText("Đã từ chối", { exact: true })).toBeVisible();
  await ctx.close();
});

test("UI-8 decisions: rationale is mandatory when the orchestrator records one by hand", async ({ browser }) => {
  const w = await createWorld("ui8");
  const title = uniq("QA-E2E-ui-decision");
  const { ctx, page } = await loginAs(browser, w, `/w/${w.slug}/decisions`);
  await page.getByRole("button", { name: "Ghi quyết định" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Tiêu đề").fill(title);
  await dlg.getByLabel("Nội dung").fill("chọn phương án A");
  const submit = dlg.locator('button[type="button"]').filter({ hasText: "Ghi lại" });
  await expect(submit).toBeDisabled();
  await dlg.getByLabel(/Lý do/).fill("   ");
  await expect(submit).toBeDisabled();
  await dlg.getByLabel(/Lý do/).fill("vì rẻ hơn và dễ rollback");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("Đã ghi quyết định.")).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible();
  await ctx.close();
});

test("UI-9 Giao việc dialog creates a request that is already 'sent' to the role; contract_change locks the receiver to Leader", async ({ browser }) => {
  const w = await createWorld("ui9");
  const be = await createAgent(w, "backend");
  const title = uniq("QA-E2E-assign");
  const { ctx, page } = await loginAs(browser, w);
  await page.getByRole("button", { name: "Giao việc", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("radio", { name: "Backend" }).click();
  await dlg.getByLabel("Tiêu đề").fill(title);
  await dlg.getByLabel("Nội dung").fill("QA-E2E: thêm route GET /queue");
  await dlg.getByRole("button", { name: "Giao việc" }).last().click();
  await expect(page.getByText("Đã giao cho Backend.")).toBeVisible();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  const r = await reqById(w, id);
  expect(r).toMatchObject({ title, status: "sent", kind: "question", askerRoleId: null, receiverRoleId: w.roles.backend });
  // the role's agent sees it as the orchestrator's directive
  expect(JSON.stringify((await tool(be.token, "list_inbox")).data)).toContain(id);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  // contract_change: every role but Leader is disabled
  await page.goto(`/w/${w.slug}`);
  await settled(page);
  await page.getByRole("button", { name: "Giao việc", exact: true }).click();
  const d2 = page.getByRole("dialog");
  await d2.getByRole("radio", { name: "Backend" }).click();
  await d2.getByRole("radio", { name: "Đổi contract" }).click();
  await expect(d2.getByRole("radio", { name: "Leader" })).toBeEnabled();
  await expect(d2.getByRole("radio", { name: "Leader" })).toHaveAttribute("aria-checked", "true");
  await expect(d2.getByRole("radio", { name: "Backend" })).toBeDisabled();
  await ctx.close();
});

test("UI-10 a secret in Giao việc is rejected with a clear message and nothing is stored", async ({ browser }) => {
  const w = await createWorld("ui10");
  const title = uniq("QA-E2E-ui-secret");
  const { ctx, page } = await loginAs(browser, w);
  await page.getByRole("button", { name: "Giao việc", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("radio", { name: "Backend" }).click();
  await dlg.getByLabel("Tiêu đề").fill(title);
  const key = ["sk", "ant", "api03", "QQqqWWwwEEeeRRrrTTttYYyy9988"].join("-");
  await dlg.getByLabel("Nội dung").fill(`dùng key ${key} nhé`);
  await dlg.getByRole("button", { name: "Giao việc" }).last().click();
  await expect(dlg.getByRole("alert")).toContainText(/chứa key/);
  await expect(dlg.getByLabel("Nội dung")).toHaveValue(/dùng key/); // the human keeps the text to fix it
  expect(JSON.stringify((await api(w.orch, "GET", W(w, "/requests"))).body)).not.toContain(title);
  await ctx.close();
});

test("UI-11 role drawer: card, out-of-area chip, one-time token (works, then revoked -> 401), role edit", async ({ browser }) => {
  const w = await createWorld("ui11");
  const fe = await createAgent(w, "frontend");
  const doing = uniq("QA-E2E-doing");
  const st = await tool(fe.token, "post_status", { presence: "working", doing, branch: "frontend/qa", paths: ["apps/web/x.tsx", "packages/shared/src/api.ts"] });
  expect(st.isError).toBe(false);
  const { ctx, page } = await loginAs(browser, w, `/w/${w.slug}/office?role=${w.roles.frontend}`);
  const drawer = page.getByRole("dialog", { name: "Vai trò Frontend" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(doing)).toBeVisible();
  await expect(drawer.getByText("frontend/qa")).toBeVisible();
  await expect(drawer.getByText("apps/web/x.tsx")).toBeVisible();
  await expect(drawer.getByText("packages/shared/src/api.ts")).toBeVisible();
  await expect(drawer.getByText(/Ngoài vùng · của Leader/)).toHaveCount(1); // only the shared/ path is out of area
  await expect(drawer.getByText("agent của vai trò")).toBeVisible();
  await expect(drawer.getByLabel("Đường dẫn được ghi").getByText("apps/web/**")).toBeVisible();

  // mint a token for the role: shown once, works, gone after reload
  await drawer.getByRole("button", { name: "Tạo token" }).click();
  const dlg = page.getByRole("dialog", { name: "Tạo token cho Frontend" });
  const label = uniq("qa-e2e-ui-agent");
  await dlg.getByLabel("Tên gọi").fill(label);
  await dlg.getByRole("button", { name: "Tạo token" }).last().click();
  const tokenBox = page.locator('input[value^="oh_agent_"]').first();
  await expect(tokenBox).toBeVisible();
  const token = await tokenBox.inputValue();
  expect(token).toMatch(/^oh_agent_[A-Za-z0-9]{40,}$/);
  const rb = await tool(token, "read_board");
  expect(rb.status).toBe(200);
  await expect(page.getByText(/Nối vào Claude Code/)).toBeVisible();
  await page.getByLabel("Tôi đã lưu token").check();
  await page.getByRole("button", { name: "Xong" }).click();
  await expect(tokenBox).toHaveCount(0);
  await page.reload();
  await settled(page);
  await expect(page.locator("body")).not.toContainText(token);
  await expect(page.locator("body")).not.toContainText(/oh_agent_[A-Za-z0-9]{40,}/);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain("oh_agent_");

  // revoke through the UI
  await expect(page.getByText(label).first()).toBeVisible();
  await page.getByRole("button", { name: `Thu hồi ${label}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Thu hồi", exact: true }).click();
  await expect(page.getByText(`Đã thu hồi ${label}.`)).toBeVisible();
  expect((await tool(token, "read_board")).status).toBe(401);

  // edit owned paths: persisted by the real API
  await page.getByRole("button", { name: "Sửa vai trò" }).click();
  await page.getByLabel("Thêm đường dẫn").fill("docs/qa-e2e/**");
  await page.getByRole("button", { name: "Thêm", exact: true }).click();
  await page.getByRole("button", { name: "Lưu vai trò" }).click();
  await expect(page.getByText("Đã lưu vai trò Frontend.")).toBeVisible();
  const roles = (await api(w.orch, "GET", W(w, "/board"))).body.roles as any[];
  expect(roles.find((r) => r.id === w.roles.frontend).ownedPaths).toContain("docs/qa-e2e/**");
  await ctx.close();
  void MCP;
});

test("UI-12 role drawer: orchestrator sets the card by hand (paths kept) and assigns work from the drawer", async ({ browser }) => {
  const w = await createWorld("ui12");
  const be = await createAgent(w, "backend");
  expect((await tool(be.token, "post_status", { presence: "working", doing: "agent doing", paths: ["apps/api/a.ts"] })).isError).toBe(false);
  const { ctx, page } = await loginAs(browser, w, `/w/${w.slug}/office?role=${w.roles.backend}`);
  const drawer = page.getByRole("dialog", { name: "Vai trò Backend" });
  await drawer.getByRole("button", { name: "Đặt tay" }).click();
  await drawer.getByLabel("Đang làm gì").fill("QA-E2E: đặt tay");
  await drawer.getByRole("button", { name: "Lưu thẻ" }).click();
  await expect(page.getByText("Đã cập nhật thẻ Backend.")).toBeVisible();
  await expect(drawer.getByText("QA-E2E: đặt tay")).toBeVisible();
  await expect(drawer.getByText("apps/api/a.ts")).toBeVisible(); // paths are kept
  await expect(drawer.getByText("bạn đặt tay")).toBeVisible();

  const title = uniq("QA-E2E-from-drawer");
  await drawer.getByRole("button", { name: "Giao việc cho Backend" }).click();
  const dlg = page.getByRole("dialog", { name: "Giao việc" });
  await expect(dlg.getByRole("radio", { name: "Backend" })).toHaveAttribute("aria-checked", "true"); // preselected
  await dlg.getByLabel("Tiêu đề").fill(title);
  await dlg.getByLabel("Nội dung").fill("QA-E2E: việc từ ngăn vai trò");
  await dlg.getByRole("button", { name: "Giao việc" }).last().click();
  await expect(page.getByText("Đã giao cho Backend.")).toBeVisible();
  const mine = (await api(w.orch, "GET", W(w, "/requests"))).body.find((r: any) => r.title === title);
  expect(mine).toMatchObject({ status: "sent", receiverRoleId: w.roles.backend });
  await ctx.close();
});

test("UI-13 office map shows six role desks plus the orchestrator desk; desks open the drawer / the queue", async ({ browser }) => {
  const w = await createWorld("ui13");
  const fe = await createAgent(w, "frontend");
  await agentDraft(fe, "backend", { title: uniq("QA-E2E-badge") });
  const { ctx, page } = await loginAs(browser, w, `/w/${w.slug}/office`);
  await expect(page.getByRole("heading", { name: "Bản đồ văn phòng" })).toBeVisible();
  for (const name of ["Leader", "Business", "Design", "Backend", "Frontend", "QA & Security"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${name.replace("&", "\\&")}, đợt \\d\\.`) })).toBeVisible();
  }
  expect(await page.locator("button.oh-ws:not([data-me])").count()).toBe(6);
  const orch = page.getByRole("button", { name: /^Bàn điều phối \(bạn\): 1 việc chờ duyệt/ });
  await expect(orch).toBeVisible();
  await page.getByRole("button", { name: /^Design, đợt/ }).click();
  await expect(page.getByRole("dialog", { name: "Vai trò Design" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`role=${w.roles.design}`));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Vai trò Design" })).toHaveCount(0);
  await orch.click();
  await expect(page).toHaveURL(new RegExp(`/w/${w.slug}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Chờ duyệt" })).toBeVisible();
  await ctx.close();
});

test("UI-14 office map: an agent working outside its area is flagged on the desk; presence is a word", async ({ browser }) => {
  const w = await createWorld("ui14");
  const fe = await createAgent(w, "frontend");
  expect((await tool(fe.token, "post_status", { presence: "working", doing: "QA-E2E sửa contract", paths: ["packages/shared/src/api.ts"] })).isError).toBe(false);
  const { ctx, page } = await loginAs(browser, w, `/w/${w.slug}/office`);
  const desk = page.getByRole("button", { name: /^Frontend, đợt 2\. Đang sửa 1 file ngoài vùng/ });
  await expect(desk).toBeVisible();
  await expect(desk).toHaveAttribute("data-out-of-area", "true");
  await expect(desk.getByText("Ngoài vùng: Leader")).toBeVisible();
  await expect(desk.getByText(/Đang làm|Rảnh|Bị kẹt|Đang xem|Ngoại tuyến|Đang chờ/).first()).toBeVisible();
  await expect(desk.getByText("QA-E2E sửa contract")).toBeVisible();
  await ctx.close();
});

test("UI-15 live update: a draft made by an agent while the queue is open appears without a reload", async ({ browser }) => {
  const w = await createWorld("ui15");
  const fe = await createAgent(w, "frontend");
  const { ctx, page } = await loginAs(browser, w);
  await expect(page.getByText("Không có gì chờ bạn").first()).toBeVisible();
  const title = uniq("QA-E2E-live");
  await agentDraft(fe, "backend", { title });
  await expect(card(page, title)).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});
