import type { ReactNode } from "react";
import { BUDDIES, MOOD_GLYPH, MOOD_LABEL_VI, mascotSrc } from "@officehub/brand";
import { PRESENCE_TO_MOOD, type Mascot as MascotTraits, type MascotMood, type PresenceState } from "@officehub/shared";
import { Icon, cn } from "./primitives.js";

export const PRESENCE_LABEL_VI: Record<PresenceState, string> = {
  working: "Đang làm",
  waiting: "Đang chờ",
  blocked: "Bị kẹt",
  reviewing: "Đang xem",
  idle: "Rảnh",
  offline: "Ngoại tuyến",
};

export type MascotSize = 24 | 32 | 48 | 64 | 96 | 120 | 160 | 220;

export interface MascotProps {
  mascot: MascotTraits;
  /** Preferred: mood derives from presence via PRESENCE_TO_MOOD. */
  presence?: PresenceState;
  mood?: MascotMood;
  size?: MascotSize;
  /** Content was drafted by this member's agent. */
  agentBadge?: boolean;
  /** Accessible name; defaults to a Vietnamese description. Pass the member name for context. */
  title?: string;
  /** A visible name already sits next to the mascot: hide it from screen readers. */
  decorative?: boolean;
  /** Hide the mood badge (e.g. picker thumbnails). */
  noBadge?: boolean;
  className?: string;
}

/** Static Desk Buddy pose (<img>, object-fit: contain) + small mood badge. Sleeping is slightly desaturated. */
export function Mascot({ mascot, presence, mood, size = 48, agentBadge, title, decorative, noBadge, className }: MascotProps) {
  const m: MascotMood = mood ?? (presence ? PRESENCE_TO_MOOD[presence] : "relaxed");
  const meta = BUDDIES[mascot.buddy] ?? BUDDIES.milo;
  const alt = title ?? `Linh vật ${meta.name}, ${MOOD_LABEL_VI[m]}`;
  const px = size <= 64 ? 128 : 512;
  const badge = Math.max(14, Math.round(size * 0.3));
  return (
    <span
      data-mood={m}
      data-buddy={mascot.buddy}
      className={cn("relative inline-flex shrink-0 items-end justify-center leading-none", className)}
      style={{ width: size, height: size }}
    >
      <picture>
        <source type="image/webp" srcSet={mascotSrc(mascot.buddy, px)} />
        <img
          src={mascotSrc(mascot.buddy, 256)}
          alt={decorative ? "" : alt}
          aria-hidden={decorative ? true : undefined}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ width: size, height: size, objectFit: "contain", objectPosition: "center bottom", filter: m === "sleeping" ? "saturate(0.55)" : undefined, opacity: m === "sleeping" ? 0.85 : undefined }}
        />
      </picture>
      {!noBadge && size >= 32 && (
        <span
          aria-hidden="true"
          data-mood-badge={m}
          className="absolute -right-0.5 bottom-0 inline-flex items-center justify-center rounded-oh-full border border-oh-surface bg-oh-primary-soft px-1 font-mono font-bold leading-none text-oh-primary-soft-fg shadow-oh-sm"
          style={{ minWidth: badge, height: badge, fontSize: Math.max(9, Math.round(badge * 0.6)) }}
        >
          {MOOD_GLYPH[m]}
        </span>
      )}
      {agentBadge && (
        <span
          aria-hidden="true"
          data-agent-badge
          className="absolute -left-0.5 bottom-0 inline-flex items-center justify-center rounded-oh-full border border-oh-surface bg-oh-agent text-oh-agent-fg"
          style={{ width: badge, height: badge }}
        >
          <Icon name="bot" size={Math.round(badge * 0.65)} />
        </span>
      )}
    </span>
  );
}

const TONE: Record<PresenceState, string> = {
  working: "bg-oh-agent-soft text-oh-agent-soft-fg", // Cobalt = đang làm
  waiting: "bg-oh-warning-soft text-oh-warning-soft-fg",
  blocked: "bg-oh-danger-soft text-oh-danger-soft-fg",
  reviewing: "bg-oh-untrusted-soft text-oh-untrusted-soft-fg",
  idle: "bg-oh-success-soft text-oh-success-soft-fg",
  offline: "bg-oh-surface-2 text-oh-ink-muted",
};
const GLYPH: Record<PresenceState, string> = Object.fromEntries(
  (Object.keys(PRESENCE_TO_MOOD) as PresenceState[]).map((p) => [p, MOOD_GLYPH[PRESENCE_TO_MOOD[p]]]),
) as Record<PresenceState, string>;

/** Status badge: shape glyph + Vietnamese text, never colour alone. */
export function StatusBadge({ presence, className }: { presence: PresenceState; className?: string }) {
  return (
    <span
      data-presence={presence}
      title={`Tâm trạng linh vật: ${MOOD_LABEL_VI[PRESENCE_TO_MOOD[presence]]}`}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-oh-sm px-2 py-0.5 text-oh-xs font-medium", TONE[presence], className)}
    >
      <span aria-hidden="true" className="font-mono font-bold leading-none">{GLYPH[presence]}</span>
      {PRESENCE_LABEL_VI[presence]}
    </span>
  );
}
/** @deprecated old name; use StatusBadge. */
export const PresencePill = StatusBadge;

export function EmptyState({
  title,
  description,
  mascot,
  mood = "relaxed",
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  mascot?: MascotTraits;
  mood?: MascotMood;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-oh-lg border border-dashed border-oh-border-strong bg-oh-surface p-8 text-center", className)}>
      <Mascot mascot={mascot ?? { buddy: "fern" }} mood={mood} size={96} noBadge decorative />
      <h3 className="text-oh-lg font-semibold">{title}</h3>
      {description && <p className="max-w-prose text-oh-sm text-oh-ink-muted">{description}</p>}
      {action}
    </div>
  );
}
