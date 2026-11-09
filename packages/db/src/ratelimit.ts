/**
 * Rule 8: per-agent token buckets (in-memory, per process).
 * Defaults (Business): 60 req/min total, post_status 6/min, drafts (send_request + reply_draft) 20/hour.
 */
export class TokenBucket {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private capacity: number,
    private perMinute: number,
    private now: () => number = Date.now,
  ) {}

  /** Returns 0 if allowed, otherwise seconds to wait. */
  take(key: string): number {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.at) / 60000) * this.perMinute);
    b.at = t;
    let wait = 0;
    if (b.tokens >= 1) b.tokens -= 1;
    else wait = Math.max(1, Math.ceil(((1 - b.tokens) / this.perMinute) * 60));
    this.buckets.set(key, b);
    return wait;
  }
}

export type LimitKind = "any" | "status" | "draft";

export interface AgentLimiterOptions {
  perMinute?: number;
  statusPerMinute?: number;
  draftsPerHour?: number;
  now?: () => number;
}

export class AgentRateLimiter {
  private all: TokenBucket;
  private status: TokenBucket;
  private drafts: TokenBucket;
  constructor(o: AgentLimiterOptions = {}) {
    const pm = o.perMinute ?? Number(process.env.AGENT_RATE_PER_MIN ?? 60);
    const sm = o.statusPerMinute ?? Number(process.env.AGENT_STATUS_PER_MIN ?? 6);
    const dh = o.draftsPerHour ?? Number(process.env.AGENT_DRAFTS_PER_HOUR ?? 20);
    this.all = new TokenBucket(pm, pm, o.now);
    this.status = new TokenBucket(sm, sm, o.now);
    this.drafts = new TokenBucket(dh, dh / 60, o.now);
  }
  /** @returns 0 when allowed, else retry-after seconds. */
  check(agentId: string, kind: LimitKind = "any"): number {
    const a = this.all.take(agentId);
    if (a) return a;
    if (kind === "status") return this.status.take(agentId);
    if (kind === "draft") return this.drafts.take(agentId);
    return 0;
  }
}
