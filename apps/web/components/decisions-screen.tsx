"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, DecisionCard, Dialog, EmptyState, Icon, Mascot, TaskChip, cn, relativeTimeVi, useToast } from "@officehub/ui";
import type { DecisionProposal, Role, Task } from "@officehub/shared";
import { errorMessage } from "@/lib/errors";
import { useBoard, useDecisions, useProposals, useRecordDecision } from "@/lib/hooks";
import { roleMap } from "@/lib/requests";
import { useStableCallback } from "@/lib/use-stable";
import { Field, Select, TextArea, TextInput } from "./form";
import { RoleChips } from "./parties";
import { ProposalCard } from "./queue-screen";
import { ListSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
type Tab = "log" | "proposals";

export function DecisionsScreen() {
  const { slug, me } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "proposals" ? "proposals" : "log";
  const board = useBoard(slug);
  const decisions = useDecisions(slug);
  const proposals = useProposals(slug);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const roles = board.data?.roles ?? [];
  const byId = roleMap(roles);

  const list = useMemo(() => {
    const term = fold(q.trim());
    const all = decisions.data ?? [];
    return term ? all.filter((d) => fold(`${d.title} ${d.body} ${d.rationale}`).includes(term)) : all;
  }, [decisions.data, q]);
  const pending = (proposals.data ?? []).filter((p) => p.status === "pending");
  const resolved = (proposals.data ?? []).filter((p) => p.status !== "pending");
  const setTab = (t: Tab) => router.replace(`/w/${slug}/decisions${t === "proposals" ? "?tab=proposals" : ""}`, { scroll: false });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-oh-2xl font-bold">Quyết định</h1>
          <p className="text-oh-sm text-oh-ink-muted">Chỉ bạn ghi quyết định. Agent chỉ đề xuất, và đọc lại qua read_decisions.</p>
        </div>
        <Button variant="primary" icon="decision" onClick={() => setOpen(true)}>
          Ghi quyết định
        </Button>
      </div>

      <div role="tablist" aria-label="Quyết định" className="flex gap-1">
        {(
          [
            ["log", "Sổ quyết định", decisions.data?.length ?? 0],
            ["proposals", "Đề xuất", pending.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("inline-flex items-center gap-2 rounded-oh-md px-3.5 py-2 text-oh-sm font-medium focus-visible:outline-3 focus-visible:outline-oh-focus", tab === id ? "bg-oh-primary-soft text-oh-primary-soft-fg" : "text-oh-ink-muted hover:bg-oh-surface-2")}
          >
            {label}
            <Badge tone={id === "proposals" && n > 0 ? "human" : "neutral"}>{n}</Badge>
          </button>
        ))}
      </div>

      {tab === "log" ? (
        <div role="tabpanel" aria-label="Sổ quyết định" className="space-y-4">
          <div className="relative">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-oh-ink-muted" />
            <TextInput type="search" aria-label="Tìm quyết định" placeholder="Tìm theo tiêu đề, nội dung hoặc lý do" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          {!board.data || !decisions.data ? (
            <ListSkeleton label="Đang tải quyết định…" />
          ) : list.length === 0 ? (
            q ? (
              <EmptyState title="Không thấy quyết định nào khớp" mood="curious" mascot={me.mascot} description="Thử từ khóa ngắn hơn, không cần gõ dấu cũng được." />
            ) : (
              <EmptyState title="Chưa có quyết định nào" mascot={me.mascot} description="Khi chốt một việc, ghi lại cùng lý do để agent không phải hỏi lại." action={<Button variant="primary" onClick={() => setOpen(true)}>Ghi quyết định đầu tiên</Button>} />
            )
          ) : (
            <ul className="space-y-4">
              {list.map((d) => {
                const task = d.taskId ? board.data!.tasks.find((t) => t.id === d.taskId) : null;
                const from = d.proposalId ? (proposals.data ?? []).find((p) => p.id === d.proposalId) : null;
                return (
                  <li key={d.id} className="space-y-2">
                    <DecisionCard decision={d} decidedBy={{ displayName: "Bạn", mascot: board.data!.orchestrator.mascot }} />
                    <div className="flex flex-wrap items-center gap-2 px-1 text-oh-xs text-oh-ink-muted">
                      {d.roleIds.map((id) => {
                        const r = byId.get(id);
                        return r ? (
                          <span key={id} className="inline-flex items-center gap-1 rounded-oh-full bg-oh-surface-2 py-0.5 pl-0.5 pr-2">
                            <Mascot mascot={r.mascot} mood="relaxed" size={24} decorative noBadge />
                            {r.name}
                          </span>
                        ) : null;
                      })}
                      {from && <Badge tone="agent" icon="bot">Từ đề xuất của {byId.get(from.roleId)?.name ?? "agent"}</Badge>}
                      {task && (
                        <>
                          <TaskChip task={task} />
                          <Link href={`/w/${slug}/tasks/${task.id}`} className="font-medium underline-offset-2 hover:underline">Bàn giao</Link>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div role="tabpanel" aria-label="Đề xuất" className="space-y-5">
          {!board.data || !proposals.data ? (
            <ListSkeleton label="Đang tải đề xuất…" />
          ) : (
            <>
              {pending.length === 0 ? (
                <EmptyState title="Không có đề xuất nào chờ" mood="relaxed" mascot={me.mascot} description="Agent dùng propose_decision để đề xuất; đề xuất hiện ở đây và trong hàng chờ duyệt." />
              ) : (
                <ul className="space-y-3">
                  {pending.map((p) => (
                    <li key={p.id}>
                      <ProposalCard proposal={p} roles={roles} slug={slug} />
                    </li>
                  ))}
                </ul>
              )}
              {resolved.length > 0 && (
                <section aria-labelledby="resolved-h">
                  <h2 id="resolved-h" className="mb-2 text-oh-base font-semibold">Đã xử lý</h2>
                  <ul className="divide-y divide-oh-border rounded-oh-lg border border-oh-border bg-oh-surface">
                    {resolved.map((p) => (
                      <ResolvedRow key={p.id} p={p} roles={byId} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}

      <RecordDialog open={open} onClose={() => setOpen(false)} slug={slug} tasks={board.data?.tasks ?? []} roles={roles} />
    </div>
  );
}

function ResolvedRow({ p, roles }: { p: DecisionProposal; roles: Map<string, Role> }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-oh-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium">{p.title}</span>
        <small className="text-oh-xs text-oh-ink-muted">
          {roles.get(p.roleId)?.name ?? "Agent"} đề xuất · {p.resolvedAt ? relativeTimeVi(p.resolvedAt) : ""}
        </small>
      </span>
      <Badge tone={p.status === "accepted" ? "success" : "neutral"} icon={p.status === "accepted" ? "check" : "cancel"}>
        {p.status === "accepted" ? "Đã ghi" : "Đã từ chối"}
      </Badge>
    </li>
  );
}

function RecordDialog({ open, onClose, slug, tasks, roles }: { open: boolean; onClose: () => void; slug: string; tasks: Task[]; roles: Role[] }) {
  const toast = useToast();
  const record = useRecordDecision(slug);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rationale, setRationale] = useState("");
  const [taskId, setTaskId] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const close = useStableCallback(() => onClose());
  const valid = title.trim() && rationale.trim();

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setError(null);
    record.mutate(
      { title: title.trim(), body: body.trim(), rationale: rationale.trim(), taskId: taskId || null, roleIds },
      {
        onSuccess: () => {
          toast("Đã ghi quyết định.", "success");
          setTitle("");
          setBody("");
          setRationale("");
          setTaskId("");
          setRoleIds([]);
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
          <Button variant="ghost" onClick={close}>Để sau</Button>
          <Button variant="primary" icon="decision" disabled={!valid} loading={record.isPending} onClick={() => submit()}>Ghi lại</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tiêu đề">{(id) => <TextInput id={id} data-autofocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Nội dung">{(id) => <TextArea id={id} rows={3} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
        <Field label="Lý do (bắt buộc)" hint="Không dán khóa bí mật vào đây.">
          {(id, d) => <TextArea id={id} aria-describedby={d} rows={3} maxLength={5000} required value={rationale} onChange={(e) => setRationale(e.target.value)} />}
        </Field>
        <RoleChips roles={roles} value={roleIds} onChange={setRoleIds} label="Vai trò liên quan (không bắt buộc)" />
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
        {error && <p role="alert" className="text-oh-sm text-oh-danger-soft-fg">{error}</p>}
        <button type="submit" className="sr-only" tabIndex={-1}>Ghi lại</button>
      </form>
    </Dialog>
  );
}
