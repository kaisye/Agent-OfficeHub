import type { z } from "zod";
import type {
  Agent,
  Board,
  Decision,
  ChangeKind,
  Id,
  Me,
  Request,
  RequestAction,
  Routes,
} from "@officehub/shared";
import type { ApiErrorCode } from "@officehub/shared";

export type Body<K extends keyof typeof Routes> = (typeof Routes)[K] extends { body: infer B extends z.ZodTypeAny }
  ? z.infer<B>
  : never;

export type UpdateStatusInput = Body<"updateMyStatus">;
export type MascotInput = Body<"updateMyMascot">;
export type CreateRequestInput = Body<"createRequest">;
export type RecordDecisionInput = Body<"recordDecision">;
export type CreateAgentInput = Body<"createAgent">;
export type ActInput = { action: RequestAction; body?: string };

export type { ChangeKind, Me };
/** A server "change" message. `all` is the client-side fallback for an unparseable message: refresh everything. */
export interface ChangeEvent {
  kind: ChangeKind | "all";
  id: string | null;
}

export type DevMember = z.infer<(typeof Routes)["devMembers"]["res"]>[number];

/** One interface, two implementations (http | mock). All calls are scoped by workspace slug. */
export interface ApiClient {
  readonly mode: "http" | "mock";
  // session
  me(): Promise<Me>;
  /** Dev login picker (http: GET /auth/dev-members; mock: the seed members). */
  devMembers(): Promise<DevMember[]>;
  devLogin(memberId: Id): Promise<void>;
  /** Where the "Đăng nhập bằng GitHub" button sends the browser. */
  githubLoginUrl(): string;
  logout(): Promise<void>;
  // board
  board(slug: string): Promise<Board>;
  updateMyStatus(slug: string, input: UpdateStatusInput): Promise<void>;
  updateMyMascot(slug: string, input: MascotInput): Promise<void>;
  // requests
  listRequests(slug: string): Promise<Request[]>;
  createRequest(slug: string, input: CreateRequestInput): Promise<Request>;
  actOnRequest(slug: string, id: Id, input: ActInput): Promise<Request>;
  getRequest(slug: string, id: Id): Promise<Request>;
  inbox(slug: string): Promise<Request[]>;
  markRead(slug: string, id: Id): Promise<void>;
  // decisions
  listDecisions(slug: string): Promise<Decision[]>;
  recordDecision(slug: string, input: RecordDecisionInput): Promise<Decision>;
  // agents
  listMyAgents(slug: string): Promise<Agent[]>;
  createAgent(slug: string, input: CreateAgentInput): Promise<{ agent: Agent; token: string }>;
  revokeAgent(slug: string, id: Id): Promise<void>;
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
