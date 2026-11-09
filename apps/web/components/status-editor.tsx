"use client";

import { useState } from "react";
import { Button, Card, Icon, Mascot, PRESENCE_LABEL_VI, PresencePill, cn, useToast } from "@officehub/ui";
import { PresenceState, type Member, type StatusCard } from "@officehub/shared";
import { errorMessage } from "@/lib/errors";
import { useUpdateStatus } from "@/lib/hooks";
import { Field, TextInput } from "./form";

const PRESENCES = PresenceState.options;

/** Inline "Cập nhật trạng thái" editor for my own card (BRD-02). */
export function StatusEditor({
  slug,
  me,
  members,
  current,
  onClose,
}: {
  slug: string;
  me: Member;
  members: Member[];
  current: StatusCard | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useUpdateStatus(slug);
  const [presence, setPresence] = useState<PresenceState>(current?.presence ?? "working");
  const [doing, setDoing] = useState(current?.doing ?? "");
  const [branch, setBranch] = useState(current?.branch ?? "");
  const [waitingOn, setWaitingOn] = useState<string[]>(current?.waitingOn ?? []);
  const others = members.filter((m) => m.id !== me.id);

  const toggle = (id: string) => setWaitingOn((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      { presence, doing: doing.trim() || null, branch: branch.trim() || null, waitingOn },
      {
        onSuccess: () => {
          toast("Đã cập nhật thẻ của bạn.", "success");
          onClose();
        },
        onError: (err) => toast(errorMessage(err), "danger"),
      },
    );
  };

  return (
    <Card as="section" aria-label="Cập nhật trạng thái" className="space-y-4 border-oh-primary">
      <form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-oh-sm font-medium">Bạn đang thế nào?</legend>
          <div className="flex flex-wrap gap-2">
            {PRESENCES.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={presence === p}
                aria-label={PRESENCE_LABEL_VI[p]}
                onClick={() => setPresence(p)}
                className={cn(
                  "rounded-oh-full border-2 p-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-oh-focus",
                  presence === p ? "border-oh-primary" : "border-transparent hover:border-oh-border-strong",
                )}
              >
                <PresencePill presence={p} />
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-oh-xs text-oh-ink-muted">
            <Mascot mascot={me.mascot} presence={presence} size={32} title="Xem trước" />
            <span>Linh vật của bạn sẽ đổi tư thế theo trạng thái này.</span>
          </div>
        </fieldset>

        <Field label="Đang làm gì" hint="Một câu ngắn là đủ. Đừng dán khóa bí mật vào đây.">
          {(id, d) => (
            <TextInput id={id} aria-describedby={d} maxLength={280} value={doing} onChange={(e) => setDoing(e.target.value)} placeholder="Ví dụ: Review PR #214" />
          )}
        </Field>
        <Field label="Nhánh">
          {(id) => <TextInput id={id} maxLength={200} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="feat/ten-nhanh" className="font-mono" />}
        </Field>

        <fieldset>
          <legend className="mb-2 text-oh-sm font-medium">Đang chờ ai</legend>
          <div className="flex flex-wrap gap-2">
            {others.map((m) => {
              const on = waitingOn.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(m.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-oh-full border py-0.5 pl-0.5 pr-3 text-oh-sm focus-visible:outline-3 focus-visible:outline-oh-focus",
                    on ? "border-oh-primary bg-oh-primary-soft text-oh-primary-soft-fg" : "border-oh-border bg-oh-surface hover:bg-oh-surface-2",
                  )}
                >
                  <Mascot mascot={m.mascot} mood="relaxed" size={24} title={m.displayName} />
                  {m.displayName}
                  {on && <Icon name="check" size={12} />}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Để sau
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Lưu
          </Button>
        </div>
      </form>
    </Card>
  );
}
