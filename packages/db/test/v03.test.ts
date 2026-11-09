import { afterAll, describe, expect, it } from "vitest";
import { Agent, AuditEntry, HubEvent, Request as RequestSchema } from "@officehub/shared";
import { adminSql, closeAll, withWorkspace } from "../src/client.js";
import { authenticateAgent, devMembers } from "../src/auth.js";
import { actOnRequest, createRequestDraft, getRequest, listRequests } from "../src/requests.js";
import { buildHandoff, getBoard, listAudit, revokeAgent } from "../src/services.js";
import { auditStandalone } from "../src/core.js";
import { makeAgentToken, makeWorkspace } from "../src/testing.js";

afterAll(closeAll);
const mk = (rcv: string, title = "T", body = "ask body", taskId: string | null = null) => ({ receiverId: rcv, title, body, taskId, dueAt: null });

async function agentPrincipal(w: Awaited<ReturnType<typeof makeWorkspace>>, who: "alice" | "bob" | "carol") {
  const t = await makeAgentToken(w, who);
  const a = await authenticateAgent(t.token);
  if (!a.ok) throw new Error("auth");
  return { ...t, principal: a.principal };
}

describe("open-draft cap per agent (Business matrix)", () => {
  it("11th open draft -> 429 rate_limited with a clear message; sending frees a slot; humans/other agents are not capped", async () => {
    const w = await makeWorkspace("cap");
    const { principal } = await agentPrincipal(w, "alice");
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push((await createRequestDraft(principal, mk(w.bob, `d${i}`))).id);
    const err = await createRequestDraft(principal, mk(w.bob, "d11")).catch((e) => e);
    expect(err).toMatchObject({ code: "rate_limited", status: 429 });
    expect(err.message).toMatch(/10 unsent draft/);
    await actOnRequest(w.human("alice"), ids[0]!, "send");
    expect((await createRequestDraft(principal, mk(w.bob, "again"))).status).toBe("draft");
    await expect(createRequestDraft(principal, mk(w.bob, "over"))).rejects.toMatchObject({ code: "rate_limited" });
    const other = await agentPrincipal(w, "carol");
    expect((await createRequestDraft(other.principal, mk(w.bob))).status).toBe("draft");
    expect((await createRequestDraft(w.human("alice"), mk(w.bob, "human"))).status).toBe("draft");
  });
  it("concurrent creates cannot exceed the cap", async () => {
    const w = await makeWorkspace("cap");
    const { principal } = await agentPrincipal(w, "alice");
    const res = await Promise.allSettled(Array.from({ length: 14 }, (_, i) => createRequestDraft(principal, mk(w.bob, `c${i}`))));
    expect(res.filter((r) => r.status === "fulfilled").length).toBe(10);
  });
});

describe("visibility hardening: board events, handoff pack", () => {
  it("non-parties never see request titles/bodies/events in board or handoff; admin sees sent requests only", async () => {
    const w = await makeWorkspace("vis");
    const [task] = await adminSql()`INSERT INTO tasks (workspace_id, source, title, state) VALUES (${w.id}, 'manual', 'Ship feed', 'open') RETURNING id`;
    const taskId = task!.id as string;
    const sentReq = await createRequestDraft(w.human("alice"), mk(w.bob, "SENT-TITLE-ALPHA", "SENT-BODY-ALPHA", taskId));
    await actOnRequest(w.human("alice"), sentReq.id, "send");
    await createRequestDraft(w.human("alice"), mk(w.bob, "DRAFT-TITLE-BETA", "DRAFT-BODY-BETA", taskId));
    const carol = w.human("carol");
    const board = await getBoard(carol);
    expect(JSON.stringify(board)).not.toMatch(/ALPHA|BETA/);
    expect(board.openRequests).toHaveLength(0);
    expect(board.recentEvents.filter((e) => String(e.type).startsWith("request."))).toHaveLength(0);
    expect((await buildHandoff(carol, taskId)).markdown).not.toMatch(/ALPHA|BETA|request\./);
    const ca = await agentPrincipal(w, "carol");
    expect(JSON.stringify(await getBoard(ca.principal))).not.toMatch(/ALPHA|BETA/);
    const bobPack = (await buildHandoff(w.human("bob"), taskId)).markdown;
    expect(bobPack).toMatch(/SENT-TITLE-ALPHA/);
    expect(bobPack).toMatch(/SENT-BODY-ALPHA/);
    expect(bobPack).not.toMatch(/BETA/);
    expect((await buildHandoff(w.human("alice"), taskId)).markdown).toMatch(/DRAFT-TITLE-BETA/);
    // a non-party admin: the sent request is visible (contract C13), the foreign draft never is
    const asAdmin = { ...carol, role: "admin" as const };
    const adminPack = (await buildHandoff(asAdmin, taskId)).markdown;
    expect(adminPack).toMatch(/SENT-TITLE-ALPHA/);
    expect(adminPack).not.toMatch(/BETA/);
    expect(JSON.stringify(await getBoard(asAdmin))).not.toMatch(/BETA/);
  });

  it("request.* event payloads carry ids only (no titles/bodies)", async () => {
    const w = await makeWorkspace("vis");
    const d = await createRequestDraft(w.human("alice"), mk(w.bob, "EVT-TITLE", "EVT-BODY"));
    await actOnRequest(w.human("alice"), d.id, "send");
    await actOnRequest(w.human("bob"), d.id, "draft_reply", "EVT-REPLY");
    const ev = await withWorkspace(w.id, (tx) => tx`SELECT * FROM events WHERE type LIKE 'request.%'`);
    expect(ev.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(ev)).not.toMatch(/EVT-/);
    for (const e of ev) expect(Object.keys(e.data).every((k) => ["requestId", "messageId"].includes(k))).toBe(true);
  });
});

describe("contract v0.3 shapes", () => {
  it("every message carries authorMemberId; Request parses against the shared schema", async () => {
    const w = await makeWorkspace("shape");
    const { principal } = await agentPrincipal(w, "bob");
    const d = await createRequestDraft(w.human("alice"), mk(w.bob));
    await actOnRequest(w.human("alice"), d.id, "send");
    await actOnRequest(principal, d.id, "draft_reply", "agent reply");
    const r = await actOnRequest(w.human("bob"), d.id, "send_reply");
    expect(RequestSchema.safeParse(r).success).toBe(true);
    expect(r.messages.every((m) => typeof m.authorMemberId === "string")).toBe(true);
    expect(r.messages[1]).toMatchObject({ authoredBy: "agent", authorMemberId: w.bob });
    expect(RequestSchema.safeParse(await getRequest(w.human("alice"), d.id)).success).toBe(true);
    expect((await listRequests(w.human("alice"))).every((x) => RequestSchema.safeParse(x).success)).toBe(true);
  });

  it("revokeAgent returns the revoked Agent; audit targetId is a plain string (non-uuid kept)", async () => {
    const w = await makeWorkspace("shape");
    const t = await makeAgentToken(w, "bob");
    const rev = await revokeAgent(w.human("bob"), t.agent.id);
    expect(Agent.safeParse(rev).success).toBe(true);
    expect(rev.revokedAt).not.toBeNull();
    await auditStandalone(w.id, { kind: "human", memberId: w.alice }, { action: "x.test", targetKind: "request", targetId: "#7" });
    const rows = await listAudit(w.human("alice"));
    expect(rows.every((r) => AuditEntry.safeParse(r).success)).toBe(true);
    expect(rows.find((r) => r.action === "x.test")!.targetId).toBe("#7");
    expect(rows.find((r) => r.action === "agent.revoke")!.targetId).toBe(t.agent.id);
  });

  it("devMembers lists members with workspace slug and mascot", async () => {
    const w = await makeWorkspace("dev");
    const me = (await devMembers()).find((m) => m.id === w.alice)!;
    expect(me).toMatchObject({ displayName: "Alice", workspaceSlug: w.slug });
    expect(me.mascot).toMatchObject({ species: "blob" });
  });

  it("board events parse as HubEvent", async () => {
    const w = await makeWorkspace("shape");
    const d = await createRequestDraft(w.human("alice"), mk(w.bob));
    await actOnRequest(w.human("alice"), d.id, "send");
    const b = await getBoard(w.human("bob"));
    expect(b.recentEvents.length).toBeGreaterThan(0);
    for (const e of b.recentEvents) expect(HubEvent.safeParse(e).success).toBe(true);
  });
});
