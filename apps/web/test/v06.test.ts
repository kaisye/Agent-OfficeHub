import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES, Me, Routes, outOfArea } from "@officehub/shared";
import { MOCK_IDS, MOCK_SLUG, createHttpClient, createMockClient } from "../lib/api";
import { keysForChange } from "../lib/hooks";
import { directionLabel, queueSection, roleMap } from "../lib/requests";
import { mcpJson } from "../lib/agent-snippets";

const S = MOCK_SLUG;

describe("contract v0.6 in the mock", () => {
  it("me() carries the workspace slug; devMembers is the orchestrator only", async () => {
    let who: string | null = null;
    const api = createMockClient({ session: { get: () => who, set: (v) => (who = v) } });
    const list = await api.devMembers(S);
    expect(() => Routes.devMembers.res.parse(list)).not.toThrow();
    await api.devLogin(list[0]!.id);
    expect(Me.parse(await api.me())).toMatchObject({ workspaceSlug: S, id: MOCK_IDS.orchestrator });
  });

  it("the queue response matches Routes.queue.res", async () => {
    const api = createMockClient({ session: { get: () => MOCK_IDS.orchestrator, set: () => {} } });
    expect(Routes.queue.res.safeParse(await api.queue(S)).success).toBe(true);
  });

  it("seed roles are the shared DEFAULT_ROLES, and the Frontend card shows an out-of-area file owned by Leader", async () => {
    const api = createMockClient({ session: { get: () => MOCK_IDS.orchestrator, set: () => {} } });
    const b = await api.board(S);
    expect(new Set(b.roles.map((r) => r.key))).toEqual(new Set(DEFAULT_ROLES.map((r) => r.key)));
    const fe = b.roles.find((r) => r.key === "frontend")!;
    const out = outOfArea(fe, b.cards.find((c) => c.roleId === fe.id)!.paths, b.roles);
    expect(out.map((o) => o.owner?.key)).toEqual(["leader"]);
  });
});

describe("request helpers", () => {
  it("labels parties with roles and 'bạn' for the orchestrator; sorts queue sections", async () => {
    const api = createMockClient({ session: { get: () => MOCK_IDS.orchestrator, set: () => {} } });
    const b = await api.board(S);
    const roles = roleMap(b.roles);
    const all = await api.listRequests(S);
    const byId = (id: string) => all.find((r) => r.id === id)!;
    expect(directionLabel(byId(MOCK_IDS.request.blockerDraft), roles)).toBe("Frontend → Backend");
    expect(directionLabel(byId(MOCK_IDS.request.repliedReview), roles)).toBe("Bạn → QA & Security");
    expect(directionLabel(byId(MOCK_IDS.request.askingMe), roles)).toBe("Backend → bạn");
    expect(queueSection(byId(MOCK_IDS.request.blockerDraft))).toBe("drafts");
    expect(queueSection(byId(MOCK_IDS.request.replyDrafted))).toBe("replies");
    expect(queueSection(byId(MOCK_IDS.request.askingMe))).toBe("askingMe");
    expect(queueSection(byId(MOCK_IDS.request.repliedAuto))).toBe("answered");
    expect(queueSection(byId(MOCK_IDS.request.assigned))).toBeNull();
  });
});

describe("SSE change kinds map to queries", () => {
  const names = (kind: Parameters<typeof keysForChange>[1]["kind"], id: string | null = "x") => keysForChange(S, { kind, id }).map((k) => k.join("/"));
  it("maps each ChangeKind", () => {
    expect(names("card")).toEqual([`board/${S}`]);
    expect(names("role")).toEqual([`board/${S}`]);
    expect(names("request")).toEqual(expect.arrayContaining([`board/${S}`, `queue/${S}`, `requests/${S}`, `request/${S}/x`]));
    expect(names("proposal")).toEqual(expect.arrayContaining([`queue/${S}`, `proposals/${S}`]));
    expect(names("decision")).toEqual(expect.arrayContaining([`decisions/${S}`]));
    expect(names("agent")).toEqual([`agents/${S}`]);
    expect(names("member")).toEqual([`board/${S}`, "me"]);
  });
  it("refreshes everything for an unparseable message", () => {
    expect(names("all", null).length).toBeGreaterThan(6);
  });
});

describe("http client", () => {
  it("parses SSE messages with ChangeMessage and falls back to refresh-all", () => {
    const listeners: Record<string, (ev: { data: string }) => void> = {};
    class FakeES {
      constructor(public url: string) {}
      addEventListener(n: string, f: (ev: { data: string }) => void) {
        listeners[n] = f;
      }
      close() {}
    }
    const api = createHttpClient({ baseUrl: "http://x", eventSourceImpl: FakeES as unknown as typeof EventSource });
    const got: unknown[] = [];
    api.subscribe(S, (e) => got.push(e));
    listeners.change!({ data: JSON.stringify({ kind: "proposal", id: "1" }) });
    listeners.change!({ data: JSON.stringify({ kind: "inbox", id: "1" }) });
    expect(got).toEqual([
      { kind: "proposal", id: "1" },
      { kind: "all", id: null },
    ]);
  });

  it("calls the v0.6 routes with CSRF on writes", async () => {
    const calls: { url: string; method: string; csrf?: string; body?: string }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method!, csrf: (init.headers as Record<string, string>)["X-OfficeHub-CSRF"], body: init.body as string | undefined });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const api = createHttpClient({ baseUrl: "http://api", fetchImpl });
    await api.queue(S);
    await api.updateRoleStatus(S, "r1", { presence: "idle", doing: null, branch: null, waitingOn: [] });
    await api.actOnRequest(S, "q1", { action: "send", autoForwardReply: true });
    await api.actOnProposal(S, "p1", { action: "reject" });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET http://api/w/${S}/queue`,
      `PUT http://api/w/${S}/roles/r1/status`,
      `POST http://api/w/${S}/requests/q1/actions`,
      `POST http://api/w/${S}/proposals/p1`,
    ]);
    expect(calls[0]!.csrf).toBeUndefined();
    expect(calls.slice(1).every((c) => c.csrf === "1")).toBe(true);
    expect(JSON.parse(calls[2]!.body!)).toEqual({ action: "send", autoForwardReply: true });
  });
});

describe("agent snippets", () => {
  it("never inline the token; read it from the environment", () => {
    const j = mcpJson();
    expect(j).toContain("${OFFICEHUB_AGENT_TOKEN}");
    expect(j).not.toMatch(/oh_agent_[A-Za-z0-9]/);
  });
});
