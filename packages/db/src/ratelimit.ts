/**
 * Rule 8: per-agent token buckets, stored in Postgres (table rate_buckets) so the API and the MCP server
 * (separate processes) draw from the SAME buckets and restarts do not reset them.
 * Each take is ONE atomic upsert (row lock serializes concurrent callers; refill uses the DB clock).
 * Defaults (Business): 60 req/min total, post_status 6/min, drafts (send_request + reply_draft) 20/hour.
 */
import { appSql } from "./client.js";

export type LimitKind = "any" | "status" | "draft";

export interface AgentLimiterOptions {
  perMinute?: number;
  statusPerMinute?: number;
  draftsPerHour?: number;
}

export class AgentRateLimiter {
  private cfg: Record<LimitKind, { capacity: number; perMinute: number }>;
  constructor(o: AgentLimiterOptions = {}) {
    const pm = o.perMinute ?? Number(process.env.AGENT_RATE_PER_MIN ?? 60);
    const sm = o.statusPerMinute ?? Number(process.env.AGENT_STATUS_PER_MIN ?? 6);
    const dh = o.draftsPerHour ?? Number(process.env.AGENT_DRAFTS_PER_HOUR ?? 20);
    this.cfg = { any: { capacity: pm, perMinute: pm }, status: { capacity: sm, perMinute: sm }, draft: { capacity: dh, perMinute: dh / 60 } };
  }

  private take(agentId: string, kind: LimitKind): Promise<number> {
    const { capacity, perMinute } = this.cfg[kind];
    return takeToken(`${agentId}:${kind}`, capacity, perMinute);
  }

  /** @returns 0 when allowed, else retry-after seconds. */
  async check(agentId: string, kind: LimitKind = "any"): Promise<number> {
    const a = await this.take(agentId, "any");
    if (a) return a;
    if (kind === "status") return this.take(agentId, "status");
    if (kind === "draft") return this.take(agentId, "draft");
    return 0;
  }
}

/**
 * Generic shared bucket (same table, same atomic upsert). Also used for human auth throttling
 * (keys "login:ip:…", "login:email:…", "invite:ip:…"). Returns 0 if allowed, otherwise seconds to wait.
 */
export async function takeToken(key: string, capacity: number, perMinute: number): Promise<number> {
  const [r] = await appSql()`
    INSERT INTO rate_buckets AS b (key, tokens, updated_at, last_ok)
    VALUES (${key}, ${capacity - 1}, now(), ${capacity >= 1})
    ON CONFLICT (key) DO UPDATE SET
      tokens = CASE WHEN LEAST(${capacity}::float8, b.tokens + extract(epoch FROM (now() - b.updated_at)) / 60 * ${perMinute}::float8) >= 1
                    THEN LEAST(${capacity}::float8, b.tokens + extract(epoch FROM (now() - b.updated_at)) / 60 * ${perMinute}::float8) - 1
                    ELSE LEAST(${capacity}::float8, b.tokens + extract(epoch FROM (now() - b.updated_at)) / 60 * ${perMinute}::float8) END,
      last_ok = LEAST(${capacity}::float8, b.tokens + extract(epoch FROM (now() - b.updated_at)) / 60 * ${perMinute}::float8) >= 1,
      updated_at = now()
    RETURNING tokens, last_ok`;
  if (r!.last_ok) return 0;
  return Math.max(1, Math.ceil(((1 - Number(r!.tokens)) / perMinute) * 60));
}
