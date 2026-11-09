"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Icon, Mascot } from "@officehub/ui";
import { getApi } from "@/lib/api";
import type { AssistantTurn } from "@/lib/api/types";
import { errorMessage } from "@/lib/errors";
import { useWorkspace } from "./workspace";

const SUGGESTIONS = [
  "Dũng đang làm trên nhánh nào, có conflict với mình không?",
  "Ai đang chờ ai, việc nào đang đứng?",
  "Nhóm đã chốt gì về tag theo app?",
  "Hôm nay có yêu cầu nào mình cần trả lời?",
];
const TOOL_LABEL: Record<string, string> = {
  get_team_status: "trạng thái nhóm",
  list_my_requests: "yêu cầu của bạn",
  list_decisions: "sổ quyết định",
  compare_branches: "so sánh nhánh",
};

type Msg = AssistantTurn & { tools?: string[]; error?: boolean };

/** Read-only workspace assistant: answers with the asker's visibility, never acts on their behalf. */
export function AssistantScreen() {
  const { slug, me } = useWorkspace();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [msgs, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history: AssistantTurn[] = msgs.filter((m) => !m.error).map(({ role, text }) => ({ role, text }));
    setMsgs((cur) => [...cur, { role: "user", text: q }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await getApi().askAssistant(slug, q, history);
      setMsgs((cur) => [...cur, { role: "assistant", text: res.answer, tools: res.toolsUsed }]);
    } catch (e) {
      setMsgs((cur) => [...cur, { role: "assistant", text: errorMessage(e), error: true }]);
      setDraft(q); // keep the question so it can be retried or edited
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <header className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-oh-ink-muted">Trợ lý văn phòng</p>
        <h1 className="mt-1 text-oh-3xl font-bold">Hỏi trợ lý</h1>
        <p className="mt-1 text-oh-sm text-oh-ink-muted">
          Hỏi về nhánh, việc, yêu cầu và quyết định của nhóm. Trợ lý chỉ đọc, chỉ thấy những gì bạn được xem, và không làm thay bạn.
        </p>
      </header>

      <section aria-live="polite" aria-label="Hội thoại" className="flex-1 space-y-4 rounded-oh-lg border border-oh-border bg-oh-surface p-4 shadow-oh-md sm:p-5">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center py-6 text-center">
            <Mascot mascot={{ buddy: "milo" }} mood="relaxed" size={120} decorative />
            <p className="mt-3 text-oh-base font-medium">Chào {me.displayName}, bạn muốn biết gì về văn phòng?</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="rounded-oh-full border border-oh-border bg-oh-bg px-3 py-1.5 text-oh-xs text-oh-ink hover:border-oh-primary hover:bg-oh-primary-soft focus-visible:outline-3 focus-visible:outline-oh-focus"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-oh-lg rounded-br-oh-sm bg-oh-primary px-3.5 py-2 text-oh-sm text-oh-primary-fg">{m.text}</p>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2.5">
              <Mascot mascot={{ buddy: "milo" }} mood={m.error ? "worried" : "focused"} size={32} decorative noBadge />
              <div className="min-w-0 max-w-[85%]">
                <p
                  className={
                    "whitespace-pre-wrap rounded-oh-lg rounded-tl-oh-sm border px-3.5 py-2 text-oh-sm " +
                    (m.error ? "border-oh-danger bg-oh-danger-soft text-oh-danger-soft-fg" : "border-oh-border bg-oh-bg text-oh-ink")
                  }
                >
                  {m.text}
                </p>
                {m.tools && m.tools.length > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-oh-ink-muted">
                    <Icon name="search" size={11} /> Đã xem: {m.tools.map((t) => TOOL_LABEL[t] ?? t).join(", ")}
                  </p>
                )}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div role="status" className="flex items-center gap-2.5 text-oh-xs text-oh-ink-muted">
            <Mascot mascot={{ buddy: "milo" }} mood="curious" size={32} decorative noBadge />
            Trợ lý đang xem dữ liệu nhóm…
          </div>
        )}
        <div ref={end} />
      </section>

      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <label htmlFor="ask" className="sr-only">
          Câu hỏi cho trợ lý
        </label>
        <textarea
          id="ask"
          rows={2}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          placeholder="Ví dụ: Dũng đang làm trên nhánh nào, có conflict với mình không?"
          className="min-h-11 flex-1 resize-none rounded-oh-md border border-oh-border-strong bg-oh-surface px-3 py-2 text-oh-sm focus-visible:outline-3 focus-visible:outline-oh-focus"
        />
        <Button type="submit" variant="primary" icon="send" disabled={busy || !draft.trim()}>
          Hỏi
        </Button>
      </form>
      <p className="mt-1.5 text-[11px] text-oh-ink-muted">Đừng dán mật khẩu hay key vào đây. Câu hỏi có dạng key sẽ bị chặn.</p>
    </div>
  );
}
