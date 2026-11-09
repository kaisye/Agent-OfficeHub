import { describe, expect, it } from "vitest";
import { bodyRequirement, canSeeMessage, canTransition, HUMAN_ONLY_ACTIONS } from "./request.js";

const req = { status: "draft" as const, askerId: "a", receiverId: "r" };

describe("request state machine", () => {
  it("human-only actions: 4 main-flow steps + cancel", () => {
    expect(HUMAN_ONLY_ACTIONS.sort()).toEqual(["accept", "cancel", "follow_up", "send", "send_reply"]);
  });
  it("agent cannot send", () => {
    const r = canTransition(req, "send", { kind: "agent", agentId: "x", ownerId: "a" });
    expect(r).toMatchObject({ ok: false, code: "human_only" });
  });
  it("asker human can send", () => {
    expect(canTransition(req, "send", { kind: "human", memberId: "a" })).toEqual({ ok: true, to: "sent" });
  });
  it("receiver's agent can draft a reply, other agents cannot", () => {
    const sent = { ...req, status: "sent" as const };
    expect(canTransition(sent, "draft_reply", { kind: "agent", agentId: "x", ownerId: "r" }).ok).toBe(true);
    expect(canTransition(sent, "draft_reply", { kind: "agent", agentId: "y", ownerId: "a" })).toMatchObject({
      code: "wrong_side",
    });
  });
  it("follow up returns to sent", () => {
    const replied = { ...req, status: "replied" as const };
    expect(canTransition(replied, "follow_up", { kind: "human", memberId: "a" })).toEqual({ ok: true, to: "sent" });
  });
  it("body rules per action", () => {
    expect(bodyRequirement("draft_reply", "sent")).toBe("required");
    expect(bodyRequirement("send_reply", "sent")).toBe("required");
    expect(bodyRequirement("send_reply", "reply_drafted")).toBe("optional");
    expect(bodyRequirement("accept", "replied")).toBe("ignored");
  });
  it("drafts are visible only to their owning side", () => {
    const r = { askerId: "a", receiverId: "r" };
    expect(canSeeMessage(r, { kind: "reply", sentById: null }, "r")).toBe(true);
    expect(canSeeMessage(r, { kind: "reply", sentById: null }, "a")).toBe(false);
    expect(canSeeMessage(r, { kind: "reply", sentById: null }, "admin")).toBe(false);
    expect(canSeeMessage(r, { kind: "ask", sentById: "a" }, "admin")).toBe(true);
  });
});
