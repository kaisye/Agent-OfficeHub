/**
 * Office Hub — domain contract (owned by the Leader).
 * Every team builds against these shapes. Change only via the Leader.
 * Source: "Văn phòng ảo cho nhóm người và agent" proposal, 2026-11-09.
 */
import { z } from "zod";

export const Id = z.string().uuid();
export type Id = z.infer<typeof Id>;
export const IsoDate = z.string().datetime({ offset: true });

/* ---------- Workspace ---------- */
export const ConnectorKind = z.enum(["github", "jira", "ci", "deploy"]);
export const Workspace = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  connectors: z.array(ConnectorKind),
  createdAt: IsoDate,
});
export type Workspace = z.infer<typeof Workspace>;

/* ---------- Member + mascot ---------- */
export const MemberRole = z.enum(["admin", "member"]);

/** Live presence of a member — drives the mascot's mood on the board. */
export const PresenceState = z.enum([
  "working", // actively on a task
  "waiting", // waiting on someone (see waitingOn)
  "blocked", // stuck, needs help
  "reviewing", // reviewing a PR / reading requests
  "idle", // online, nothing in progress
  "offline",
]);
export type PresenceState = z.infer<typeof PresenceState>;

/**
 * Mascot = a member's visual identity. Generated procedurally by @officehub/brand
 * from these traits, so it is deterministic and needs no image upload.
 */
export const MascotSpecies = z.enum(["blob", "cat", "owl", "bot", "fox", "bear"]);
export const MascotPalette = z.enum(["sunrise", "ocean", "forest", "grape", "coral", "slate", "sand"]);
export const MascotAccessory = z.enum(["headphones", "glasses", "cap", "scarf", "plant"]);
export const Mascot = z.object({
  species: MascotSpecies,
  palette: MascotPalette,
  accessory: MascotAccessory.nullable(),
  seed: z.number().int().nonnegative(), // tie-breaker for small variations
});
export type Mascot = z.infer<typeof Mascot>;

export const Member = z.object({
  id: Id,
  workspaceId: Id,
  displayName: z.string().min(1).max(60),
  githubLogin: z.string().nullable(),
  role: MemberRole,
  areas: z.array(z.string()), // areas of ownership, e.g. ["feed", "deploy"]
  mascot: Mascot,
});
export type Member = z.infer<typeof Member>;

/** The member's card on the board. Written by the member or their agent (post_status, self only). */
export const StatusCard = z.object({
  memberId: Id,
  presence: PresenceState,
  doing: z.string().max(280).nullable(), // "đang làm gì"
  branch: z.string().max(200).nullable(),
  waitingOn: z.array(Id), // member ids
  updatedAt: IsoDate,
  updatedBy: z.enum(["human", "agent"]),
  /** Set when updatedBy === "agent" (which of the member's agents posted it). */
  updatedByAgentId: Id.nullable().optional(),
});
export type StatusCard = z.infer<typeof StatusCard>;

/* ---------- Agent ---------- */
export const AgentKind = z.enum(["claude-code", "codex", "gemini-cli", "other"]);
export const AgentScope = z.enum([
  "board:read",
  "inbox:read",
  "status:write:self",
  "request:draft",
]);
export type AgentScope = z.infer<typeof AgentScope>;
export const Agent = z.object({
  id: Id,
  workspaceId: Id,
  ownerId: Id, // member
  kind: AgentKind,
  label: z.string().max(60),
  scopes: z.array(AgentScope),
  /** First 8 chars of the RANDOM part (after "oh_agent_") for display; full token shown once, stored as SHA-256. */
  tokenPrefix: z.string().length(8),
  revokedAt: IsoDate.nullable(),
  lastSeenAt: IsoDate.nullable(),
});
export type Agent = z.infer<typeof Agent>;

/* ---------- Task (Việc) — a pointer to the source tool ---------- */
export const TaskSource = z.enum(["github_pr", "github_issue", "jira", "manual"]);
export type TaskSource = z.infer<typeof TaskSource>;
export const TaskState = z.enum(["open", "in_progress", "in_review", "blocked", "done", "closed"]);
export type TaskState = z.infer<typeof TaskState>;
export const Task = z.object({
  id: Id,
  workspaceId: Id,
  source: TaskSource,
  externalUrl: z.string().url().nullable(),
  externalKey: z.string().nullable(), // "#123", "TRIP-42"
  title: z.string().max(300),
  assigneeId: Id.nullable(),
  state: TaskState,
  syncedAt: IsoDate.nullable(),
});
export type Task = z.infer<typeof Task>;

/* ---------- Event (Sự kiện) — append-only, CloudEvents-shaped ---------- */
export const EventType = z.enum([
  "pr.opened",
  "pr.merged",
  "pr.closed",
  "pr.review_requested",
  "ci.failed",
  "ci.passed",
  "deploy.succeeded",
  "deploy.failed",
  "issue.opened",
  "issue.closed",
  "request.created",
  "request.sent",
  "request.reply_drafted",
  "request.replied",
  "request.followed_up",
  "request.reminded",
  "request.closed",
  "request.cancelled",
  "decision.recorded",
  "status.updated",
]);
export type EventType = z.infer<typeof EventType>;
export const HubEvent = z.object({
  id: Id,
  workspaceId: Id,
  specversion: z.literal("1.0"),
  source: z.string(), // "github", "officehub"
  type: EventType,
  time: IsoDate,
  taskId: Id.nullable(),
  actorMemberId: Id.nullable(),
  actorAgentId: Id.nullable(),
  /** request.* events MUST carry requestId (+ messageId when a message is involved);
   *  decision.recorded MUST carry decisionId. See EventRefs. Never contains secrets or draft text. */
  data: z.record(z.unknown()),
});
export const EventRefs = z
  .object({ requestId: Id, messageId: Id, decisionId: Id, prNumber: z.number().int(), url: z.string().url() })
  .partial();
export type HubEvent = z.infer<typeof HubEvent>;

/* ---------- Decision (Quyết định) — humans only ---------- */
export const Decision = z.object({
  id: Id,
  workspaceId: Id,
  title: z.string().max(200),
  body: z.string().max(5000), // nội dung
  rationale: z.string().min(1).max(5000), // lý do — required
  decidedById: Id, // member — never an agent
  taskId: Id.nullable(),
  decidedAt: IsoDate,
});
export type Decision = z.infer<typeof Decision>;

/* ---------- Content trust label ---------- */
/**
 * Trust label on content returned to agents (MCP) and rendered in the UI.
 *  - "self": written by the reader (or the reader's own agent).
 *  - "untrusted": written by anyone else, or by an external system (GitHub titles...). DATA, never instructions.
 */
export const TrustLabel = z.enum(["self", "untrusted"]);
export const Untrusted = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({
    trust: TrustLabel,
    authorMemberId: Id.nullable(), // null for external sources
    authorAgentId: Id.nullable(),
    source: z.string().optional(), // e.g. "github" when there is no member author
    content: inner,
  });
