import { readdirSync, readFileSync } from "node:fs";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Member, Request } from "@officehub/shared";
import { Dialog, Mascot, MemberCard, RequestCard, TaskChip, ToastProvider, TokenRevealOnce, UntrustedQuote, useToast, availableActions, relativeTimeVi } from "./index.js";

afterEach(cleanup);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const W = "33333333-3333-4333-8333-333333333333";
const mem = (id: string, name: string): Member => ({
  id, workspaceId: W, displayName: name, githubLogin: null, role: "member", areas: [],
  mascot: { buddy: "milo" },
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
    fireEvent.click(screen.getByRole("button", { name: /^Gửi$/ }));
    expect(onAction).toHaveBeenCalledWith("send", expect.anything());
    expect(screen.getByRole("button", { name: /Hủy yêu cầu/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Gửi$/ })).toHaveLength(1);
  });
  it("receiver cannot see asker's buttons and sees the message as untrusted", () => {
    render(<RequestCard request={req("sent", { sentById: A, authoredBy: "human" })} asker={asker} receiver={receiver} viewerMemberId={B} />);
    expect(screen.queryByRole("button", { name: /Hủy yêu cầu/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Gửi trả lời$/ })).toBeTruthy();
    expect(screen.getByLabelText(/Nội dung từ Trang, chưa xác minh/)).toBeTruthy();
  });
  it("follow_up and send_reply-from-sent require a body; the draft stays hidden from the other side", () => {
    const onAction = vi.fn();
    const r = { ...req("replied", { sentById: B, kind: "reply", authoredBy: "human" }), unreadForViewer: true };
    render(<RequestCard request={r} asker={asker} receiver={receiver} viewerMemberId={A} onAction={onAction} />);
    expect(document.querySelector("[data-unread]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hỏi lại" }));
    const send = screen.getByRole("button", { name: "Hỏi lại" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Thêm tag nữa nhé" } });
    fireEvent.click(send);
    expect(onAction).toHaveBeenCalledWith("follow_up", expect.anything(), "Thêm tag nữa nhé");
  });
  it("hides the receiver's reply draft from the asker", () => {
    render(<RequestCard request={req("reply_drafted", { kind: "reply", body: "BÍ MẬT nháp" })} asker={asker} receiver={receiver} viewerMemberId={A} />);
    expect(screen.queryByText(/BÍ MẬT nháp/)).toBeNull();
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
    expect(screen.getByText("Agent soạn · cập nhật hộ")).toBeTruthy();
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

describe("Dialog", () => {
  it("does not steal focus when onClose changes identity (regression)", () => {
    function Host() {
      const [v, setV] = useState("");
      return (
        <Dialog open onClose={() => setV("")} title="Tạo yêu cầu">
          <input aria-label="Tiêu đề" value={v} onChange={(e) => setV(e.target.value)} />
          <textarea aria-label="Nội dung" />
        </Dialog>
      );
    }
    render(<Host />);
    const second = screen.getByLabelText("Nội dung");
    second.focus();
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "a" } }); // re-render, new onClose
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "ab" } });
    expect(document.activeElement).toBe(second);
  });
  it("calls the latest onClose on Escape", () => {
    const first = vi.fn(), second = vi.fn();
    const { rerender } = render(<Dialog open onClose={first} title="X" />);
    rerender(<Dialog open onClose={second} title="X" />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
  it("renders in a portal on document.body and returns focus to the opener", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <div id="host">
          <button onClick={() => setOpen(true)}>Mở</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Hộp thoại"><button>OK</button></Dialog>
        </div>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "Mở" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Hộp thoại" });
    expect(document.getElementById("host")!.contains(dialog)).toBe(false);
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("TaskChip", () => {
  const task = { source: "jira", externalKey: "TRIP-42", externalUrl: "https://x.test/TRIP-42", title: "Một tiêu đề rất rất dài cho việc này cần cắt bớt", state: "open" } as const;
  it("keeps the key unbreakable and truncates the title with a full-text tooltip", () => {
    render(<TaskChip task={task} />);
    expect(screen.getByText("TRIP-42").className).toContain("whitespace-nowrap");
    const t = screen.getByText(task.title);
    expect(t.className).toContain("truncate");
    expect(t.getAttribute("title")).toBe(task.title);
  });
});

describe("UntrustedQuote external author", () => {
  it("labels a null-author GitHub source", () => {
    render(<UntrustedQuote authorMemberId={null} source="github">Review comment</UntrustedQuote>);
    expect(screen.getByText("Từ GitHub · nội dung chưa xác minh")).toBeTruthy();
    expect(screen.getByLabelText(/Nội dung từ GitHub, chưa xác minh/)).toBeTruthy();
  });
  it("shows the member name when there is one", () => {
    render(<UntrustedQuote authorName="Bảo">x</UntrustedQuote>);
    expect(screen.getByText("Từ Bảo · nội dung chưa xác minh")).toBeTruthy();
  });
});

describe("RequestCard detail link", () => {
  it("renders inside the card footer, with the card's own box", () => {
    render(<RequestCard request={req("closed", { sentById: A })} asker={asker} receiver={receiver} viewerMemberId={A} detailHref="/w/x/requests/1" />);
    const link = screen.getByRole("link", { name: "Mở chi tiết và chuỗi trao đổi" });
    expect(link.getAttribute("href")).toBe("/w/x/requests/1");
    expect(link.closest("article")).toBeTruthy();
    expect(link.closest("footer")?.parentElement?.tagName).toBe("ARTICLE");
  });
  it("is absent without detailHref", () => {
    render(<RequestCard request={req("closed", { sentById: A })} asker={asker} receiver={receiver} viewerMemberId={A} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("screen reader semantics", () => {
  it("MemberCard mascot reads 'Phong — đang làm'", () => {
    render(<MemberCard member={receiver} status={{ memberId: B, presence: "working", doing: "x", branch: null, waitingOn: [], updatedAt: T, updatedBy: "human" }} />);
    expect(screen.getByRole("img", { name: "Phong — đang làm" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Phong — đang làm" })).toBeTruthy();
  });
  it("default mascot title is natural Vietnamese; decorative mascots are hidden", () => {
    const { container } = render(<><Mascot mascot={asker.mascot} mood="focused" /><Mascot mascot={asker.mascot} decorative /></>);
    expect(screen.getByRole("img", { name: "Linh vật Milo, đang làm" })).toBeTruthy();
    expect(container.querySelectorAll("img[aria-hidden='true']")).toHaveLength(1);
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
  it("toasts: polite status region for info, assertive alert region for errors", () => {
    function Fire() {
      const toast = useToast();
      return (
        <>
          <button onClick={() => toast("Đã lưu", "success")}>ok</button>
          <button onClick={() => toast("Lỗi mạng", "danger")}>bad</button>
        </>
      );
    }
    render(<ToastProvider><Fire /></ToastProvider>);
    const polite = screen.getByRole("status");
    const alert = screen.getByRole("alert");
    expect(polite.getAttribute("aria-live")).toBe("polite");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    act(() => { fireEvent.click(screen.getByText("ok")); fireEvent.click(screen.getByText("bad")); });
    expect(polite.textContent).toContain("Đã lưu");
    expect(alert.textContent).toContain("Lỗi mạng");
    expect(screen.getAllByRole("status")).toHaveLength(1); // no nested live roles inside toasts
  });
});

describe("module hygiene", () => {
  const dir = `${process.cwd()}/src/`;
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.tsx"));
  const text = (f: string) => readFileSync(dir + f, "utf8");
  it('every module that uses hooks has "use client" as its first statement', () => {
    for (const f of files) {
      const src = text(f);
      if (/\buse(State|Effect|Ref|Context|Id|Callback|Memo|Reducer)\b|createContext/.test(src)) {
        expect(src.trimStart().startsWith('"use client"'), f).toBe(true);
      }
    }
  });
  it("logic modules stay server-safe", () => {
    expect(text("request-logic.ts")).not.toMatch(/from "react"|^"use client"/m);
  });
  it("uses only the canonical surface token (oh-surface-2)", () => {
    for (const f of files) expect(text(f), f).not.toMatch(/oh-surface2/);
  });
  it("every oh-* color utility exists in the brand theme", () => {
    const theme = readFileSync(`${process.cwd()}/../brand/src/tailwind-theme.css`, "utf8");
    const defined = new Set([...theme.matchAll(/--color-oh-([a-z0-9-]+):/g)].map((m) => m[1]));
    for (const f of files) {
      for (const m of text(f).matchAll(/\b(?:bg|text|border|ring|outline|fill|stroke)-oh-([a-z0-9-]+)/g)) {
        const name = m[1]!;
        // skip non-color utilities that share the prefix (text-oh-sm, outline-oh-..)
        if (/^(xs|sm|base|lg|xl|2xl|3xl|4xl)$/.test(name)) continue;
        expect(defined.has(name), `${f}: ${m[0]}`).toBe(true);
      }
    }
  });
});
