/** Rule 4: the secret scanner on EVERY text field, human + agent paths; plus bypass attempts. */
import { beforeAll, describe, expect, it } from "vitest";
import { FAKE, MEMBER, W, act, api, createAgent, draftRequest, login, sentRequest, sql, tool, toolErrCode, uniq, type AgentCred, type Session } from "../src/helpers.js";
import { known } from "../src/known.js";

let bao: Session, trang: Session, phong: Session;
let baoAgent: AgentCred, trangAgent: AgentCred;
const clean = (s: string) => `QA-E2E-SEC ${s}`;

beforeAll(async () => {
  [bao, trang, phong] = await Promise.all([login(MEMBER.bao), login(MEMBER.trang), login(MEMBER.phong)]);
  [baoAgent, trangAgent] = await Promise.all([createAgent(bao), createAgent(trang)]);
});

type Writer = (secretText: string) => Promise<{ blocked: boolean; stored: boolean; status: number }>;
const verdict = (status: number) => ({ status, blocked: status === 422, stored: status === 200 || status === 201 });

/** Every human + agent write path that accepts free text. */
const writers: Record<string, Writer> = {
  "request.title": async (t) => verdict((await api(bao, "POST", W("/requests"), { receiverId: MEMBER.trang, title: clean(t), body: "ok", taskId: null, dueAt: null })).status),
  "request.body": async (t) => verdict((await api(bao, "POST", W("/requests"), { receiverId: MEMBER.trang, title: "QA-E2E-SEC body", body: clean(t), taskId: null, dueAt: null })).status),
  "status.doing": async (t) => verdict((await api(bao, "PUT", W("/status"), { presence: "idle", doing: clean(t), branch: null, waitingOn: [] })).status),
  "status.branch": async (t) => verdict((await api(bao, "PUT", W("/status"), { presence: "idle", doing: null, branch: clean(t), waitingOn: [] })).status),
  "decision.title": async (t) => verdict((await api(bao, "POST", W("/decisions"), { title: clean(t), body: "", rationale: "r", taskId: null })).status),
  "decision.body": async (t) => verdict((await api(bao, "POST", W("/decisions"), { title: "QA-E2E-SEC dec", body: clean(t), rationale: "r", taskId: null })).status),
  "decision.rationale": async (t) => verdict((await api(bao, "POST", W("/decisions"), { title: "QA-E2E-SEC dec", body: "", rationale: clean(t), taskId: null })).status),
  "agent.label": async (t) => verdict((await api(bao, "POST", W("/agents"), { kind: "codex", label: `qa-e2e ${t}`.slice(0, 60), scopes: ["board:read"] })).status),
  "mcp.send_request.body": async (t) => {
    const r = await tool(baoAgent.token, "send_request", { receiverId: MEMBER.trang, title: "QA-E2E-SEC mcp", body: clean(t) });
    return verdict(toolErrCode(r) === "secret_detected" ? 422 : r.isError ? 400 : 200);
  },
  "mcp.post_status.doing": async (t) => {
    const a = await createAgent(bao); // fresh agent: status bucket is 6/min
    const r = await tool(a.token, "post_status", { presence: "idle", doing: clean(t) });
    return verdict(toolErrCode(r) === "secret_detected" ? 422 : r.isError ? 400 : 200);
  },
  "mcp.post_status.branch": async (t) => {
    const a = await createAgent(bao);
    const r = await tool(a.token, "post_status", { presence: "idle", branch: clean(t) });
    return verdict(toolErrCode(r) === "secret_detected" ? 422 : r.isError ? 400 : 200);
  },
  "mcp.reply_draft.body": async (t) => {
    const rq = await sentRequest(bao, MEMBER.trang, { title: uniq("QA-E2E-SEC-rd") });
    const r = await tool(trangAgent.token, "reply_draft", { requestId: rq.id, body: clean(t) });
    return verdict(toolErrCode(r) === "secret_detected" ? 422 : r.isError ? 400 : 200);
  },
  "human.send.body(edit)": async (t) => {
    const d = await draftRequest(bao, MEMBER.trang);
    return verdict((await act(bao, d.id, "send", clean(t))).status);
  },
  "human.draft_reply.body": async (t) => {
    const rq = await sentRequest(bao, MEMBER.trang, { title: uniq("QA-E2E-SEC-dr") });
    return verdict((await act(trang, rq.id, "draft_reply", clean(t))).status);
  },
  "human.send_reply.body": async (t) => {
    const rq = await sentRequest(bao, MEMBER.trang, { title: uniq("QA-E2E-SEC-sr") });
    return verdict((await act(trang, rq.id, "send_reply", clean(t))).status);
  },
  "human.follow_up.body": async (t) => {
    const rq = await sentRequest(bao, MEMBER.trang, { title: uniq("QA-E2E-SEC-fu") });
    await act(trang, rq.id, "send_reply", "ok answer");
    return verdict((await act(bao, rq.id, "follow_up", clean(t))).status);
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
    const r = await api(bao, "POST", W("/requests"), { receiverId: MEMBER.trang, title: marker, body: `use ${secret} please`, taskId: null, dueAt: null });
    expect(r.status).toBe(422);
    expect(r.text).not.toContain(secret);
    expect(r.body.error.message).toMatch(/github-token/);
    const db = sql();
    expect((await db`SELECT count(*)::int AS n FROM requests WHERE title = ${marker}`)[0]!.n).toBe(0);
    expect((await db`SELECT count(*)::int AS n FROM request_messages WHERE body LIKE ${"%" + secret + "%"}`)[0]!.n).toBe(0);
    expect((await db`SELECT count(*)::int AS n FROM events WHERE data::text LIKE ${"%" + secret + "%"}`)[0]!.n).toBe(0);
    expect((await db`SELECT count(*)::int AS n FROM audit_log WHERE meta::text LIKE ${"%" + secret + "%"} OR action LIKE ${"%" + secret + "%"}`)[0]!.n).toBe(0);
    const audit = (await api(phong, "GET", W("/audit"))).body as any[];
    const row = audit.find((e) => e.action === "secret.rejected" && e.actorMemberId === MEMBER.bao);
    expect(row.detail).toEqual({ rule: "github-token", field: "body" });
    expect(JSON.stringify(audit)).not.toContain(secret);
  });
  it("no secret-looking string is stored anywhere in the whole DB by this suite (spot check on all tables)", async () => {
    const db = sql();
    for (const k of [FAKE.anthropic(), FAKE.openai(), FAKE.github(), FAKE.aws()]) {
      const n = await db`SELECT (SELECT count(*) FROM request_messages WHERE body LIKE ${"%" + k + "%"}) + (SELECT count(*) FROM requests WHERE title LIKE ${"%" + k + "%"}) + (SELECT count(*) FROM decisions WHERE body LIKE ${"%" + k + "%"} OR rationale LIKE ${"%" + k + "%"} OR title LIKE ${"%" + k + "%"}) + (SELECT count(*) FROM status_cards WHERE doing LIKE ${"%" + k + "%"} OR branch LIKE ${"%" + k + "%"}) AS n`;
      expect(Number(n[0]!.n)).toBe(0);
    }
  });
});

describe("scanner bypass attempts (confirmed gaps are marked known)", () => {
  const stored = async (text: string) => (await writers["request.body"]!(text)).stored;

  known("SEC-03", "zero-width / format characters inside a key must not defeat the scanner (sk-ant-<ZWSP>...)", async () => {
    const k = FAKE.anthropic().replace("sk-ant-", "sk-ant-​");
    expect(await stored(k)).toBe(false);
  });
  known("SEC-03", "zero-width joiner inside a GitHub token", async () => {
    const k = FAKE.github().replace("ghp_", "ghp_‍");
    expect(await stored(k)).toBe(false);
  });
  known("SEC-03", "Unicode fullwidth letters (ｓｋ-ant-...) normalise to a key (NFKC) and must be caught", async () => {
    const k = FAKE.anthropic().replace("sk", "ｓｋ");
    expect(await stored(k)).toBe(false);
  });
  known("SEC-04", "Stripe live secret key (sk_live_...) is a well-known format", async () => {
    expect(await stored(FAKE.stripe())).toBe(false);
  });
  known("SEC-04", "database URL with an inline password", async () => {
    expect(await stored(FAKE.dbUrl())).toBe(false);
  });
  known("SEC-04", "JWT (three base64url segments)", async () => {
    expect(await stored(FAKE.jwt())).toBe(false);
  });
  known("SEC-04", "an Office Hub agent token itself (oh_agent_...) pasted into the hub", async () => {
    const a = await createAgent(bao, ["board:read"]);
    expect(await stored(`my token is ${a.token}`)).toBe(false);
  });
  known("SEC-04", "`Authorization: Bearer <opaque hex>` header paste", async () => {
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
