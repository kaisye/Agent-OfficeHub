/** Rule 8: per-agent token buckets (in-memory, per process). Defaults: 60 req/min, 10 drafts/min. */
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

export interface AgentLimiterOptions {
  perMinute?: number;
  draftsPerMinute?: number;
  now?: () => number;
}

export class AgentRateLimiter {
  private all: TokenBucket;
  private drafts: TokenBucket;
  constructor(o: AgentLimiterOptions = {}) {
    const pm = o.perMinute ?? Number(process.env.AGENT_RATE_PER_MIN ?? 60);
    const dm = o.draftsPerMinute ?? Number(process.env.AGENT_DRAFTS_PER_MIN ?? 10);
    this.all = new TokenBucket(pm, pm, o.now);
    this.drafts = new TokenBucket(dm, dm, o.now);
  }
  /** @returns 0 when allowed, else retry-after seconds. */
  check(agentId: string, isDraft = false): number {
    const a = this.all.take(agentId);
    if (a) return a;
    return isDraft ? this.drafts.take(agentId) : 0;
  }
}
