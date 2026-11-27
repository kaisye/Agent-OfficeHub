import {
  AgentScope,
  DEFAULT_ROLES,
  type Agent,
  type Decision,
  type DecisionProposal,
  type HubEvent,
  type Member,
  type Request,
  type RequestKind,
  type RequestMessage,
  type Role,
  type StatusCard,
  type Task,
  type Workspace,
} from "@officehub/shared";

/**
 * Mock-mode seed (v0.6): the "office-hub-dev" workspace — one human orchestrator and the six DEFAULT_ROLES,
 * one Claude Code agent per role, and requests in every approval-queue state (a blocker included).
 * Ids are fixed so tests and screenshots can point at them; times are relative to "now".
 */
const id = (n: number) => `0f6c0b1e-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const MOCK_SLUG = "office-hub-dev";
export const MOCK_IDS = {
  workspace: id(1),
  orchestrator: id(10),
  role: Object.fromEntries(DEFAULT_ROLES.map((r, i) => [r.key, id(1001 + i)])) as Record<RoleKey, string>,
  agent: Object.fromEntries(DEFAULT_ROLES.map((r, i) => [r.key, id(2001 + i)])) as Record<RoleKey, string>,
  revokedAgent: id(2099),
  task: { contract: id(3001), queue: id(3002), deploy: id(3003), e2e: id(3004) },
  request: {
    blockerDraft: id(4001),
    contractDraft: id(4002),
    questionDraft: id(4003),
    draftToMe: id(4004),
    replyDrafted: id(4005),
    askingMe: id(4006),
    repliedReview: id(4007),
    repliedAuto: id(4008),
    assigned: id(4009),
    closed: id(4010),
  },
  decision: { workspace: id(6001), contractToLeader: id(6002) },
  proposal: { pending: id(7001), accepted: id(7002) },
} as const;
type RoleKey = "leader" | "business" | "design" | "backend" | "frontend" | "qa";

export const MOCK_ORCHESTRATOR: Member = {
  id: MOCK_IDS.orchestrator,
  workspaceId: MOCK_IDS.workspace,
  displayName: "Phong",
  githubLogin: null,
  role: "admin",
  areas: [],
  mascot: { buddy: "blu" },
};

/** Mock-only sign-in (memory only, reset on reload). */
export const MOCK_LOGIN = { email: "phong@officehub.dev", password: "officehub-demo" } as const;

export interface MockSeed {
  workspace: Workspace;
  orchestrator: Member;
  roles: Role[];
  cards: StatusCard[];
  tasks: Task[];
  events: HubEvent[];
  requests: Request[];
  decisions: Decision[];
  proposals: DecisionProposal[];
  agents: Agent[];
}

export function buildSeed(now: number): MockSeed {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const R = MOCK_IDS.role;
  const A = MOCK_IDS.agent;
  const ME = MOCK_IDS.orchestrator;
  const W = MOCK_IDS.workspace;

  const workspace: Workspace = { id: W, name: "Office Hub", slug: MOCK_SLUG, connectors: ["github"], createdAt: ago(60 * 24 * 3) };
  const roles: Role[] = DEFAULT_ROLES.map((r) => ({
    id: R[r.key as RoleKey],
    workspaceId: W,
    key: r.key,
    name: r.name,
    mission: r.mission,
    ownedPaths: [...r.ownedPaths],
    handoffPath: r.handoffPath,
    wave: r.wave,
    mascot: { buddy: r.buddy },
  }));

  const card = (key: RoleKey, c: Omit<StatusCard, "roleId" | "updatedBy" | "updatedByAgentId" | "updatedAt"> & { min: number; human?: boolean }): StatusCard => ({
    roleId: R[key],
    presence: c.presence,
    doing: c.doing,
    branch: c.branch,
    paths: c.paths,
    waitingOn: c.waitingOn,
    updatedAt: ago(c.min),
    updatedBy: c.human ? "human" : "agent",
    updatedByAgentId: c.human ? null : A[key],
  });
  const cards: StatusCard[] = [
    card("leader", { presence: "reviewing", doing: "Rà contract v0.6 sau khi Backend chạy migration 0008", branch: "orchestrator-v06", paths: ["packages/shared/src/api.ts"], waitingOn: [], min: 6 }),
    card("business", { presence: "idle", doing: "Đã xong ma trận quyền cho một người điều phối", branch: null, paths: [], waitingOn: [], min: 95 }),
    card("design", { presence: "working", doing: "Chọn màu cho chip cảnh báo sửa ngoài vùng", branch: "design/out-of-area-chip", paths: ["packages/ui/src/board.tsx", "packages/brand/src/tokens.css"], waitingOn: [], min: 14 }),
    card("backend", { presence: "blocked", doing: "Kẹt deploy lên PC: thiếu secret webhook", branch: "orchestrator-v06", paths: ["apps/api/src/app.ts", "deploy/pc/up.sh"], waitingOn: [], min: 4 }),
    card("frontend", { presence: "working", doing: "Màn Chờ duyệt và bàn vai trò", branch: "orchestrator-v06", paths: ["apps/web/components/queue-screen.tsx", "packages/shared/src/request.ts"], waitingOn: [R.backend], min: 2 }),
    card("qa", { presence: "waiting", doing: "Chờ màn Chờ duyệt để viết E2E", branch: null, paths: ["tests/e2e/queue.spec.ts"], waitingOn: [R.frontend], min: 30 }),
  ];

  const tasks: Task[] = [
    { id: MOCK_IDS.task.contract, workspaceId: W, source: "github_pr", externalUrl: "https://github.com/officehub/office-hub/pull/41", externalKey: "#41", title: "feat(v0.6): contract một người điều phối", roleId: R.leader, state: "in_review", syncedAt: ago(20) },
    { id: MOCK_IDS.task.queue, workspaceId: W, source: "manual", externalUrl: null, externalKey: null, title: "Màn Chờ duyệt làm trang chính", roleId: R.frontend, state: "in_progress", syncedAt: null },
    { id: MOCK_IDS.task.deploy, workspaceId: W, source: "manual", externalUrl: null, externalKey: null, title: "Deploy PC với seed office-hub-dev", roleId: R.backend, state: "blocked", syncedAt: null },
    { id: MOCK_IDS.task.e2e, workspaceId: W, source: "github_issue", externalUrl: "https://github.com/officehub/office-hub/issues/12", externalKey: "#12", title: "E2E: Frontend → Backend → người duyệt", roleId: R.qa, state: "open", syncedAt: ago(60) },
  ];

  let msgN = 5001;
  const msg = (requestId: string, m: { kind: RequestMessage["kind"]; body: string; by: RoleKey | "me"; sent: boolean; min: number; edited?: boolean }): RequestMessage => ({
    id: id(msgN++),
    requestId,
    kind: m.kind,
    body: m.body,
    authoredBy: m.by === "me" ? "human" : "agent",
    authorMemberId: m.by === "me" ? ME : null,
    authorRoleId: m.by === "me" ? null : R[m.by],
    authorAgentId: m.by === "me" ? null : A[m.by],
    sentById: m.sent ? ME : null,
    editedBeforeSend: !!m.edited,
    createdAt: ago(m.min),
  });
  const req = (
    rid: string,
    r: { from: RoleKey | null; to: RoleKey | null; kind: RequestKind; title: string; status: Request["status"]; min: number; taskId?: string; auto?: boolean; dueMin?: number },
    messages: RequestMessage[],
  ): Request => ({
    id: rid,
    workspaceId: W,
    askerRoleId: r.from ? R[r.from] : null,
    receiverRoleId: r.to ? R[r.to] : null,
    kind: r.kind,
    autoForwardReply: !!r.auto,
    taskId: r.taskId ?? null,
    title: r.title,
    status: r.status,
    dueAt: r.dueMin === undefined ? null : ago(r.dueMin),
    messages,
    createdAt: messages[0]?.createdAt ?? ago(r.min),
    updatedAt: ago(r.min),
  });
  const Q = MOCK_IDS.request;
  const requests: Request[] = [
    req(Q.blockerDraft, { from: "frontend", to: "backend", kind: "blocker", title: "GET /queue trả 500 khi một vai trò chưa có thẻ trạng thái", status: "draft", min: 3, taskId: MOCK_IDS.task.queue }, [
      msg(Q.blockerDraft, { kind: "ask", by: "frontend", sent: false, min: 3, body: "Màn Chờ duyệt gọi GET /w/office-hub-dev/queue và nhận 500 khi vai trò QA chưa từng post_status.\nLog: TypeError: Cannot read properties of undefined (reading 'presence') ở services.ts.\nBackend xem giúp, mình đang kẹt ở bước hiển thị hàng chờ." }),
    ]),
    req(Q.contractDraft, { from: "frontend", to: "leader", kind: "contract_change", title: "Thêm roleKey vào Request để hiện tên vai trò không cần tra", status: "draft", min: 18 }, [
      msg(Q.contractDraft, { kind: "ask", by: "frontend", sent: false, min: 18, body: "Đề xuất thêm askerRoleKey / receiverRoleKey (string | null) vào Request. Web đang phải tra board.roles cho mỗi thẻ. Không đổi luật canTransition." }),
    ]),
    req(Q.questionDraft, { from: "qa", to: "backend", kind: "question", title: "Rate limit MCP tính theo agent hay theo vai trò?", status: "draft", min: 26 }, [
      msg(Q.questionDraft, { kind: "ask", by: "qa", sent: false, min: 26, body: "Bản thiết kế ghi \"giới hạn tính theo vai trò\". Code hiện tại đếm theo agentId. Mình cần biết để viết test E2E cho luật số 8." }),
    ]),
    req(Q.draftToMe, { from: "business", to: null, kind: "question", title: "Có giữ seed Tripflix cho buổi demo không?", status: "draft", min: 40 }, [
      msg(Q.draftToMe, { kind: "ask", by: "business", sent: false, min: 40, body: "Mục 9 đã chốt xoá seed Tripflix trên PC. Mình hỏi lại: có cần giữ một bản Tripflix cho demo khách không, hay chỉ office-hub-dev?" }),
    ]),
    req(Q.replyDrafted, { from: "frontend", to: "design", kind: "question", title: "Màu nào cho chip cảnh báo \"sửa ngoài vùng\"?", status: "reply_drafted", min: 9 }, [
      msg(Q.replyDrafted, { kind: "ask", by: "frontend", sent: true, min: 50, body: "Bàn vai trò cần một chip khi card.paths có file ngoài vùng. Dùng tone warning hay untrusted?" }),
      msg(Q.replyDrafted, { kind: "reply", by: "design", sent: false, min: 9, body: "Dùng tone warning (bg-oh-warning-soft, chữ oh-warning-soft-fg) kèm icon alert. Untrusted để dành cho nội dung do bên khác viết. Ghi tên vai trò sở hữu trong chip." }),
    ]),
    req(Q.askingMe, { from: "backend", to: null, kind: "blocker", title: "Cần GITHUB_WEBHOOK_SECRET trên PC để deploy", status: "sent", min: 5, taskId: MOCK_IDS.task.deploy }, [
      msg(Q.askingMe, { kind: "ask", by: "backend", sent: true, min: 5, body: "deploy/pc/up.sh dừng ở bước kiểm tra env: thiếu GITHUB_WEBHOOK_SECRET. Mình không được đọc secret, bạn đặt giá trị vào ~/.officehub.env trên PC rồi báo mình chạy lại nhé." }),
    ]),
    req(Q.repliedReview, { from: null, to: "qa", kind: "review", title: "Chạy lại E2E sau migration 0008", status: "replied", min: 12, taskId: MOCK_IDS.task.e2e }, [
      msg(Q.repliedReview, { kind: "ask", by: "me", sent: true, min: 120, body: "Migration 0008 đã vào nhánh. Chạy lại toàn bộ E2E và báo cái nào đỏ." }),
      msg(Q.repliedReview, { kind: "reply", by: "qa", sent: true, min: 12, body: "34/36 xanh. 2 bài đỏ là luồng mời thành viên (đã bỏ ở v0.6), mình sẽ xoá. Chưa có E2E cho hàng chờ duyệt." }),
    ]),
    req(Q.repliedAuto, { from: "frontend", to: "backend", kind: "question", title: "Route cho đề xuất quyết định tên gì?", status: "replied", min: 35, auto: true }, [
      msg(Q.repliedAuto, { kind: "ask", by: "frontend", sent: true, min: 70, body: "Mình cần route liệt kê và duyệt đề xuất quyết định." }),
      msg(Q.repliedAuto, { kind: "reply", by: "backend", sent: true, min: 35, body: "GET /w/:slug/proposals và POST /w/:slug/proposals/:id với action accept | reject. Accept có thể kèm title/body/rationale/roleIds đã sửa." }),
    ]),
    req(Q.assigned, { from: null, to: "frontend", kind: "question", title: "Làm màn Chờ duyệt thành trang chính", status: "sent", min: 180, taskId: MOCK_IDS.task.queue, dueMin: -60 * 24 }, [
      msg(Q.assigned, { kind: "ask", by: "me", sent: true, min: 180, body: "Theo docs/redesign-orchestrator.md mục 7: Chờ duyệt là trang chính, bản đồ văn phòng chuyển sang tab thứ hai." }),
    ]),
    req(Q.closed, { from: "leader", to: "backend", kind: "handoff", title: "Contract v0.6 đã chốt, mời Backend làm migration", status: "closed", min: 300, taskId: MOCK_IDS.task.contract }, [
      msg(Q.closed, { kind: "ask", by: "leader", sent: true, min: 360, body: "packages/shared v0.6 đã merge vào orchestrator-v06. Backend làm 0008_orchestrator.sql theo mục 7." }),
      msg(Q.closed, { kind: "reply", by: "backend", sent: true, min: 320, body: "Đã nhận, migration và test v06 đã xong." }),
    ]),
  ];

  const proposals: DecisionProposal[] = [
    {
      id: MOCK_IDS.proposal.pending,
      workspaceId: W,
      roleId: R.backend,
      agentId: A.backend,
      title: "Mỗi agent giữ tối đa 20 nháp chưa chuyển",
      body: "Khi một agent đã có 20 nháp chờ người điều phối, send_request trả rate_limited cho tới khi bớt nháp.",
      rationale: "Một agent lặp vô hạn có thể làm ngập hàng chờ duyệt. 20 đủ cho một buổi làm việc bình thường.",
      status: "pending",
      decisionId: null,
      createdAt: ago(22),
      resolvedAt: null,
    },
    {
      id: MOCK_IDS.proposal.accepted,
      workspaceId: W,
      roleId: R.leader,
      agentId: A.leader,
      title: "contract_change luôn gửi tới Leader",
      body: "Yêu cầu loại contract_change chỉ được nhận bởi vai trò Leader.",
      rationale: "Chỉ Leader được sửa packages/shared; gửi đi nơi khác chỉ làm chậm.",
      status: "accepted",
      decisionId: MOCK_IDS.decision.contractToLeader,
      createdAt: ago(60 * 26),
      resolvedAt: ago(60 * 25),
    },
  ];
  const decisions: Decision[] = [
    {
      id: MOCK_IDS.decision.contractToLeader,
      workspaceId: W,
      title: "contract_change luôn gửi tới Leader",
      body: "Yêu cầu loại contract_change chỉ được nhận bởi vai trò Leader.",
      rationale: "Chỉ Leader được sửa packages/shared; gửi đi nơi khác chỉ làm chậm.",
      decidedById: ME,
      taskId: null,
      roleIds: [R.leader],
      proposalId: MOCK_IDS.proposal.accepted,
      decidedAt: ago(60 * 25),
    },
    {
      id: MOCK_IDS.decision.workspace,
      workspaceId: W,
      title: "Một workspace cho mỗi dự án",
      body: "office-hub-dev chỉ chứa các vai trò của repo này. Dự án khác tạo workspace riêng.",
      rationale: "RLS theo workspace đã có sẵn; trộn dự án làm check_paths trả sai chủ sở hữu.",
      decidedById: ME,
      taskId: MOCK_IDS.task.contract,
      roleIds: [R.leader, R.backend],
      proposalId: null,
      decidedAt: ago(60 * 30),
    },
  ];

  const scopes = [...AgentScope.options];
  const agents: Agent[] = [
    ...DEFAULT_ROLES.map((r, i): Agent => ({
      id: A[r.key as RoleKey],
      workspaceId: W,
      ownerId: ME,
      roleId: R[r.key as RoleKey],
      kind: "claude-code",
      label: `Claude Code · ${r.name}`,
      scopes,
      tokenPrefix: ["Lq7Hd2Xa", "Mb3Kp9Ze", "Pc4Rt6Yw", "Bd5Sn8Qv", "Fe2Gw7Tu", "Qa9Hm3Ns"][i]!,
      revokedAt: null,
      lastSeenAt: ago([6, 95, 14, 4, 2, 30][i]!),
    })),
    {
      id: MOCK_IDS.revokedAgent,
      workspaceId: W,
      ownerId: ME,
      roleId: R.frontend,
      kind: "codex",
      label: "Codex · Frontend (cũ)",
      scopes: ["board:read", "inbox:read"],
      tokenPrefix: "Xo1Yp2Zq",
      revokedAt: ago(60 * 20),
      lastSeenAt: ago(60 * 21),
    },
  ];

  let evN = 8001;
  const ev = (type: HubEvent["type"], min: number, data: Record<string, unknown>, by: { agent?: RoleKey; human?: boolean; taskId?: string | null } = {}): HubEvent => ({
    id: id(evN++),
    workspaceId: W,
    specversion: "1.0",
    source: "officehub",
    type,
    time: ago(min),
    taskId: by.taskId ?? null,
    actorMemberId: by.human ? ME : null,
    actorAgentId: by.agent ? A[by.agent] : null,
    data,
  });
  const events: HubEvent[] = [
    ev("status.updated", 2, { roleId: R.frontend, presence: "working" }, { agent: "frontend" }),
    ev("request.created", 3, { requestId: Q.blockerDraft }, { agent: "frontend", taskId: MOCK_IDS.task.queue }),
    ev("status.updated", 4, { roleId: R.backend, presence: "blocked" }, { agent: "backend" }),
    ev("request.sent", 5, { requestId: Q.askingMe }, { human: true, taskId: MOCK_IDS.task.deploy }),
    ev("request.reply_drafted", 9, { requestId: Q.replyDrafted }, { agent: "design" }),
    ev("request.replied", 12, { requestId: Q.repliedReview }, { human: true, taskId: MOCK_IDS.task.e2e }),
    ev("request.created", 18, { requestId: Q.contractDraft }, { agent: "frontend" }),
    ev("decision.proposed", 22, { proposalId: MOCK_IDS.proposal.pending, roleId: R.backend }, { agent: "backend" }),
    ev("request.created", 26, { requestId: Q.questionDraft }, { agent: "qa" }),
    ev("request.replied", 35, { requestId: Q.repliedAuto, autoForwarded: true }, { agent: "backend" }),
    ev("pr.opened", 60 * 20, { number: 41, title: "feat(v0.6): contract một người điều phối" }, { taskId: MOCK_IDS.task.contract }),
  ];
  // In the server, an event source of "github" has no member; keep the PR event looking external.
  events[events.length - 1]!.source = "github";

  return { workspace, orchestrator: { ...MOCK_ORCHESTRATOR }, roles, cards, tasks, events, requests, decisions, proposals, agents };
}
