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
import { Id, Member, StatusCard, Task, HubEvent, Decision, Agent, AgentScope, PresenceState, Workspace } from "./domain.js";
import { Request, RequestAction } from "./request.js";

export const ApiError = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

/** Board = everything the main screen needs in one call. */
export const Board = z.object({
  workspace: Workspace,
  members: z.array(Member),
  cards: z.array(StatusCard),
  tasks: z.array(Task),
  recentEvents: z.array(HubEvent), // newest first, max 50
  openRequests: z.array(Request), // not closed/cancelled
});
export type Board = z.infer<typeof Board>;

export const Routes = {
  // session
  devLogin: { method: "POST", path: "/auth/dev-login", body: z.object({ memberId: Id }) },
  githubLogin: { method: "GET", path: "/auth/github" },
  me: { method: "GET", path: "/me", res: Member },
  logout: { method: "POST", path: "/auth/logout" },

  // board (human)
  board: { method: "GET", path: "/w/:slug/board", res: Board },
  stream: { method: "GET", path: "/w/:slug/stream" }, // SSE: event "change" with { kind, id }

  // status (human, self)
  updateMyStatus: {
    method: "PUT",
    path: "/w/:slug/status",
    body: z.object({
      presence: PresenceState,
      doing: z.string().max(280).nullable(),
      branch: z.string().max(200).nullable(),
      waitingOn: z.array(Id),
    }),
  },
  updateMyMascot: { method: "PUT", path: "/w/:slug/me/mascot", body: Member.shape.mascot },

  // requests (human)
  listRequests: { method: "GET", path: "/w/:slug/requests", res: z.array(Request) },
  createRequest: {
    method: "POST",
    path: "/w/:slug/requests",
    body: z.object({
      receiverId: Id,
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
    body: z.object({ action: RequestAction, body: z.string().max(8000).optional() }),
    res: Request,
  },

  // decisions (human only)
  listDecisions: { method: "GET", path: "/w/:slug/decisions", res: z.array(Decision) },
  recordDecision: {
    method: "POST",
    path: "/w/:slug/decisions",
    body: z.object({
      title: z.string().min(1).max(200),
      body: z.string().max(5000),
      rationale: z.string().max(5000),
      taskId: Id.nullable(),
    }),
    res: Decision,
  },

  // agents (human manages own agents)
  listMyAgents: { method: "GET", path: "/w/:slug/agents", res: z.array(Agent) },
  createAgent: {
    method: "POST",
    path: "/w/:slug/agents",
    body: z.object({ kind: Agent.shape.kind, label: z.string().max(60), scopes: z.array(AgentScope) }),
    res: z.object({ agent: Agent, token: z.string() }), // token shown ONCE
  },
  revokeAgent: { method: "DELETE", path: "/w/:slug/agents/:id" },

  // handoff pack (generated summary for a task)
  handoff: { method: "GET", path: "/w/:slug/tasks/:id/handoff", res: z.object({ markdown: z.string() }) },

  // webhooks (connectors)
  githubWebhook: { method: "POST", path: "/hooks/github/:workspaceId" },

  // audit
  audit: { method: "GET", path: "/w/:slug/audit" },
} as const;

/** MCP tools (Streamable HTTP at http://localhost:8788/mcp). Names are fixed. */
export const McpTools = {
  read_board: { scope: "board:read", humanApproval: false },
  list_inbox: { scope: "inbox:read", humanApproval: false },
  post_status: { scope: "status:write:self", humanApproval: false },
  send_request: { scope: "request:draft", humanApproval: true }, // creates a DRAFT; owner clicks send
  reply_draft: { scope: "request:draft", humanApproval: true }, // drafts a reply; owner clicks send
} as const satisfies Record<string, { scope: AgentScope; humanApproval: boolean }>;
export type McpToolName = keyof typeof McpTools;

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
