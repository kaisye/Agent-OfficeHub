"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { Badge, Button, EmptyState, RequestCard, cn } from "@officehub/ui";
import type { Request } from "@officehub/shared";
import { useBoard, useInbox, useRequests } from "@/lib/hooks";
import { memberMap, needsMe } from "@/lib/requests";
import { useActionRunner } from "./action-runner";
import { NewRequestDialog } from "./new-request-dialog";
import { ListSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace";

type Tab = "mine" | "asked" | "all";
const TABS: { id: Tab; label: string }[] = [
  { id: "mine", label: "Cần tôi xử lý" },
  { id: "asked", label: "Tôi đã hỏi" },
  { id: "all", label: "Tất cả" },
];

export function RequestsScreen() {
  const { slug, me } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "mine") as Tab;
  const board = useBoard(slug);
  const inbox = useInbox(slug);
  const all = useRequests(slug);
  const [creating, setCreating] = useState(false);
  const members = board.data?.members ?? [];
  const runner = useActionRunner(slug, members, me.id);

  const mine = needsMe(inbox.data, board.data, me.id);
  const list: Request[] =
    tab === "mine" ? mine : tab === "asked" ? (all.data ?? []).filter((r) => r.askerId === me.id) : (all.data ?? []);
  const counts: Record<Tab, number> = {
    mine: mine.length,
    asked: (all.data ?? []).filter((r) => r.askerId === me.id && !["closed", "cancelled"].includes(r.status)).length,
    all: all.data?.length ?? 0,
  };
  const loading = !board.data || !all.data || !inbox.data;
  const map = memberMap(members);

  const setTab = (t: Tab) => router.replace(`/w/${slug}/requests?tab=${t}`, { scroll: false });
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
          <h1 className="text-oh-2xl font-bold">Yêu cầu</h1>
          <p className="text-oh-sm text-oh-ink-muted">Agent chỉ soạn nháp. Chỉ bạn mới bấm gửi.</p>
        </div>
        <Button variant="primary" icon="request" onClick={() => setCreating(true)}>
          Tạo yêu cầu
        </Button>
      </div>

      <div role="tablist" aria-label="Lọc yêu cầu" onKeyDown={onKey} className="flex gap-1 overflow-x-auto border-b border-oh-border">
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
              "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-oh-sm font-medium focus-visible:outline-3 focus-visible:outline-oh-focus",
              tab === t.id ? "border-oh-primary text-oh-ink" : "border-transparent text-oh-ink-muted hover:text-oh-ink",
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
          <ul className="space-y-4">
            {list.map((r) => {
              const asker = map.get(r.askerId);
              const receiver = map.get(r.receiverId);
              if (!asker || !receiver) return null;
              return (
                <li key={r.id} className="space-y-1">
                  <RequestCard
                    request={r}
                    asker={asker}
                    receiver={receiver}
                    viewerMemberId={me.id}
                    onAction={runner.handle}
                    onEditDraft={() => router.push(`/w/${slug}/requests/${r.id}?edit=1`)}
                  />
                  <div className="px-1">
                    <Link
                      href={`/w/${slug}/requests/${r.id}`}
                      className="text-oh-sm font-medium underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-oh-focus"
                    >
                      Mở chi tiết và chuỗi trao đổi
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {runner.dialog}
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} slug={slug} members={members} tasks={board.data?.tasks ?? []} meId={me.id} />
    </div>
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
