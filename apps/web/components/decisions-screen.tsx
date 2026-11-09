"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, DecisionCard, Dialog, EmptyState, Icon, TaskChip, useToast } from "@officehub/ui";
import { errorMessage } from "@/lib/errors";
import { useBoard, useDecisions, useRecordDecision } from "@/lib/hooks";
import { memberMap } from "@/lib/requests";
import { useStableCallback } from "@/lib/use-stable";
import { Field, Select, TextArea, TextInput } from "./form";
import { ListSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

export function DecisionsScreen() {
  const { slug, me } = useWorkspace();
  const board = useBoard(slug);
  const decisions = useDecisions(slug);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const list = useMemo(() => {
    const term = fold(q.trim());
    const all = decisions.data ?? [];
    return term ? all.filter((d) => fold(`${d.title} ${d.body} ${d.rationale}`).includes(term)) : all;
  }, [decisions.data, q]);

  const loading = !board.data || !decisions.data;
  const map = memberMap(board.data?.members ?? []);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-oh-2xl font-bold">Quyết định</h1>
          <p className="text-oh-sm text-oh-ink-muted">Sổ chung của nhóm. Chỉ người mới ghi quyết định, agent thì không.</p>
        </div>
        <Button variant="primary" icon="decision" onClick={() => setOpen(true)}>
          Ghi quyết định
        </Button>
      </div>

      <div className="relative">
        <Icon name="review" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-oh-ink-muted" />
        <TextInput type="search" aria-label="Tìm quyết định" placeholder="Tìm theo tiêu đề, nội dung hoặc lý do" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <ListSkeleton label="Đang tải quyết định…" />
      ) : list.length === 0 ? (
        q ? (
          <EmptyState title="Không thấy quyết định nào khớp" mood="curious" mascot={me.mascot} description="Thử từ khóa ngắn hơn, không cần gõ dấu cũng được." />
        ) : (
          <EmptyState
            title="Chưa có quyết định nào"
            mascot={me.mascot}
            description="Khi nhóm chốt một việc, ghi lại cùng lý do để người sau không phải hỏi lại."
            action={
              <Button variant="primary" onClick={() => setOpen(true)}>
                Ghi quyết định đầu tiên
              </Button>
            }
          />
        )
      ) : (
        <ul className="space-y-4">
          {list.map((d) => {
            const by = map.get(d.decidedById);
            const task = d.taskId ? board.data!.tasks.find((t) => t.id === d.taskId) : null;
            if (!by) return null;
            return (
              <li key={d.id} className="space-y-2">
                <DecisionCard decision={d} decidedBy={by} />
                {task && (
                  <div className="flex flex-wrap items-center gap-2 px-1">
                    <TaskChip task={task} />
                    <Link href={`/w/${slug}/tasks/${task.id}`} className="text-oh-sm font-medium underline-offset-2 hover:underline">
                      Bàn giao
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <RecordDialog open={open} onClose={() => setOpen(false)} slug={slug} tasks={board.data?.tasks ?? []} />
    </div>
  );
}

function RecordDialog({ open, onClose, slug, tasks }: { open: boolean; onClose: () => void; slug: string; tasks: import("@officehub/shared").Task[] }) {
  const toast = useToast();
  const record = useRecordDecision(slug);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rationale, setRationale] = useState("");
  const [taskId, setTaskId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const close = useStableCallback(() => onClose());
  const valid = title.trim() && rationale.trim();

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setError(null);
    record.mutate(
      { title: title.trim(), body: body.trim(), rationale: rationale.trim(), taskId: taskId || null },
      {
        onSuccess: () => {
          toast("Đã ghi quyết định.", "success");
          setTitle("");
          setBody("");
          setRationale("");
          setTaskId("");
          close();
        },
        onError: (err) => {
          setError(errorMessage(err));
          toast(errorMessage(err), "danger");
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Ghi quyết định"
      description="Nêu rõ chốt gì và vì sao. Lý do là bắt buộc."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Để sau
          </Button>
          <Button variant="primary" icon="decision" disabled={!valid} loading={record.isPending} onClick={() => submit()}>
            Ghi lại
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tiêu đề">{(id) => <TextInput id={id} data-autofocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Nội dung">{(id) => <TextArea id={id} rows={3} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
        <Field label="Lý do (bắt buộc)" hint="Không dán khóa bí mật vào đây.">
          {(id, d) => <TextArea id={id} aria-describedby={d} rows={3} maxLength={5000} required value={rationale} onChange={(e) => setRationale(e.target.value)} />}
        </Field>
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
        {error && (
          <p role="alert" className="text-oh-sm text-oh-danger-soft-fg">
            {error}
          </p>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>
          Ghi lại
        </button>
      </form>
    </Dialog>
  );
}
