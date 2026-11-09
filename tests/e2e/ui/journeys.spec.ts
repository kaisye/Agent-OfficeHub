/** P0 UI journeys in real Chrome against http://localhost:3000 (http mode, real API). */
import { test } from "@playwright/test";
import { MEMBER, SLUG, apiCall, apiLogin, expect, loginAs, mcpTool, settled, uniq } from "./helpers";

test.describe.configure({ mode: "serial" });

test("UI-1 dev login -> board shows all 7 members with mascots (BRD-01)", async ({ browser }) => {
  const { ctx, page } = await loginAs(browser, MEMBER.phong);
  await expect(page).toHaveURL(new RegExp(`/w/${SLUG}`));
  const floor = page.locator('section[aria-labelledby="floor-h"]');
  for (const name of ["Phong", "Dũng", "Bảo", "Thắng", "Trang", "Thành", "Duy"]) await expect(floor.getByText(name, { exact: true }).first()).toBeVisible();
  // one mascot svg per member card (+ small ones elsewhere)
  expect(await floor.locator("svg").count()).toBeGreaterThanOrEqual(7);
  // every presence pill is a word, not colour only
  await expect(floor.getByText(/Đang làm|Rảnh|Bị kẹt|Đang xem|Ngoại tuyến|Đang chờ/).first()).toBeVisible();
  await ctx.close();
});

test("UI-2 request journey: create -> confirm send -> receiver's agent drafts via MCP -> receiver sends reply -> asker accepts", async ({ browser }) => {
  const title = uniq("QA-E2E-ui-journey");
  const bao = await loginAs(browser, MEMBER.bao);
  const baoApi = await apiLogin(MEMBER.bao);
  const trangApi = await apiLogin(MEMBER.trang);

  // --- asker composes in the UI; nothing is sent until the confirm click
  await bao.page.getByRole("button", { name: "Tạo yêu cầu" }).first().click();
  const dlg = bao.page.getByRole("dialog");
  await dlg.getByRole("radio", { name: "Trang" }).click();
  await dlg.getByLabel("Tiêu đề").fill(title);
  await dlg.getByLabel("Nội dung").fill("QA-E2E: server staging đang ghim tag nào?");
  await dlg.getByRole("button", { name: /Gửi/ }).first().click(); // moves to the confirm step, does NOT send
  await expect(dlg.getByText(/Gửi cho Trang\?/)).toBeVisible();
  const before = (await apiCall(trangApi.cookie, "GET", `/w/${SLUG}/requests`)).body.find((r: any) => r.title === title);
  expect(before, "nothing reached the receiver before the confirm click").toBeUndefined();
  await dlg.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(bao.page.getByText("Đã gửi cho Trang.")).toBeVisible();

  const req = (await apiCall(baoApi.cookie, "GET", `/w/${SLUG}/requests`)).body.find((r: any) => r.title === title);
  expect(req.status).toBe("sent");

  // --- receiver's agent: reads the inbox and DRAFTS only
  const agent = await apiCall(trangApi.cookie, "POST", `/w/${SLUG}/agents`, { kind: "claude-code", label: "qa-e2e-ui", scopes: ["board:read", "inbox:read", "status:write:self", "request:draft"] });
  const inbox = await mcpTool(agent.body.token, "list_inbox");
  expect(JSON.stringify(inbox.data)).toContain(req.id);
  const draft = await mcpTool(agent.body.token, "reply_draft", { requestId: req.id, body: "QA-E2E: staging đang ghim v1.4.2" });
  expect(draft.data).toMatchObject({ status: "reply_drafted", sent: false });

  // --- asker sees "waiting", but NOT the draft text
  await bao.page.goto(`/w/${SLUG}/requests/${req.id}`);
  await settled(bao.page);
  await expect(bao.page.getByText("staging đang ghim v1.4.2")).toHaveCount(0);

  // --- receiver (human) reviews the agent draft and presses send
  const trang = await loginAs(browser, MEMBER.trang, `/w/${SLUG}/requests/${req.id}`);
  await expect(trang.page.getByText("staging đang ghim v1.4.2").first()).toBeVisible();
  await expect(trang.page.getByText(/Nháp từ agent/).first()).toBeVisible();
  await trang.page.getByRole("button", { name: "Gửi trả lời" }).first().click();
  await trang.page.getByRole("dialog").getByRole("button", { name: "Gửi trả lời" }).click();
  await expect(trang.page.getByText(/Đã gửi trả lời|Đã gửi/).first()).toBeVisible();
  expect((await apiCall(baoApi.cookie, "GET", `/w/${SLUG}/requests`)).body.find((r: any) => r.id === req.id).status).toBe("replied");

  // --- asker accepts
  await bao.page.goto(`/w/${SLUG}/requests/${req.id}`);
  await settled(bao.page);
  await expect(bao.page.getByText("staging đang ghim v1.4.2").first()).toBeVisible();
  await bao.page.getByRole("button", { name: "Chấp nhận" }).first().click();
  const confirm = bao.page.getByRole("dialog");
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: "Chấp nhận" }).click();
  await expect.poll(async () => (await apiCall(baoApi.cookie, "GET", `/w/${SLUG}/requests`)).body.find((r: any) => r.id === req.id)?.status).toBe("closed");
  await bao.ctx.close();
  await trang.ctx.close();
});

test("UI-3 secret in a request is rejected with a clear toast and nothing is stored", async ({ browser }) => {
  const title = uniq("QA-E2E-ui-secret");
  const { ctx, page } = await loginAs(browser, MEMBER.bao);
  await page.getByRole("button", { name: "Tạo yêu cầu" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("radio", { name: "Trang" }).click();
  await dlg.getByLabel("Tiêu đề").fill(title);
  const key = ["sk", "ant", "api03", "QQqqWWwwEEeeRRrrTTttYYyy9988"].join("-");
  await dlg.getByLabel("Nội dung").fill(`dùng key ${key} nhé`);
  await dlg.getByRole("button", { name: /Gửi/ }).first().click();
  const confirmSend = dlg.getByRole("button", { name: "Gửi", exact: true });
  if (await confirmSend.isVisible().catch(() => false)) await confirmSend.click();
  await expect(page.getByText(/chứa key/).first()).toBeVisible();
  await expect(dlg.getByLabel("Nội dung")).toHaveValue(new RegExp("dùng key")); // the human keeps their text to fix it; the server stored nothing
  const baoApi = await apiLogin(MEMBER.bao);
  const all = await apiCall(baoApi.cookie, "GET", `/w/${SLUG}/requests`);
  expect(JSON.stringify(all.body)).not.toContain(title);
  await ctx.close();
});

test("UI-4 decisions: rationale is mandatory; a valid one is recorded and listed", async ({ browser }) => {
  const title = uniq("QA-E2E-ui-decision");
  const { ctx, page } = await loginAs(browser, MEMBER.phong, `/w/${SLUG}/decisions`);
  await page.getByRole("button", { name: "Ghi quyết định" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Tiêu đề").fill(title);
  await dlg.getByLabel("Nội dung").fill("chọn phương án A");
  const submit = dlg.locator('button[type="button"]').filter({ hasText: "Ghi lại" });
  await expect(submit).toBeDisabled(); // no rationale yet
  await dlg.getByLabel(/Lý do/).fill("   ");
  await expect(submit).toBeDisabled(); // whitespace is not a rationale
  await dlg.getByLabel(/Lý do/).fill("vì rẻ hơn và dễ rollback");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("Đã ghi quyết định.")).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible();
  await ctx.close();
});

test("UI-5 agent token: shown once -> works -> revoke in UI -> MCP says 401", async ({ browser }) => {
  const label = uniq("qa-e2e-ui-agent");
  const { ctx, page } = await loginAs(browser, MEMBER.minh, `/w/${SLUG}/agents`);
  await page.getByRole("button", { name: /Thêm agent|Tạo agent/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Tên gọi").fill(label);
  await dlg.getByRole("button", { name: "Tạo agent và token" }).click();
  const tokenBox = page.locator('input[value^="oh_agent_"]').first();
  await expect(tokenBox).toBeVisible();
  const token = await tokenBox.inputValue();
  expect(token).toMatch(/^oh_agent_[A-Za-z0-9]{40,}$/);
  expect((await mcpTool(token, "read_board")).status).toBe(200);

  // close + reload: the token is gone from the UI for good
  await page.getByLabel("Tôi đã lưu token").check();
  await page.getByRole("button", { name: "Xong" }).click();
  await page.reload();
  await settled(page);
  await expect(page.getByText(label).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(token);
  await expect(page.locator("body")).not.toContainText(/oh_agent_[A-Za-z0-9]{40,}/);

  // revoke through the UI
  await page.getByRole("button", { name: `Thu hồi ${label}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Thu hồi", exact: true }).click();
  await expect(page.getByText(`Đã thu hồi ${label}.`)).toBeVisible();
  const after = await mcpTool(token, "read_board");
  expect(after.status).toBe(401);
  await ctx.close();
});
