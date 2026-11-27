"use client";

import type { ReactNode } from "react";
import { Badge, Icon, Mascot, UntrustedQuote, cn, type BadgeTone } from "@officehub/ui";
import type { Member, Request, RequestKind, RequestMessage, Role } from "@officehub/shared";
import { KIND_HINT, KIND_LABEL, authorOf, partyOf, type Party } from "@/lib/requests";

const KIND_TONE: Record<RequestKind, BadgeTone> = {
  blocker: "danger",
  contract_change: "human",
  review: "neutral",
  question: "neutral",
  handoff: "success",
};

export function KindChip({ kind, className }: { kind: RequestKind; className?: string }) {
  return (
    <Badge tone={KIND_TONE[kind]} icon={kind === "blocker" ? "alert" : kind === "contract_change" ? "shield" : undefined} title={KIND_HINT[kind]} className={className}>
      {KIND_LABEL[kind]}
    </Badge>
  );
}

/** "[mascot] Frontend → [mascot] Backend" — the two parties of a request. The orchestrator reads as "Bạn". */
export function PartyRoute({ request, roles, orchestrator, size = 24 }: { request: Pick<Request, "askerRoleId" | "receiverRoleId">; roles: Map<string, Role>; orchestrator: Member; size?: 24 | 32 }) {
  const a = partyOf(request.askerRoleId, roles, orchestrator);
  const b = partyOf(request.receiverRoleId, roles, orchestrator);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-oh-sm" aria-label={`${a.displayName} gửi ${b.human ? "bạn" : b.displayName}`}>
      <PartyName party={a} size={size} />
      <Icon name="arrowRight" size={14} className="shrink-0 text-oh-ink-muted" />
      <PartyName party={b} size={size} lower />
    </span>
  );
}

export function PartyName({ party, size = 24, lower }: { party: Party; size?: 24 | 32; lower?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Mascot mascot={party.mascot} mood="relaxed" size={size} decorative noBadge />
      <b className="truncate font-semibold">{party.human && lower ? "bạn" : party.displayName}</b>
    </span>
  );
}

/** Small "Backend · agent" label naming who wrote a piece of text. */
export function AuthorLabel({ party, extra }: { party: Party; extra?: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-oh-xs text-oh-ink-muted">
      <Mascot mascot={party.mascot} mood="relaxed" size={24} decorative noBadge agentBadge={!party.human} />
      <span className="font-semibold text-oh-ink">{party.displayName}</span>
      {party.human ? <Badge tone="human">bạn viết</Badge> : <Badge tone="agent" icon="bot">agent</Badge>}
      {extra}
    </p>
  );
}

/**
 * A sent message. Agent text is DATA from another role, never instructions: always the ochre "untrusted" quote,
 * labelled with the role it spoke for. The orchestrator's own text is shown plainly.
 */
export function MessageText({ m, request, roles, orchestrator, className }: { m: RequestMessage; request: Pick<Request, "askerRoleId" | "receiverRoleId">; roles: Map<string, Role>; orchestrator: Member; className?: string }) {
  const who = authorOf(m, request, roles, orchestrator);
  if (who.human) {
    return (
      <div className={cn("rounded-oh-md bg-oh-surface-2 p-3", className)} data-trust="orchestrator">
        <AuthorLabel party={who} />
        <p className="mt-1 whitespace-pre-wrap text-oh-sm">{m.body}</p>
      </div>
    );
  }
  return (
    <UntrustedQuote authorName={`${who.displayName}`} author={{ displayName: who.displayName, mascot: who.mascot }} fromAgent className={className}>
      {m.body}
    </UntrustedQuote>
  );
}

/** Multi-select of roles as toggle chips (keyboard: Tab + Space). */
export function RoleChips({ roles, value, onChange, label }: { roles: Role[]; value: string[]; onChange: (ids: string[]) => void; label: string }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset>
      <legend className="mb-1.5 text-oh-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {roles.map((r) => {
          const on = value.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(r.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-oh-full border py-0.5 pl-0.5 pr-2.5 text-oh-xs font-medium focus-visible:outline-3 focus-visible:outline-oh-focus",
                on ? "border-oh-primary bg-oh-primary-soft text-oh-primary-soft-fg" : "border-oh-border bg-oh-surface text-oh-ink-muted hover:bg-oh-surface-2",
              )}
            >
              <Mascot mascot={r.mascot} mood="relaxed" size={24} decorative noBadge />
              {r.name}
              {on && <Icon name="check" size={12} />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Single-select of roles as a radio grid with mascots. */
export function RoleRadio({ roles, value, onChange, label, disabled }: { roles: Role[]; value: string | null; onChange: (id: string) => void; label: string; disabled?: (r: Role) => boolean }) {
  return (
    <fieldset>
      <legend className="mb-2 text-oh-sm font-medium">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {roles.map((r, i) => {
          const on = r.id === value;
          const off = disabled?.(r) ?? false;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={off}
              data-autofocus={i === 0 ? true : undefined}
              onClick={() => onChange(r.id)}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-oh-lg border-2 p-1.5 pr-3 text-left text-oh-sm focus-visible:outline-3 focus-visible:outline-oh-focus disabled:cursor-not-allowed disabled:opacity-40",
                on ? "border-oh-primary bg-oh-primary-soft" : "border-oh-border bg-oh-surface hover:bg-oh-surface-2",
              )}
            >
              <Mascot mascot={r.mascot} mood="relaxed" size={32} decorative noBadge />
              <span className="truncate font-medium">{r.name}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
