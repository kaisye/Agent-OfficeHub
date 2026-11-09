import { afterAll, describe, expect, it } from "vitest";
import { bodyRequirement, canSeeMessage } from "@officehub/shared";
import { closeAll, withWorkspace } from "../src/client.js";
import { actOnRequest, createRequestDraft, getRequest, listInbox, listRequests, markRead } from "../src/requests.js";
import { getBoard, listAudit } from "../src/services.js";
import { runReminders, workingMinutesBetween } from "../src/reminders.js";
import { makeWorkspace } from "../src/testing.js";

afterAll(closeAll);
const mk = (rcv: string) => ({ receiverId: rcv, title: "T", body: "ask body", taskId: null, dueAt: null });

describe("bodyRequirement (C6) enforced by actOnRequest", () => {
  it("unit table", () => {
    expect(bodyRequirement("draft_reply", "sent")).toBe("required");
    expect(bodyRequirement("follow_up", "replied")).toBe("required");
    expect(bodyRequirement("send_reply", "sent")).toBe("required");
    expect(bodyRequirement("send_reply", "reply_drafted")).toBe("optional");
    expect(bodyRequirement("send", "draft")).toBe("optional");
    expect(bodyRequirement("accept", "replied")).toBe("ignored");
  });
  it("draft_reply / follow_up without body -> 400; send_reply from sent without draft -> 400; edited send flags editedBeforeSend", async () => {
    const w = await makeWorkspace("body");
    const d = await createRequestDraft(w.human("alice"), mk(w.bob));
    const sent = await actOnRequest(w.human("alice"), d.id, "send"); // unchanged draft
    expect(sent.messages[0]!.editedBeforeSend).toBe(false);
    await expect(actOnRequest(w.human("bob"), d.id, "draft_reply")).rejects.toMatchObject({ code: "validation_failed", status: 400 });
    await expect(actOnRequest(w.human("bob"), d.id, "send_reply")).rejects.toMatchObject({ code: "validation_failed" });
    await actOnRequest(w.human("bob"), d.id, "draft_reply", "draft v1");
    const r = await actOnRequest(w.human("bob"), d.id, "send_reply", "draft v2 edited");
    expect(r.messages[1]).toMatchObject({ body: "draft v2 edited", editedBeforeSend: true }); // differs from the draft
    await expect(actOnRequest(w.human("alice"), d.id, "follow_up")).rejects.toMatchObject({ code: "validation_failed" });
    const f = await actOnRequest(w.human("alice"), d.id, "accept", "ignored text");
    expect(f.messages.length).toBe(2); // accept ignores body
  });
});

describe("visibility C13", () => {
  it("canSeeMessage unit", () => {
    const req = { askerId: "A", receiverId: "R" };
    expect(canSeeMessage(req, { kind: "ask", sentById: null }, "A")).toBe(true);
    expect(canSeeMessage(req, { kind: "ask", sentById: null }, "R")).toBe(false);
    expect(canSeeMessage(req, { kind: "reply", sentById: null }, "R")).toBe(true);
    expect(canSeeMessage(req, { kind: "reply", sentById: null }, "A")).toBe(false);
    expect(canSeeMessage(req, { kind: "ask", sentById: "A" }, "X")).toBe(true);
    expect(canSeeMessage(req, { kind: "ask", sentById: null }, "X")).toBe(false);
  });
  it("third parties see nothing; admin sees sent requests read-only, never drafts; board is filtered", async () => {
    const w = await makeWorkspace("vis"); // alice admin, bob, carol
    const d = await createRequestDraft(w.human("bob"), mk(w.carol));
    // bob->carol draft: admin alice cannot see it
    expect((await listRequests(w.human("alice"))).length).toBe(0);
    await expect(getRequest(w.human("alice"), d.id)).rejects.toMatchObject({ code: "not_found" });
    await actOnRequest(w.human("bob"), d.id, "send");
    await actOnRequest(w.human("carol"), d.id, "draft_reply", "secret-ish reply draft");
    const adminView = await getRequest(w.human("alice"), d.id);
    expect(adminView.messages.map((m) => m.kind)).toEqual(["ask"]); // reply draft hidden from admin
    await expect(actOnRequest(w.human("alice"), d.id, "cancel")).rejects.toMatchObject({ code: "not_found" }); // read-only
    // a non-admin third party: make dave
    const board = await getBoard(w.human("alice"));
    expect(board.openRequests.length).toBe(1);
    expect(board.recentEvents.some((e) => e.type === "request.sent")).toBe(true);
    // third party member (alice is admin; use a 4th member through admin sql)
    const { adminSql } = await import("../src/client.js");
    const [dave] = await adminSql()`INSERT INTO members (workspace_id, display_name, role, mascot) VALUES (${w.id}, 'Dave', 'member', ${adminSql().json({ buddy: "pip" })}) RETURNING id`;
    const daveP = { kind: "human" as const, workspaceId: w.id, memberId: dave!.id as string, role: "member" as const };
    const b2 = await getBoard(daveP);
    expect(b2.openRequests.length).toBe(0);
    expect(b2.recentEvents.filter((e) => e.type.startsWith("request.")).length).toBe(0);
    await expect(getRequest(daveP, d.id)).rejects.toMatchObject({ code: "not_found" });
  });
  it("event data carries ids only, never draft text", async () => {
    const w = await makeWorkspace("evd");
    const d = await createRequestDraft(w.human("alice"), mk(w.bob));
    await actOnRequest(w.human("alice"), d.id, "send");
    const ev = await withWorkspace(w.id, (tx) => tx`SELECT data FROM events WHERE type LIKE 'request.%'`);
    for (const e of ev) {
      expect(Object.keys(e.data).sort()).toEqual(expect.arrayContaining(["requestId"]));
      expect(JSON.stringify(e.data)).not.toContain("ask body");
    }
  });
});

describe("unread (C8)", () => {
  it("unreadForViewer, markRead, own action is read, unread first", async () => {
    const w = await makeWorkspace("unr");
    const d1 = await createRequestDraft(w.human("alice"), mk(w.bob));
    await actOnRequest(w.human("alice"), d1.id, "send");
    expect((await getRequest(w.human("alice"), d1.id)).unreadForViewer).toBe(false); // my own action
    expect((await getRequest(w.human("bob"), d1.id)).unreadForViewer).toBe(true);
    const d2 = await createRequestDraft(w.human("alice"), mk(w.bob));
    await actOnRequest(w.human("alice"), d2.id, "send");
    await markRead(w.human("bob"), d1.id);
    const inbox = await listInbox(w.human("bob"), { actionOnly: true });
    expect(inbox.map((i) => i.id)).toEqual([d2.id, d1.id]); // unread first
    expect(inbox.map((i) => i.unread)).toEqual([true, false]);
    await actOnRequest(w.human("bob"), d1.id, "draft_reply", "r");
    await actOnRequest(w.human("bob"), d1.id, "send_reply");
    expect((await getRequest(w.human("alice"), d1.id)).unreadForViewer).toBe(true); // reply arrived
  });
});

describe("reminders + audit shape", () => {
  it("working-hours math", () => {
    // Fri 2026-11-06 17:00+07 -> Mon 2026-11-09 10:00+07 = 1h Fri + 1h Mon
    expect(workingMinutesBetween(new Date("2026-11-06T17:00:00+07:00"), new Date("2026-11-09T10:00:00+07:00"))).toBe(120);
  });
  it("emits request.reminded once, never closes", async () => {
    const w = await makeWorkspace("rem");
    const d = await createRequestDraft(w.human("alice"), { ...mk(w.bob), dueAt: new Date(Date.now() - 3600_000).toISOString() });
    await actOnRequest(w.human("alice"), d.id, "send");
    await runReminders();
    await runReminders(); // second run within 24 working hours: no duplicate
    const n = await withWorkspace(w.id, (tx) => tx`SELECT count(*)::int AS n FROM events WHERE type = 'request.reminded'`);
    expect(n[0]!.n).toBe(1);
    expect((await getRequest(w.human("alice"), d.id)).status).toBe("sent");
  });
  it("audit: admin all, member own; entries match the AuditEntry shape without content", async () => {
    const w = await makeWorkspace("aud");
    await createRequestDraft(w.human("bob"), mk(w.carol));
    const { AuditEntry } = await import("@officehub/shared");
    const admin = await listAudit(w.human("alice"));
    const bobs = await listAudit(w.human("bob"));
    const carols = await listAudit(w.human("carol"));
    expect(admin.length).toBeGreaterThan(0);
    expect(bobs.length).toBeGreaterThan(0);
    expect(carols.length).toBe(0);
    for (const e of admin) expect(AuditEntry.safeParse(e).success).toBe(true);
  });
});
