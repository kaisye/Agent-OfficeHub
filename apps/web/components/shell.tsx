"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Dialog, Drawer, Icon, Mascot, cn, relativeTimeVi, requestDirectionLabel, type IconName } from "@officehub/ui";
import { getApi } from "@/lib/api";
import { useBoard, useDecisions, useInbox, useRequests } from "@/lib/hooks";
import { memberMap, needsMe } from "@/lib/requests";
import { useWorkspace } from "./workspace";

const LINKS: { href: string; label: string; icon: IconName; exact?: boolean; badge?: boolean }[] = [
  { href: "", label: "Văn phòng", icon: "office", exact: true },
  { href: "/requests", label: "Yêu cầu", icon: "request", badge: true },
  { href: "/decisions", label: "Quyết định", icon: "decision" },
  { href: "/agents", label: "Agent của tôi", icon: "bot" },
  { href: "/me/mascot", label: "Mascot của bạn", icon: "smile" },
];

/** Desk Buddies leaf mark (two leaves on a Forest tile). */
export function LeafMark({ size = 34 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="inline-grid shrink-0 place-items-center bg-oh-primary text-oh-primary-fg" style={{ width: size, height: size * 1.08, borderRadius: "13px 13px 10px 10px", transform: "rotate(-5deg)" }}>
      <Icon name="leaf" size={Math.round(size * 0.62)} />
    </span>
  );
}

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: ReactNode }) {
  const { slug } = useWorkspace();
  const base = `/w/${slug}`;
  const pathname = usePathname();
  const board = useBoard(slug);
  const inbox = useInbox(slug);
  const { me } = useWorkspace();
  const mine = needsMe(inbox.data, board.data, me.id);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  // Cmd/Ctrl+K opens the quick search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const current = LINKS.find((l) => isActive(pathname, base + l.href, l.exact));
  const crumb = current?.label ?? (pathname.includes("/tasks/") ? "Bàn giao" : "");

  return (
    <div>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded-oh-md focus:bg-oh-surface focus:px-3 focus:py-2 focus:outline-3 focus:outline-oh-focus">
        Bỏ qua điều hướng
      </a>
      <aside className="oh-sidebar" aria-label="Thanh bên">
        <Link href={base} aria-label="Office Hub, về Văn phòng" className="flex items-center gap-2.5 rounded-oh-md px-2.5 focus-visible:outline-3 focus-visible:outline-oh-focus">
          <LeafMark />
          <span className="oh-hide-sm text-oh-xl font-bold leading-tight tracking-tight">
            office hub
            <small className="mt-0.5 block text-[9px] font-medium tracking-[0.25em] text-oh-ink-muted">WARM STUDIO</small>
          </span>
        </Link>

        <div className="oh-hide-sm mb-6 mt-7 flex items-center gap-2.5 rounded-oh-md border border-oh-border bg-oh-surface p-3">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-oh-md bg-oh-primary-soft font-serif text-oh-primary-soft-fg">
            {(board.data?.workspace.name ?? "O").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <b className="block truncate text-oh-sm">{board.data?.workspace.name ?? "Office Hub"}</b>
            <small className="block text-oh-xs text-oh-ink-muted">Không gian của nhóm</small>
          </span>
        </div>

        <nav aria-label="Điều hướng chính" className="mt-7 grid gap-1.5 sm:mt-0">
          {LINKS.map((l) => (
            <Link key={l.href} href={base + l.href} aria-current={isActive(pathname, base + l.href, l.exact) ? "page" : undefined} aria-label={l.label} title={l.label} className="oh-nav-link focus-visible:outline-3 focus-visible:outline-oh-focus">
              <Icon name={l.icon} size={19} />
              <span className="oh-hide-sm">{l.label}</span>
              {l.badge && mine.length > 0 && (
                <Badge tone="human" className="oh-hide-sm ml-auto" aria-label={`${mine.length} yêu cầu cần bạn xử lý`}>
                  {mine.length}
                </Badge>
              )}
            </Link>
          ))}
        </nav>

        <div className="mt-auto">
          <SelfMenu base={base} />
        </div>
      </aside>

      <div className="oh-main-shell">
        <header className="oh-topbar">
          <div className="flex min-w-0 items-center gap-3 text-oh-sm text-oh-ink-muted">
            <span className="oh-hide-sm hidden truncate sm:inline">{board.data?.workspace.name ?? "Office Hub"}</span>
            <Icon name="chevron" size={14} className="hidden sm:block" />
            <b className="truncate font-medium text-oh-ink">{crumb}</b>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <button type="button" onClick={() => setSearchOpen(true)} className="flex items-center gap-2 rounded-oh-md border border-oh-border bg-oh-surface px-3 py-2 text-oh-sm text-oh-ink-muted hover:border-oh-border-strong focus-visible:outline-3 focus-visible:outline-oh-focus" aria-label="Tìm nhanh (Ctrl hoặc Cmd + K)">
              <Icon name="search" size={16} />
              <span className="hidden sm:inline">Tìm nhanh</span>
              <kbd className="ml-1 hidden rounded-[4px] border border-oh-border px-1 text-[11px] sm:inline">⌘K</kbd>
            </button>
            <button type="button" onClick={() => setBellOpen(true)} className="relative rounded-oh-md p-2 text-oh-ink-muted hover:bg-oh-surface-2 focus-visible:outline-3 focus-visible:outline-oh-focus" aria-label={mine.length > 0 ? `Hộp thư: ${mine.length} việc cần bạn` : "Hộp thư: trống"}>
              <Icon name="bell" size={20} />
              {mine.length > 0 && <span aria-hidden="true" className="absolute right-1.5 top-1 grid min-w-4 place-items-center rounded-oh-full border border-oh-surface px-1 text-[10px] font-bold leading-4 text-white" style={{ background: "var(--oh-brand-cognac)" }}>{mine.length}</span>}
            </button>
          </div>
        </header>
        <main id="main" className="oh-content min-w-0">
          {children}
        </main>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <NotificationDrawer open={bellOpen} onClose={() => setBellOpen(false)} />
    </div>
  );
}

/* ---------- self block + account menu ---------- */
function SelfMenu({ base }: { base: string }) {
  const { me } = useWorkspace();
  const board = useBoard(me.workspaceSlug);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const presence = board.data?.cards.find((c) => c.memberId === me.id)?.presence ?? "offline";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const logout = async () => {
    await getApi().logout();
    qc.clear();
    router.replace("/login");
  };
  const item = "flex w-full items-center gap-2 rounded-oh-md px-3 py-2 text-left text-oh-sm hover:bg-oh-surface-2 focus-visible:outline-3 focus-visible:outline-oh-focus";
  return (
    <div ref={ref} className="relative border-t border-oh-border pt-4">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Menu của ${me.displayName}`} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-oh-md text-left focus-visible:outline-3 focus-visible:outline-oh-focus max-[760px]:justify-center">
        <Mascot mascot={me.mascot} presence={presence} size={32} title={me.displayName} />
        <span className="oh-hide-sm min-w-0 flex-1">
          <b className="block truncate text-oh-sm">{me.displayName}</b>
          <small className="block text-oh-xs text-oh-ink-muted">{me.role === "admin" ? "Quản trị" : "Thành viên"}</small>
        </span>
      </button>
      {open && (
        <div role="menu" aria-label="Tài khoản" className="absolute bottom-full left-0 mb-2 w-60 rounded-oh-lg border border-oh-border bg-oh-surface p-1.5 shadow-oh-lg">
          <p className="px-3 py-2 text-oh-xs text-oh-ink-muted">{me.displayName} · {me.role === "admin" ? "Quản trị" : "Thành viên"}</p>
          <Link role="menuitem" href={`${base}/me/mascot`} className={item} onClick={() => setOpen(false)}>Mascot của bạn</Link>
          <Link role="menuitem" href={`${base}/agents`} className={item} onClick={() => setOpen(false)}>Agent của tôi</Link>
          <ThemeToggle className={item} />
          <button role="menuitem" type="button" className={item} onClick={logout}>
            <Icon name="logout" size={16} />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    setTheme(t === "dark" || t === "light" ? t : null);
  }, []);
  const next = () => {
    const dark = theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const n = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", n);
    try {
      localStorage.setItem("officehub.theme", n);
    } catch {
      /* ignore */
    }
    setTheme(n);
  };
  return (
    <button role="menuitem" type="button" className={className} onClick={next}>
      Đổi giao diện sáng / tối
    </button>
  );
}

/* ---------- Tìm nhanh (Cmd/Ctrl+K) ---------- */
interface Hit {
  key: string;
  kind: "Thành viên" | "Yêu cầu" | "Quyết định";
  title: string;
  sub: string;
  href: string;
  mascot?: import("@officehub/shared").Mascot;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { slug } = useWorkspace();
  const router = useRouter();
  const board = useBoard(slug);
  const requests = useRequests(slug);
  const decisions = useDecisions(slug);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const all = useMemo<Hit[]>(() => {
    const members = (board.data?.members ?? []).map((m): Hit => ({ key: `m-${m.id}`, kind: "Thành viên", title: m.displayName, sub: m.areas.join(", ") || "Thành viên", href: `/w/${slug}?member=${m.id}`, mascot: m.mascot }));
    const reqs = (requests.data ?? []).map((r): Hit => ({ key: `r-${r.id}`, kind: "Yêu cầu", title: r.title, sub: r.status, href: `/w/${slug}/requests?open=${r.id}` }));
    const decs = (decisions.data ?? []).map((d): Hit => ({ key: `d-${d.id}`, kind: "Quyết định", title: d.title, sub: d.rationale ?? "", href: `/w/${slug}/decisions` }));
    return [...members, ...reqs, ...decs];
  }, [board.data, requests.data, decisions.data, slug]);
  const needle = fold(q.trim());
  const hits = (needle ? all.filter((h) => fold(`${h.title} ${h.sub}`).includes(needle)) : all.filter((h) => h.kind === "Thành viên")).slice(0, 12);

  const go = (h: Hit) => {
    onClose();
    router.push(h.href);
  };
  return (
    <Dialog open={open} onClose={onClose} title="Tìm nhanh" description="Thành viên, yêu cầu, quyết định.">
      <input
        data-autofocus
        aria-label="Tìm thành viên, yêu cầu, quyết định"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && hits[0] && go(hits[0])}
        placeholder="Gõ tên hoặc từ khoá…"
        className="w-full rounded-oh-md border border-oh-border-strong bg-oh-surface px-3 py-2.5 text-oh-base focus-visible:outline-3 focus-visible:outline-oh-focus"
      />
      <div role="list" aria-label="Kết quả" className="mt-3 max-h-[50vh] overflow-y-auto">
        {hits.length === 0 ? (
          <p className="py-6 text-center text-oh-sm text-oh-ink-muted">Không tìm thấy kết quả cho “{q}”.</p>
        ) : (
          hits.map((h) => (
            <button key={h.key} role="listitem" type="button" onClick={() => go(h)} className="flex w-full items-center gap-3 border-b border-oh-border px-1 py-2.5 text-left hover:bg-oh-surface-2 focus-visible:outline-3 focus-visible:outline-oh-focus">
              {h.mascot ? <Mascot mascot={h.mascot} size={32} noBadge decorative /> : <Icon name={h.kind === "Yêu cầu" ? "request" : "decision"} size={20} className="mx-1 text-oh-ink-muted" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-oh-sm font-medium">{h.title}</span>
                <small className="block truncate text-oh-xs text-oh-ink-muted">{h.sub}</small>
              </span>
              <Badge>{h.kind}</Badge>
            </button>
          ))
        )}
      </div>
    </Dialog>
  );
}

/* ---------- Hộp thư (chuông) ---------- */
function NotificationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { slug, me } = useWorkspace();
  const board = useBoard(slug);
  const inbox = useInbox(slug);
  const router = useRouter();
  const map = memberMap(board.data?.members ?? []);
  const items = needsMe(inbox.data, board.data, me.id);
  return (
    <Drawer open={open} onClose={onClose} title="Hộp thư" description="Việc đang chờ bạn. Agent chỉ soạn nháp; bạn là người bấm gửi.">
      {items.length === 0 ? (
        <p className="py-8 text-center text-oh-sm text-oh-ink-muted">Hộp thư trống. Không ai đang chờ bạn.</p>
      ) : (
        <ul>
          {items.map((r) => {
            const asker = map.get(r.askerId);
            const receiver = map.get(r.receiverId);
            const other = r.askerId === me.id ? receiver : asker;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`/w/${slug}/requests?open=${r.id}`);
                  }}
                  className={cn("flex w-full items-center gap-3 border-b border-oh-border py-4 text-left hover:bg-oh-surface-2 focus-visible:outline-3 focus-visible:outline-oh-focus")}
                >
                  {other && <Mascot mascot={other.mascot} size={32} noBadge decorative />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-oh-sm font-semibold">{r.title}</span>
                    <small className="block text-oh-xs text-oh-ink-muted">
                      {requestDirectionLabel(r, me.id, asker?.displayName ?? "", receiver?.displayName ?? "")} · {relativeTimeVi(r.updatedAt)}
                    </small>
                  </span>
                  {r.unreadForViewer && <span role="img" aria-label="Chưa đọc" className="size-2.5 shrink-0 rounded-oh-full bg-oh-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

