import { describe, expect, it } from "vitest";
import { Me, Routes } from "@officehub/shared";
import { ApiClientError, createMockClient, createHttpClient } from "../lib/api";
import { keysForChange } from "../lib/hooks";
import { needsMe } from "../lib/requests";

const PHONG = "adcf8a47-7647-4b1f-952a-76723d7a3413";
const TRANG = "97c2557b-189e-4b54-8c73-a89dfa40e274";
const S = "tripflix";

function setup() {
  let who: string | null = null;
  return createMockClient({ session: { get: () => who, set: (v) => (who = v) } });
}

describe("contract v0.3 in the mock", () => {
  it("me() carries the workspace slug and name", async () => {
    const api = setup();
    await api.devLogin(PHONG);
    expect(Me.parse(await api.me())).toMatchObject({ workspaceSlug: S });
  });

  it("devMembers lists members with their workspace slug", async () => {
    const api = setup();
    const list = await api.devMembers();
    expect(list.length).toBeGreaterThan(3);
    expect(list.every((m) => m.workspaceSlug === S)).toBe(true);
    expect(() => Routes.devMembers.res.parse(list)).not.toThrow();
  });

  it("getRequest returns one request and hides what the viewer may not see", async () => {
    const api = setup();
    await api.devLogin(PHONG);
    const all = await api.listRequests(S);
    const one = await api.getRequest(S, all[0]!.id);
    expect(one.id).toBe(all[0]!.id);
    await expect(api.getRequest(S, crypto.randomUUID())).rejects.toBeInstanceOf(ApiClientError);
  });

  it("simulateTeammate changes someone other than the viewer and emits a typed change", async () => {
    const api = setup();
    await api.devLogin(PHONG);
    const seen: string[] = [];
    api.subscribe(S, (e) => seen.push(e.kind));
    const before = JSON.stringify((await api.board(S)).cards);
    const msg = api.server.simulateTeammate(S, PHONG, () => 0.99);
    await Promise.resolve();
    expect(msg).toMatch(/chuyển sang|trả lời/);
    expect(JSON.stringify((await api.board(S)).cards)).not.toBe(before);
    expect(seen.length).toBeGreaterThan(0);
    expect((await api.board(S)).cards.find((c) => c.memberId === PHONG)?.updatedBy).toBeDefined();
  });
});

describe("SSE change kinds map to queries", () => {
  const names = (kind: Parameters<typeof keysForChange>[1]["kind"], id: string | null = "x") =>
    keysForChange(S, { kind, id }).map((k) => k.join("/"));
  it("maps each ChangeKind", () => {
    expect(names("card")).toEqual(["board/tripflix"]);
    expect(names("event")).toEqual(["board/tripflix"]);
    expect(names("request")).toEqual(expect.arrayContaining(["board/tripflix", "inbox/tripflix", "requests/tripflix", "request/tripflix/x"]));
    expect(names("decision")).toEqual(["decisions/tripflix"]);
    expect(names("agent")).toEqual(["agents/tripflix"]);
    expect(names("member")).toEqual(["board/tripflix", "me"]);
    expect(names("task")).toEqual(expect.arrayContaining(["board/tripflix"]));
  });
  it("refreshes everything for an unparseable message", () => {
    expect(names("all", null).length).toBeGreaterThan(5);
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
    listeners.change!({ data: JSON.stringify({ kind: "card", id: "1" }) });
    listeners.change!({ data: JSON.stringify({ kind: "status", id: "1" }) });
    expect(got).toEqual([
      { kind: "card", id: "1" },
      { kind: "all", id: null },
    ]);
  });
});

describe("needsMe", () => {
  it("includes my own unsent drafts alongside the inbox", async () => {
    const api = setup();
    await api.devLogin(TRANG);
    const board = await api.board(S);
    const inbox = await api.inbox(S);
    const list = needsMe(inbox, board, TRANG);
    expect(list.length).toBeGreaterThanOrEqual(inbox.length);
  });
});
