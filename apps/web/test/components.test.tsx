import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastProvider } from "@officehub/ui";
import { MOCK_IDS, MOCK_SLUG, createMockClient } from "../lib/api";
import { QueueScreen } from "../components/queue-screen";
import { RequestDetail } from "../components/request-detail";
import { WorkspaceProvider } from "../components/workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const Q = MOCK_IDS.request;

async function setup(ui: ReactNode) {
  const api = createMockClient({ session: { get: () => MOCK_IDS.orchestrator, set: () => {} } });
  (globalThis as unknown as { __officehubApi: unknown }).__officehubApi = api;
  const me = await api.me();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <WorkspaceProvider slug={MOCK_SLUG} me={me}>
          {ui}
        </WorkspaceProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { api, server: api.server, user: userEvent.setup() };
}
const req = (server: ReturnType<typeof createMockClient>["server"], id: string) => server.requests.find((r) => r.id === id)!;

describe("Chờ duyệt (approval queue)", () => {
  it("shows the sections, highlights blockers first and labels agent text with its role", async () => {
    await setup(<QueueScreen />);
    expect(await screen.findByRole("heading", { name: "Chờ duyệt" })).toBeTruthy();
    for (const h of ["Nháp cần chuyển", "Câu trả lời chờ chuyển", "Agent hỏi bạn", "Đã có trả lời", "Đề xuất quyết định"]) {
      expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    }
    expect(screen.getByText("2 việc đang kẹt cần bạn trước").closest('[role="alert"]')).toBeTruthy();
    // First item in "Nháp cần chuyển" is the blocker.
    const drafts = screen.getByRole("region", { name: "Nháp cần chuyển" });
    const first = within(drafts).getAllByRole("article")[0]!;
    expect(first.getAttribute("data-kind")).toBe("blocker");
    // Agent-written draft: agent-draft frame + "agent" tag, never plain trusted text.
    expect(first.querySelector('[data-trust="agent-draft"]')).toBeTruthy();
    expect(within(first).getByText("agent")).toBeTruthy();
    // A forwarded agent message is rendered as untrusted.
    const asking = screen.getByRole("region", { name: "Agent hỏi bạn" });
    expect(within(asking).getByLabelText(/Nội dung từ Backend \(agent soạn\), chưa xác minh/)).toBeTruthy();
  });

  it("Chuyển forwards the edited draft (nothing moves before the click)", async () => {
    const { server, user } = await setup(<QueueScreen />);
    const card = (await screen.findAllByRole("article")).find((a) => a.id === `req-${Q.blockerDraft}`)!;
    expect(req(server, Q.blockerDraft).status).toBe("draft");
    const box = within(card).getByRole("textbox");
    await user.clear(box);
    await user.type(box, "Backend xem giúp lỗi 500.");
    await user.click(within(card).getByRole("button", { name: "Chuyển" }));
    await waitFor(() => expect(req(server, Q.blockerDraft).status).toBe("sent"));
    expect(req(server, Q.blockerDraft).messages[0]).toMatchObject({ body: "Backend xem giúp lỗi 500.", editedBeforeSend: true, sentById: MOCK_IDS.orchestrator });
  });

  it("offers 'Tự chuyển câu trả lời' only on questions, and sends it", async () => {
    const { server, user } = await setup(<QueueScreen />);
    const cards = await screen.findAllByRole("article");
    const blocker = cards.find((a) => a.id === `req-${Q.blockerDraft}`)!;
    expect(within(blocker).queryByLabelText(/Tự chuyển câu trả lời/)).toBeNull();
    const question = cards.find((a) => a.id === `req-${Q.questionDraft}`)!;
    await user.click(within(question).getByLabelText(/Tự chuyển câu trả lời/));
    await user.click(within(question).getByRole("button", { name: "Chuyển" }));
    await waitFor(() => expect(req(server, Q.questionDraft).status).toBe("sent"));
    expect(req(server, Q.questionDraft).autoForwardReply).toBe(true);
  });

  it("answers an agent's question, and closes an answered request", async () => {
    const { server, user } = await setup(<QueueScreen />);
    const cards = await screen.findAllByRole("article");
    const asking = cards.find((a) => a.id === `req-${Q.askingMe}`)!;
    const send = within(asking).getByRole("button", { name: "Trả lời" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await user.type(within(asking).getByRole("textbox"), "Đã đặt secret trên PC.");
    await user.click(send);
    await waitFor(() => expect(req(server, Q.askingMe).status).toBe("replied"));

    const answered = (await screen.findAllByRole("article")).find((a) => a.id === `req-${Q.repliedReview}`)!;
    await user.click(within(answered).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(req(server, Q.repliedReview).status).toBe("closed"));
  });

  it("records an edited proposal as a decision", async () => {
    const { server, user } = await setup(<QueueScreen />);
    const p = await screen.findByRole("article", { name: /Đề xuất:/ });
    const title = within(p).getByLabelText("Tiêu đề");
    await user.clear(title);
    await user.type(title, "Tối đa 20 nháp mỗi agent");
    await user.click(within(p).getByRole("button", { name: "Ghi quyết định" }));
    await waitFor(() => expect(server.proposals.find((x) => x.id === MOCK_IDS.proposal.pending)!.status).toBe("accepted"));
    expect(server.decisions[0]).toMatchObject({ title: "Tối đa 20 nháp mỗi agent", proposalId: MOCK_IDS.proposal.pending });
  });
});

describe("request detail", () => {
  it("names both parties, shows the agent reply draft and forwards it only after confirm", async () => {
    const { server, user } = await setup(<RequestDetail id={Q.replyDrafted} embedded />);
    expect(await screen.findByLabelText("Frontend gửi Design")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Chuyển trả lời" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Chuyển trả lời cho Frontend?");
    expect(req(server, Q.replyDrafted).status).toBe("reply_drafted");
    await user.click(within(dialog).getByRole("button", { name: "Chuyển trả lời" }));
    await waitFor(() => expect(req(server, Q.replyDrafted).status).toBe("replied"));
  });
});
