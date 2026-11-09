"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Icon, Mascot, cn } from "@officehub/ui";
import { getApi } from "@/lib/api";
import { useBoard, useInbox } from "@/lib/hooks";
import { needsMe } from "@/lib/requests";
import { useWorkspace } from "./workspace";

const LINKS = [
  { href: "", label: "Văn phòng", exact: true },
  { href: "/requests", label: "Yêu cầu", badge: true },
  { href: "/decisions", label: "Quyết định" },
  { href: "/agents", label: "Agent của tôi" },
] as const;

export function TopNav() {
  const { slug, me } = useWorkspace();
  const pathname = usePathname();
  const board = useBoard(slug);
  const inbox = useInbox(slug);
  const count = needsMe(inbox.data, board.data, me.id).length;
  const base = `/w/${slug}`;

  return (
    <header className="sticky top-0 z-30 border-b border-oh-border bg-oh-bg/90 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded-oh-md focus:bg-oh-surface focus:px-3 focus:py-2 focus:outline-3 focus:outline-oh-focus"
      >
        Bỏ qua điều hướng
      </a>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6">
        <Link href={base} className="flex min-w-0 items-center gap-2 rounded-oh-md focus-visible:outline-3 focus-visible:outline-oh-focus">
          <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-oh-md bg-oh-primary text-oh-primary-fg">
            <Icon name="status" size={18} />
          </span>
          <span className="truncate text-oh-base font-semibold">{board.data?.workspace.name ?? "Office Hub"}</span>
        </Link>

        <nav aria-label="Điều hướng chính" className="ml-2 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink key={l.href} href={base + l.href} active={isActive(pathname, base + l.href, "exact" in l)} badge={"badge" in l ? count : 0}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {count > 0 && (
            <Link
              href={`${base}/requests`}
              className="hidden items-center gap-1.5 rounded-oh-full bg-oh-primary-soft px-3 py-1.5 text-oh-sm font-medium text-oh-primary-soft-fg focus-visible:outline-3 focus-visible:outline-oh-focus sm:inline-flex"
            >
              <Icon name="bell" size={14} />
              {count} việc cần bạn
            </Link>
          )}
          <UserMenu base={base} />
        </div>
      </div>
      <nav aria-label="Điều hướng chính (di động)" className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {LINKS.map((l) => (
          <NavLink key={l.href} href={base + l.href} active={isActive(pathname, base + l.href, "exact" in l)} badge={"badge" in l ? count : 0}>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

function isActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ href, active, badge, children }: { href: string; active: boolean; badge: number; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-oh-md px-3 py-1.5 text-oh-sm font-medium focus-visible:outline-3 focus-visible:outline-oh-focus",
        active ? "bg-oh-surface-2 text-oh-ink" : "text-oh-ink-muted hover:bg-oh-surface-2 hover:text-oh-ink",
      )}
    >
      {children}
      {badge > 0 && (
        <Badge tone="human" aria-label={`${badge} yêu cầu cần bạn xử lý`}>
          {badge}
        </Badge>
      )}
    </Link>
  );
}

function UserMenu({ base }: { base: string }) {
  const { me } = useWorkspace();
  const [open, setOpen] = useState(false);
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

  const item =
    "flex w-full items-center gap-2 rounded-oh-md px-3 py-2 text-left text-oh-sm hover:bg-oh-surface-2 focus-visible:outline-3 focus-visible:outline-oh-focus";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu của ${me.displayName}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-oh-full border border-oh-border bg-oh-surface py-0.5 pl-0.5 pr-3 focus-visible:outline-3 focus-visible:outline-oh-focus"
      >
        <Mascot mascot={me.mascot} mood="relaxed" size={32} title={me.displayName} />
        <span className="hidden max-w-28 truncate text-oh-sm font-medium sm:inline">{me.displayName}</span>
      </button>
      {open && (
        <div role="menu" aria-label="Tài khoản" className="absolute right-0 mt-2 w-60 rounded-oh-lg border border-oh-border bg-oh-surface p-1.5 shadow-oh-lg">
          <p className="px-3 py-2 text-oh-xs text-oh-ink-muted">
            {me.displayName} · {me.role === "admin" ? "Quản trị" : "Thành viên"}
          </p>
          <Link role="menuitem" href={`${base}/me/mascot`} className={item} onClick={() => setOpen(false)}>
            Mascot của tôi
          </Link>
          <Link role="menuitem" href={`${base}/agents`} className={item} onClick={() => setOpen(false)}>
            Agent của tôi
          </Link>
          <ThemeToggle className={item} />
          <button role="menuitem" type="button" className={item} onClick={logout}>
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
