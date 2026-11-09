import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequestCard, ToastProvider } from "@officehub/ui";
import type { Request } from "@officehub/shared";
import { createMockClient } from "../lib/api";
import { useActionRunner } from "../components/action-runner";

const PHONG = "adcf8a47-7647-4b1f-952a-76723d7a3413";
const BAO = "7f7870ee-bc43-47b5-84fc-001dc3081d57";
const REQ = "5b47fd49-596d-4b96-860a-07caac67b9d0"; // Bảo -> Phong, agent reply draft

function setup() {
  let who: string | null = PHONG;
  const api = createMockClient({ session: { get: () => who, set: (v) => (who = v) } });
  (globalThis as unknown as { __officehubApi: unknown }).__officehubApi = api;
  const members = api.server.members;
  const get = () => api.server.listRequests("tripflix", PHONG).find((r) => r.id === REQ)!;
  function Harness() {
    const runner = useActionRunner("tripflix", members, PHONG);
    const r: Request = get();
    return (
      <>
        <RequestCard
          request={r}
          asker={members.find((m) => m.id === r.askerId)!}
          receiver={members.find((m) => m.id === r.receiverId)!}
          viewerMemberId={PHONG}
          onAction={runner.handle}
        />
        {runner.dialog}
      </>
    );
  }
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { api };
}

describe("request actions in the UI", () => {
  it("shows the agent draft and only sends after the human confirms", async () => {
    const user = userEvent.setup();
    const { api } = setup();
    expect(screen.getByLabelText(/Bản nháp do agent soạn/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Gửi trả lời/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Gửi trả lời cho Bảo?");
    // nothing sent yet
    expect(api.server.requests.find((r) => r.id === REQ)!.status).toBe("reply_drafted");

    await user.click(within(dialog).getByRole("button", { name: "Gửi trả lời" }));
    await waitFor(() => expect(api.server.requests.find((r) => r.id === REQ)!.status).toBe("replied"));
    expect(api.server.requests.find((r) => r.id === REQ)!.messages.at(-1)!.sentById).toBe(PHONG);
  });

  it("cancelling the confirm leaves the draft untouched", async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await user.click(screen.getByRole("button", { name: /Gửi trả lời/ }));
    await user.click(await screen.findByRole("button", { name: "Để sau" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.server.requests.find((r) => r.id === REQ)!.status).toBe("reply_drafted");
  });

  it("the asker (Bảo) is not offered send buttons and never sees the draft", async () => {
    // viewer logic lives in canTransition/canSeeMessage; check through the card for the other side
    const api = createMockClient({ session: { get: () => BAO, set: () => {} } });
    const r = api.server.listRequests("tripflix", BAO).find((x) => x.id === REQ)!;
    const members = api.server.members;
    render(
      <RequestCard request={r} asker={members.find((m) => m.id === BAO)!} receiver={members.find((m) => m.id === PHONG)!} viewerMemberId={BAO} />,
    );
    expect(screen.queryByRole("button", { name: /Gửi/ })).toBeNull();
    expect(screen.queryByLabelText(/Bản nháp do agent soạn/)).toBeNull();
    expect(screen.queryByText(/OPENAI_API_KEY vào kho/)).toBeNull();
  });
});
