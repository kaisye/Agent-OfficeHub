"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Mascot, cn, useToast } from "@officehub/ui";
import type { Member, Task } from "@officehub/shared";
import { errorMessage } from "@/lib/errors";
import { useStableCallback } from "@/lib/use-stable";
import { getApi } from "@/lib/api";
import { useCreateRequest } from "@/lib/hooks";
import { dateInputToIso } from "@/lib/requests";
import { useQueryClient } from "@tanstack/react-query";
import { applyChange } from "@/lib/hooks";
import { Field, Select, TextArea, TextInput } from "./form";

/** "Tạo yêu cầu": saves a draft, or (after a confirm step) creates and sends. Only a human click ever sends. */
export function NewRequestDialog({
  open,
  onClose,
  slug,
  members,
  tasks,
  meId,
  defaultTaskId = null,
  defaultReceiverId = null,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  members: Member[];
  tasks: Task[];
  meId: string;
  defaultTaskId?: string | null;
  defaultReceiverId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const create = useCreateRequest(slug);
  const [receiverId, setReceiverId] = useState<string | null>(defaultReceiverId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [taskId, setTaskId] = useState<string>(defaultTaskId ?? "");
  const [due, setDue] = useState("");
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("edit");
      setError(null);
    }
  }, [open]);

  const others = members.filter((m) => m.id !== meId);
  const receiver = others.find((m) => m.id === receiverId) ?? null;
  const valid = !!receiver && title.trim().length > 0 && body.trim().length > 0;

  const reset = () => {
    setReceiverId(defaultReceiverId);
    setTitle("");
    setBody("");
    setTaskId(defaultTaskId ?? "");
    setDue("");
    setStep("edit");
    setError(null);
  };
  const close = useStableCallback(() => onClose());

  const input = () => ({
    receiverId: receiverId!,
    title: title.trim(),
    body: body.trim(),
    taskId: taskId || null,
    dueAt: dateInputToIso(due),
  });

  const saveDraft = () => {
    setError(null);
    create.mutate(input(), {
      onSuccess: (r) => {
        toast("Đã lưu bản nháp. Chưa gửi cho ai cả.", "success");
        reset();
        close();
        router.push(`/w/${slug}/requests/${r.id}`);
      },
      onError: (e) => {
        setError(errorMessage(e));
        toast(errorMessage(e), "danger");
        setStep("edit");
      },
    });
  };

  const sendNow = async () => {
    setSending(true);
    setError(null);
    let id: string | null = null;
    try {
      const r = await getApi().createRequest(slug, input());
      id = r.id;
      await getApi().actOnRequest(slug, r.id, { action: "send" });
      applyChange(qc, slug, { kind: "request", id: r.id });
      toast(`Đã gửi cho ${receiver!.displayName}.`, "success");
      reset();
      close();
      router.push(`/w/${slug}/requests/${r.id}`);
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      toast(msg, "danger");
      setStep("edit");
      if (id) {
        // Draft was saved but not sent: keep it visible.
        applyChange(qc, slug, { kind: "request", id });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={step === "confirm" ? `Gửi cho ${receiver?.displayName}?` : "Tạo yêu cầu"}
      description={step === "confirm" ? "Chỉ khi bạn bấm Gửi, yêu cầu mới tới người nhận." : "Hỏi một người cụ thể, nêu rõ cần gì. Có thể lưu nháp trước."}
      footer={
        step === "confirm" ? (
          <>
            <Button variant="ghost" onClick={() => setStep("edit")} disabled={sending}>
              Quay lại
            </Button>
            <Button variant="primary" icon="send" loading={sending} onClick={sendNow} data-autofocus>
              Gửi
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Để sau
            </Button>
            <Button variant="secondary" disabled={!valid} loading={create.isPending} onClick={saveDraft}>
              Lưu nháp
            </Button>
            <Button variant="primary" icon="send" disabled={!valid} onClick={() => setStep("confirm")}>
              Gửi…
            </Button>
          </>
        )
      }
    >
      {step === "confirm" && receiver ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Mascot mascot={receiver.mascot} mood="relaxed" size={48} title={receiver.displayName} />
            <p className="text-oh-base font-semibold">{title.trim()}</p>
          </div>
          <p className="whitespace-pre-wrap rounded-oh-md bg-oh-surface-2 p-3 text-oh-sm">{body.trim()}</p>
          {error && (
            <p role="alert" className="text-oh-sm text-oh-danger-soft-fg">
              {error}
            </p>
          )}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setStep("confirm");
          }}
        >
          <fieldset>
            <legend className="mb-2 text-oh-sm font-medium">Gửi cho ai</legend>
            <div role="radiogroup" aria-label="Người nhận" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {others.map((m, i) => {
                const on = m.id === receiverId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    data-autofocus={i === 0 ? true : undefined}
                    onClick={() => setReceiverId(m.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-oh-lg border-2 p-1.5 pr-3 text-left text-oh-sm focus-visible:outline-3 focus-visible:outline-oh-focus",
                      on ? "border-oh-primary bg-oh-primary-soft" : "border-oh-border bg-oh-surface hover:bg-oh-surface-2",
                    )}
                  >
                    <Mascot mascot={m.mascot} mood="relaxed" size={32} decorative />
                    <span className="truncate font-medium">{m.displayName}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Field label="Tiêu đề">{(id) => <TextInput id={id} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Server staging đang ghim tag nào?" />}</Field>
          <Field label="Nội dung" hint="Không dán khóa bí mật (API key, token) vào đây. Gửi key qua kênh bí mật.">
            {(id, d) => <TextArea id={id} aria-describedby={d} rows={5} maxLength={8000} value={body} onChange={(e) => setBody(e.target.value)} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gắn với việc (không bắt buộc)">
              {(id) => (
                <Select id={id} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">Không gắn việc</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.externalKey ? `${t.externalKey} · ` : ""}
                      {t.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Hạn (không bắt buộc)">{(id) => <TextInput id={id} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
          </div>
          {error && (
            <p role="alert" className="text-oh-sm text-oh-danger-soft-fg">
              {error}
            </p>
          )}
          <button type="submit" className="sr-only" tabIndex={-1}>
            Tiếp tục
          </button>
        </form>
      )}
    </Dialog>
  );
}
