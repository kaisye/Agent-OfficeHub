import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Badge, Button, Icon, cn } from "./primitives.js";

/* ---------- Dialog ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    (el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab" && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return e.preventDefault();
        const first = items[0]!, last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--oh-overlay)" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="w-full max-w-lg animate-oh-pop rounded-oh-xl border border-oh-border bg-oh-surface p-6 text-oh-ink shadow-oh-lg outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-oh-xl font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" aria-label="Đóng hộp thoại" onClick={onClose}>
            <Icon name="close" />
          </Button>
        </div>
        {description && <p id={descId} className="mt-1 text-oh-sm text-oh-ink-muted">{description}</p>}
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */
export type ToastTone = "info" | "success" | "danger";
export interface ToastData { id: number; tone: ToastTone; message: string }

export function Toast({ tone = "info", message, onDismiss }: { tone?: ToastTone; message: string; onDismiss?: () => void }) {
  const icon = tone === "success" ? "check" : tone === "danger" ? "alert" : "info";
  const cls = {
    info: "bg-oh-agent-soft text-oh-agent-soft-fg border-oh-agent",
    success: "bg-oh-success-soft text-oh-success-soft-fg border-oh-success",
    danger: "bg-oh-danger-soft text-oh-danger-soft-fg border-oh-danger",
  }[tone];
  return (
    <div className={cn("flex animate-oh-pop items-center gap-2 rounded-oh-md border px-3 py-2 text-oh-sm shadow-oh-md", cls)}>
      <Icon name={icon} size={16} />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button type="button" aria-label="Đóng thông báo" onClick={onDismiss} className="rounded-oh-sm p-1 focus-visible:outline-3 focus-visible:outline-oh-focus">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

const ToastCtx = createContext<((message: string, tone?: ToastTone) => void) | null>(null);
export const useToast = () => {
  const fn = useContext(ToastCtx);
  if (!fn) throw new Error("useToast must be used inside <ToastProvider>");
  return fn;
};

export function ToastProvider({ children, durationMs = 5000 }: { children: ReactNode; durationMs?: number }) {
  const [items, setItems] = useState<ToastData[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = next.current++;
      setItems((l) => [...l, { id, tone, message }]);
      if (durationMs > 0) setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss, durationMs],
  );
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <Toast key={t.id} tone={t.tone} message={t.message} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- TokenRevealOnce ---------- */
export function TokenRevealOnce({ token, agentLabel, onDone }: { token: string; agentLabel?: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section aria-label="Token agent, chỉ hiện một lần" className="space-y-3 rounded-oh-lg border-2 border-oh-warning bg-oh-warning-soft p-4 text-oh-warning-soft-fg">
      <p className="flex items-center gap-2 text-oh-sm font-semibold">
        <Icon name="key" size={16} />
        Token{agentLabel ? ` của ${agentLabel}` : ""} chỉ hiện một lần
      </p>
      <p className="text-oh-sm">Hãy lưu vào nơi an toàn (trình quản lý mật khẩu). Đóng màn hình này là không xem lại được — nếu mất, hãy thu hồi và tạo token mới. Không dán token vào chat.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          aria-label="Token agent"
          value={token}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-oh-md border border-oh-border-strong bg-oh-surface px-3 py-2 font-mono text-oh-sm text-oh-ink"
        />
        <Button variant="secondary" icon={copied ? "check" : "copy"} onClick={copy}>
          {copied ? "Đã chép" : "Sao chép"}
        </Button>
      </div>
      <p role="status" className="sr-only">{copied ? "Đã sao chép token" : ""}</p>
      <label className="flex items-center gap-2 text-oh-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4" />
        Tôi đã lưu token
      </label>
      <Button variant="primary" disabled={!saved} onClick={onDone}>
        Xong
      </Button>
      <Badge tone="warning" icon="alert">Không xem lại được</Badge>
    </section>
  );
}
