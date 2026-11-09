import { describe, expect, it } from "vitest";
import { Board, Request as RequestSchema } from "@officehub/shared";
import { ApiClientError, createMockClient, type ApiClient } from "../lib/api";
import { errorMessage } from "../lib/errors";

const PHONG = "adcf8a47-7647-4b1f-952a-76723d7a3413"; // admin, owns claude-code agent
const TRANG = "97c2557b-189e-4b54-8c73-a89dfa40e274";
const BAO = "7f7870ee-bc43-47b5-84fc-001dc3081d57";
const LAN = "ed5375c3-a3b1-400c-a0c3-70593a3824e6";
const PHONG_AGENT = "c9982750-58ec-4cd5-a025-13ce3d526962";
const REQ_REPLY_DRAFTED = "5b47fd49-596d-4b96-860a-07caac67b9d0"; // Bảo asks Phong, reply drafted by agent
const REQ_DRAFT = "e".repeat(0); // placeholder, resolved below
void REQ_DRAFT;
const S = "tripflix";

function setup() {
  let who: string | null = null;
  const api = createMockClient({ session: { get: () => who, set: (v) => (who = v) } });
  const as = async (id: string): Promise<ApiClient> => {
    await api.devLogin(id);
    return api;
  };
  return { api, as };
}

async function code(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiClientError) return e.code;
    throw e;
  }
  return "ok";
}

describe("mock client: seed and session", () => {
  it("requires a session, then returns contract-shaped data", async () => {
    const { api, as } = setup();
    expect(await code(api.me())).toBe("unauthenticated");
    await as(PHONG);
    expect((await api.me()).displayName).toBe("Phong");
    const board = await api.board(S);
    expect(Board.safeParse(board).success).toBe(true);
    expect(board.members).toHaveLength(7);
    expect(await code(api.board("other-workspace"))).toBe("not_found");
  });
});

describe("mock client: visibility (canSeeMessage)", () => {
  it("hides the receiver's reply draft from the asker and admin, shows it to the receiver", async () => {
    const { api, as } = setup();
    await as(PHONG);
    const mine = (await api.listRequests(S)).find((r) => r.id === REQ_REPLY_DRAFTED)!;
    expect(mine.messages.some((m) => m.kind === "reply" && m.sentById === null)).toBe(true);

    await as(BAO); // asker
    const asker = (await api.listRequests(S)).find((r) => r.id === REQ_REPLY_DRAFTED)!;
    expect(asker.messages.every((m) => m.sentById !== null)).toBe(true);
    expect(asker.messages).toHaveLength(1);

    await as(LAN); // unrelated member: cannot see the request at all
    expect((await api.listRequests(S)).some((r) => r.id === REQ_REPLY_DRAFTED)).toBe(false);
    expect(await code(api.actOnRequest(S, REQ_REPLY_DRAFTED, { action: "send_reply" }))).toBe("not_found");
  });

  it("does not leak drafts through the board either", async () => {
    const { api, as } = setup();
    await as(BAO);
    const board = await api.board(S);
    const r = board.openRequests.find((x) => x.id === REQ_REPLY_DRAFTED)!;
    expect(r.messages.every((m) => m.sentById !== null)).toBe(true);
  });

  it("an unsent ask draft is invisible to the receiver", async () => {
    const { api, as } = setup();
    await as(PHONG);
    const draft = await api.createRequest(S, { receiverId: TRANG, title: "Nháp thử", body: "Nội dung nháp", taskId: null, dueAt: null });
    expect(draft.status).toBe("draft");
    await as(TRANG);
    expect((await api.listRequests(S)).some((r) => r.id === draft.id)).toBe(false);
    expect((await api.inbox(S)).some((r) => r.id === draft.id)).toBe(false);
  });
});

describe("mock client: agents cannot send", () => {
  it("rejects human-only actions from an agent token with human_only", async () => {
    const { api, as } = setup();
    await as(PHONG);
    const agent = api.server.agent(PHONG_AGENT);
    const draft = agent.sendRequest(S, { receiverId: BAO, title: "Agent hỏi", body: "Anh Bảo ơi, cho hỏi chút", taskId: null, dueAt: null });
    expect(draft.status).toBe("draft");
    expect(draft.messages[0]).toMatchObject({ authoredBy: "agent", sentById: null });
    for (const action of ["send", "send_reply", "accept", "follow_up", "cancel"] as const) {
      try {
        agent.act(S, draft.id, { action, body: "x" });
        expect.unreachable();
      } catch (e) {
        expect((e as ApiClientError).code).toMatch(/human_only|invalid_state/);
      }
    }
    // specifically: send on a draft is human_only
    expect(() => agent.act(S, draft.id, { action: "send" })).toThrowError(/human click/);
    // still a draft
    expect((await api.listRequests(S)).find((r) => r.id === draft.id)!.status).toBe("draft");
    // the human can send it
    const sent = await api.actOnRequest(S, draft.id, { action: "send" });
    expect(sent.status).toBe("sent");
  });

  it("the receiver's agent may draft a reply but not send it; other agents get wrong_side", async () => {
    const { api, as } = setup();
    await as(TRANG);
    const asked = await api.createRequest(S, { receiverId: PHONG, title: "Hỏi Phong", body: "Cho mình hỏi?", taskId: null, dueAt: null });
    await api.actOnRequest(S, asked.id, { action: "send" });
    const phongAgent = api.server.agent(PHONG_AGENT);
    const r = phongAgent.replyDraft(S, asked.id, "Đây là bản nháp trả lời");
    expect(r.status).toBe("reply_drafted");
    expect(() => phongAgent.act(S, asked.id, { action: "send_reply" })).toThrowError(/human click/);
    // the asker's own agent is on the wrong side; an unrelated member's agent can't even see the request
    const { agent: trangAgent } = await api.createAgent(S, { kind: "codex", label: "Codex của Trang", scopes: ["request:draft"] });
    expect(() => api.server.agent(trangAgent.id).replyDraft(S, asked.id, "Sai phía")).toThrowError(/receiver/);
    const baoAgent = api.server.agent(api.server.agents.find((a) => a.ownerId === BAO)!.id);
    expect(() => baoAgent.replyDraft(S, asked.id, "Ngoài luồng")).toThrowError(/Không tìm thấy/);
  });

  it("revoked agents are rejected", async () => {
    const { api, as } = setup();
    await as(PHONG);
    await api.revokeAgent(S, PHONG_AGENT);
    expect(() => api.server.agent(PHONG_AGENT)).toThrowError(/thu hồi/);
  });
});

describe("mock client: state machine and body rules", () => {
  it("follows the send -> draft_reply -> send_reply -> accept flow", async () => {
    const { api, as } = setup();
    await as(TRANG);
    const r0 = await api.createRequest(S, { receiverId: PHONG, title: "Luồng đầy đủ", body: "Câu hỏi", taskId: null, dueAt: null });
    expect(RequestSchema.safeParse(r0).success).toBe(true);
    expect((await api.actOnRequest(S, r0.id, { action: "send" })).status).toBe("sent");

    // wrong side: asker cannot reply; receiver cannot accept
    expect(await code(api.actOnRequest(S, r0.id, { action: "send_reply", body: "tự trả lời" }))).toBe("wrong_side");

    await as(PHONG);
    expect((await api.inbox(S)).some((r) => r.id === r0.id)).toBe(true);
    expect(await code(api.actOnRequest(S, r0.id, { action: "accept" }))).toBe("invalid_state");
    expect((await api.actOnRequest(S, r0.id, { action: "draft_reply", body: "Nháp" })).status).toBe("reply_drafted");
    const replied = await api.actOnRequest(S, r0.id, { action: "send_reply", body: "Bản đã sửa" });
    expect(replied.status).toBe("replied");
    const reply = replied.messages.find((m) => m.kind === "reply")!;
    expect(reply).toMatchObject({ body: "Bản đã sửa", sentById: PHONG, editedBeforeSend: true });

    await as(TRANG);
    expect((await api.actOnRequest(S, r0.id, { action: "accept" })).status).toBe("closed");
    expect(await code(api.actOnRequest(S, r0.id, { action: "cancel" }))).toBe("invalid_state");
  });

  it("enforces bodyRequirement: required, optional, ignored", async () => {
    const { api, as } = setup();
    await as(TRANG);
    const r = await api.createRequest(S, { receiverId: PHONG, title: "Body rules", body: "Gốc", taskId: null, dueAt: null });
    // send: body optional; a changed body marks editedBeforeSend
    const sent = await api.actOnRequest(S, r.id, { action: "send", body: "Gốc đã chỉnh" });
    expect(sent.messages[0]).toMatchObject({ body: "Gốc đã chỉnh", editedBeforeSend: true });

    await as(PHONG);
    // send_reply from "sent" requires a body
    expect(await code(api.actOnRequest(S, r.id, { action: "send_reply" }))).toBe("validation_failed");
    // draft_reply requires a body
    expect(await code(api.actOnRequest(S, r.id, { action: "draft_reply" }))).toBe("validation_failed");
    await api.actOnRequest(S, r.id, { action: "draft_reply", body: "Nháp trả lời" });
    // send_reply from reply_drafted: body optional, unchanged draft is not "edited"
    const replied = await api.actOnRequest(S, r.id, { action: "send_reply" });
    expect(replied.messages.find((m) => m.kind === "reply")).toMatchObject({ body: "Nháp trả lời", editedBeforeSend: false });

    await as(TRANG);
    // follow_up requires a body
    expect(await code(api.actOnRequest(S, r.id, { action: "follow_up" }))).toBe("validation_failed");
    const again = await api.actOnRequest(S, r.id, { action: "follow_up", body: "Hỏi thêm" });
    expect(again.status).toBe("sent");
    expect(again.messages.at(-1)).toMatchObject({ kind: "follow_up", sentById: TRANG });
  });

  it("agent-drafted reply sends as-is, keeping authoredBy=agent and approver", async () => {
    const { api, as } = setup();
    await as(PHONG);
    const replied = await api.actOnRequest(S, REQ_REPLY_DRAFTED, { action: "send_reply" });
    const reply = replied.messages.find((m) => m.kind === "reply")!;
    expect(reply).toMatchObject({ authoredBy: "agent", sentById: PHONG, editedBeforeSend: false });
  });
});

describe("mock client: secret rejection", () => {
  it.each([
    ["sk-live-abc", "openai-key"],
    ["ghp_abcdef", "github-token"],
    ["AKIAIOSFODNN7", "aws-access-key"],
  ])("rejects %s and stores nothing", async (secret, rule) => {
    const { api, as } = setup();
    await as(PHONG);
    const before = (await api.listRequests(S)).length;
    const e = await api
      .createRequest(S, { receiverId: TRANG, title: "Key", body: `dùng ${secret} nhé`, taskId: null, dueAt: null })
      .catch((x: ApiClientError) => x);
    expect(e).toBeInstanceOf(ApiClientError);
    expect((e as ApiClientError).code).toBe("secret_detected");
    expect((e as ApiClientError).rule).toBe(rule);
    expect((e as ApiClientError).message).not.toContain(secret);
    expect((await api.listRequests(S)).length).toBe(before);
    expect(errorMessage(e)).toBe(`Tin có vẻ chứa key (${rule}). Không lưu gì. Hãy gửi key qua kênh bí mật.`);
  });

  it("scans reply bodies, decisions and status text too", async () => {
    const { api, as } = setup();
    await as(PHONG);
    expect(await code(api.actOnRequest(S, REQ_REPLY_DRAFTED, { action: "send_reply", body: "key ghp_xyz" }))).toBe("secret_detected");
    expect((await api.listRequests(S)).find((r) => r.id === REQ_REPLY_DRAFTED)!.status).toBe("reply_drafted");
    expect(await code(api.recordDecision(S, { title: "t", body: "b", rationale: "AKIAxxxx", taskId: null }))).toBe("secret_detected");
    expect(await code(api.updateMyStatus(S, { presence: "working", doing: "dùng sk-abc", branch: null, waitingOn: [] }))).toBe("secret_detected");
  });
});

describe("mock client: decisions, agents, status, realtime", () => {
  it("requires a rationale and records the human as decider", async () => {
    const { api, as } = setup();
    await as(BAO);
    expect(await code(api.recordDecision(S, { title: "t", body: "b", rationale: " ", taskId: null }))).toBe("validation_failed");
    const d = await api.recordDecision(S, { title: "Dùng pnpm", body: "Toàn repo", rationale: "Nhanh hơn", taskId: null });
    expect(d.decidedById).toBe(BAO);
    expect((await api.listDecisions(S))[0]!.id).toBe(d.id);
  });

  it("creates an agent with a one-time token and a prefix from the random part", async () => {
    const { api, as } = setup();
    await as(TRANG);
    const { agent, token } = await api.createAgent(S, { kind: "claude-code", label: "Claude của Trang", scopes: ["board:read"] });
    expect(token.startsWith("oh_agent_")).toBe(true);
    expect(token.slice("oh_agent_".length).startsWith(agent.tokenPrefix)).toBe(true);
    const mine = await api.listMyAgents(S);
    expect(mine.map((a) => a.id)).toContain(agent.id);
    expect(JSON.stringify(mine)).not.toContain(token);
    await as(BAO);
    expect((await api.listMyAgents(S)).some((a) => a.id === agent.id)).toBe(false);
    expect(await code(api.revokeAgent(S, agent.id))).toBe("forbidden");
    await as(TRANG);
    await api.revokeAgent(S, agent.id);
    expect((await api.listMyAgents(S)).find((a) => a.id === agent.id)!.revokedAt).not.toBeNull();
  });

  it("emits change events and updates the card", async () => {
    const { api, as } = setup();
    await as(LAN);
    const seen: string[] = [];
    const off = api.subscribe(S, (e) => seen.push(e.kind));
    await api.updateMyStatus(S, { presence: "working", doing: "Vẽ icon", branch: "feat/icons", waitingOn: [BAO] });
    await Promise.resolve();
    off();
    expect(seen).toContain("status");
    const card = (await api.board(S)).cards.find((c) => c.memberId === LAN)!;
    expect(card).toMatchObject({ presence: "working", doing: "Vẽ icon", waitingOn: [BAO], updatedBy: "human" });
  });

  it("markRead clears the unread flag", async () => {
    const { api, as } = setup();
    await as(PHONG);
    expect((await api.inbox(S)).find((r) => r.id === REQ_REPLY_DRAFTED)!.unreadForViewer).toBe(true);
    await api.markRead(S, REQ_REPLY_DRAFTED);
    expect((await api.inbox(S)).find((r) => r.id === REQ_REPLY_DRAFTED)!.unreadForViewer).toBe(false);
  });

  it("handoff markdown omits drafts of the other side", async () => {
    const { api, as } = setup();
    await as(BAO);
    const taskId = (await api.listRequests(S)).find((r) => r.id === REQ_REPLY_DRAFTED)!.taskId!;
    const { markdown } = await api.handoff(S, taskId);
    expect(markdown).toContain("Bàn giao");
    expect(markdown).not.toContain("Đã thêm OPENAI_API_KEY vào kho bí mật");
  });
});
