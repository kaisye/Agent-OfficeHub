import { afterAll, describe, expect, it } from "vitest";
import { appSql, adminSql, closeAll, withWorkspace } from "../src/client.js";
import { actOnRequest, createRequestDraft, getRequest, listInbox } from "../src/requests.js";
import { updateOwnStatus, recordDecision } from "../src/services.js";
import { authenticateAgent } from "../src/auth.js";
import { makeAgentToken, makeWorkspace } from "../src/testing.js";

afterAll(closeAll);

describe("row-level security", () => {
  it("blocks cross-workspace reads even with an unfiltered query", async () => {
    const a = await makeWorkspace("rls");
    const b = await makeWorkspace("rls");
    // Context = workspace A, but the query is a bug-like `SELECT *` with no WHERE.
    const seenFromA = await withWorkspace(a.id, (tx) => tx`SELECT id, workspace_id FROM members`);
    expect(seenFromA.length).toBe(3);
    expect(seenFromA.every((r) => r.workspace_id === a.id)).toBe(true);
    const seenFromB = await withWorkspace(b.id, (tx) => tx`SELECT id FROM members WHERE id = ${a.alice}`);
    expect(seenFromB.length).toBe(0); // even by explicit foreign id
    const ws = await withWorkspace(a.id, (tx) => tx`SELECT id FROM workspaces`);
    expect(ws.map((w) => w.id)).toEqual([a.id]);
  });
  it("sees nothing without a workspace context, and cannot write into another workspace", async () => {
    const a = await makeWorkspace("rls");
    const b = await makeWorkspace("rls");
    expect((await appSql()`SELECT id FROM members`).length).toBe(0);
    await expect(
      withWorkspace(b.id, (tx) => tx`INSERT INTO decisions (workspace_id, title, body, rationale, decided_by_id) VALUES (${a.id}, 't', 'b', 'r', ${a.alice})`),
    ).rejects.toThrow(/row-level security/);
  });
  it("the app role is not a superuser and does not bypass RLS", async () => {
    const [r] = await appSql()`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(r).toMatchObject({ rolsuper: false, rolbypassrls: false });
  });
});

describe("append-only tables", () => {
  it("events and audit_log reject UPDATE/DELETE for the app role and the owner", async () => {
    const w = await makeWorkspace("ao");
    await updateOwnStatus(w.human("alice"), { presence: "working", doing: "x", branch: null, waitingOn: [] });
    await expect(withWorkspace(w.id, (tx) => tx`UPDATE events SET type = 'pr.merged'`)).rejects.toThrow();
    await expect(withWorkspace(w.id, (tx) => tx`DELETE FROM events`)).rejects.toThrow();
    await expect(withWorkspace(w.id, (tx) => tx`DELETE FROM audit_log`)).rejects.toThrow();
    await expect(adminSql()`UPDATE audit_log SET action = 'x' WHERE workspace_id = ${w.id}`).rejects.toThrow(/append-only/);
    await expect(adminSql()`DELETE FROM events WHERE workspace_id = ${w.id}`).rejects.toThrow(/append-only/);
  });
});

describe("request flow via services", () => {
  it("agent drafts, human sends, receiver agent drafts reply, human sends reply, asker accepts", async () => {
    const w = await makeWorkspace("flow");
    const askerAgent = await makeAgentToken(w, "alice");
    const recvAgent = await makeAgentToken(w, "bob");
    const aa = await authenticateAgent(askerAgent.token);
    const ra = await authenticateAgent(recvAgent.token);
    if (!aa.ok || !ra.ok) throw new Error("auth");
    const draft = await createRequestDraft(aa.principal, { receiverId: w.bob, title: "Q", body: "what tag?", taskId: null, dueAt: null });
    expect(draft.status).toBe("draft");
    await expect(actOnRequest(aa.principal, draft.id, "send")).rejects.toMatchObject({ code: "human_only", status: 403 });
    // receiver cannot see the asker's draft
    await expect(getRequest(w.human("bob"), draft.id)).rejects.toMatchObject({ code: "not_found" });
    const sent = await actOnRequest(w.human("alice"), draft.id, "send", "what tag does the server pin?");
    expect(sent.status).toBe("sent");
    expect(sent.messages[0]).toMatchObject({ sentById: w.alice, editedBeforeSend: true, authoredBy: "agent" });
    await expect(actOnRequest(w.human("carol"), draft.id, "send_reply", "hi")).rejects.toMatchObject({ code: "not_found" });
    await expect(actOnRequest(aa.principal, draft.id, "draft_reply", "mine")).rejects.toMatchObject({ code: "wrong_side" });
    const rd = await actOnRequest(ra.principal, draft.id, "draft_reply", "tag v1.2");
    expect(rd.status).toBe("reply_drafted");
    // asker cannot read the unsent reply draft
    expect((await getRequest(w.human("alice"), draft.id)).messages.length).toBe(1);
    expect((await getRequest(w.human("bob"), draft.id)).messages.length).toBe(2);
    await expect(actOnRequest(ra.principal, draft.id, "send_reply")).rejects.toMatchObject({ code: "human_only" });
    const replied = await actOnRequest(w.human("bob"), draft.id, "send_reply");
    expect(replied.status).toBe("replied");
    expect(replied.messages[1]).toMatchObject({ authoredBy: "agent", sentById: w.bob, editedBeforeSend: false });
    await expect(actOnRequest(w.human("bob"), draft.id, "accept")).rejects.toMatchObject({ code: "wrong_side" });
    const closed = await actOnRequest(w.human("alice"), draft.id, "accept");
    expect(closed.status).toBe("closed");
    await expect(actOnRequest(w.human("alice"), draft.id, "cancel")).rejects.toMatchObject({ code: "invalid_state", status: 409 });
    const types = (await withWorkspace(w.id, (tx) => tx`SELECT type FROM events ORDER BY time, id`)).map((r) => r.type);
    expect(types).toEqual(expect.arrayContaining(["request.created", "request.sent", "request.reply_drafted", "request.replied", "request.closed"]));
  });

  it("inbox: unread tracking and markSeen", async () => {
    const w = await makeWorkspace("inbox");
    const d = await createRequestDraft(w.human("alice"), { receiverId: w.bob, title: "T", body: "b", taskId: null, dueAt: null });
    await actOnRequest(w.human("alice"), d.id, "send");
    expect((await listInbox(w.human("bob"), { unreadOnly: true })).length).toBe(1);
    await listInbox(w.human("bob"), { markSeen: true });
    expect((await listInbox(w.human("bob"), { unreadOnly: true })).length).toBe(0);
  });

  it("decisions are human only at the service layer", async () => {
    const w = await makeWorkspace("dec");
    const a = await authenticateAgent((await makeAgentToken(w, "alice")).token);
    if (!a.ok) throw new Error();
    await expect(recordDecision(a.principal, { title: "t", body: "b", rationale: "r", taskId: null })).rejects.toMatchObject({ code: "human_only" });
    const d = await recordDecision(w.human("alice"), { title: "t", body: "b", rationale: "r", taskId: null });
    expect(d.decidedById).toBe(w.alice);
  });
});
