/**
 * HTTP API + MCP contract. Backend implements, Frontend consumes.
 * Base URL: http://localhost:8787 (API_PORT). All JSON. Errors: { error: { code, message } }.
 *
 * Auth:
 *  - Humans: session cookie "oh_session" (GitHub OAuth; dev login when DEV_LOGIN_ENABLED=true).
 *  - Agents: "Authorization: Bearer oh_agent_<token>" — ONLY accepted by the MCP server and
 *    the /agent/* routes, never by human action routes (send/accept/decide...).
 */
import { z } from "zod";
import { Id, Member, StatusCard, Task, HubEvent, Decision, DecisionProposal, Agent, AgentScope, PresenceState, Role, RoleKey, Mascot, Workspace } from "./domain.js";
import { Request, RequestAction, RequestKind } from "./request.js";

export const ApiErrorCode = z.enum([
  "unauthenticated", // 401 — no/expired session or token
  "token_revoked", // 401
  "forbidden", // 403 — wrong workspace/role/side
  "human_only", // 403 — agent token on a human route, or agent attempting a human-only action
  "insufficient_scope", // 403 — agent token lacks the tool's scope
  "not_found", // 404
  "invalid_state", // 409 — transition not allowed from current status
  "wrong_side", // 403 — e.g. receiver trying to accept
  "validation_failed", // 400
  "secret_detected", // 422 — message names the rule, never the value; nothing stored
  "rate_limited", // 429
  "csrf_failed", // 403
  "bad_signature", // 401 — webhook signature mismatch
  "internal", // 500
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;
export const ApiError = z.object({ error: z.object({ code: ApiErrorCode, message: z.string() }) });

/** Audit log entry (append-only). Never contains message bodies or secrets. */
export const AuditEntry = z.object({
  id: Id,
  workspaceId: Id,
  at: z.string().datetime({ offset: true }),
  actorMemberId: Id.nullable(),
  actorAgentId: Id.nullable(),
  via: z.enum(["web", "api", "mcp", "webhook", "system"]),
  action: z.string(), // e.g. "request.send", "mcp.read_board", "agent.revoke", "secret.rejected"
  targetKind: z.enum(["request", "decision", "proposal", "role", "status", "agent", "task", "board", "inbox", "session"]).nullable(),
  targetId: z.string().nullable(), // not always a uuid (e.g. "#7")
  outcome: z.enum(["ok", "denied", "rejected"]),
  detail: z.record(z.unknown()), // e.g. { rule: "openai-key" } — no content
});
export type AuditEntry = z.infer<typeof AuditEntry>;

/**
 * Board = everything the main screen needs in one call (v0.6: one orchestrator + role seats).
 * openRequests is FILTERED per viewer and drafts REDACTED per canSeeMessage (C13).
 */
export const Board = z.object({
  workspace: Workspace,
  orchestrator: Member,
  roles: z.array(Role), // ordered by wave, then name
  cards: z.array(StatusCard), // one per role at most
  tasks: z.array(Task),
  recentEvents: z.array(HubEvent), // newest first, max 50
  openRequests: z.array(Request), // not closed/cancelled
  pendingProposals: z.array(DecisionProposal),
});
export type Board = z.infer<typeof Board>;

/** Signed-in member + their workspace (v0.3). Returned by /me and /auth/dev-login. */
export const Me = Member.extend({ workspaceSlug: z.string(), workspaceName: z.string() });
export type Me = z.infer<typeof Me>;

/** SSE: each "change" event carries { kind, id }. kind matches the DB NOTIFY trigger names. */
export const ChangeKind = z.enum(["card", "task", "event", "request", "decision", "proposal", "role", "member", "agent"]);
export type ChangeKind = z.infer<typeof ChangeKind>;
export const ChangeMessage = z.object({ kind: ChangeKind, id: z.string() });

const Ok = z.object({ ok: z.literal(true) });

/** Credential rules shared by server and web forms. */
export const Password = {
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10, "Mật khẩu cần ít nhất 10 ký tự").max(200),
};

export const Routes = {
  // session
  devLogin: { method: "POST", path: "/auth/dev-login", body: z.object({ memberId: Id }), res: Me },
  /** Only when DEV_LOGIN_ENABLED=true: members to pick from on the login screen. */
  devMembers: {
    method: "GET",
    path: "/auth/dev-members",
    res: z.array(z.object({ id: Id, displayName: z.string(), workspaceSlug: z.string(), mascot: Member.shape.mascot })),
  },
  githubLogin: { method: "GET", path: "/auth/github" },
  me: { method: "GET", path: "/me", res: Me },

  // Password login via one-time invite links (v0.5) — no GitHub or email service needed.
  /** Admin only. Creates a single-use link (48h) for that member; any older unused link for them is revoked. */
  inviteMember: {
    method: "POST",
    path: "/w/:slug/members/:id/invite",
    res: z.object({ url: z.string().url(), expiresAt: z.string().datetime({ offset: true }) }),
  },
  /** Public. 404 when the token is unknown, used or expired. */
  inviteInfo: {
    method: "GET",
    path: "/auth/invite/:token",
    res: z.object({ displayName: z.string(), workspaceName: z.string(), mascot: Member.shape.mascot, email: z.string().nullable() }),
  },
  /** Public. Sets the member's email + password, burns the invite, starts a session. */
  acceptInvite: {
    method: "POST",
    path: "/auth/invite/accept",
    body: z.object({ token: z.string().min(20).max(200), email: Password.email, password: Password.password }),
    res: Me,
  },
  passwordLogin: {
    method: "POST",
    path: "/auth/login",
    body: z.object({ email: Password.email, password: z.string().min(1).max(200) }),
    res: Me,
  },
  changePassword: {
    method: "POST",
    path: "/w/:slug/me/password",
    body: z.object({ current: z.string().min(1).max(200), next: Password.password }),
    res: Ok, // other sessions of this member are signed out
  },
  logout: { method: "POST", path: "/auth/logout" },

  // board (human)
  board: { method: "GET", path: "/w/:slug/board", res: Board },
  stream: { method: "GET", path: "/w/:slug/stream" }, // SSE: event "change" with { kind, id }

  updateMyMascot: { method: "PUT", path: "/w/:slug/me/mascot", body: Member.shape.mascot },

  // roles (v0.6, orchestrator only)
  listRoles: { method: "GET", path: "/w/:slug/roles", res: z.array(Role) },
  updateRole: {
    method: "PUT",
    path: "/w/:slug/roles/:id",
    body: z
      .object({
        name: Role.shape.name,
        mission: Role.shape.mission,
        ownedPaths: Role.shape.ownedPaths,
        handoffPath: Role.shape.handoffPath,
        wave: Role.shape.wave,
        mascot: Mascot,
      })
      .partial(),
    res: Role,
  },
  /** The orchestrator may set a role's card by hand (e.g. mark it offline). */
  updateRoleStatus: {
    method: "PUT",
    path: "/w/:slug/roles/:id/status",
    body: z.object({
      presence: PresenceState,
      doing: z.string().max(280).nullable(),
      branch: z.string().max(200).nullable(),
      waitingOn: z.array(Id),
      /** omitted = keep the agent's last list; [] = clear it (e.g. a dead session left stale files) */
      paths: z.array(z.string().min(1).max(200)).max(50).optional(),
    }),
  },

  // requests (human)
  listRequests: { method: "GET", path: "/w/:slug/requests", res: z.array(Request) },
  /** The orchestrator assigns work to a role: created already "sent" (the orchestrator wrote it). */
  createRequest: {
    method: "POST",
    path: "/w/:slug/requests",
    body: z.object({
      receiverRoleId: Id,
      kind: RequestKind.default("question"),
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(8000),
      taskId: Id.nullable(),
      dueAt: z.string().datetime({ offset: true }).nullable(),
    }),
    res: Request,
  },
  actOnRequest: {
    method: "POST",
    path: "/w/:slug/requests/:id/actions",
    // body presence is validated server-side with bodyRequirement(action, status) (C6)
    // autoForwardReply: only with action "send" on kind "question" (canAutoForward)
    body: z.object({
      action: RequestAction,
      body: z.string().min(1).max(8000).optional(),
      autoForwardReply: z.boolean().optional(),
    }),
    res: Request,
  },
  /**
   * v0.6 approval queue — everything waiting for the orchestrator's click, most urgent first:
   * drafts to forward (draft), replies to forward (reply_drafted), answers to close (replied),
   * requests addressed to the orchestrator (sent, receiver = null) and pending decision proposals.
   */
  queue: {
    method: "GET",
    path: "/w/:slug/queue",
    res: z.object({ requests: z.array(Request), proposals: z.array(DecisionProposal) }),
  },
  getRequest: { method: "GET", path: "/w/:slug/requests/:id", res: Request }, // same visibility rules
  markRead: { method: "POST", path: "/w/:slug/requests/:id/read", res: Ok },

  // decisions (human only)
  listDecisions: { method: "GET", path: "/w/:slug/decisions", res: z.array(Decision) },
  recordDecision: {
    method: "POST",
    path: "/w/:slug/decisions",
    body: z.object({
      title: z.string().min(1).max(200),
      body: z.string().max(5000),
      rationale: z.string().min(1).max(5000),
      taskId: Id.nullable(),
      roleIds: z.array(Id).default([]),
    }),
    res: Decision,
  },
  listProposals: { method: "GET", path: "/w/:slug/proposals", res: z.array(DecisionProposal) },
  /** accept → records a Decision (optionally edited); reject → proposal closed, audit kept. */
  actOnProposal: {
    method: "POST",
    path: "/w/:slug/proposals/:id",
    body: z.object({
      action: z.enum(["accept", "reject"]),
      title: z.string().min(1).max(200).optional(),
      body: z.string().max(5000).optional(),
      rationale: z.string().min(1).max(5000).optional(),
      roleIds: z.array(Id).optional(),
    }),
    res: z.object({ proposal: DecisionProposal, decision: Decision.nullable() }),
  },

  /**
   * Read-only workspace assistant (v0.6). Answers with the ASKER's visibility; no write tools.
   * History is kept by the client (last 8 turns, text only); nothing is stored server-side except an audit row.
   */
  askAssistant: {
    method: "POST",
    path: "/w/:slug/assistant",
    body: z.object({
      question: z.string().trim().min(1).max(2000),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) })).max(16).default([]),
    }),
    res: z.object({ answer: z.string(), toolsUsed: z.array(z.string()) }),
  },

  // agents (human manages own agents)
  listMyAgents: { method: "GET", path: "/w/:slug/agents", res: z.array(Agent) },
  createAgent: {
    method: "POST",
    path: "/w/:slug/agents",
    body: z.object({ roleId: Id, kind: Agent.shape.kind, label: z.string().max(60), scopes: z.array(AgentScope) }),
    res: z.object({ agent: Agent, token: z.string() }), // token shown ONCE
  },
  revokeAgent: { method: "DELETE", path: "/w/:slug/agents/:id", res: Agent },

  // handoff pack (generated summary for a task)
  handoff: { method: "GET", path: "/w/:slug/tasks/:id/handoff", res: z.object({ markdown: z.string() }) },

  // webhooks (connectors)
  // Signature MUST verify with the per-workspace secret = HMAC-SHA256(key=GITHUB_WEBHOOK_SECRET, msg=workspaceId) as hex (SEC-08).
  githubWebhook: { method: "POST", path: "/hooks/github/:workspaceId" },
  /** Admin only: what to paste into GitHub → Settings → Webhooks for this workspace. */
  githubWebhookSetup: {
    method: "GET",
    path: "/w/:slug/connectors/github",
    res: z.object({ payloadUrl: z.string().url(), secret: z.string(), events: z.array(z.string()) }),
  },

  // audit
  audit: { method: "GET", path: "/w/:slug/audit", res: z.array(AuditEntry) }, // admin: all; member: own + own agents
} as const;

/** MCP tools (Streamable HTTP at http://localhost:8788/mcp). Names are fixed. */
export const McpTools = {
  read_board: { scope: "board:read", humanApproval: false },
  list_inbox: { scope: "inbox:read", humanApproval: false },
  post_status: { scope: "status:write:self", humanApproval: false }, // the agent's own ROLE card
  send_request: { scope: "request:draft", humanApproval: true }, // creates a DRAFT; the orchestrator forwards it
  reply_draft: { scope: "request:draft", humanApproval: true }, // drafts a reply; the orchestrator forwards it
  check_paths: { scope: "board:read", humanApproval: false }, // v0.6: who owns these files?
  read_decisions: { scope: "decision:read", humanApproval: false }, // v0.6
  propose_decision: { scope: "decision:propose", humanApproval: true }, // v0.6: the orchestrator records it
} as const satisfies Record<string, { scope: AgentScope; humanApproval: boolean }>;
export type McpToolName = keyof typeof McpTools;

/** MCP tool inputs (v0.3) — the MCP server registers exactly these shapes. */
export const McpToolInputs = {
  read_board: z.object({}),
  list_inbox: z.object({ unreadOnly: z.boolean().optional() }),
  post_status: z.object({
    presence: PresenceState,
    doing: z.string().max(280).nullable().optional(),
    branch: z.string().max(200).nullable().optional(),
    paths: z.array(z.string().min(1).max(200)).max(50).optional(),
    /** role keys (e.g. "backend") this role is waiting on */
    waitingOn: z.array(RoleKey).optional(),
  }),
  send_request: z.object({
    /** a role key ("backend", "leader"...) or "orchestrator" to ask the human */
    to: z.union([RoleKey, z.literal("orchestrator")]),
    kind: RequestKind.default("question"),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(8000),
    taskId: Id.nullable().optional(),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  }),
  reply_draft: z.object({ requestId: Id, body: z.string().min(1).max(8000) }),
  check_paths: z.object({ paths: z.array(z.string().min(1).max(200)).min(1).max(100) }),
  read_decisions: z.object({ limit: z.number().int().min(1).max(50).optional() }),
  propose_decision: z.object({
    title: z.string().min(1).max(200),
    body: z.string().max(5000),
    rationale: z.string().min(1).max(5000),
  }),
} as const satisfies Record<McpToolName, z.ZodTypeAny>;

/** Mascot mood is derived from presence — brand renders a pose per mood. */
export const PRESENCE_TO_MOOD = {
  working: "focused",
  waiting: "waiting",
  blocked: "worried",
  reviewing: "curious",
  idle: "relaxed",
  offline: "sleeping",
} as const satisfies Record<PresenceState, string>;
export type MascotMood = (typeof PRESENCE_TO_MOOD)[PresenceState];
