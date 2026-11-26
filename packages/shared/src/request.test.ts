import { describe, expect, it } from "vitest";
import { bodyRequirement, canAutoForward, canSeeMessage, canTransition, HUMAN_ONLY_ACTIONS, isParty } from "./request.js";
import { DEFAULT_ROLES, globToRegExp, outOfArea, ownerOfPath } from "./roles.js";

// v0.6: parties are roles; null = the human orchestrator
const req = { status: "draft" as const, askerRoleId: "frontend", receiverRoleId: "backend" };
const human = { kind: "human" as const, memberId: "phong" };
const agentOf = (roleId: string) => ({ kind: "agent" as const, agentId: `ag-${roleId}`, roleId });

describe("request state machine (orchestrator gate)", () => {
  it("human-only actions: 4 main-flow steps + cancel", () => {
    expect(HUMAN_ONLY_ACTIONS.sort()).toEqual(["accept", "cancel", "follow_up", "send", "send_reply"]);
  });
  it("no agent can forward a draft, not even the asking role", () => {
    expect(canTransition(req, "send", agentOf("frontend"))).toMatchObject({ ok: false, code: "human_only" });
  });
  it("the orchestrator forwards any draft", () => {
    expect(canTransition(req, "send", human)).toEqual({ ok: true, to: "sent" });
  });
  it("only the receiving role's agents may draft a reply", () => {
    const sent = { ...req, status: "sent" as const };
    expect(canTransition(sent, "draft_reply", agentOf("backend")).ok).toBe(true);
    expect(canTransition(sent, "draft_reply", agentOf("frontend"))).toMatchObject({ code: "wrong_side" });
    expect(canTransition(sent, "draft_reply", agentOf("qa"))).toMatchObject({ code: "wrong_side" });
  });
  it("an agent can never act on the orchestrator's side", () => {
    const toHuman = { status: "sent" as const, askerRoleId: "backend", receiverRoleId: null };
    expect(canTransition(toHuman, "draft_reply", agentOf("backend"))).toMatchObject({ code: "wrong_side" });
    expect(canTransition(toHuman, "send_reply", human)).toEqual({ ok: true, to: "replied" });
  });
  it("follow up returns to sent; orchestrator closes", () => {
    const replied = { ...req, status: "replied" as const };
    expect(canTransition(replied, "follow_up", human)).toEqual({ ok: true, to: "sent" });
    expect(canTransition(replied, "accept", human)).toEqual({ ok: true, to: "closed" });
    expect(canTransition(replied, "accept", agentOf("frontend"))).toMatchObject({ code: "human_only" });
  });
  it("body rules per action", () => {
    expect(bodyRequirement("draft_reply", "sent")).toBe("required");
    expect(bodyRequirement("send_reply", "sent")).toBe("required");
    expect(bodyRequirement("send_reply", "reply_drafted")).toBe("optional");
    expect(bodyRequirement("accept", "replied")).toBe("ignored");
  });
  it("only plain questions may be auto-forwarded", () => {
    expect(canAutoForward("question")).toBe(true);
    for (const k of ["contract_change", "review", "handoff", "blocker"] as const) expect(canAutoForward(k)).toBe(false);
  });
});

describe("visibility", () => {
  const r = { askerRoleId: "frontend", receiverRoleId: "backend" };
  it("drafts are visible only to their owning role and to the orchestrator", () => {
    expect(canSeeMessage(r, { kind: "reply", sentById: null }, { kind: "role", roleId: "backend" })).toBe(true);
    expect(canSeeMessage(r, { kind: "reply", sentById: null }, { kind: "role", roleId: "frontend" })).toBe(false);
    expect(canSeeMessage(r, { kind: "ask", sentById: null }, { kind: "role", roleId: "backend" })).toBe(false);
    expect(canSeeMessage(r, { kind: "reply", sentById: null }, { kind: "human" })).toBe(true);
  });
  it("roles outside the request see nothing", () => {
    expect(isParty(r, { kind: "role", roleId: "qa" })).toBe(false);
    expect(canSeeMessage(r, { kind: "ask", sentById: "phong" }, { kind: "role", roleId: "qa" })).toBe(false);
    expect(isParty(r, { kind: "human" })).toBe(true);
  });
});

describe("path ownership", () => {
  const roles = DEFAULT_ROLES.map((r) => ({ id: r.key, key: r.key, ownedPaths: r.ownedPaths }));
  it("globs", () => {
    expect(globToRegExp("apps/web/**").test("apps/web/components/x.tsx")).toBe(true);
    expect(globToRegExp("apps/web/**").test("apps/web")).toBe(true);
    expect(globToRegExp("docs/*.md").test("docs/a/b.md")).toBe(false);
  });
  it("maps ARCHITECTURE ownership", () => {
    expect(ownerOfPath("packages/shared/src/api.ts", roles)?.key).toBe("leader");
    expect(ownerOfPath("./apps/mcp/src/app.ts", roles)?.key).toBe("backend");
    expect(ownerOfPath("deploy/pc/up.sh", roles)?.key).toBe("backend");
    expect(ownerOfPath("apps/web/app/page.tsx", roles)?.key).toBe("frontend");
    expect(ownerOfPath("README.md", roles)).toBeNull();
  });
  it("flags writes outside the role's area", () => {
    const fe = roles.find((r) => r.key === "frontend")!;
    const out = outOfArea(fe, ["apps/web/x.tsx", "packages/shared/src/api.ts"], roles);
    expect(out).toEqual([{ path: "packages/shared/src/api.ts", owner: roles.find((r) => r.key === "leader") }]);
  });
});
