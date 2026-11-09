import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ---------- Icon (24px grid, stroke) ---------- */
const PATHS = {
  pr: "M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm12 6V9a3 3 0 0 0-3-3h-3m0 0 2-2m-2 2 2 2M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 3a3 3 0 1 0 0 0Z",
  merge: "M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0-12a3 3 0 1 0 0 0Zm12 12a3 3 0 1 0 0 0Zm0 0c0-6-12-3-12-9",
  close: "M18 6 6 18M6 6l12 12",
  review: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  ciFail: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-3-13 6 6m0-6-6 6",
  ciPass: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-4-10 3 3 5-6",
  deploy: "M12 3c4 2 6 6 5 11l-5 5-5-5c-1-5 1-9 5-11Zm0 6a1.5 1.5 0 1 0 0 .01M8 19l-3 2m11-2 3 2",
  issue: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6v.01M12 7v6",
  request: "M4 5h16v11H9l-5 4V5Z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
  draft: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
  reply: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v3",
  check: "M5 12.5 10 17.5 19 7",
  cancel: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM5 5l14 14",
  decision: "M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Zm-3 10 2.5 2.5L15.5 9",
  status: "M3 12h4l3-8 4 16 3-8h4",
  bot: "M12 8V4m-1-1h2M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm4 5v1m6-1v1",
  copy: "M9 9h11v11H9V9ZM5 15H4V4h11v1",
  alert: "M12 3 2 21h20L12 3Zm0 6v5m0 3v.01",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
  shield: "M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-10v5m0-9v.01",
  quote: "M4 6h7v7H6l-2 4V6Zm9 0h7v7h-5l-2 4V6Z",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m2 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Zm-4.3 13a2 2 0 0 1-3.4 0",
  key: "M15 7a4 4 0 1 1-3.5 6L3 21v-3l2-1v-2l2-1 4.5-4.5A4 4 0 0 1 15 7Z",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ---------- Button ---------- */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<ButtonVariant, string> = {
  // Primary = human decision color, always solid.
  primary: "bg-oh-primary text-oh-primary-fg hover:bg-oh-primary-hover border border-transparent",
  secondary: "bg-oh-surface text-oh-ink border border-oh-border-strong hover:bg-oh-surface-2",
  ghost: "bg-transparent text-oh-ink border border-transparent hover:bg-oh-surface-2",
  danger: "bg-oh-danger text-oh-danger-fg hover:bg-oh-danger-hover border border-transparent",
};
const SIZE = { sm: "min-h-8 px-3 text-oh-sm gap-1.5", md: "min-h-10 px-4 text-oh-base gap-2", lg: "min-h-12 px-6 text-oh-lg gap-2" } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof SIZE;
  loading?: boolean;
  icon?: IconName;
}
export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-oh-md font-medium transition-colors duration-150 cursor-pointer",
        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-oh-focus",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {loading ? "Đang xử lý…" : children}
    </button>
  );
}

/* ---------- Badge ---------- */
export type BadgeTone = "neutral" | "human" | "agent" | "untrusted" | "success" | "warning" | "danger";
const TONE: Record<BadgeTone, string> = {
  neutral: "bg-oh-surface-2 text-oh-ink-muted border-oh-border",
  human: "bg-oh-primary-soft text-oh-primary-soft-fg border-transparent",
  agent: "bg-oh-agent-soft text-oh-agent-soft-fg border-oh-agent border-dashed",
  untrusted: "bg-oh-untrusted-soft text-oh-untrusted-soft-fg border-oh-untrusted",
  success: "bg-oh-success-soft text-oh-success-soft-fg border-transparent",
  warning: "bg-oh-warning-soft text-oh-warning-soft-fg border-transparent",
  danger: "bg-oh-danger-soft text-oh-danger-soft-fg border-transparent",
};
export function Badge({ tone = "neutral", icon, children, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; icon?: IconName }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-oh-full border px-2 py-0.5 text-oh-xs font-medium whitespace-nowrap", TONE[tone], className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/* ---------- Card ---------- */
export function Card({
  as: Tag = "div",
  interactive,
  dashed,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "article" | "li"; interactive?: boolean; dashed?: boolean; children?: ReactNode }) {
  return (
    <Tag
      className={cn(
        "rounded-oh-lg bg-oh-surface text-oh-ink p-4 border shadow-oh-sm",
        dashed ? "border-dashed border-oh-agent" : "border-oh-border",
        interactive && "transition-shadow hover:shadow-oh-md focus-within:shadow-oh-md",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
