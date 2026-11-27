"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { Badge, Button, Drawer, EmptyState, Icon, cn, relativeTimeVi, requestStatusText } from "@officehub/ui";
import type { Member, Request, RequestStatus, Role } from "@officehub/shared";
import { useBoard, useRequests } from "@/lib/hooks";
import { draftOf, isOverdue, partyOf, queueSection, roleMap } from "@/lib/requests";
import { Select } from "./form";
import { NewRequestDialog } from "./new-request-dialog";
import { KindChip, PartyRoute } from "./parties";
import { RequestDetail } from "./request-detail";
import { ListSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace";

type Tab = "gate" | "agents" | "all";
const TABS: { id: Tab; label: string }[] = [
  { id: "gate", label: "Chờ bạn" },
  { id: "agents", label: "Chờ agent" },
  { id: "all", label: "Tất cả" },
];
const OPEN: RequestStatus[] = ["draft", "sent", "reply_drafted", "replied"];

const COLUMNS: { id: string; label: string; dot: string; statuses: RequestStatus[] }[] = [
  { id: "draft", label: "Nháp chờ chuyển", dot: "var(--oh-agent)", statuses: ["draft", "reply_drafted"] },
  { id: "sent", label: "Đã chuyển", dot: "var(--oh-warning)", statuses: ["sent"] },
  { id: "replied", label: "Đã có trả lời", dot: "var(--oh-brand-cognac)", statuses: ["replied"] },
  { id: "done", label: "Xong", dot: "var(--oh-success)", statuses: ["closed", "cancelled"] },
];

export function RequestsScreen() {
  const { slug, me } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "all") as Tab;
  const roleFilter = params.get("role") ?? "";
  const openId = params.get("open");
  const board = useBoard(slug);
  const all = useRequests(slug);
  const [creating, setCreating] = useState(false);

  const byRole = (all.data ?? []).filter((r) => !roleFilter || r.askerRoleId === roleFilter || r.receiverRoleId === roleFilter);
  const lists: Record<Tab, Request[]> = {
    gate: byRole.filter((r) => queueSection(r) !== null),
    agents: byRole.filter((r) => r.status === "sent" && r.receiverRoleId !== null),
    all: byRole,
  };
  const list = lists[tab];
  const loading = !board.data || !all.data;

  const url = (t: Tab, open?: string | null, role = roleFilter) => `/w/${slug}/requests?tab=${t}${role ? `&role=${role}` : ""}${open ? `&open=${open}` : ""}`;
  const setTab = (t: Tab) => router.replace(url(t), { scroll: false });
  const openRequest = (id: string | null) => router.replace(url(tab, id), { scroll: false });
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + step + TABS.length) % TABS.length]!.id;
    setTab(next);
    requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.15em] text-oh-ink-muted">TRAO ĐỔI GIỮA CÁC VAI TRÒ</p>
          <h1 className="text-oh-3xl font-bold tracking-tight">Yêu cầu</h1>
          <p className="mt-1 text-oh-sm text-oh-ink-muted">Mỗi yêu cầu có hai bên: hai vai trò, hoặc bạn và một vai trò.</p>
        </div>
        <Button variant="primary" icon="request" onClick={() => setCreating(true)}>
          Giao việc
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Lọc yêu cầu" onKeyDown={onKey} className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls="requests-panel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-oh-md px-3.5 py-2 text-oh-sm font-medium focus-visible:outline-3 focus-visible:outline-oh-focus",
                tab === t.id ? "bg-oh-primary-soft text-oh-primary-soft-fg" : "text-oh-ink-muted hover:bg-oh-surface-2",
              )}
            >
              {t.label}
              <Badge tone={t.id === "gate" && lists.gate.length > 0 ? "human" : "neutral"}>{t.id === "all" ? lists.all.filter((r) => OPEN.includes(r.status)).length : lists[t.id].length}</Badge>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-oh-sm">
          <span className="whitespace-nowrap text-oh-ink-muted">Vai trò</span>
          <Select value={roleFilter} onChange={(e) => router.replace(url(tab, null, e.target.value), { scroll: false })} className="w-auto min-w-40">
            <option value="">Tất cả vai trò</option>
            {(board.data?.roles ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </label>
      </div>

      <div id="requests-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {loading ? (
          <ListSkeleton label="Đang tải yêu cầu…" />
        ) : list.length === 0 ? (
          <EmptyState
            title={tab === "gate" ? "Không có gì chờ bạn" : tab === "agents" ? "Không vai trò nào đang nợ trả lời" : "Chưa có yêu cầu nào"}
            description={tab === "all" ? "Khi agent soạn nháp hoặc bạn giao việc, mọi thứ sẽ hiện ở đây." : "Tranh thủ nghỉ chút nhé."}
            mascot={me.mascot}
            mood={tab === "gate" ? "sleeping" : "relaxed"}
            action={tab === "all" ? <Button variant="primary" icon="request" onClick={() => setCreating(true)}>Giao việc</Button> : undefined}
          />
        ) : (
          <div className="oh-kanban grid items-start gap-4" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {COLUMNS.map((col) => {
              const items = list.filter((r) => col.statuses.includes(r.status));
              return (
                <section key={col.id} aria-label={col.label} className="min-h-40 min-w-0 rounded-oh-lg bg-oh-surface-2 p-3">
                  <header className="mb-3 flex items-center gap-2 px-0.5">
                    <span aria-hidden="true" className="size-2 rounded-oh-full" style={{ background: col.dot }} />
                    <h2 className="text-oh-sm font-semibold">{col.label}</h2>
                    <span className="ml-auto text-oh-xs text-oh-ink-muted">{items.length}</span>
                  </header>
                  {items.length === 0 ? (
                    <p className="rounded-oh-md border border-dashed border-oh-border-strong px-3 py-6 text-center text-oh-xs text-oh-ink-muted">Trống</p>
                  ) : (
                    <ul className="space-y-3">
                      {items.map((r) => (
                        <li key={r.id}>
                          <KanbanCard request={r} roles={roleMap(board.data!.roles)} orchestrator={board.data!.orchestrator} onOpen={() => openRequest(r.id)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <Drawer open={!!openId} onClose={() => openRequest(null)} title="Chi tiết yêu cầu">
        {openId && <RequestDetail id={openId} embedded />}
      </Drawer>
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} slug={slug} roles={board.data?.roles ?? []} tasks={board.data?.tasks ?? []} defaultRoleId={roleFilter || null} />
    </div>
  );
}

function KanbanCard({ request: r, roles, orchestrator, onOpen }: { request: Request; roles: Map<string, Role>; orchestrator: Member; onOpen: () => void }) {
  const asker = partyOf(r.askerRoleId, roles, orchestrator);
  const receiver = partyOf(r.receiverRoleId, roles, orchestrator);
  const { label } = requestStatusText(r, { asker: asker.displayName, receiver: receiver.human ? "bạn" : receiver.displayName });
  const last = r.messages[r.messages.length - 1];
  const agentDraft = !!draftOf(r) && last?.authoredBy === "agent";
  const gate = queueSection(r) !== null;
  return (
    <article
      aria-label={`Yêu cầu: ${r.title}`}
      data-status={r.status}
      className={cn(
        "rounded-oh-md border bg-oh-surface shadow-oh-sm transition hover:-translate-y-0.5 hover:border-oh-border-strong",
        r.kind === "blocker" && r.status !== "closed" && r.status !== "cancelled" ? "border-oh-danger" : agentDraft ? "border-dashed border-oh-agent" : "border-oh-border",
      )}
    >
      <button type="button" onClick={onOpen} aria-label={`Mở chi tiết: ${r.title}`} className="block w-full rounded-oh-md p-3.5 text-left focus-visible:outline-3 focus-visible:outline-oh-focus">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-1.5">
          <PartyRoute request={r} roles={roles} orchestrator={orchestrator} />
          {r.unreadForViewer && <span role="img" aria-label="Mới" data-unread className="size-2 shrink-0 rounded-oh-full bg-oh-primary" />}
        </div>
        <h3 className="text-oh-sm font-semibold">{r.title}</h3>
        {last && (
          <p className="mt-1.5 line-clamp-2 text-oh-xs text-oh-ink-muted">
            {last.authoredBy === "agent" && <Icon name="bot" size={11} className="mr-1 inline text-oh-agent" />}
            {last.body}
          </p>
        )}
        <footer className="mt-3 flex flex-wrap items-center gap-1 border-t border-oh-border pt-2.5">
          <KindChip kind={r.kind} />
          {isOverdue(r) && <Badge tone="danger" icon="alert">Quá hạn</Badge>}
          <Badge tone={r.status === "closed" ? "success" : r.status === "cancelled" ? "neutral" : gate ? "human" : "warning"}>{label}</Badge>
        </footer>
        <small className="mt-1.5 block text-[11px] text-oh-ink-muted">{relativeTimeVi(r.updatedAt)}</small>
      </button>
    </article>
  );
}
