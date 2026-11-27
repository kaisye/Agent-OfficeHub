import type { z } from "zod";
import type {
  Agent,
  Board,
  Decision,
  DecisionProposal,
  ChangeKind,
  Id,
  Me,
  Request,
  RequestAction,
  Role,
  Routes,
} from "@officehub/shared";
import type { ApiErrorCode } from "@officehub/shared";

/** Request body as the client sends it (zod input: fields with a default are optional). */
export type Body<K extends keyof typeof Routes> = (typeof Routes)[K] extends { body: infer B extends z.ZodTypeAny }
  ? z.input<B>
  : never;

export type MascotInput = Body<"updateMyMascot">;
export type CreateRequestInput = Body<"createRequest">;
export type RecordDecisionInput = Body<"recordDecision">;
export type CreateAgentInput = Body<"createAgent">;
export type UpdateRoleInput = Body<"updateRole">;
export type RoleStatusInput = Body<"updateRoleStatus">;
export type ProposalActionInput = Body<"actOnProposal">;
export type ActInput = { action: RequestAction; body?: string; autoForwardReply?: boolean };
export type Queue = z.infer<(typeof Routes)["queue"]["res"]>;
export type ProposalResult = z.infer<(typeof Routes)["actOnProposal"]["res"]>;

export type { ChangeKind, Me };
/** A server "change" message. `all` is the client-side fallback for an unparseable message: refresh everything. */
export interface ChangeEvent {
  kind: ChangeKind | "all";
  id: string | null;
}

export type DevMember = z.infer<(typeof Routes)["devMembers"]["res"]>[number];
export type InviteInfo = z.infer<(typeof Routes)["inviteInfo"]["res"]>;
export type AcceptInviteInput = Body<"acceptInvite">;
export type ChangePasswordInput = Body<"changePassword">;
export type AssistantTurn = { role: "user" | "assistant"; text: string };
export type AssistantAnswer = z.infer<(typeof Routes)["askAssistant"]["res"]>;

/**
 * One interface, two implementations (http | mock). All calls are scoped by workspace slug.
 * v0.6: the signed-in human is the orchestrator; every human-only action is theirs.
 */
export interface ApiClient {
  readonly mode: "http" | "mock";
  // session
  me(): Promise<Me>;
  /** Dev login picker (http: GET /auth/dev-members?workspace=<slug>, 404 when dev login is disabled; mock: the orchestrator). */
  devMembers(workspace: string): Promise<DevMember[]>;
  devLogin(memberId: Id): Promise<void>;
  /** Where the "Đăng nhập bằng GitHub" button sends the browser. */
  githubLoginUrl(): string;
  logout(): Promise<void>;
  // password login; invite links now only (re)set the orchestrator's password (pnpm db:invite)
  passwordLogin(email: string, password: string): Promise<void>;
  inviteInfo(token: string): Promise<InviteInfo>;
  acceptInvite(input: AcceptInviteInput): Promise<void>;
  changePassword(slug: string, input: ChangePasswordInput): Promise<void>;
  // board + roles
  board(slug: string): Promise<Board>;
  updateMyMascot(slug: string, input: MascotInput): Promise<void>;
  listRoles(slug: string): Promise<Role[]>;
  updateRole(slug: string, id: Id, input: UpdateRoleInput): Promise<Role>;
  updateRoleStatus(slug: string, id: Id, input: RoleStatusInput): Promise<void>;
  // requests
  queue(slug: string): Promise<Queue>;
  listRequests(slug: string): Promise<Request[]>;
  createRequest(slug: string, input: CreateRequestInput): Promise<Request>;
  actOnRequest(slug: string, id: Id, input: ActInput): Promise<Request>;
  getRequest(slug: string, id: Id): Promise<Request>;
  markRead(slug: string, id: Id): Promise<void>;
  // decisions + proposals
  listDecisions(slug: string): Promise<Decision[]>;
  recordDecision(slug: string, input: RecordDecisionInput): Promise<Decision>;
  listProposals(slug: string): Promise<DecisionProposal[]>;
  actOnProposal(slug: string, id: Id, input: ProposalActionInput): Promise<ProposalResult>;
  // agents
  listMyAgents(slug: string): Promise<Agent[]>;
  createAgent(slug: string, input: CreateAgentInput): Promise<{ agent: Agent; token: string }>;
  revokeAgent(slug: string, id: Id): Promise<void>;
  // read-only workspace assistant
  askAssistant(slug: string, question: string, history: AssistantTurn[]): Promise<AssistantAnswer>;
  // handoff
  handoff(slug: string, taskId: Id): Promise<{ markdown: string }>;
  // realtime: returns an unsubscribe function
  subscribe(slug: string, onChange: (e: ChangeEvent) => void): () => void;
}

export class ApiClientError extends Error {
  readonly code: ApiErrorCode | "network";
  readonly status: number;
  constructor(code: ApiErrorCode | "network", message: string, status = 0) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
  /** Name of the secret rule when code === "secret_detected" (server names the rule, never the value). */
  get rule(): string | undefined {
    if (this.code !== "secret_detected") return undefined;
    return /\(([\w. -]+)\)/.exec(this.message)?.[1] ?? /rule[:= ]+([\w-]+)/i.exec(this.message)?.[1];
  }
}

export const isApiError = (e: unknown): e is ApiClientError => e instanceof ApiClientError;
