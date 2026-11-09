/** P0 journeys through the real API + MCP (black box). Story ids refer to docs/business/user-stories.md. */
import { beforeAll, describe, expect, it } from "vitest";
import { MEMBER, SLUG, TAG, W, act, api, board, createAgent, draftRequest, login, rpc, sentRequest, tool, toolErrCode, uniq, type AgentCred, type Session } from "../src/helpers.js";

let phong: Session, trang: Session, bao: Session;
beforeAll(async () => {
  [phong, trang, bao] = await Promise.all([login(MEMBER.phong), login(MEMBER.trang), login(MEMBER.bao)]);
});

describe("J1 dev login -> board (BRD-01)", () => {
  it("returns Me with workspace slug and the board has 7 members, 7 cards with mascots", async () => {
    expect(phong.me).toMatchObject({ id: MEMBER.phong, role: "admin", workspaceSlug: SLUG });
    const b = await board(phong);
    expect(b.members).toHaveLength(7);
    expect(b.cards.length).toBeGreaterThanOrEqual(7);
    for (const m of b.members) expect(m.mascot).toMatchObject({ species: expect.any(String), palette: expect.any(String) });
    expect(b.workspace.slug).toBe(SLUG);
  });
  it("unauthenticated board is 401", async () => {
    expect((await api(null, "GET", W("/board"))).status).toBe(401);
  });
});

describe("J2 request lifecycle: draft -> send -> agent reply_draft -> human send_reply -> accept (REQ-*)", () => {
  let trangAgent: AgentCred;
  beforeAll(async () => {
    trangAgent = await createAgent(trang);
  });

  it("walks the whole state machine; only humans advance it, the agent only drafts", async () => {
    const title = uniq(`${TAG}-lifecycle`);
    const d = await draftRequest(bao, MEMBER.trang, { title, body: "QA-E2E ask body: which tag is staging pinned to?" });
    expect(d.status).toBe("draft");

    // receiver cannot see a draft at all
    expect((await api(trang, "GET", W("/requests"))).body.find((r: any) => r.id === d.id)).toBeUndefined();
    expect((await act(trang, d.id, "send_reply", "x")).status).toBe(404);

    const sent = await act(bao, d.id, "send");
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe("sent");

    // receiver's agent sees it in list_inbox, labelled untrusted
    const inbox = await tool(trangAgent.token, "list_inbox", {});
    const item = inbox.data.items.find((i: any) => i.requestId === d.id);
    expect(item).toBeTruthy();
    expect(item.yourRole).toBe("receiver");
    expect(item.messages[0].trust).toBe("untrusted");
    expect(item.title.trust).toBe("untrusted");
    expect(inbox.blocks[0]).toMatch(/untrusted/i);

    // agent drafts the reply — status becomes reply_drafted, nothing is "sent"
    const dr = await tool(trangAgent.token, "reply_draft", { requestId: d.id, body: "QA-E2E reply draft by agent" });
    expect(dr.data).toMatchObject({ status: "reply_drafted", humanApproval: true, sent: false });

    // the asker must NOT see the reply draft yet
    const askerView = (await api(bao, "GET", W("/requests"))).body.find((r: any) => r.id === d.id);
    expect(askerView.status).toBe("reply_drafted");
    expect(JSON.stringify(askerView)).not.toContain("reply draft by agent");
    // the receiver (human) sees it and may edit+send
    const rcvView = (await api(trang, "GET", W("/requests"))).body.find((r: any) => r.id === d.id);
    expect(rcvView.messages.some((m: any) => m.kind === "reply" && m.authoredBy === "agent" && m.sentById === null)).toBe(true);

    // the agent cannot send, even through the human route
    const agentSend = await fetch(`http://localhost:8787${W(`/requests/${d.id}/actions`)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${trangAgent.token}`, "content-type": "application/json", "x-officehub-csrf": "1" },
      body: JSON.stringify({ action: "send_reply" }),
    });
    expect(agentSend.status).toBe(403);
    expect((await agentSend.json()).error.code).toBe("human_only");

    // asker cannot send the receiver's reply nor accept early
    expect((await act(bao, d.id, "send_reply", "no")).status).toBe(403);
    expect((await act(bao, d.id, "accept")).status).toBe(409);

    // receiver presses send (edited text -> editedBeforeSend)
    const sr = await act(trang, d.id, "send_reply", "QA-E2E reply edited by human");
    expect(sr.status).toBe(200);
    expect(sr.body.status).toBe("replied");
    const sentReply = sr.body.messages.find((m: any) => m.kind === "reply");
    expect(sentReply).toMatchObject({ sentById: MEMBER.trang, editedBeforeSend: true });

    // asker now sees it and accepts (closes)
    const acc = await act(bao, d.id, "accept");
    expect(acc.status).toBe(200);
    expect(acc.body.status).toBe("closed");
    // closed is terminal
    expect((await act(bao, d.id, "follow_up", "again")).status).toBe(409);
  });

  it("follow_up sends the request back to the receiver's side", async () => {
    const d = await sentRequest(bao, MEMBER.trang, { title: uniq(`${TAG}-fu`) });
    expect((await act(trang, d.id, "send_reply", "first answer")).status).toBe(200);
    const fu = await act(bao, d.id, "follow_up", "QA-E2E follow up question");
    expect(fu.status).toBe(200);
    expect(fu.body.status).toBe("sent");
    expect((await act(bao, d.id, "cancel")).body.status).toBe("cancelled");
  });

  it("cancel is only for the asker", async () => {
    const d = await sentRequest(bao, MEMBER.trang, { title: uniq(`${TAG}-cancel`) });
    expect((await act(trang, d.id, "cancel")).status).toBe(403);
    expect((await act(bao, d.id, "cancel")).status).toBe(200);
  });
});

describe("J3 agent cannot send / decide (rule: humans press send)", () => {
  it("MCP exposes exactly the 5 draft-only tools — no send, accept, decide", async () => {
    const a = await createAgent(bao);
    const r = await rpc(a.token, "tools/list", {});
    expect(r.body.result.tools.map((t: any) => t.name).sort()).toEqual(["list_inbox", "post_status", "read_board", "reply_draft", "send_request"]);
  });
  it("send_request via MCP creates a DRAFT only; the receiver sees nothing until the human sends", async () => {
    const a = await createAgent(bao);
    const t = uniq(`${TAG}-mcpdraft`);
    const r = await tool(a.token, "send_request", { receiverId: MEMBER.trang, title: t, body: "QA-E2E body from agent" });
    expect(r.data).toMatchObject({ status: "draft", sent: false, humanApproval: true });
    expect(JSON.stringify((await api(trang, "GET", W("/requests"))).body)).not.toContain(t);
    expect(JSON.stringify((await api(trang, "GET", W("/inbox"))).body)).not.toContain(t);
    // the agent-authored draft is shown to the asker as authored by an agent
    const mine = (await api(bao, "GET", W("/requests"))).body.find((x: any) => x.id === r.data.requestId);
    expect(mine.messages[0]).toMatchObject({ authoredBy: "agent", sentById: null });
  });
});

describe("J4 secrets are rejected, never stored (SEC rule 4)", () => {
  it("API: 422 secret_detected naming the rule, not the value; nothing stored", async () => {
    const key = ["sk", "ant", "api03", "ZZzzYYyyXXxxWWwwVVvvUUuu1122"].join("-");
    const marker = uniq(`${TAG}-secret`);
    const r = await api(bao, "POST", W("/requests"), { receiverId: MEMBER.trang, title: marker, body: `deploy with ${key}`, taskId: null, dueAt: null });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("secret_detected");
    expect(r.text).not.toContain(key);
    expect((await api(bao, "GET", W("/requests"))).text).not.toContain(marker);
  });
});

describe("J5 decisions require a rationale (DEC-*)", () => {
  it("rejects empty / whitespace rationale, accepts a real one, lists it", async () => {
    const title = uniq(`${TAG}-decision`);
    for (const rationale of ["", "   "]) {
      expect((await api(phong, "POST", W("/decisions"), { title, body: "", rationale, taskId: null })).status).toBe(400);
    }
    const ok = await api(phong, "POST", W("/decisions"), { title, body: "chọn phương án A", rationale: "vì rẻ hơn", taskId: null });
    expect(ok.status).toBe(201);
    const list = (await api(trang, "GET", W("/decisions"))).body;
    expect(list.find((d: any) => d.title === title)).toMatchObject({ rationale: "vì rẻ hơn", decidedById: MEMBER.phong });
  });
  it("agents cannot record decisions (no tool, 403 on API)", async () => {
    const a = await createAgent(phong);
    const r = await fetch(`http://localhost:8787${W("/decisions")}`, {
      method: "POST",
      headers: { authorization: `Bearer ${a.token}`, "content-type": "application/json", "x-officehub-csrf": "1" },
      body: JSON.stringify({ title: "x", body: "", rationale: "y", taskId: null }),
    });
    expect(r.status).toBe(403);
  });
});

describe("J6 agent token: shown once -> works -> revoke -> 401 everywhere (AGT-*)", () => {
  it("token is returned once, never listed, MCP + /agent/inbox 401 after revoke", async () => {
    const a = await createAgent(bao);
    expect(a.token).toMatch(/^oh_agent_[A-Za-z0-9]{40,}$/);
    const list = await api(bao, "GET", W("/agents"));
    expect(list.text).not.toContain(a.token);
    expect(list.body.find((x: any) => x.id === a.id)).toMatchObject({ revokedAt: null });

    expect((await tool(a.token, "read_board", {})).status).toBe(200);
    expect((await fetch("http://localhost:8787/agent/inbox", { headers: { authorization: `Bearer ${a.token}` } })).status).toBe(200);

    expect((await api(bao, "DELETE", W(`/agents/${a.id}`))).status).toBe(200);

    const after = await tool(a.token, "read_board", {});
    expect(after.status).toBe(401);
    expect(toolErrCode(after)).toBe("token_revoked");
    expect((await fetch("http://localhost:8787/agent/inbox", { headers: { authorization: `Bearer ${a.token}` } })).status).toBe(401);
    expect((await api(bao, "GET", W("/agents"))).body.find((x: any) => x.id === a.id).revokedAt).toBeTruthy();
  });
});

describe("J7 status card is self-only (BRD-02)", () => {
  it("post_status updates only the owner's card, marks updatedBy=agent, ignores smuggled member fields", async () => {
    const a = await createAgent(bao);
    const before = (await board(trang)).cards.find((c: any) => c.memberId === MEMBER.trang);
    const r = await tool(a.token, "post_status", { presence: "working", doing: uniq(`${TAG}-doing`), branch: "qa/e2e", waitingOn: [], memberId: MEMBER.trang, ownerId: MEMBER.trang } as any);
    expect(r.isError).toBe(false);
    const cards = (await board(trang)).cards;
    expect(cards.find((c: any) => c.memberId === MEMBER.bao)).toMatchObject({ presence: "working", updatedBy: "agent", branch: "qa/e2e" });
    expect(cards.find((c: any) => c.memberId === MEMBER.trang)).toEqual(before);
  });
});
