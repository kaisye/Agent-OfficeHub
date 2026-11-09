import type { ReactNode } from "react";
import { MOOD_LABEL_VI, renderMascot } from "@officehub/brand";
import { PRESENCE_TO_MOOD, type Mascot as MascotTraits, type MascotMood, type PresenceState } from "@officehub/shared";
import { cn } from "./primitives.js";

export const PRESENCE_LABEL_VI: Record<PresenceState, string> = {
  working: "Đang làm",
  waiting: "Đang chờ",
  blocked: "Bị kẹt",
  reviewing: "Đang xem",
  idle: "Rảnh",
  offline: "Ngoại tuyến",
};
/** Shape glyph in the pill so presence never relies on color alone. */
const PRESENCE_GLYPH: Record<PresenceState, string> = {
  working: "●", waiting: "…", blocked: "!", reviewing: "?", idle: "○", offline: "z",
};

export type MascotSize = 24 | 32 | 48 | 96 | 160;

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
  className?: string;
}

export function Mascot({ mascot, presence, mood, size = 48, agentBadge, title, className }: MascotProps) {
  const m: MascotMood = mood ?? (presence ? PRESENCE_TO_MOOD[presence] : "relaxed");
  const svg = renderMascot(mascot, { mood: m, size, agentBadge, title });
  // SVG string comes from our pure generator, which escapes the title and emits no scripts/handlers.
  return (
    <span
      className={cn("inline-flex shrink-0 leading-none", className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function PresencePill({ presence, className }: { presence: PresenceState; className?: string }) {
  const tone: Record<PresenceState, string> = {
    working: "bg-oh-primary-soft text-oh-primary-soft-fg",
    waiting: "bg-oh-warning-soft text-oh-warning-soft-fg",
    blocked: "bg-oh-danger-soft text-oh-danger-soft-fg",
    reviewing: "bg-oh-agent-soft text-oh-agent-soft-fg",
    idle: "bg-oh-success-soft text-oh-success-soft-fg",
    offline: "bg-oh-surface-2 text-oh-ink-muted",
  };
  return (
    <span
      data-presence={presence}
      title={`Tâm trạng linh vật: ${MOOD_LABEL_VI[PRESENCE_TO_MOOD[presence]]}`}
      className={cn("inline-flex items-center gap-1.5 rounded-oh-full px-2.5 py-0.5 text-oh-xs font-medium", tone[presence], className)}
    >
      <span aria-hidden="true" className="font-mono font-bold leading-none">{PRESENCE_GLYPH[presence]}</span>
      {PRESENCE_LABEL_VI[presence]}
    </span>
  );
}

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
  const traits = mascot ?? { species: "blob", palette: "sand", accessory: null, seed: 0 };
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-oh-lg border border-dashed border-oh-border-strong p-8 text-center", className)}>
      <Mascot mascot={traits} mood={mood} size={96} />
      <h3 className="text-oh-lg font-semibold">{title}</h3>
      {description && <p className="max-w-prose text-oh-sm text-oh-ink-muted">{description}</p>}
      {action}
    </div>
  );
}
