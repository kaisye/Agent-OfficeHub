/** Map GitHub webhook payloads to HubEvent + Task upserts. Signature checking lives in the API layer. */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { EventType } from "@officehub/shared";
import type { Tx } from "./client.js";
import { withWorkspace } from "./client.js";
import { audit, emitEvent } from "./core.js";

export function verifyGithubSignature(secret: string, rawBody: string, header: string | undefined | null): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = header.slice(7);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(got, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

type TaskState = "open" | "in_progress" | "in_review" | "blocked" | "done" | "closed";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;

interface Mapped {
  type: EventType;
  task?: { source: "github_pr" | "github_issue"; key: string; url: string | null; title: string; state: TaskState; assigneeLogin: string | null };
  taskRef?: { source: "github_pr"; key: string };
  data: Record<string, unknown>;
}

export function mapGithubEvent(name: string, p: Payload): Mapped | null {
  const action = p.action as string | undefined;
  if (name === "pull_request" && p.pull_request) {
    const pr = p.pull_request;
    const task = {
      source: "github_pr" as const,
      key: `#${pr.number}`,
      url: pr.html_url ?? null,
      title: String(pr.title ?? `PR #${pr.number}`).slice(0, 300),
      assigneeLogin: pr.assignee?.login ?? pr.user?.login ?? null,
      state: "in_progress" as TaskState,
    };
    const data = { number: pr.number, action, repo: p.repository?.full_name ?? null, author: pr.user?.login ?? null };
    if (action === "opened" || action === "reopened" || action === "ready_for_review") return { type: "pr.opened", task: { ...task, state: pr.draft ? "in_progress" : "in_review" }, data };
    if (action === "review_requested") return { type: "pr.review_requested", task: { ...task, state: "in_review" }, data: { ...data, reviewer: p.requested_reviewer?.login ?? null } };
    if (action === "closed" && pr.merged) return { type: "pr.merged", task: { ...task, state: "done" }, data };
    if (action === "closed") return { type: "pr.closed", task: { ...task, state: "closed" }, data };
    return null;
  }
  if ((name === "check_suite" || name === "workflow_run") && (p.check_suite || p.workflow_run)) {
    const run = p.check_suite ?? p.workflow_run;
    if (p.action !== "completed") return null;
    const pr = run.pull_requests?.[0];
    const type: EventType | null = run.conclusion === "success" ? "ci.passed" : run.conclusion === "failure" || run.conclusion === "timed_out" ? "ci.failed" : null;
    if (!type) return null;
    return {
      type,
      taskRef: pr ? { source: "github_pr", key: `#${pr.number}` } : undefined,
      data: { conclusion: run.conclusion, branch: run.head_branch ?? null, repo: p.repository?.full_name ?? null, workflow: run.name ?? null },
    };
  }
  if (name === "issues" && p.issue) {
    const i = p.issue;
    if (action !== "opened" && action !== "closed" && action !== "reopened") return null;
    const closed = action === "closed";
    return {
      type: closed ? "issue.closed" : "issue.opened",
      task: {
        source: "github_issue",
        key: `#${i.number}`,
        url: i.html_url ?? null,
        title: String(i.title ?? `Issue #${i.number}`).slice(0, 300),
        state: closed ? "closed" : "open",
        assigneeLogin: i.assignee?.login ?? null,
      },
      data: { number: i.number, action, repo: p.repository?.full_name ?? null },
    };
  }
  if (name === "deployment_status" && p.deployment_status) {
    const s = p.deployment_status.state as string;
    const type: EventType | null = s === "success" ? "deploy.succeeded" : s === "failure" || s === "error" ? "deploy.failed" : null;
    if (!type) return null;
    return {
      type,
      data: { environment: p.deployment?.environment ?? null, ref: p.deployment?.ref ?? null, repo: p.repository?.full_name ?? null, state: s },
    };
  }
  return null;
}

async function upsertTask(tx: Tx, workspaceId: string, t: NonNullable<Mapped["task"]>): Promise<string> {
  const a = t.assigneeLogin
    ? (await tx`SELECT id FROM members WHERE lower(github_login) = lower(${t.assigneeLogin})`)[0]
    : undefined;
  const [row] = await tx`INSERT INTO tasks (workspace_id, source, external_url, external_key, title, assignee_id, state, synced_at)
    VALUES (${workspaceId}, ${t.source}, ${t.url}, ${t.key}, ${t.title}, ${a?.id ?? null}, ${t.state}, now())
    ON CONFLICT (workspace_id, source, external_key) WHERE external_key IS NOT NULL
    DO UPDATE SET title = EXCLUDED.title, state = EXCLUDED.state, external_url = COALESCE(EXCLUDED.external_url, tasks.external_url),
      assignee_id = COALESCE(EXCLUDED.assignee_id, tasks.assignee_id), synced_at = now()
    RETURNING id`;
  return row!.id as string;
}

/** Returns what happened. Idempotent on X-GitHub-Delivery. */
export async function ingestGithub(
  workspaceId: string,
  eventName: string,
  deliveryId: string | null,
  payload: Payload,
): Promise<{ status: "ignored" | "duplicate" | "ingested"; eventId?: string }> {
  const m = mapGithubEvent(eventName, payload);
  return withWorkspace(workspaceId, async (tx) => {
    if (!m) {
      await audit(tx, workspaceId, { kind: "webhook" }, { action: "webhook.github", outcome: "ignored", meta: { event: eventName } });
      return { status: "ignored" as const };
    }
    let taskId: string | null = null;
    if (m.task) taskId = await upsertTask(tx, workspaceId, m.task);
    else if (m.taskRef) {
      const r = await tx`SELECT id FROM tasks WHERE source = ${m.taskRef.source} AND external_key = ${m.taskRef.key}`;
      taskId = (r[0]?.id as string | undefined) ?? null;
    }
    const id = await emitEvent(tx, null, workspaceId, m.type, m.data, {
      taskId,
      source: "github",
      dedupeKey: deliveryId ? `gh:${deliveryId}` : null,
    });
    await audit(tx, workspaceId, { kind: "webhook" }, { action: "webhook.github", targetKind: "event", targetId: id, outcome: id ? "ok" : "duplicate", meta: { event: eventName, type: m.type } });
    return id ? { status: "ingested" as const, eventId: id } : { status: "duplicate" as const };
  });
}
