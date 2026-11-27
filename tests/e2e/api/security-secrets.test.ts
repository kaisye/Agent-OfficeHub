/** Rule 4: the secret scanner on EVERY text field, human + agent paths; plus bypass attempts. */
import { beforeAll, describe, expect, it } from "vitest";
import { FAKE, ROLE_KEYS, W, act, agentDraft, api, assign, createAgent, createWorld, roleStatus, sql, tool, toolErrCode, uniq, type AgentCred, type World } from "../src/helpers.js";
import { known } from "../src/known.js";

let w: World;
let feAgent: AgentCred, beAgent: AgentCred;
let propCount = 0;
const clean = (s: string) => `QA-E2E-SEC ${s}`;

beforeAll(async () => {
  w = await createWorld("secrets");
  [feAgent, beAgent] = await Promise.all([createAgent(w, "frontend"), createAgent(w, "backend")]);
});

type Writer = (secretText: string) => Promise<{ blocked: boolean; stored: boolean; status: number }>;
const verdict = (status: number) => ({ status, blocked: status === 422, stored: status === 200 || status === 201 });
const mcpVerdict = (r: Awaited<ReturnType<typeof tool>>) => verdict(toolErrCode(r) === "secret_detected" ? 422 : r.isError ? 400 : 200);
const postRequest = (title: string, body: string) => api(w.orch, "POST", W(w, "/requests"), { receiverRoleId: w.roles.backend, kind: "question", title, body, taskId: null, dueAt: null });
/** a draft by the frontend agent, waiting for the orchestrator (fresh each time: the agent may hold 10 open drafts at most) */
const freshDraft = async () => {
  const d = await agentDraft(feAgent, "backend", { title: uniq("QA-E2E-SEC-d") });
  return d.id;
};

/** Every human + agent write path that accepts free text. */
const writers: Record<string, Writer> = {
  "request.title": async (t) => verdict((await postRequest(clean(t), "ok")).status),
  "request.body": async (t) => verdict((await postRequest("QA-E2E-SEC body", clean(t))).status),
  "role.status.doing": async (t) => verdict((await roleStatus(w, "qa", { doing: clean(t) })).status),
  "role.status.branch": async (t) => verdict((await roleStatus(w, "qa", { branch: clean(t) })).status),
  "role.mission": async (t) => verdict((await api(w.orch, "PUT", W(w, `/roles/${w.roles.qa}`), { mission: clean(t) })).status),
  "role.name": async (t) => verdict((await api(w.orch, "PUT", W(w, `/roles/${w.roles.qa}`), { name: clean(t).slice(0, 60) })).status),
  "decision.title": async (t) => verdict((await api(w.orch, "POST", W(w, "/decisions"), { title: clean(t), body: "", rationale: "r", taskId: null })).status),
  "decision.body": async (t) => verdict((await api(w.orch, "POST", W(w, "/decisions"), { title: "QA-E2E-SEC dec", body: clean(t), rationale: "r", taskId: null })).status),
  "decision.rationale": async (t) => verdict((await api(w.orch, "POST", W(w, "/decisions"), { title: "QA-E2E-SEC dec", body: "", rationale: clean(t), taskId: null })).status),
  "agent.label": async (t) => verdict((await api(w.orch, "POST", W(w, "/agents"), { roleId: w.roles.qa, kind: "codex", label: `qa-e2e ${t}`.slice(0, 60), scopes: ["board:read"] })).status),
  "mcp.send_request.title": async (t) => mcpVerdict(await tool(feAgent.token, "send_request", { to: "backend", title: clean(t), body: "ok" })),
  "mcp.send_request.body": async (t) => mcpVerdict(await tool(feAgent.token, "send_request", { to: "backend", title: "QA-E2E-SEC mcp", body: clean(t) })),
  "mcp.post_status.doing": async (t) => {
    const a = await createAgent(w, "qa"); // fresh agent: status bucket is 6/min
    return mcpVerdict(await tool(a.token, "post_status", { presence: "idle", doing: clean(t) }));
  },
  "mcp.post_status.branch": async (t) => {
    const a = await createAgent(w, "qa");
    return mcpVerdict(await tool(a.token, "post_status", { presence: "idle", branch: clean(t) }));
  },
  "mcp.post_status.paths": async (t) => {
    const a = await createAgent(w, "qa");
    return mcpVerdict(await tool(a.token, "post_status", { presence: "idle", paths: [clean(t)] }));
  },
  "mcp.reply_draft.body": async (t) => {
    const rq = await assign(w, "backend", { title: uniq("QA-E2E-SEC-rd") });
    return mcpVerdict(await tool(beAgent.token, "reply_draft", { requestId: rq.id, body: clean(t) }));
  },
  "mcp.propose_decision.title": async (t) => {
    const a = await createAgent(w, "design");
    return mcpVerdict(await tool(a.token, "propose_decision", { title: clean(t), body: "b", rationale: "r" }));
  },
  "mcp.propose_decision.body": async (t) => {
    const a = await createAgent(w, "design");
    return mcpVerdict(await tool(a.token, "propose_decision", { title: "QA-E2E-SEC prop", body: clean(t), rationale: "r" }));
  },
  "mcp.propose_decision.rationale": async (t) => {
    const a = await createAgent(w, "design");
    return mcpVerdict(await tool(a.token, "propose_decision", { title: "QA-E2E-SEC prop", body: "b", rationale: clean(t) }));
  },
  "orchestrator.send.body(edit of an agent draft)": async (t) => verdict((await act(w, await freshDraft(), "send", clean(t))).status),
  "orchestrator.draft_reply.body": async (t) => verdict((await act(w, (await assign(w, "backend", { title: uniq("QA-E2E-SEC-dr") })).id, "draft_reply", clean(t))).status),
  "orchestrator.send_reply.body": async (t) => verdict((await act(w, (await assign(w, "backend", { title: uniq("QA-E2E-SEC-sr") })).id, "send_reply", clean(t))).status),
  "orchestrator.follow_up.body": async (t) => {
    const rq = await assign(w, "backend", { title: uniq("QA-E2E-SEC-fu") });
    await act(w, rq.id, "send_reply", "ok answer");
    return verdict((await act(w, rq.id, "follow_up", clean(t))).status);
  },
  "proposal.accept(edited body)": async (t) => {
    const a = await createAgent(w, ROLE_KEYS[propCount++ % ROLE_KEYS.length]!); // a rejected accept leaves the proposal pending: spread over roles (5 pending per role max)
    const p = (await tool(a.token, "propose_decision", { title: "QA-E2E-SEC prop", body: "b", rationale: "r" })).data.proposalId;
    return verdict((await api(w.orch, "POST", W(w, `/proposals/${p}`), { action: "accept", body: clean(t) })).status);
  },
};

describe("every free-text path rejects well-known key formats (422, nothing stored)", () => {
  const detected = { anthropic: FAKE.anthropic(), openai: FAKE.openai(), github: FAKE.github(), aws: FAKE.aws(), pem: FAKE.pem(), "generic password=": "password=" + "Xk9vQ2mZp7Lw4RtYb8NcA1sD" };
  for (const [wname, w] of Object.entries(writers)) {
    it(`${wname}`, async () => {
      const failures: string[] = [];
      for (const [kind, secret] of Object.entries(detected)) {
        // agent label / mcp fields are length limited; keep the secret within them
        const r = await w(secret);
        if (!r.blocked) failures.push(`${kind} -> status ${r.status}${r.stored ? " (STORED)" : ""}`);
      }
      expect(failures).toEqual([]);
    });
  }
});

describe("secret rejection hygiene", () => {
  it("never echoes the value, audits only rule+field, writes nothing to requests/messages/events/audit", async () => {
    const secret = FAKE.github();
    const marker = uniq("QA-E2E-hygiene");
    const r = await postRequest(marker, `use ${secret} please`);
    expect(r.status).toBe(422);
    expect(r.text).not.toContain(secret);
    expect(r.body.error.message).toMatch(/github-token/);
    const db = sql();
    expect((await db`SELECT count(*)::int AS n FROM requests WHERE title = ${marker}`)[0]!.n).toBe(0);
    expect((await db`SELECT count(*)::int AS n FROM request_messages WHERE body LIKE ${"%" + secret + "%"}`)[0]!.n).toBe(0);
    expect((await db`SELECT count(*)::int AS n FROM events WHERE data::text LIKE ${"%" + secret + "%"}`)[0]!.n).toBe(0);
    expect((await db`SELECT count(*)::int AS n FROM audit_log WHERE meta::text LIKE ${"%" + secret + "%"} OR action LIKE ${"%" + secret + "%"}`)[0]!.n).toBe(0);
    const audit = (await api(w.orch, "GET", W(w, "/audit"))).body as any[];
    const row = audit.find((e) => e.action === "secret.rejected" && e.actorMemberId === w.orchestratorId);
    expect(row.detail).toEqual({ rule: "github-token", field: "body" });
    expect(JSON.stringify(audit)).not.toContain(secret);
  });
  it("an agent's rejected secret is audited against the agent (rule + field only) and stores nothing", async () => {
    const secret = FAKE.openai();
    const r = await tool(feAgent.token, "send_request", { to: "backend", title: uniq("QA-E2E-hyg-agent"), body: `key ${secret}` });
    expect(toolErrCode(r)).toBe("secret_detected");
    expect(JSON.stringify(r.res.body)).not.toContain(secret);
    const audit = (await api(w.orch, "GET", W(w, "/audit"))).body as any[];
    const row = audit.find((e) => e.action === "secret.rejected" && e.actorAgentId === feAgent.id);
    expect(row).toBeTruthy();
    expect(JSON.stringify(audit)).not.toContain(secret);
    expect((await sql()`SELECT count(*)::int AS n FROM request_messages WHERE body LIKE ${"%" + secret + "%"}`)[0]!.n).toBe(0);
  });
  it("no secret-looking string is stored anywhere in the whole DB by this suite (spot check on all tables)", async () => {
    const db = sql();
    for (const k of [FAKE.anthropic(), FAKE.openai(), FAKE.github(), FAKE.aws()]) {
      const n = await db`SELECT (SELECT count(*) FROM request_messages WHERE body LIKE ${"%" + k + "%"}) + (SELECT count(*) FROM requests WHERE title LIKE ${"%" + k + "%"}) + (SELECT count(*) FROM decisions WHERE body LIKE ${"%" + k + "%"} OR rationale LIKE ${"%" + k + "%"} OR title LIKE ${"%" + k + "%"}) + (SELECT count(*) FROM decision_proposals WHERE body LIKE ${"%" + k + "%"} OR rationale LIKE ${"%" + k + "%"} OR title LIKE ${"%" + k + "%"}) + (SELECT count(*) FROM status_cards WHERE doing LIKE ${"%" + k + "%"} OR branch LIKE ${"%" + k + "%"} OR array_to_string(paths, ' ') LIKE ${"%" + k + "%"}) + (SELECT count(*) FROM roles WHERE mission LIKE ${"%" + k + "%"} OR name LIKE ${"%" + k + "%"}) AS n`;
      expect(Number(n[0]!.n)).toBe(0);
    }
  });
});

describe("scanner bypass attempts (confirmed gaps are marked known)", () => {
  const stored = async (text: string) => (await writers["request.body"]!(text)).stored;

  it("[SEC-03] zero-width / format characters inside a key must not defeat the scanner (sk-ant-<ZWSP>...)", async () => {
    const k = FAKE.anthropic().replace("sk-ant-", "sk-ant-​");
    expect(await stored(k)).toBe(false);
  });
  it("[SEC-03] zero-width joiner inside a GitHub token", async () => {
    const k = FAKE.github().replace("ghp_", "ghp_‍");
    expect(await stored(k)).toBe(false);
  });
  it("[SEC-03] Unicode fullwidth letters (ｓｋ-ant-...) normalise to a key (NFKC) and must be caught", async () => {
    const k = FAKE.anthropic().replace("sk", "ｓｋ");
    expect(await stored(k)).toBe(false);
  });
  it("[SEC-04] Stripe live secret key (sk_live_...) is a well-known format", async () => {
    expect(await stored(FAKE.stripe())).toBe(false);
  });
  it("[SEC-04] database URL with an inline password", async () => {
    expect(await stored(FAKE.dbUrl())).toBe(false);
  });
  it("[SEC-04] JWT (three base64url segments)", async () => {
    expect(await stored(FAKE.jwt())).toBe(false);
  });
  it("[SEC-04] an Office Hub agent token itself (oh_agent_...) pasted into the hub", async () => {
    const a = await createAgent(w, "design", ["board:read"]);
    expect(await stored(`my token is ${a.token}`)).toBe(false);
  });
  it("[SEC-04] `Authorization: Bearer <opaque hex>` header paste", async () => {
    expect(await stored("Authorization: Bearer 0123456789abcdef0123456789abcdef01234567")).toBe(false);
  });
  it("lowercased AWS key id is not a real credential format (accepted: documented limitation)", async () => {
    expect(await stored(FAKE.aws().toLowerCase())).toBe(true);
  });
  it("base64 / hex / reversed / space-split encodings are NOT detected (accepted limitation: scanner is regex-based, not DLP) ", async () => {
    const gh = FAKE.github();
    expect(await stored(Buffer.from(gh).toString("base64"))).toBe(true);
    expect(await stored(Buffer.from(gh).toString("hex"))).toBe(true);
    expect(await stored([...gh].reverse().join(""))).toBe(true);
    expect(await stored(FAKE.anthropic().replace("api03-", "api03- "))).toBe(true);
  });
});
