import { describe, expect, it } from "vitest";
import { canTransition, HUMAN_ONLY_ACTIONS } from "./request.js";

const req = { status: "draft" as const, askerId: "a", receiverId: "r" };

describe("request state machine", () => {
  it("has exactly 4 human-only steps in the main flow (+cancel)", () => {
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
});
