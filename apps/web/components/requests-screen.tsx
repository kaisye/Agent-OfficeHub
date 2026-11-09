"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { Badge, Button, Drawer, EmptyState, Icon, Mascot, cn, relativeTimeVi, requestDirectionLabel, requestStatusText } from "@officehub/ui";
import type { Member, Request, RequestStatus } from "@officehub/shared";
import { useBoard, useInbox, useRequests } from "@/lib/hooks";
import { memberMap, needsMe } from "@/lib/requests";
import { NewRequestDialog } from "./new-request-dialog";
import { RequestDetail } from "./request-detail";
import { ListSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace";

type Tab = "mine" | "asked" | "all";
const TABS: { id: Tab; label: string }[] = [
  { id: "mine", label: "Cần tôi xử lý" },
  { id: "asked", label: "Tôi đã hỏi" },
  { id: "all", label: "Tất cả" },
];

const COLUMNS: { id: string; label: string; dot: string; statuses: RequestStatus[] }[] = [
  { id: "draft", label: "Bản nháp", dot: "var(--oh-agent)", statuses: ["draft", "reply_drafted"] },
  { id: "sent", label: "Đã gửi", dot: "var(--oh-warning)", statuses: ["sent"] },
  { id: "replied", label: "Đã có trả lời", dot: "var(--oh-brand-cognac)", statuses: ["replied"] },
  { id: "done", label: "Xong", dot: "var(--oh-success)", statuses: ["closed", "cancelled"] },
];

export function RequestsScreen() {
  const { slug, me } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "mine") as Tab;
  const openId = params.get("open");
  const board = useBoard(slug);
  const inbox = useInbox(slug);
  const all = useRequests(slug);
  const [creating, setCreating] = useState(false);
  const members = board.data?.members ?? [];

  const mine = needsMe(inbox.data, board.data, me.id);
  const list: Request[] = tab === "mine" ? mine : tab === "asked" ? (all.data ?? []).filter((r) => r.askerId === me.id) : (all.data ?? []);
  const counts: Record<Tab, number> = {
    mine: mine.length,
    asked: (all.data ?? []).filter((r) => r.askerId === me.id && !["closed", "cancelled"].includes(r.status)).length,
    all: all.data?.length ?? 0,
  };
  const loading = !board.data || !all.data || !inbox.data;
  const map = memberMap(members);

  const url = (t: Tab, open?: string | null) => `/w/${slug}/requests?tab=${t}${open ? `&open=${open}` : ""}`;
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
          <p className="mb-2 text-[11px] font-semibold tracking-[0.15em] text-oh-ink-muted">TRAO ĐỔI GIỮA CÁC BẠN</p>
          <h1 className="text-oh-3xl font-bold tracking-tight">Yêu cầu</h1>
          <p className="mt-1 text-oh-sm text-oh-ink-muted">Agent chỉ soạn nháp. Chỉ bạn mới bấm gửi.</p>
        </div>
        <Button variant="primary" icon="request" onClick={() => setCreating(true)}>
          Tạo yêu cầu
        </Button>
      </div>

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
            <Badge tone={t.id === "mine" && counts.mine > 0 ? "human" : "neutral"}>{counts[t.id]}</Badge>
          </button>
        ))}
      </div>

      <div id="requests-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {loading ? (
          <ListSkeleton label="Đang tải yêu cầu…" />
        ) : list.length === 0 ? (
          <EmptyForTab tab={tab} onCreate={() => setCreating(true)} mascot={me.mascot} />
        ) : (
          <div className="oh-kanban grid items-start gap-4" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {COLUMNS.map((col) => {
              const items = list.filter((r) => col.statuses.includes(r.status));
              return (
                <section key={col.id} aria-label={col.label} className="min-h-40 rounded-oh-lg bg-oh-surface-2 p-3">
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
                          <KanbanCard request={r} asker={map.get(r.askerId)} receiver={map.get(r.receiverId)} meId={me.id} onOpen={() => openRequest(r.id)} />
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
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} slug={slug} members={members} tasks={board.data?.tasks ?? []} meId={me.id} />
    </div>
  );
}

function KanbanCard({ request: r, asker, receiver, meId, onOpen }: { request: Request; asker?: Member; receiver?: Member; meId: string; onOpen: () => void }) {
  if (!asker || !receiver) return null;
  const side = meId === r.askerId ? "asker" : meId === r.receiverId ? "receiver" : "observer";
  const other = side === "receiver" ? asker : receiver;
  const { label } = requestStatusText(r, side, other.displayName);
  const last = r.messages[r.messages.length - 1];
  const agentDraft = !!last && last.sentById === null && last.authoredBy === "agent";
  const overdue = !!r.dueAt && ["sent", "reply_drafted", "replied"].includes(r.status) && new Date(r.dueAt).getTime() < Date.now();
  return (
    <article
      aria-label={`Yêu cầu: ${r.title}`}
      data-status={r.status}
      className={cn("rounded-oh-md border bg-oh-surface shadow-oh-sm transition hover:-translate-y-0.5 hover:border-oh-border-strong", agentDraft ? "border-dashed border-oh-agent" : "border-oh-border")}
    >
      <button type="button" onClick={onOpen} aria-label={`Mở chi tiết: ${r.title}`} className="block w-full rounded-oh-md p-3.5 text-left focus-visible:outline-3 focus-visible:outline-oh-focus">
        <p className="mb-2 flex items-center gap-1.5 text-oh-xs font-medium text-oh-ink-muted">
          {r.unreadForViewer && <span role="img" aria-label="Chưa đọc" data-unread className="size-2 shrink-0 rounded-oh-full bg-oh-primary" />}
          {agentDraft && <Icon name="bot" size={13} className="text-oh-agent" />}
          <span className={agentDraft ? "text-oh-agent" : undefined}>{requestDirectionLabel(r, meId, asker.displayName, receiver.displayName)}</span>
        </p>
        <h3 className="text-oh-sm font-semibold">{r.title}</h3>
        {last && <p className="mt-1.5 line-clamp-2 text-oh-xs text-oh-ink-muted">{last.body}</p>}
        <footer className="mt-3 flex items-center justify-between gap-2 border-t border-oh-border pt-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-oh-xs">
            <Mascot mascot={other.mascot} mood="relaxed" size={24} decorative noBadge />
            <span className="truncate">{other.displayName}</span>
          </span>
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {overdue && <Badge tone="danger" icon="alert">Quá hạn</Badge>}
            <Badge tone={r.status === "closed" ? "success" : r.status === "cancelled" ? "neutral" : agentDraft ? "agent" : "warning"}>{label}</Badge>
          </span>
        </footer>
        <small className="mt-1.5 block text-[11px] text-oh-ink-muted">{relativeTimeVi(r.updatedAt)}</small>
      </button>
    </article>
  );
}

function EmptyForTab({ tab, onCreate, mascot }: { tab: Tab; onCreate: () => void; mascot: import("@officehub/shared").Mascot }) {
  const copy: Record<Tab, { title: string; description: string }> = {
    mine: { title: "Hộp thư trống", description: "Không ai đang chờ bạn. Tranh thủ nghỉ chút nhé." },
    asked: { title: "Bạn chưa hỏi ai", description: "Cần thông tin từ đồng đội? Tạo yêu cầu, hoặc nhờ agent soạn nháp." },
    all: { title: "Chưa có yêu cầu nào", description: "Khi ai đó hỏi hoặc bạn hỏi, mọi thứ sẽ hiện ở đây." },
  };
  return (
    <EmptyState
      title={copy[tab].title}
      description={copy[tab].description}
      mascot={mascot}
      mood={tab === "mine" ? "sleeping" : "relaxed"}
      action={
        tab !== "mine" ? (
          <Button variant="primary" icon="request" onClick={onCreate}>
            Tạo yêu cầu
          </Button>
        ) : undefined
      }
    />
  );
}
