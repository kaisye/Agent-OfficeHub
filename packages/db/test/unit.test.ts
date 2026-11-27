import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { adminSql, closeAll } from "../src/client.js";
import { canTransition, TRANSITIONS, RequestStatus, type RequestAction } from "@officehub/shared";
import { scanText, scanFields } from "../src/secrets.js";
import { AgentRateLimiter } from "../src/ratelimit.js";
import { bearer, generateAgentToken, hashToken, hasScope } from "../src/tokens.js";

describe("secret scanner", () => {
  const hits: [string, string][] = [
    ["key is sk-abcdefghijklmnopqrstuvwxyz123456", "openai-api-key"],
    ["sk-proj-abcdefghijklmnopqrstuvwx_yz-12345", "openai-project-key"],
    ["ANTHROPIC sk-ant-api03-abcdefghijklmnopqrstuvwxyz", "anthropic-api-key"],
    ["ghp_abcdefghijklmnopqrstuvwxyz0123456789", "github-token"],
    ["gho_abcdefghijklmnopqrstuvwxyz0123456789", "github-token"],
    ["github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyz", "github-fine-grained-pat"],
    ["AKIAIOSFODNN7EXAMPLE", "aws-access-key-id"],
    ["AIzaSyA-abcdefghijklmnopqrstuvwxyz012345", "google-api-key"],
    ["xoxb-123456789012-abcdefghijkl", "slack-token"],
    ["-----BEGIN RSA PRIVATE KEY-----\nMIIE", "private-key-block"],
    ["-----BEGIN OPENSSH PRIVATE KEY-----", "private-key-block"],
    ['api_key = "Zk3jP9xQ2mV7nB4cL8wR1tY6"', "generic-high-entropy-secret"],
    ["DEEPSEEK_API_KEY=3f9a1c7e5b2d4a8f9c0e1b7d6a5f4e3c", "generic-high-entropy-secret"],
  ];
  it.each(hits)("detects %s", (text, rule) => {
    expect(scanText(text)).toBe(rule);
  });
  it("does not flag normal prose or low-entropy values", () => {
    expect(scanText("Chốt tách tag theo app, giảm bộ đếm bình luận khi ẩn.")).toBeNull();
    expect(scanText("risk-management-framework and task-list-for-tomorrow-morning")).toBeNull();
    expect(scanText("password = aaaaaaaaaaaaaaaaaaaa")).toBeNull();
    expect(scanText("Tên biến là API_KEY, đặt trong .env")).toBeNull();
  });
  it("names the rule and field, never the value", () => {
    const hit = scanFields({ title: "ok", body: "x AKIAIOSFODNN7EXAMPLE" });
    expect(hit).toEqual({ rule: "aws-access-key-id", field: "body" });
    expect(JSON.stringify(hit)).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
});

describe("agent tokens", () => {
  it("generates oh_agent_ + >=43 base62 chars, stores only a sha256 hash", () => {
    const t = generateAgentToken();
    expect(t.token).toMatch(/^oh_agent_[0-9A-Za-z]{43,}$/);
    expect(t.hash).toBe(hashToken(t.token));
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.hash).not.toContain(t.token);
    expect(generateAgentToken().token).not.toBe(t.token);
    expect(t.prefix).toHaveLength(8);
  });
  it("parses bearer headers and checks scopes", () => {
    expect(bearer("Bearer abc")).toBe("abc");
    expect(bearer("Basic abc")).toBeNull();
    expect(hasScope(["board:read"], "board:read")).toBe(true);
    expect(hasScope(["board:read"], "request:draft")).toBe(false);
  });
});

describe("rate limiter (Postgres-backed, shared)", () => {
  afterAll(closeAll);
  it("allows capacity then blocks, per agent, refills over time (DB clock)", async () => {
    const l = new AgentRateLimiter({ perMinute: 3, draftsPerHour: 1, statusPerMinute: 1 });
    const a = randomUUID();
    const b = randomUUID();
    expect([await l.check(a), await l.check(a), await l.check(a)]).toEqual([0, 0, 0]);
    expect(await l.check(a)).toBeGreaterThan(0);
    expect(await l.check(b)).toBe(0); // per-agent
    // time passes: backdate the buckets by 60s instead of mocking a clock
    await adminSql()`UPDATE rate_buckets SET updated_at = updated_at - interval '60 seconds' WHERE key LIKE ${a + ":%"}`;
    expect(await l.check(a, "draft")).toBe(0);
    expect(await l.check(a, "draft")).toBeGreaterThan(0); // draft bucket (1/hour)
  });
  it("two limiter instances (API + MCP processes) share the same buckets", async () => {
    const api = new AgentRateLimiter({ perMinute: 4 });
    const mcp = new AgentRateLimiter({ perMinute: 4 });
    const a = randomUUID();
    expect([await api.check(a), await mcp.check(a), await api.check(a), await mcp.check(a)]).toEqual([0, 0, 0, 0]);
    expect(await api.check(a)).toBeGreaterThan(0);
    expect(await mcp.check(a)).toBeGreaterThan(0);
  });
  it("is atomic under concurrency: 30 parallel takes against capacity 10 allow exactly 10", async () => {
    const l = new AgentRateLimiter({ perMinute: 10 });
    const a = randomUUID();
    const res = await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? l : new AgentRateLimiter({ perMinute: 10 })).check(a)));
    expect(res.filter((x) => x === 0).length).toBe(10);
  });
});

describe("request transitions (shared canTransition, v0.6)", () => {
  const statuses = RequestStatus.options;
  const actions = Object.keys(TRANSITIONS) as RequestAction[];
  it("an agent can never perform an orchestrator-only action from any state, on either side", () => {
    for (const status of statuses)
      for (const a of actions) {
        if (!TRANSITIONS[a].humanOnly) continue;
        for (const roleId of ["A", "R"]) {
          const r = canTransition({ status, askerRoleId: "A", receiverRoleId: "R" }, a, { kind: "agent", agentId: "x", roleId });
          expect(r.ok).toBe(false);
        }
      }
  });
  it("only the receiving role's agent may draft a reply", () => {
    const req = { status: "sent" as const, askerRoleId: "A", receiverRoleId: "R" };
    expect(canTransition(req, "draft_reply", { kind: "agent", agentId: "x", roleId: "R" }).ok).toBe(true);
    expect(canTransition(req, "draft_reply", { kind: "agent", agentId: "x", roleId: "A" }).ok).toBe(false);
  });
  it("closed/cancelled are terminal", () => {
    for (const status of ["closed", "cancelled"] as const)
      for (const a of actions) expect(canTransition({ status, askerRoleId: "A", receiverRoleId: "R" }, a, { kind: "human", memberId: "H" }).ok).toBe(false);
  });
});

describe("hardening (SEC-03/04, SEC-08/09, BUG-02)", async () => {
  const { normaliseForScan } = await import("../src/secrets.js");
  const { mapGithubEvent, safeUrl, workspaceWebhookSecret } = await import("../src/github.js");
  it("catches keys split by invisible characters or written in fullwidth letters", () => {
    const k = ["sk", "ant", "api03", "A1b2C3d4E5f6G7h8I9j0K1l2M3"].join("-");
    expect(scanText(k.replace("sk-ant-", "sk-ant-​"))).toBe("anthropic-api-key");
    expect(scanText(k.replace("sk", "ｓｋ"))).toBe("anthropic-api-key");
    expect(normaliseForScan("a‍b­c")).toBe("abc");
  });
  it.each([
    ["sk_live_" + "4eC39HqLyjWDarjtT1zdp7dc", "stripe-secret-key"],
    ["postgres://admin:" + "SuperS3cretPw" + "@db.internal:5432/prod", "url-with-password"],
    [["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9P"].join("."), "jwt"],
    ["my token is oh_agent_" + "Abc123Def456Ghi789Jkl012", "office-hub-agent-token"],
    ["Authorization: Bearer 0123456789abcdef0123456789abcdef", "bearer-token"],
  ])("detects %s", (text, rule) => expect(scanText(text)).toBe(rule));
  it("leaves ordinary text and plain URLs alone", () => {
    expect(scanText("Xem https://github.com/o/r/pull/7 và postgres://localhost:5433/officehub")).toBeNull();
  });
  it("webhook: null payload ignored, only http(s) links kept, secrets differ per workspace", () => {
    expect(mapGithubEvent("pull_request", null)).toBeNull();
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://github.com/o/r/pull/1")).toBe("https://github.com/o/r/pull/1");
    expect(workspaceWebhookSecret("s", "a")).not.toBe(workspaceWebhookSecret("s", "b"));
    expect(workspaceWebhookSecret("", "a")).toBe("");
  });
});
