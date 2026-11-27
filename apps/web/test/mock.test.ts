import { describe, expect, it } from "vitest";
import { Board, DecisionProposal, Request as RequestSchema, Role, StatusCard } from "@officehub/shared";
import { ApiClientError, MOCK_IDS, MOCK_SLUG, createMockClient, type ApiClient } from "../lib/api";
import { errorMessage } from "../lib/errors";

const S = MOCK_SLUG;
const ME = MOCK_IDS.orchestrator;
const R = MOCK_IDS.role;
const A = MOCK_IDS.agent;
const Q = MOCK_IDS.request;

function setup() {
  let who: string | null = null;
  const api = createMockClient({ session: { get: () => who, set: (v) => (who = v) } });
  const login = async (): Promise<ApiClient> => {
    await api.devLogin(ME);
    return api;
  };
  return { api, login, agent: (key: keyof typeof A) => api.server.agent(A[key]) };
}

async function code(p: Promise<unknown> | (() => unknown)) {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    if (e instanceof ApiClientError) return e.code;
    throw e;
  }
  return "ok";
}

describe("mock: seed and session (v0.6 shapes)", () => {
  it("requires a session, then returns one orchestrator and the six roles", async () => {
    const { api, login } = setup();
    expect(await code(api.me())).toBe("unauthenticated");
    expect(await code(api.devLogin(crypto.randomUUID()))).toBe("not_found");
    await login();
    expect((await api.me()).workspaceSlug).toBe(S);
    const board = await api.board(S);
    expect(Board.safeParse(board).success).toBe(true);
    expect(board.roles.map((r) => r.key)).toEqual(["leader", "backend", "business", "design", "frontend", "qa"]); // wave, then name
    for (const r of board.roles) expect(Role.safeParse(r).success).toBe(true);
    for (const c of board.cards) expect(StatusCard.safeParse(c).success).toBe(true);
    for (const r of await api.listRequests(S)) expect(RequestSchema.safeParse(r).success, r.title).toBe(true);
    for (const p of await api.listProposals(S)) expect(DecisionProposal.safeParse(p).success).toBe(true);
    expect(board.orchestrator.id).toBe(ME);
    expect(await code(api.board("other"))).toBe("not_found");
    expect(await api.devMembers(S)).toHaveLength(1);
  });

  it("password login works with the mock credentials only", async () => {
    const { api } = setup();
    expect(await code(api.passwordLogin("phong@officehub.dev", "sai-mat-khau"))).toBe("unauthenticated");
    await api.passwordLogin("phong@officehub.dev", "officehub-demo");
    expect((await api.me()).id).toBe(ME);
    expect(await code(api.changePassword(S, { current: "x", next: "mat-khau-moi-123" }))).toBe("unauthenticated");
    await api.changePassword(S, { current: "officehub-demo", next: "mat-khau-moi-123" });
  });
});

describe("mock: approval queue", () => {
  it("holds drafts, reply drafts, answers and asks-to-me; blockers first; the pending proposal", async () => {
    const { api, login } = setup();
    await login();
    const q = await api.queue(S);
    const ids = q.requests.map((r) => r.id);
    for (const id of [Q.blockerDraft, Q.contractDraft, Q.questionDraft, Q.draftToMe, Q.replyDrafted, Q.askingMe, Q.repliedReview, Q.repliedAuto]) expect(ids).toContain(id);
    expect(ids).not.toContain(Q.assigned); // waiting on Frontend, not on the human
    expect(ids).not.toContain(Q.closed);
    const kinds = q.requests.map((r) => r.kind);
    expect(kinds.lastIndexOf("blocker")).toBeLessThan(kinds.findIndex((k) => k !== "blocker"));
    expect(q.proposals.map((p) => p.id)).toEqual([MOCK_IDS.proposal.pending]);
  });

  it("the orchestrator sees every draft, agent text keeps its role", async () => {
    const { api, login } = setup();
    await login();
    const r = await api.getRequest(S, Q.replyDrafted);
    const reply = r.messages.find((m) => m.kind === "reply")!;
    expect(reply).toMatchObject({ sentById: null, authoredBy: "agent", authorRoleId: R.design });
  });
});

describe("mock: visibility per role (canSeeMessage)", () => {
  it("another role never sees an unforwarded draft", async () => {
    const { api, login, agent } = setup();
    await login();
    // Frontend's blocker draft to Backend: Backend's agent cannot see it, Frontend's can.
    expect(agent("backend").inbox().some((r) => r.id === Q.blockerDraft)).toBe(false);
    expect(agent("frontend").inbox().some((r) => r.id === Q.blockerDraft)).toBe(true);
    expect(await code(() => agent("backend").replyDraft(Q.blockerDraft, "x"))).toBe("not_found");
    // Design's reply draft is hidden from the asking role (Frontend) until forwarded.
    const fe = agent("frontend").inbox().find((r) => r.id === Q.replyDrafted)!;
    expect(fe.messages.some((m) => m.kind === "reply")).toBe(false);
    await api.actOnRequest(S, Q.replyDrafted, { action: "send_reply" });
    expect(agent("frontend").inbox().find((r) => r.id === Q.replyDrafted)!.messages.some((m) => m.kind === "reply")).toBe(true);
    // Unrelated role sees nothing.
    expect(agent("qa").inbox().some((r) => r.id === Q.replyDrafted)).toBe(false);
  });
});

describe("mock: agents cannot do human steps", () => {
  it("every human-only action from an agent token fails; the draft stays a draft", async () => {
    const { api, login, agent } = setup();
    await login();
    const fe = agent("frontend");
    const d = fe.sendRequest({ to: "backend", title: "Agent hỏi", body: "Route nào?" });
    expect(d.status).toBe("draft");
    expect(d.messages[0]).toMatchObject({ authoredBy: "agent", authorRoleId: R.frontend, sentById: null });
    for (const action of ["send", "send_reply", "accept", "follow_up", "cancel"] as const) {
      expect(await code(() => fe.act(d.id, { action, body: "x" }))).toMatch(/human_only|invalid_state/);
    }
    expect(() => fe.act(d.id, { action: "send" })).toThrowError(/orchestrator/);
    expect((await api.getRequest(S, d.id)).status).toBe("draft");
  });

  it("only the receiving role drafts a reply (wrong_side for the asker)", async () => {
    const { api, login, agent } = setup();
    await login();
    const d = agent("frontend").sendRequest({ to: "backend", title: "Hỏi", body: "?" });
    await api.actOnRequest(S, d.id, { action: "send" });
    expect(await code(() => agent("frontend").replyDraft(d.id, "tự trả lời"))).toBe("wrong_side");
    expect(agent("backend").replyDraft(d.id, "Trả lời").status).toBe("reply_drafted");
  });

  it("scopes and revocation are enforced", async () => {
    const { api, login } = setup();
    await login();
    const { agent } = await api.createAgent(S, { roleId: R.qa, kind: "codex", label: "Chỉ đọc", scopes: ["board:read"] });
    expect(await code(() => api.server.agent(agent.id).sendRequest({ to: "backend", title: "t", body: "b" }))).toBe("insufficient_scope");
    expect(await code(() => api.server.agent(agent.id).proposeDecision({ title: "t", body: "", rationale: "r" }))).toBe("insufficient_scope");
    await api.revokeAgent(S, agent.id);
    expect(await code(() => api.server.agent(agent.id))).toBe("token_revoked");
  });
});

describe("mock: state machine, body rules, auto-forward", () => {
  it("flow A: draft → send → reply_draft → send_reply (edited) → accept", async () => {
    const { api, login, agent } = setup();
    await login();
    const d = agent("frontend").sendRequest({ to: "backend", title: "Luồng A", body: "Câu hỏi gốc" });
    const sent = await api.actOnRequest(S, d.id, { action: "send", body: "Câu hỏi đã sửa" });
    expect(sent.status).toBe("sent");
    expect(sent.messages[0]).toMatchObject({ body: "Câu hỏi đã sửa", editedBeforeSend: true, sentById: ME, authoredBy: "agent" });
    agent("backend").replyDraft(d.id, "Nháp trả lời");
    const replied = await api.actOnRequest(S, d.id, { action: "send_reply", body: "Trả lời đã sửa" });
    expect(replied.status).toBe("replied");
    expect(replied.messages.find((m) => m.kind === "reply")).toMatchObject({ body: "Trả lời đã sửa", editedBeforeSend: true, sentById: ME });
    expect((await api.actOnRequest(S, d.id, { action: "accept" })).status).toBe("closed");
    expect(await code(api.actOnRequest(S, d.id, { action: "cancel" }))).toBe("invalid_state");
  });

  it("bodyRequirement: required for follow_up and send_reply from sent; ignored for accept", async () => {
    const { api, login } = setup();
    await login();
    expect(await code(api.actOnRequest(S, Q.askingMe, { action: "send_reply" }))).toBe("validation_failed");
    expect((await api.actOnRequest(S, Q.askingMe, { action: "send_reply", body: "Đã đặt secret." })).status).toBe("replied");
    expect(await code(api.actOnRequest(S, Q.repliedReview, { action: "follow_up" }))).toBe("validation_failed");
    const again = await api.actOnRequest(S, Q.repliedReview, { action: "follow_up", body: "Bài nào đỏ?" });
    expect(again.status).toBe("sent");
    expect(again.messages.at(-1)).toMatchObject({ kind: "follow_up", authoredBy: "human", sentById: ME });
  });

  it("flow C: a draft addressed to the orchestrator is forwarded, then answered", async () => {
    const { api, login } = setup();
    await login();
    expect((await api.actOnRequest(S, Q.draftToMe, { action: "send" })).status).toBe("sent");
    expect((await api.queue(S)).requests.find((r) => r.id === Q.draftToMe)?.status).toBe("sent");
    expect((await api.actOnRequest(S, Q.draftToMe, { action: "send_reply", body: "Chỉ office-hub-dev." })).status).toBe("replied");
  });

  it("autoForwardReply: question only, only with send; the reply then skips the second click", async () => {
    const { api, login, agent } = setup();
    await login();
    expect(await code(api.actOnRequest(S, Q.blockerDraft, { action: "send", autoForwardReply: true }))).toBe("validation_failed");
    expect(await code(api.actOnRequest(S, Q.repliedReview, { action: "accept", autoForwardReply: true }))).toBe("validation_failed");
    const sent = await api.actOnRequest(S, Q.questionDraft, { action: "send", autoForwardReply: true });
    expect(sent.autoForwardReply).toBe(true);
    const r = agent("backend").replyDraft(Q.questionDraft, "Theo vai trò.");
    expect(r.status).toBe("replied");
    expect(r.messages.find((m) => m.kind === "reply")!.sentById).toBe(ME);
    // A follow-up drops the pre-approval.
    const f = await api.actOnRequest(S, Q.questionDraft, { action: "follow_up", body: "Giới hạn bao nhiêu?" });
    expect(f.autoForwardReply).toBe(false);
    expect(agent("backend").replyDraft(Q.questionDraft, "60/phút").status).toBe("reply_drafted");
  });

  it("the orchestrator's own request is created already sent; contract_change only to the Leader", async () => {
    const { api, login, agent } = setup();
    await login();
    const r = await api.createRequest(S, { receiverRoleId: R.backend, kind: "review", title: "Xem PR", body: "PR #41", taskId: null, dueAt: null });
    expect(r).toMatchObject({ status: "sent", askerRoleId: null, receiverRoleId: R.backend });
    expect(r.messages[0]).toMatchObject({ authoredBy: "human", sentById: ME });
    expect((await api.queue(S)).requests.some((x) => x.id === r.id)).toBe(false);
    expect(await code(api.createRequest(S, { receiverRoleId: R.backend, kind: "contract_change", title: "t", body: "b", taskId: null, dueAt: null }))).toBe("validation_failed");
    expect((await api.createRequest(S, { receiverRoleId: R.leader, kind: "contract_change", title: "t", body: "b", taskId: null, dueAt: null })).status).toBe("sent");
    expect(await code(() => agent("frontend").sendRequest({ to: "backend", kind: "contract_change", title: "t", body: "b" }))).toBe("validation_failed");
    expect(await code(() => agent("frontend").sendRequest({ to: "frontend", title: "t", body: "b" }))).toBe("validation_failed");
  });
});

describe("mock: secret rejection", () => {
  it.each([
    ["sk-live-abc", "openai-key"],
    ["ghp_abcdef", "github-token"],
    ["AKIAIOSFODNN7", "aws-access-key"],
  ])("rejects %s and stores nothing", async (secret, rule) => {
    const { api, login } = setup();
    await login();
    const before = (await api.listRequests(S)).length;
    const e = await api.createRequest(S, { receiverRoleId: R.backend, title: "Key", body: `dùng ${secret} nhé`, taskId: null, dueAt: null }).catch((x: ApiClientError) => x);
    expect((e as ApiClientError).code).toBe("secret_detected");
    expect((e as ApiClientError).rule).toBe(rule);
    expect((e as ApiClientError).message).not.toContain(secret);
    expect((await api.listRequests(S)).length).toBe(before);
    expect(errorMessage(e)).toBe(`Tin có vẻ chứa key (${rule}). Không lưu gì. Hãy gửi key qua kênh bí mật.`);
  });

  it("scans edits on forward, decisions, proposals, roles, cards and agent drafts", async () => {
    const { api, login, agent } = setup();
    await login();
    expect(await code(api.actOnRequest(S, Q.replyDrafted, { action: "send_reply", body: "key ghp_xyz" }))).toBe("secret_detected");
    expect((await api.getRequest(S, Q.replyDrafted)).status).toBe("reply_drafted");
    expect(await code(api.recordDecision(S, { title: "t", body: "b", rationale: "AKIAxxxx", taskId: null }))).toBe("secret_detected");
    expect(await code(api.actOnProposal(S, MOCK_IDS.proposal.pending, { action: "accept", rationale: "sk-123" }))).toBe("secret_detected");
    expect(await code(api.updateRole(S, R.qa, { mission: "dùng sk-abc" }))).toBe("secret_detected");
    expect(await code(api.updateRoleStatus(S, R.qa, { presence: "working", doing: "sk-abc", branch: null, waitingOn: [] }))).toBe("secret_detected");
    expect(await code(() => agent("qa").sendRequest({ to: "backend", title: "t", body: "ghp_123" }))).toBe("secret_detected");
  });
});

describe("mock: decisions and proposals (human only)", () => {
  it("record requires a rationale; roleIds must be roles", async () => {
    const { api, login } = setup();
    await login();
    expect(await code(api.recordDecision(S, { title: "t", body: "b", rationale: " ", taskId: null }))).toBe("validation_failed");
    expect(await code(api.recordDecision(S, { title: "t", body: "b", rationale: "r", taskId: null, roleIds: [crypto.randomUUID()] }))).toBe("validation_failed");
    const d = await api.recordDecision(S, { title: "Dùng pnpm", body: "", rationale: "Nhanh", taskId: null, roleIds: [R.backend] });
    expect(d).toMatchObject({ decidedById: ME, roleIds: [R.backend], proposalId: null });
  });

  it("accepting an edited proposal records a decision linked to it; it cannot be handled twice", async () => {
    const { api, login } = setup();
    await login();
    const { proposal, decision } = await api.actOnProposal(S, MOCK_IDS.proposal.pending, { action: "accept", title: "Tối đa 20 nháp", roleIds: [R.backend, R.qa] });
    expect(proposal.status).toBe("accepted");
    expect(decision).toMatchObject({ title: "Tối đa 20 nháp", proposalId: proposal.id, roleIds: [R.backend, R.qa], decidedById: ME });
    expect(proposal.decisionId).toBe(decision!.id);
    expect(await code(api.actOnProposal(S, proposal.id, { action: "reject" }))).toBe("invalid_state");
    expect((await api.queue(S)).proposals).toHaveLength(0);
  });

  it("an agent proposal lands in the queue; reject keeps it listed as rejected", async () => {
    const { api, login, agent } = setup();
    await login();
    const p = agent("qa").proposeDecision({ title: "E2E chạy mỗi PR", body: "", rationale: "Bắt lỗi sớm" });
    expect((await api.queue(S)).proposals.map((x) => x.id)).toContain(p.id);
    const res = await api.actOnProposal(S, p.id, { action: "reject" });
    expect(res).toMatchObject({ decision: null, proposal: { status: "rejected" } });
    expect((await api.listProposals(S)).find((x) => x.id === p.id)?.status).toBe("rejected");
  });
});

describe("mock: roles, cards, agents", () => {
  it("updateRole edits owned paths and validates wave", async () => {
    const { api, login } = setup();
    await login();
    const r = await api.updateRole(S, R.frontend, { ownedPaths: ["apps/web/**", "docs/web/**"], handoffPath: "apps/web/HANDOFF.md", wave: 2 });
    expect(r.ownedPaths).toEqual(["apps/web/**", "docs/web/**"]);
    expect(await code(api.updateRole(S, R.frontend, { wave: 12 }))).toBe("validation_failed");
    expect(await code(api.updateRole(S, R.frontend, { ownedPaths: [" "] }))).toBe("validation_failed");
  });

  it("manual status keeps the agent's paths and drops waiting on itself", async () => {
    const { api, login } = setup();
    await login();
    const before = (await api.board(S)).cards.find((c) => c.roleId === R.backend)!;
    await api.updateRoleStatus(S, R.backend, { presence: "offline", doing: null, branch: null, waitingOn: [R.backend, R.leader] });
    const c = (await api.board(S)).cards.find((x) => x.roleId === R.backend)!;
    expect(c).toMatchObject({ presence: "offline", updatedBy: "human", waitingOn: [R.leader], paths: before.paths });
  });

  it("an agent posts only its own role's card, with paths", async () => {
    const { api, login, agent } = setup();
    await login();
    agent("qa").postStatus({ presence: "working", doing: "Viết E2E", branch: "qa/e2e", waitingOn: [], paths: ["tests/e2e/queue.spec.ts", "apps/web/x.ts"] });
    const c = (await api.board(S)).cards.find((x) => x.roleId === R.qa)!;
    expect(c).toMatchObject({ updatedBy: "agent", updatedByAgentId: A.qa, paths: ["tests/e2e/queue.spec.ts", "apps/web/x.ts"] });
    expect(agent("qa").checkPaths(["apps/web/x.ts"])[0]!.owner?.key).toBe("frontend");
  });

  it("createAgent needs a role; the token is shown once with a prefix from its random part", async () => {
    const { api, login } = setup();
    await login();
    expect(await code(api.createAgent(S, { roleId: crypto.randomUUID(), kind: "claude-code", label: "x", scopes: ["board:read"] }))).toBe("validation_failed");
    const { agent, token } = await api.createAgent(S, { roleId: R.design, kind: "claude-code", label: "Claude · Design 2", scopes: ["board:read", "decision:read", "decision:propose"] });
    expect(agent.roleId).toBe(R.design);
    expect(token.slice("oh_agent_".length).startsWith(agent.tokenPrefix)).toBe(true);
    expect(JSON.stringify(await api.listMyAgents(S))).not.toContain(token);
  });
});

describe("mock: realtime, unread, handoff", () => {
  it("emits typed change events", async () => {
    const { api, login, agent } = setup();
    await login();
    const seen: string[] = [];
    const off = api.subscribe(S, (e) => seen.push(e.kind));
    agent("design").postStatus({ presence: "idle", doing: null, branch: null, waitingOn: [] });
    agent("design").proposeDecision({ title: "t", body: "", rationale: "r" });
    await api.updateRole(S, R.design, { mission: "Mới" });
    await Promise.resolve();
    off();
    expect(seen).toEqual(expect.arrayContaining(["card", "proposal", "role", "event"]));
  });

  it("agent activity marks a request unread for the orchestrator; markRead clears it", async () => {
    const { api, login } = setup();
    await login();
    expect((await api.getRequest(S, Q.blockerDraft)).unreadForViewer).toBe(true);
    await api.markRead(S, Q.blockerDraft);
    expect((await api.getRequest(S, Q.blockerDraft)).unreadForViewer).toBe(false);
  });

  it("handoff names roles and omits unforwarded drafts", async () => {
    const { api, login } = setup();
    await login();
    const { markdown } = await api.handoff(S, MOCK_IDS.task.queue);
    expect(markdown).toContain("Vai trò phụ trách: Frontend");
    expect(markdown).not.toContain("TypeError"); // the blocker draft body is not forwarded yet
  });
});
