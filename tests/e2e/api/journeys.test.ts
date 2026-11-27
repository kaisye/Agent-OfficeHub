/** P0 journeys through the real API + MCP (black box), v0.6: one orchestrator directs six role agents. */
import { beforeAll, describe, expect, it } from "vitest";
import { TAG, W, act, agentDraft, agentSent, api, asAgent, assign, board, createAgent, createWorld, queue, rpc, tool, toolErrCode, uniq, type AgentCred, type World } from "../src/helpers.js";

let w: World;
let fe: AgentCred, be: AgentCred;
beforeAll(async () => {
  w = await createWorld("journeys");
  [fe, be] = await Promise.all([createAgent(w, "frontend"), createAgent(w, "backend")]);
});

describe("J1 dev login -> board (BRD-01)", () => {
  it("returns Me for the orchestrator; the board has the orchestrator, 6 role seats with mascots", async () => {
    expect(w.orch.me).toMatchObject({ id: w.orchestratorId, role: "admin", workspaceSlug: w.slug });
    const b = await board(w);
    expect(b.orchestrator.id).toBe(w.orchestratorId);
    expect(b.roles.map((r: any) => r.key).sort()).toEqual(["backend", "business", "design", "frontend", "leader", "qa"]);
    for (const r of b.roles) expect(r.mascot).toMatchObject({ buddy: expect.any(String) });
    expect(b.workspace.slug).toBe(w.slug);
    expect(b).not.toHaveProperty("members");
  });
  it("unauthenticated board is 401", async () => {
    expect((await api(null, "GET", W(w, "/board"))).status).toBe(401);
  });
});

describe("J2 request lifecycle: agent draft -> orchestrator send -> agent reply_draft -> orchestrator send_reply -> accept (REQ-*)", () => {
  it("walks the whole state machine; only the orchestrator advances it, agents only draft", async () => {
    const title = uniq(`${TAG}-lifecycle`);
    const d = await agentDraft(fe, "backend", { title, body: "QA-E2E ask body: which route returns the queue?" });
    expect(d.status).toBe("draft");

    // the receiving role sees nothing yet: no inbox item, no board entry, no action possible
    const beInbox = await tool(be.token, "list_inbox", {});
    expect(JSON.stringify(beInbox.data)).not.toContain(d.id);
    expect(toolErrCode(await tool(be.token, "reply_draft", { requestId: d.id, body: "peek" }))).toBe("not_found");
    // the draft is waiting in the orchestrator's approval queue
    expect((await queue(w)).requests.map((r: any) => r.id)).toContain(d.id);

    const sent = await act(w, d.id, "send");
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ status: "sent", askerRoleId: w.roles.frontend, receiverRoleId: w.roles.backend, kind: "question" });

    // receiver role's agent sees it in list_inbox, labelled untrusted (another role wrote it)
    const inbox = await tool(be.token, "list_inbox", {});
    const item = inbox.data.items.find((i: any) => i.requestId === d.id);
    expect(item).toMatchObject({ from: "frontend", to: "backend", yourSide: "receiver", needsYourAction: true });
    expect(item.messages[0].trust).toBe("untrusted");
    expect(item.title.trust).toBe("untrusted");
    expect(inbox.blocks[0]).toMatch(/untrusted/i);

    // the receiving agent drafts the reply: reply_drafted, nothing delivered
    const dr = await tool(be.token, "reply_draft", { requestId: d.id, body: "QA-E2E reply draft by agent" });
    expect(dr.data).toMatchObject({ status: "reply_drafted", humanApproval: true, delivered: false });

    // the asker role must NOT see the reply draft yet (agent view) ...
    const askerInbox = JSON.stringify((await tool(fe.token, "list_inbox", {})).data);
    expect(askerInbox).not.toContain("reply draft by agent");
    // ... while the orchestrator sees both messages and the approval queue lists it
    const orchView = (await api(w.orch, "GET", W(w, `/requests/${d.id}`))).body;
    expect(orchView.messages.some((m: any) => m.kind === "reply" && m.authoredBy === "agent" && m.sentById === null && m.authorRoleId === w.roles.backend)).toBe(true);
    expect((await queue(w)).requests.find((r: any) => r.id === d.id).status).toBe("reply_drafted");

    // no agent can send, even through the human route
    for (const [token, action] of [[be.token, "send_reply"], [fe.token, "accept"]] as const) {
      const r = await asAgent(token, "POST", W(w, `/requests/${d.id}/actions`), { action });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe("human_only");
    }
    // the asking agent cannot reply on the receiver's behalf (wrong_side) and accept is not valid yet
    expect(toolErrCode(await tool(fe.token, "reply_draft", { requestId: d.id, body: "no" }))).toBe("wrong_side");
    expect((await act(w, d.id, "accept")).status).toBe(409);

    // orchestrator forwards the reply (edited text -> editedBeforeSend)
    const sr = await act(w, d.id, "send_reply", "QA-E2E reply edited by orchestrator");
    expect(sr.status).toBe(200);
    expect(sr.body.status).toBe("replied");
    expect(sr.body.messages.find((m: any) => m.kind === "reply")).toMatchObject({ sentById: w.orchestratorId, editedBeforeSend: true });

    // the asking role now sees the answer; the orchestrator accepts (closes)
    expect(JSON.stringify((await tool(fe.token, "list_inbox", {})).data)).toContain("reply edited by orchestrator");
    const acc = await act(w, d.id, "accept");
    expect(acc.status).toBe(200);
    expect(acc.body.status).toBe("closed");
    // closed is terminal
    expect((await act(w, d.id, "follow_up", "again")).status).toBe(409);
  });

  it("follow_up sends the request back to the receiving role; cancel ends it", async () => {
    const d = await agentSent(w, fe, "backend", { title: uniq(`${TAG}-fu`) });
    expect((await act(w, d.id, "send_reply", "first answer")).status).toBe(200);
    const fu = await act(w, d.id, "follow_up", "QA-E2E follow up question");
    expect(fu.status).toBe(200);
    expect(fu.body.status).toBe("sent");
    expect((await act(w, d.id, "cancel")).body.status).toBe("cancelled");
  });

  it("orchestrator assigns work: created already sent, trust=orchestrator for the role; the role answers by draft", async () => {
    const job = await assign(w, "backend", { title: uniq(`${TAG}-job`) });
    expect(job).toMatchObject({ status: "sent", askerRoleId: null, receiverRoleId: w.roles.backend });
    const item = (await tool(be.token, "list_inbox", {})).data.items.find((i: any) => i.requestId === job.id);
    expect(item).toMatchObject({ from: "orchestrator", needsYourAction: true });
    expect(item.messages[0].trust).toBe("orchestrator");
    expect((await tool(be.token, "reply_draft", { requestId: job.id, body: "done" })).data.status).toBe("reply_drafted");
  });

  it("an agent can ask the orchestrator: draft -> send -> the orchestrator answers with send_reply + body", async () => {
    const d = await agentSent(w, be, "orchestrator", { title: uniq(`${TAG}-askorch`) });
    expect(d).toMatchObject({ status: "sent", receiverRoleId: null });
    expect(toolErrCode(await tool(be.token, "reply_draft", { requestId: d.id, body: "self-answer" }))).toBe("wrong_side");
    expect((await act(w, d.id, "send_reply", "yes, 8787")).body.status).toBe("replied");
  });

  it("autoForwardReply: one click for a question; refused (400, nothing changes) for other kinds", async () => {
    const q = await agentDraft(fe, "backend", { title: uniq(`${TAG}-auto`) });
    expect((await act(w, q.id, "send", undefined, { autoForwardReply: true })).body).toMatchObject({ status: "sent", autoForwardReply: true });
    const r = await tool(be.token, "reply_draft", { requestId: q.id, body: "auto answer" });
    expect(r.data).toMatchObject({ status: "replied", delivered: true });
    const rv = await agentDraft(fe, "backend", { title: uniq(`${TAG}-rev`), kind: "review" });
    const bad = await act(w, rv.id, "send", undefined, { autoForwardReply: true });
    expect(bad.status).toBe(400);
    expect((await api(w.orch, "GET", W(w, `/requests/${rv.id}`))).body.status).toBe("draft");
    // the flag is only valid on `send`
    expect((await act(w, rv.id, "cancel", undefined, { autoForwardReply: true })).status).toBe(400);
  });

  it("the approval queue puts blockers first and is not callable by agents", async () => {
    const x = await agentDraft(fe, "backend", { title: uniq(`${TAG}-plain`) });
    const b = await agentDraft(fe, "backend", { title: uniq(`${TAG}-blocker`), kind: "blocker" });
    const ids = (await queue(w)).requests.map((r: any) => r.id);
    expect(ids.indexOf(b.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(x.id));
    expect((await asAgent(fe.token, "GET", W(w, "/queue"))).status).toBe(403);
  });
});

describe("J3 agent cannot send / decide (rule: the orchestrator presses send)", () => {
  it("MCP exposes exactly the 8 tools — no send, accept, record_decision", async () => {
    const a = await createAgent(w, "design");
    const r = await rpc(a.token, "tools/list", {});
    expect(r.body.result.tools.map((t: any) => t.name).sort()).toEqual(["check_paths", "list_inbox", "post_status", "propose_decision", "read_board", "read_decisions", "reply_draft", "send_request"]);
  });
  it("send_request via MCP creates a DRAFT only; the receiving role sees nothing until the orchestrator sends", async () => {
    const t = uniq(`${TAG}-mcpdraft`);
    const r = await tool(fe.token, "send_request", { to: "qa", title: t, body: "QA-E2E body from agent" });
    expect(r.data).toMatchObject({ status: "draft", sent: false, humanApproval: true });
    const qa = await createAgent(w, "qa");
    expect(JSON.stringify((await tool(qa.token, "list_inbox")).data)).not.toContain(t);
    expect(JSON.stringify((await tool(qa.token, "read_board")).data)).not.toContain(t);
    // shown to the orchestrator as authored by the asking role's agent
    const mine = (await api(w.orch, "GET", W(w, "/requests"))).body.find((x: any) => x.id === r.data.requestId);
    expect(mine.messages[0]).toMatchObject({ authoredBy: "agent", authorRoleId: w.roles.frontend, sentById: null });
  });
});

describe("J4 secrets are rejected, never stored (SEC rule 4)", () => {
  it("API: 422 secret_detected naming the rule, not the value; nothing stored", async () => {
    const key = ["sk", "ant", "api03", "ZZzzYYyyXXxxWWwwVVvvUUuu1122"].join("-");
    const marker = uniq(`${TAG}-secret`);
    const r = await api(w.orch, "POST", W(w, "/requests"), { receiverRoleId: w.roles.backend, kind: "question", title: marker, body: `deploy with ${key}`, taskId: null, dueAt: null });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("secret_detected");
    expect(r.text).not.toContain(key);
    expect((await api(w.orch, "GET", W(w, "/requests"))).text).not.toContain(marker);
  });
});

describe("J5 decisions require a rationale; proposals become decisions only by the orchestrator (DEC-*)", () => {
  it("rejects empty / whitespace rationale, accepts a real one, lists it", async () => {
    const title = uniq(`${TAG}-decision`);
    for (const rationale of ["", "   "]) {
      expect((await api(w.orch, "POST", W(w, "/decisions"), { title, body: "", rationale, taskId: null })).status).toBe(400);
    }
    const ok = await api(w.orch, "POST", W(w, "/decisions"), { title, body: "chọn phương án A", rationale: "vì rẻ hơn", taskId: null, roleIds: [w.roles.backend] });
    expect(ok.status).toBe(201);
    const list = (await api(w.orch, "GET", W(w, "/decisions"))).body;
    expect(list.find((d: any) => d.title === title)).toMatchObject({ rationale: "vì rẻ hơn", decidedById: w.orchestratorId, roleIds: [w.roles.backend] });
    // the role it concerns reads it first through MCP
    const rd = await tool(be.token, "read_decisions", {});
    expect(rd.data.decisions.find((d: any) => d.title === title)).toMatchObject({ concernsYou: true });
  });
  it("agents cannot record decisions (no tool, 403 on API); propose_decision only queues a proposal", async () => {
    const r = await asAgent(fe.token, "POST", W(w, "/decisions"), { title: "x", body: "", rationale: "y", taskId: null });
    expect(r.status).toBe(403);
    const title = uniq(`${TAG}-prop`);
    const p = await tool(fe.token, "propose_decision", { title, body: "b", rationale: "because" });
    expect(p.data).toMatchObject({ status: "pending", humanApproval: true });
    expect((await api(w.orch, "GET", W(w, "/decisions"))).text).not.toContain(title);
    expect((await queue(w)).proposals.map((x: any) => x.id)).toContain(p.data.proposalId);
    const acc = await api(w.orch, "POST", W(w, `/proposals/${p.data.proposalId}`), { action: "accept" });
    expect(acc.status).toBe(200);
    expect(acc.body.decision).toMatchObject({ title, proposalId: p.data.proposalId, roleIds: [w.roles.frontend] });
  });
});

describe("J6 agent token: shown once -> works -> revoke -> 401 everywhere (AGT-*)", () => {
  it("token is returned once, never listed, MCP + /agent/inbox 401 after revoke", async () => {
    const a = await createAgent(w, "business");
    expect(a.token).toMatch(/^oh_agent_[A-Za-z0-9]{40,}$/);
    const list = await api(w.orch, "GET", W(w, "/agents"));
    expect(list.text).not.toContain(a.token);
    expect(list.body.find((x: any) => x.id === a.id)).toMatchObject({ revokedAt: null, roleId: w.roles.business });

    expect((await tool(a.token, "read_board", {})).status).toBe(200);
    expect((await asAgent(a.token, "GET", "/agent/inbox")).status).toBe(200);

    expect((await api(w.orch, "DELETE", W(w, `/agents/${a.id}`))).status).toBe(200);

    const after = await tool(a.token, "read_board", {});
    expect(after.status).toBe(401);
    expect(toolErrCode(after)).toBe("token_revoked");
    expect((await asAgent(a.token, "GET", "/agent/inbox")).status).toBe(401);
    expect((await api(w.orch, "GET", W(w, "/agents"))).body.find((x: any) => x.id === a.id).revokedAt).toBeTruthy();
  });
});

describe("J7 role card is role-only (BRD-02)", () => {
  it("post_status updates only the caller's ROLE card, marks updatedBy=agent, ignores smuggled role/owner fields", async () => {
    const a = await createAgent(w, "design");
    const before = (await board(w)).cards.find((c: any) => c.roleId === w.roles.backend);
    const r = await tool(a.token, "post_status", { presence: "working", doing: uniq(`${TAG}-doing`), branch: "design/e2e", waitingOn: [], roleId: w.roles.backend, memberId: w.orchestratorId } as any);
    expect(r.isError).toBe(false);
    const cards = (await board(w)).cards;
    expect(cards.find((c: any) => c.roleId === w.roles.design)).toMatchObject({ presence: "working", updatedBy: "agent", branch: "design/e2e" });
    expect(cards.find((c: any) => c.roleId === w.roles.backend)).toEqual(before);
  });
  it("the orchestrator can set a role's card by hand (PUT /roles/:id/status) and the board shows updatedBy=human", async () => {
    expect((await api(w.orch, "PUT", W(w, `/roles/${w.roles.qa}/status`), { presence: "offline", doing: null, branch: null, waitingOn: [] })).status).toBe(200);
    expect((await board(w)).cards.find((c: any) => c.roleId === w.roles.qa)).toMatchObject({ presence: "offline", updatedBy: "human" });
  });
});

describe("J8 path ownership (check_paths) and out-of-area warnings", () => {
  it("check_paths maps files to owner roles; post_status paths outside the role are flagged on the board", async () => {
    const cp = await tool(fe.token, "check_paths", { paths: ["apps/web/a.tsx", "apps/api/src/app.ts", "packages/shared/src/api.ts", "unowned/file.txt"] });
    expect(cp.data.paths).toEqual([
      { path: "apps/web/a.tsx", ownerRole: { key: "frontend", name: "Frontend" }, yours: true },
      { path: "apps/api/src/app.ts", ownerRole: { key: "backend", name: "Backend" }, yours: false },
      { path: "packages/shared/src/api.ts", ownerRole: { key: "leader", name: "Leader" }, yours: false },
      { path: "unowned/file.txt", ownerRole: null, yours: false },
    ]);
    const st = await tool(fe.token, "post_status", { presence: "working", paths: ["apps/web/a.tsx", "packages/shared/src/api.ts"] });
    expect(st.data.outOfArea).toEqual([{ path: "packages/shared/src/api.ts", owner: "leader" }]);
    const card = (await tool(be.token, "read_board")).data.roles.find((r: any) => r.key === "frontend").card;
    expect(card.outOfArea).toEqual([{ path: "packages/shared/src/api.ts", owner: "leader" }]);
  });
});
