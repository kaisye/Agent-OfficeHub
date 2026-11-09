import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Member, Request } from "@officehub/shared";
import { Dialog, Mascot, MemberCard, RequestCard, TokenRevealOnce, UntrustedQuote, availableActions, relativeTimeVi } from "./index.js";

afterEach(cleanup);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const W = "33333333-3333-4333-8333-333333333333";
const mem = (id: string, name: string): Member => ({
  id, workspaceId: W, displayName: name, githubLogin: null, role: "member", areas: [],
  mascot: { species: "cat", palette: "ocean", accessory: null, seed: 1 },
});
const asker = mem(A, "Trang");
const receiver = mem(B, "Phong");
const T = "2026-11-09T10:00:00+07:00";
const req = (status: Request["status"], msg?: Partial<Request["messages"][number]>): Request => ({
  id: "44444444-4444-4444-8444-444444444444", workspaceId: W, askerId: A, receiverId: B, taskId: null,
  title: "Server đang ghim tag nào?", status, dueAt: null, createdAt: T, updatedAt: T,
  messages: [{
    id: "55555555-5555-4555-8555-555555555555", requestId: "44444444-4444-4444-8444-444444444444", kind: "ask",
    body: "Cho mình xin tag", authoredBy: "agent", authorAgentId: null, sentById: null, editedBeforeSend: false, createdAt: T, ...msg,
  }],
});

describe("availableActions (delegates to canTransition)", () => {
  it("asker sees send + cancel on a draft; receiver sees nothing", () => {
    expect(availableActions(req("draft"), { kind: "human", memberId: A })).toEqual(["send", "cancel"]);
    expect(availableActions(req("draft"), { kind: "human", memberId: B })).toEqual([]);
  });
  it("receiver can send reply; asker can accept / follow up on replied", () => {
    expect(availableActions(req("sent"), { kind: "human", memberId: B })).toContain("send_reply");
    expect(availableActions(req("replied"), { kind: "human", memberId: A })).toEqual(["accept", "follow_up"]);
    expect(availableActions(req("closed"), { kind: "human", memberId: A })).toEqual([]);
  });
});

describe("RequestCard", () => {
  it("agent draft: Gửi lives in the DraftBlock and fires the send action", () => {
    const onAction = vi.fn();
    render(<RequestCard request={req("draft")} asker={asker} receiver={receiver} viewerMemberId={A} onAction={onAction} />);
    expect(screen.getByLabelText(/Bản nháp do agent soạn/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Gửi yêu cầu/ }));
    expect(onAction).toHaveBeenCalledWith("send", expect.anything());
    expect(screen.getByRole("button", { name: /Huỷ yêu cầu/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Gửi yêu cầu/ })).toHaveLength(1);
  });
  it("receiver cannot see asker's buttons and sees the message as untrusted", () => {
    render(<RequestCard request={req("sent", { sentById: A, authoredBy: "human" })} asker={asker} receiver={receiver} viewerMemberId={B} />);
    expect(screen.queryByRole("button", { name: /Huỷ yêu cầu/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Gửi trả lời/ })).toBeTruthy();
    expect(screen.getByLabelText(/Nội dung từ Trang, chưa xác minh/)).toBeTruthy();
  });
  it("closed request shows no actions", () => {
    render(<RequestCard request={req("closed", { sentById: A })} asker={asker} receiver={receiver} viewerMemberId={A} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("misc components", () => {
  it("Mascot exposes an accessible image", () => {
    render(<Mascot mascot={asker.mascot} presence="blocked" title="Trang" />);
    expect(screen.getByRole("img", { name: "Trang" })).toBeTruthy();
  });
  it("MemberCard shows Vietnamese presence label and waiting chips", () => {
    render(<MemberCard member={asker} waitingOnMembers={[receiver]}
      status={{ memberId: A, presence: "waiting", doing: "Chờ tên biến", branch: "feat/x", waitingOn: [B], updatedAt: T, updatedBy: "agent" }} />);
    expect(screen.getByText("Đang chờ")).toBeTruthy();
    expect(screen.getByLabelText("Đang chờ").textContent).toContain("Phong");
    expect(screen.getByText("Agent cập nhật hộ")).toBeTruthy();
  });
  it("UntrustedQuote renders text, never HTML", () => {
    const { container } = render(<UntrustedQuote authorName="Bảo">{"<img src=x onerror=alert(1)>"}</UntrustedQuote>);
    expect(container.querySelector("img")).toBeNull();
  });
  it("Dialog closes on Escape", () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="Xác nhận"><button>OK</button></Dialog>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
  it("TokenRevealOnce requires acknowledgement", () => {
    const onDone = vi.fn();
    render(<TokenRevealOnce token="oh_agent_abc" onDone={onDone} />);
    const done = screen.getByRole("button", { name: "Xong" }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Tôi đã lưu token"));
    fireEvent.click(done);
    expect(onDone).toHaveBeenCalled();
  });
  it("relativeTimeVi", () => {
    const now = new Date("2026-11-09T10:00:00Z");
    expect(relativeTimeVi("2026-11-09T09:55:00Z", now)).toBe("5 phút trước");
    expect(relativeTimeVi("2026-11-09T07:00:00Z", now)).toBe("3 giờ trước");
  });
});
