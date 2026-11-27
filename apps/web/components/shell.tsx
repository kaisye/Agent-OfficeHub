"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, Drawer, Icon, Mascot, cn, relativeTimeVi, useToast, type IconName } from "@officehub/ui";
import { Password } from "@officehub/shared";
import { getApi } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { useBoard, useDecisions, useQueue, useRequests } from "@/lib/hooks";
import { directionLabel, queueCount, roleMap } from "@/lib/requests";
import { useStableCallback } from "@/lib/use-stable";
import { Field, TextInput } from "./form";
import { KindChip } from "./parties";
import { useWorkspace } from "./workspace";

const LINKS: { href: string; label: string; icon: IconName; exact?: boolean; badge?: boolean }[] = [
  { href: "", label: "Chờ duyệt", icon: "shield", exact: true, badge: true },
  { href: "/office", label: "Văn phòng", icon: "office" },
  { href: "/requests", label: "Yêu cầu", icon: "request" },
  { href: "/decisions", label: "Quyết định", icon: "decision" },
  { href: "/agents", label: "Agent", icon: "bot" },
  { href: "/assistant", label: "Hỏi trợ lý", icon: "quote" },
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
  const queue = useQueue(slug);
  const n = queueCount(queue.data);
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
  const crumb = current?.label ?? (pathname.includes("/tasks/") ? "Bàn giao" : pathname.includes("/me/") ? "Mascot của bạn" : "");

  return (
    <div>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded-oh-md focus:bg-oh-surface focus:px-3 focus:py-2 focus:outline-3 focus:outline-oh-focus">
        Bỏ qua điều hướng
      </a>
      <aside className="oh-sidebar" aria-label="Thanh bên">
        <Link href={base} aria-label="Office Hub, về Chờ duyệt" className="flex items-center gap-2.5 rounded-oh-md px-2.5 focus-visible:outline-3 focus-visible:outline-oh-focus">
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
            <small className="block text-oh-xs text-oh-ink-muted">{board.data ? `${board.data.roles.length} vai trò · 1 điều phối` : "Đang tải…"}</small>
          </span>
        </div>

        <nav aria-label="Điều hướng chính" className="mt-7 grid gap-1.5 sm:mt-0">
          {LINKS.map((l) => (
            <Link key={l.href} href={base + l.href} aria-current={isActive(pathname, base + l.href, l.exact) ? "page" : undefined} aria-label={l.badge && n ? `${l.label}, ${n} việc` : l.label} title={l.label} className="oh-nav-link relative focus-visible:outline-3 focus-visible:outline-oh-focus">
              <Icon name={l.icon} size={19} />
              <span className="oh-hide-sm">{l.label}</span>
              {l.badge && n > 0 && (
                <>
                  <Badge tone="human" className="oh-hide-sm ml-auto">{n}</Badge>
                  <span aria-hidden="true" className="oh-show-sm absolute right-1 top-1 size-2 rounded-oh-full" style={{ background: "var(--oh-brand-cognac)" }} />
                </>
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
            <button type="button" onClick={() => setBellOpen(true)} className="relative rounded-oh-md p-2 text-oh-ink-muted hover:bg-oh-surface-2 focus-visible:outline-3 focus-visible:outline-oh-focus" aria-label={n > 0 ? `Chờ duyệt: ${n} việc` : "Chờ duyệt: trống"}>
              <Icon name="bell" size={20} />
              {n > 0 && <span aria-hidden="true" className="absolute right-1.5 top-1 grid min-w-4 place-items-center rounded-oh-full border border-oh-surface px-1 text-[10px] font-bold leading-4 text-white" style={{ background: "var(--oh-brand-cognac)" }}>{n}</span>}
            </button>
          </div>
        </header>
        <main id="main" className="oh-content min-w-0">
          {children}
        </main>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QueueDrawer open={bellOpen} onClose={() => setBellOpen(false)} />
    </div>
  );
}

/* ---------- self block + account menu ---------- */
function SelfMenu({ base }: { base: string }) {
  const { me } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();

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
        <Mascot mascot={me.mascot} mood="curious" size={32} title={me.displayName} />
        <span className="oh-hide-sm min-w-0 flex-1">
          <b className="block truncate text-oh-sm">{me.displayName}</b>
          <small className="block text-oh-xs text-oh-ink-muted">Người điều phối</small>
        </span>
      </button>
      {open && (
        <div role="menu" aria-label="Tài khoản" className="absolute bottom-full left-0 z-30 mb-2 w-60 rounded-oh-lg border border-oh-border bg-oh-surface p-1.5 shadow-oh-lg">
          <p className="px-3 py-2 text-oh-xs text-oh-ink-muted">{me.displayName} · người điều phối</p>
          <Link role="menuitem" href={`${base}/me/mascot`} className={item} onClick={() => setOpen(false)}>
            <Icon name="smile" size={16} />
            Mascot của bạn
          </Link>
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); setPw(true); }}>
            <Icon name="key" size={16} />
            Đổi mật khẩu
          </button>
          <ThemeToggle className={item} />
          <button role="menuitem" type="button" className={item} onClick={logout}>
            <Icon name="logout" size={16} />
            Đăng xuất
          </button>
        </div>
      )}
      <ChangePasswordDialog open={pw} onClose={() => setPw(false)} />
    </div>
  );
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { slug } = useWorkspace();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = useStableCallback(() => {
    setCurrent("");
    setNext("");
    setError(null);
    onClose();
  });
  const check = Password.password.safeParse(next);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!current || !check.success) return;
    setBusy(true);
    setError(null);
    try {
      await getApi().changePassword(slug, { current, next });
      toast("Đã đổi mật khẩu. Các phiên khác đã đăng xuất.", "success");
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Đổi mật khẩu"
      description="Các phiên đăng nhập khác sẽ bị đăng xuất."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Để sau</Button>
          <Button variant="primary" loading={busy} disabled={!current || !check.success} onClick={() => void submit()}>Đổi mật khẩu</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Mật khẩu hiện tại">{(id) => <TextInput id={id} type="password" autoComplete="current-password" data-autofocus value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
        <Field label="Mật khẩu mới" hint="Ít nhất 10 ký tự." error={error}>
          {(id, d) => <TextInput id={id} type="password" autoComplete="new-password" aria-describedby={d} value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <button type="submit" className="sr-only" tabIndex={-1}>Đổi mật khẩu</button>
      </form>
    </Dialog>
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
      <Icon name="leaf" size={16} />
      Đổi giao diện sáng / tối
    </button>
  );
}

/* ---------- Tìm nhanh (Cmd/Ctrl+K) ---------- */
interface Hit {
  key: string;
  kind: "Vai trò" | "Yêu cầu" | "Quyết định";
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
    const roles = board.data?.roles ?? [];
    const map = roleMap(roles);
    const rs = roles.map((r): Hit => ({ key: `ro-${r.id}`, kind: "Vai trò", title: r.name, sub: `${r.mission} ${r.ownedPaths.join(" ")}`, href: `/w/${slug}/office?role=${r.id}`, mascot: r.mascot }));
    const reqs = (requests.data ?? []).map((r): Hit => ({ key: `r-${r.id}`, kind: "Yêu cầu", title: r.title, sub: directionLabel(r, map), href: `/w/${slug}/requests/${r.id}` }));
    const decs = (decisions.data ?? []).map((d): Hit => ({ key: `d-${d.id}`, kind: "Quyết định", title: d.title, sub: d.rationale ?? "", href: `/w/${slug}/decisions` }));
    return [...rs, ...reqs, ...decs];
  }, [board.data, requests.data, decisions.data, slug]);
  const needle = fold(q.trim());
  const hits = (needle ? all.filter((h) => fold(`${h.title} ${h.sub}`).includes(needle)) : all.filter((h) => h.kind === "Vai trò")).slice(0, 12);

  const go = (h: Hit) => {
    onClose();
    router.push(h.href);
  };
  return (
    <Dialog open={open} onClose={onClose} title="Tìm nhanh" description="Vai trò, yêu cầu, quyết định. Gõ cả đường dẫn để biết file thuộc vùng ai.">
      <input
        data-autofocus
        aria-label="Tìm vai trò, yêu cầu, quyết định"
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

/* ---------- Chuông: tóm tắt hàng chờ ---------- */
function QueueDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { slug } = useWorkspace();
  const board = useBoard(slug);
  const queue = useQueue(slug);
  const router = useRouter();
  const roles = roleMap(board.data?.roles ?? []);
  const items = queue.data?.requests ?? [];
  const props = queue.data?.proposals ?? [];
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  return (
    <Drawer open={open} onClose={onClose} title="Chờ duyệt" description="Agent chỉ soạn nháp. Không gì đi qua lại khi bạn chưa bấm.">
      {items.length + props.length === 0 ? (
        <p className="py-8 text-center text-oh-sm text-oh-ink-muted">Không có gì chờ bạn.</p>
      ) : (
        <ul>
          {items.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => go(`/w/${slug}#req-${r.id}`)} className={cn("flex w-full items-center gap-3 border-b border-oh-border py-3.5 text-left hover:bg-oh-surface-2 focus-visible:outline-3 focus-visible:outline-oh-focus")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-oh-sm font-semibold">{r.title}</span>
                  <small className="flex flex-wrap items-center gap-1.5 text-oh-xs text-oh-ink-muted">
                    {directionLabel(r, roles)} · {relativeTimeVi(r.updatedAt)}
                  </small>
                </span>
                <KindChip kind={r.kind} />
                {r.unreadForViewer && <span role="img" aria-label="Mới" className="size-2.5 shrink-0 rounded-oh-full bg-oh-primary" />}
              </button>
            </li>
          ))}
          {props.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => go(`/w/${slug}#q-proposals`)} className="flex w-full items-center gap-3 border-b border-oh-border py-3.5 text-left hover:bg-oh-surface-2 focus-visible:outline-3 focus-visible:outline-oh-focus">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-oh-sm font-semibold">{p.title}</span>
                  <small className="text-oh-xs text-oh-ink-muted">{roles.get(p.roleId)?.name ?? "Agent"} đề xuất · {relativeTimeVi(p.createdAt)}</small>
                </span>
                <Badge tone="agent" icon="decision">Đề xuất</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
