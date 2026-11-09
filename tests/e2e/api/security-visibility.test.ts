/**
 * C13 visibility. Bảo (asker) <-> Trang (receiver) are the parties; Minh is a non-admin outsider; Phong is an admin outsider.
 * Marker strings let us grep every surface for leaked text.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { known } from "../src/known.js";
import { MEMBER, W, act, api, board, createAgent, draftRequest, login, sseCollect, tool, uniq, type AgentCred, type Session } from "../src/helpers.js";

let bao: Session, trang: Session, minh: Session, phong: Session;
let minhAgent: AgentCred, phongAgent: AgentCred, trangAgent: AgentCred, baoAgent: AgentCred;
let taskId: string;
const mark = { title: uniq("QA-E2E-VT"), ask: uniq("QA-E2E-VASK"), reply: uniq("QA-E2E-VREPLY") };
let reqId: string;

async function surfaces(s: Session): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  out.board = JSON.stringify(await board(s));
  out.requests = (await api(s, "GET", W("/requests", s.slug))).text;
  out.inbox = (await api(s, "GET", W("/inbox", s.slug))).text;
  out.audit = (await api(s, "GET", W("/audit", s.slug))).text;
  out.decisions = (await api(s, "GET", W("/decisions", s.slug))).text;
  out.handoff = (await api(s, "GET", W(`/tasks/${taskId}/handoff`, s.slug))).text;
  return out;
}
const leaks = (o: Record<string, string>, needle: string) => Object.entries(o).filter(([, v]) => v.includes(needle)).map(([k]) => k);

beforeAll(async () => {
  [bao, trang, minh, phong] = await Promise.all([login(MEMBER.bao), login(MEMBER.trang), login(MEMBER.minh), login(MEMBER.phong)]);
  [minhAgent, phongAgent, trangAgent, baoAgent] = await Promise.all([createAgent(minh), createAgent(phong), createAgent(trang), createAgent(bao)]);
  taskId = (await board(bao)).tasks[0].id;
});

describe("unsent ask draft is invisible to everyone but the asker", () => {
  beforeAll(async () => {
    reqId = (await draftRequest(bao, MEMBER.trang, { title: mark.title, body: mark.ask, taskId })).id;
  });
  it("receiver, admin and outsider see neither title nor body on any surface", async () => {
    for (const s of [trang, minh, phong]) expect(leaks(await surfaces(s), mark.title), s.me.displayName).toEqual([]);
    for (const s of [trang, minh, phong]) expect(leaks(await surfaces(s), mark.ask), s.me.displayName).toEqual([]);
  });
  it("getRequest: asker 200, everybody else 404", async () => {
    expect((await api(bao, "GET", W(`/requests/${reqId}`))).status).toBe(200);
    for (const s of [trang, minh, phong]) expect((await api(s, "GET", W(`/requests/${reqId}`))).status).toBe(404);
  });
  it("their agents cannot see it through MCP read_board / list_inbox either", async () => {
    for (const a of [minhAgent, phongAgent, trangAgent]) {
      const b = JSON.stringify((await tool(a.token, "read_board")).data);
      const i = JSON.stringify((await tool(a.token, "list_inbox")).data);
      expect(b + i).not.toContain(mark.title);
      expect(b + i).not.toContain(reqId);
    }
  });
  it("outsider cannot act on it (404, not 403: existence is hidden)", async () => {
    expect((await act(minh, reqId, "cancel")).status).toBe(404);
    expect((await act(trang, reqId, "send_reply", "x")).status).toBe(404);
  });
});

describe("a sent request is visible to its parties (+ admin read-only), not to outsiders", () => {
  beforeAll(async () => {
    expect((await act(bao, reqId, "send")).status).toBe(200);
    await tool(trangAgent.token, "reply_draft", { requestId: reqId, body: mark.reply });
  });

  it("outsider (member) sees nothing: board.openRequests, recentEvents, requests, inbox, audit, MCP", async () => {
    const s = await surfaces(minh);
    for (const needle of [mark.title, mark.ask, mark.reply, reqId]) {
      expect(leaks({ ...s, handoff: "" }, needle), needle).toEqual([]);
    }
    const bm = JSON.stringify((await tool(minhAgent.token, "read_board")).data);
    expect(bm).not.toContain(reqId);
    expect(bm).not.toContain(mark.title);
  });

  it("[SEC-01 fixed] handoff pack must not list requests the viewer is not a party to (title/status/participants leak)", async () => {
    const h = (await api(minh, "GET", W(`/tasks/${taskId}/handoff`))).text;
    expect(h).not.toContain(mark.title);
  });

  it("admin outsider sees the SENT ask but never the receiver's reply DRAFT", async () => {
    const mine = (await api(phong, "GET", W("/requests"))).body.find((r: any) => r.id === reqId);
    expect(mine).toBeTruthy();
    expect(JSON.stringify(mine)).toContain(mark.ask);
    for (const [k, v] of Object.entries(await surfaces(phong))) expect(v, `admin ${k}`).not.toContain(mark.reply);
    // admin's AGENT is not an admin viewer (least privilege): it must not see the request at all
    expect(JSON.stringify((await tool(phongAgent.token, "read_board")).data)).not.toContain(reqId);
  });

  it("the asker never sees the receiver's unsent reply draft (any surface, human or agent)", async () => {
    for (const [k, v] of Object.entries(await surfaces(bao))) expect(v, `asker ${k}`).not.toContain(mark.reply);
    expect(JSON.stringify((await tool(baoAgent.token, "list_inbox")).data)).not.toContain(mark.reply);
    expect(JSON.stringify((await tool(baoAgent.token, "read_board")).data)).not.toContain(mark.reply);
  });

  it("the receiver does see its own draft", async () => {
    expect((await api(trang, "GET", W("/inbox"))).text).toContain(mark.reply);
  });

  it("SSE stream: the outsider receives no notification mentioning the request id; a party does", async () => {
    const other = (await draftRequest(bao, MEMBER.trang, { title: uniq("QA-E2E-VSSE"), body: "QA-E2E-SSEBODY" })).id;
    const run = async () => {
      await act(bao, other, "send");
      await tool(trangAgent.token, "reply_draft", { requestId: other, body: "QA-E2E-SSEREPLY" });
    };
    const [outsider, party] = await Promise.all([
      sseCollect(minh, 3500),
      sseCollect(trang, 3500, run),
    ]);
    expect(outsider.status).toBe(200);
    expect(outsider.text).not.toContain(other);
    expect(outsider.text).not.toContain("QA-E2E");
    expect(party.text).toContain(other);
    expect(party.text).not.toContain("QA-E2E-SSEBODY"); // ids only, never text
  });

  it("audit log of an outsider member never carries other people's request text", async () => {
    const a = (await api(minh, "GET", W("/audit"))).text;
    expect(a).not.toContain(mark.title);
    expect(a).not.toContain(reqId);
  });

  it("audit/events never store message text (admin view)", async () => {
    const a = (await api(phong, "GET", W("/audit"))).text;
    expect(a).not.toContain(mark.ask);
    expect(a).not.toContain(mark.reply);
    expect(JSON.stringify((await board(phong)).recentEvents)).not.toContain(mark.ask);
  });
});

describe("NTF-02 the asker learns nothing while the receiver is only drafting", () => {
  known("SEC-11", "no SSE change and no status change is visible to the asker when the receiver (agent) saves a reply DRAFT", async () => {
    const id = (await draftRequest(bao, MEMBER.trang, { title: uniq("QA-E2E-ntf2") })).id;
    await act(bao, id, "send");
    const asker = await sseCollect(bao, 3500, async () => {
      await tool(trangAgent.token, "reply_draft", { requestId: id, body: "QA-E2E-draft-only" });
    });
    const status = (await api(bao, "GET", W("/requests"))).body.find((r: any) => r.id === id).status;
    expect(asker.text).not.toContain(id);
    expect(status).toBe("sent");
  });
});

describe("SEC-02 handoff timeline", () => {
  it("[SEC-02 fixed] task timeline in the handoff pack must not reveal request.* events (type + actor) of requests the viewer cannot see", async () => {
    const h = (await api(minh, "GET", W(`/tasks/${taskId}/handoff`))).text;
    const lines = h.split("\n").filter((l) => /\brequest\.(created|sent|reply_drafted)\b/.test(l));
    expect(lines).toEqual([]);
  });
});
