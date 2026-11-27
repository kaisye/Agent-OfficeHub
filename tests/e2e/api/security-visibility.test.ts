/**
 * C13 visibility (v0.6: role vs role). Frontend (asker) <-> Backend (receiver) are the parties; QA is an outsider role;
 * the orchestrator sees everything it must approve. Marker strings let us grep every surface for leaked text.
 *  - agents see: MCP read_board / list_inbox and the /agent/inbox hook, as their ROLE
 *  - the orchestrator sees: board, requests, queue, audit, decisions, handoff (+ the SSE ids stream)
 */
import { beforeAll, describe, expect, it } from "vitest";
import { known } from "../src/known.js";
import { W, act, agentDraft, api, asAgent, board, createAgent, createWorld, queue, sql, sseCollect, tool, toolErrCode, uniq, type AgentCred, type World } from "../src/helpers.js";

let w: World;
let fe: AgentCred, be: AgentCred, qa: AgentCred, be2: AgentCred;
let taskId: string;
const mark = { title: uniq("QA-E2E-VT"), ask: uniq("QA-E2E-VASK"), reply: uniq("QA-E2E-VREPLY") };
let reqId: string;

/** everything a role's agent can read about the workspace */
async function agentSurfaces(a: AgentCred): Promise<Record<string, string>> {
  return {
    mcp_read_board: JSON.stringify((await tool(a.token, "read_board")).data),
    mcp_list_inbox: JSON.stringify((await tool(a.token, "list_inbox")).data),
    hook_inbox: (await asAgent(a.token, "GET", "/agent/inbox")).text,
    mcp_read_decisions: JSON.stringify((await tool(a.token, "read_decisions")).data),
  };
}
/** everything the orchestrator can read */
async function orchSurfaces(): Promise<Record<string, string>> {
  return {
    board: JSON.stringify(await board(w)),
    requests: (await api(w.orch, "GET", W(w, "/requests"))).text,
    queue: JSON.stringify(await queue(w)),
    audit: (await api(w.orch, "GET", W(w, "/audit"))).text,
    decisions: (await api(w.orch, "GET", W(w, "/decisions"))).text,
    handoff: (await api(w.orch, "GET", W(w, `/tasks/${taskId}/handoff`))).text,
  };
}
const leaks = (o: Record<string, string>, needle: string) => Object.entries(o).filter(([, v]) => v.includes(needle)).map(([k]) => k);

beforeAll(async () => {
  w = await createWorld("visibility");
  [fe, be, qa, be2] = await Promise.all([createAgent(w, "frontend"), createAgent(w, "backend"), createAgent(w, "qa"), createAgent(w, "backend")]);
  const [t] = await sql()`INSERT INTO tasks (workspace_id, source, title, state, role_id) VALUES (${w.id}, 'manual', 'QA-E2E visibility task', 'open', ${w.roles.frontend}) RETURNING id`;
  taskId = t!.id as string;
});

describe("an unsent ask draft is invisible to every role but the asking one (and to the orchestrator, who approves it)", () => {
  beforeAll(async () => {
    reqId = (await agentDraft(fe, "backend", { title: mark.title, body: mark.ask, taskId })).id;
  });
  it("receiving role and outsider role: neither title nor body nor id on any agent surface", async () => {
    for (const a of [be, be2, qa]) {
      const s = await agentSurfaces(a);
      for (const needle of [mark.title, mark.ask, reqId]) expect(leaks(s, needle), `${a.roleKey} ${needle}`).toEqual([]);
    }
  });
  it("the asking role sees its own draft; the orchestrator sees it on board, requests, queue", async () => {
    expect(leaks(await agentSurfaces(fe), mark.title).length).toBeGreaterThan(0);
    const o = await orchSurfaces();
    for (const k of ["board", "requests", "queue"]) expect(o[k], k).toContain(mark.title);
    expect((await api(w.orch, "GET", W(w, `/requests/${reqId}`))).status).toBe(200);
  });
  it("agents cannot act on it: receiver and outsider get not_found (existence hidden), not wrong_side/403", async () => {
    expect(toolErrCode(await tool(be.token, "reply_draft", { requestId: reqId, body: "x" }))).toBe("not_found");
    expect(toolErrCode(await tool(qa.token, "reply_draft", { requestId: reqId, body: "x" }))).toBe("not_found");
  });
  it("audit and events never carry the text, only ids", async () => {
    const o = await orchSurfaces();
    expect(leaks({ audit: o.audit!, board_events: JSON.stringify((await board(w)).recentEvents) }, mark.ask)).toEqual([]);
  });
});

describe("a sent request is visible to its two roles (and the orchestrator), not to outsider roles", () => {
  beforeAll(async () => {
    expect((await act(w, reqId, "send")).status).toBe(200);
    expect((await tool(be.token, "reply_draft", { requestId: reqId, body: mark.reply })).data.status).toBe("reply_drafted");
  });

  it("outsider role sees nothing of it: read_board, list_inbox, hook inbox, decisions", async () => {
    const s = await agentSurfaces(qa);
    for (const needle of [mark.title, mark.ask, mark.reply, reqId]) expect(leaks(s, needle), needle).toEqual([]);
  });

  it("the receiving role (any of its agents) sees the sent ask and its own reply draft", async () => {
    for (const a of [be, be2]) {
      const s = await agentSurfaces(a);
      expect(s.mcp_list_inbox).toContain(mark.ask);
      expect(s.mcp_list_inbox).toContain(mark.reply); // the role's draft is shared by its agents
    }
  });

  it("the orchestrator sees the sent ask AND the receiver's reply draft (it is the one approving it)", async () => {
    const mine = (await api(w.orch, "GET", W(w, "/requests"))).body.find((r: any) => r.id === reqId);
    expect(JSON.stringify(mine)).toContain(mark.ask);
    expect(JSON.stringify(mine)).toContain(mark.reply);
    expect(JSON.stringify(await queue(w))).toContain(reqId);
  });

  it("the asking role never sees the receiver's unsent reply draft (any agent surface)", async () => {
    for (const [k, v] of Object.entries(await agentSurfaces(fe))) expect(v, `asker ${k}`).not.toContain(mark.reply);
  });

  it("once the orchestrator forwards the reply, the asking role sees it", async () => {
    const other = await agentDraft(fe, "backend", { title: uniq("QA-E2E-VFWD") });
    await act(w, other.id, "send");
    await tool(be.token, "reply_draft", { requestId: other.id, body: mark.reply + "-fwd" });
    expect(JSON.stringify((await tool(fe.token, "list_inbox")).data)).not.toContain(mark.reply + "-fwd");
    expect((await act(w, other.id, "send_reply")).status).toBe(200);
    expect(JSON.stringify((await tool(fe.token, "list_inbox")).data)).toContain(mark.reply + "-fwd");
  });

  it("the other direction: the asking role's follow-up draft... is hidden from the receiver until forwarded", async () => {
    const r = await agentDraft(fe, "backend", { title: uniq("QA-E2E-VFU"), body: "QA-E2E-FUBASE" });
    await act(w, r.id, "send");
    await act(w, r.id, "send_reply", "QA-E2E-FUANSWER");
    // the orchestrator's follow_up text is sent at once (it is the orchestrator's own click), so the receiver sees it
    expect((await act(w, r.id, "follow_up", "QA-E2E-FUTEXT")).status).toBe(200);
    expect(JSON.stringify((await tool(be.token, "list_inbox")).data)).toContain("QA-E2E-FUTEXT");
    expect(JSON.stringify((await tool(qa.token, "list_inbox")).data)).not.toContain("QA-E2E-FUTEXT");
  });

  it("an agent's own draft is the ONLY thing an orchestrator-created request reveals to its receiver: assigned work is visible to the receiver only", async () => {
    const t = uniq("QA-E2E-VJOB");
    const r = await api(w.orch, "POST", W(w, "/requests"), { receiverRoleId: w.roles.backend, kind: "question", title: t, body: "QA-E2E-JOBBODY", taskId: null, dueAt: null });
    expect(r.status).toBe(201);
    expect(leaks(await agentSurfaces(be), t).length).toBeGreaterThan(0);
    for (const a of [fe, qa]) expect(leaks(await agentSurfaces(a), t), a.roleKey).toEqual([]);
  });

  it("SSE stream is the orchestrator's: ids only, never message text; other-role activity needs no text to be signalled", async () => {
    const other = await agentDraft(fe, "backend", { title: uniq("QA-E2E-VSSE"), body: "QA-E2E-SSEBODY" });
    const run = async () => {
      await act(w, other.id, "send");
      await tool(be.token, "reply_draft", { requestId: other.id, body: "QA-E2E-SSEREPLY" });
    };
    const orch = await sseCollect(w.orch, 3500, run);
    expect(orch.status).toBe(200);
    expect(orch.text).toContain(other.id);
    expect(orch.text).not.toContain("QA-E2E-SSEBODY");
    expect(orch.text).not.toContain("QA-E2E-SSEREPLY");
    expect(orch.text).not.toContain("QA-E2E-VSSE");
  });

  it("agents cannot subscribe to the stream at all (human_only)", async () => {
    for (const a of [fe, be, qa]) expect((await asAgent(a.token, "GET", W(w, "/stream"))).status).toBe(403);
  });

  it("audit/events never store message text (orchestrator view)", async () => {
    const o = await orchSurfaces();
    for (const needle of [mark.ask, mark.reply]) expect(leaks({ audit: o.audit!, board_events: JSON.stringify((await board(w)).recentEvents) }, needle)).toEqual([]);
  });
});

describe("NTF-02 the asker learns nothing while the receiver is only drafting", () => {
  it("the asking role never gets the draft TEXT (inbox + board) while the receiving role is only drafting", async () => {
    const id = (await agentDraft(fe, "backend", { title: uniq("QA-E2E-ntf2") })).id;
    await act(w, id, "send");
    await tool(be.token, "reply_draft", { requestId: id, body: "QA-E2E-draft-only" });
    const s = await agentSurfaces(fe);
    expect(leaks(s, "QA-E2E-draft-only")).toEqual([]);
    expect(JSON.stringify((await tool(fe.token, "list_inbox")).data.items.find((i: any) => i.requestId === id).messages)).not.toContain("reply");
  });
  it("[SEC-11] the asker role's board/inbox status stays `sent` while the receiver drafts", async () => {
    const id = (await agentDraft(fe, "backend", { title: uniq("QA-E2E-ntf2b") })).id;
    await act(w, id, "send");
    await tool(be.token, "reply_draft", { requestId: id, body: "QA-E2E-draft-only" });
    const open = (await tool(fe.token, "read_board")).data.openRequests.find((r: any) => r.id === id);
    expect(open.status).toBe("sent");
  });
});

describe("SEC-01/02 handoff pack (orchestrator-only route) never includes unsent drafts", () => {
  it("lists the sent request, not the unsent draft's text, and no reply-draft text", async () => {
    const sentT = uniq("QA-E2E-HOSENT");
    const draftT = uniq("QA-E2E-HODRAFT");
    const s = await agentDraft(fe, "backend", { title: sentT, body: "QA-E2E-HOSENTBODY", taskId });
    await act(w, s.id, "send");
    await tool(be.token, "reply_draft", { requestId: s.id, body: "QA-E2E-HOREPLYDRAFT" });
    await agentDraft(fe, "backend", { title: draftT, body: "QA-E2E-HODRAFTBODY", taskId });
    const h = (await api(w.orch, "GET", W(w, `/tasks/${taskId}/handoff`))).text;
    expect(h).toMatch(/Frontend -> Backend/);
    expect(h).toContain("QA-E2E-HOSENTBODY");
    expect(h).not.toContain("QA-E2E-HODRAFTBODY");
    expect(h).not.toContain("QA-E2E-HOREPLYDRAFT");
    // agents have no handoff route
    expect((await asAgent(qa.token, "GET", W(w, `/tasks/${taskId}/handoff`))).status).toBe(403);
  });
});
