"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, cn, useToast } from "@officehub/ui";
import { RequestKind, type Role, type Task } from "@officehub/shared";
import { errorMessage } from "@/lib/errors";
import { useStableCallback } from "@/lib/use-stable";
import { useCreateRequest } from "@/lib/hooks";
import { KIND_HINT, KIND_LABEL, dateInputToIso } from "@/lib/requests";
import { Field, Select, TextArea, TextInput } from "./form";
import { RoleRadio } from "./parties";

/**
 * "Giao việc": the orchestrator writes straight to a role. The request is created already "sent"
 * (the human wrote it; no approval step). contract_change only goes to the Leader.
 */
export function NewRequestDialog({
  open,
  onClose,
  slug,
  roles,
  tasks,
  defaultTaskId = null,
  defaultRoleId = null,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  roles: Role[];
  tasks: Task[];
  defaultTaskId?: string | null;
  defaultRoleId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateRequest(slug);
  const [roleId, setRoleId] = useState<string | null>(defaultRoleId);
  const [kind, setKind] = useState<RequestKind>("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [taskId, setTaskId] = useState<string>(defaultTaskId ?? "");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setRoleId(defaultRoleId);
      setTaskId(defaultTaskId ?? "");
    }
  }, [open, defaultRoleId, defaultTaskId]);

  const leader = roles.find((r) => r.key === "leader");
  const pickKind = (k: RequestKind) => {
    setKind(k);
    if (k === "contract_change" && leader) setRoleId(leader.id);
  };
  const role = roles.find((r) => r.id === roleId) ?? null;
  const kindOk = kind !== "contract_change" || role?.key === "leader";
  const valid = !!role && kindOk && title.trim().length > 0 && body.trim().length > 0;
  const close = useStableCallback(() => onClose());

  const submit = () => {
    if (!valid) return;
    setError(null);
    create.mutate(
      { receiverRoleId: role!.id, kind, title: title.trim(), body: body.trim(), taskId: taskId || null, dueAt: dateInputToIso(due) },
      {
        onSuccess: (r) => {
          toast(`Đã giao cho ${role!.name}.`, "success");
          setTitle("");
          setBody("");
          setDue("");
          setKind("question");
          close();
          router.push(`/w/${slug}/requests/${r.id}`);
        },
        onError: (e) => {
          setError(errorMessage(e));
          toast(errorMessage(e), "danger");
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Giao việc"
      description="Bạn viết thẳng cho một vai trò. Agent của vai trò đó nhận ngay và coi đây là chỉ đạo, trong vùng của mình."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Để sau</Button>
          <Button variant="primary" icon="send" disabled={!valid} loading={create.isPending} onClick={submit}>
            Giao việc
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <RoleRadio roles={roles} value={roleId} onChange={setRoleId} label="Giao cho vai trò" disabled={(r) => kind === "contract_change" && r.key !== "leader"} />
        <fieldset>
          <legend className="mb-2 text-oh-sm font-medium">Loại</legend>
          <div role="radiogroup" aria-label="Loại yêu cầu" className="flex flex-wrap gap-1.5">
            {RequestKind.options.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                title={KIND_HINT[k]}
                onClick={() => pickKind(k)}
                className={cn(
                  "rounded-oh-full border px-3 py-1 text-oh-xs font-medium focus-visible:outline-3 focus-visible:outline-oh-focus",
                  kind === k ? "border-oh-primary bg-oh-primary-soft text-oh-primary-soft-fg" : "border-oh-border text-oh-ink-muted hover:bg-oh-surface-2",
                )}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-oh-xs text-oh-ink-muted">{KIND_HINT[kind]}</p>
        </fieldset>
        <Field label="Tiêu đề">{(id) => <TextInput id={id} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Thêm route GET /queue" />}</Field>
        <Field label="Nội dung" hint="Không dán khóa bí mật (API key, token) vào đây.">
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
          Giao việc
        </button>
      </form>
    </Dialog>
  );
}
