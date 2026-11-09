"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ACCESSORIES, MOODS, MOOD_LABEL_VI, PALETTES, SPECIES, SPECIES_LABEL_VI, defaultMascotFor, mascotPalettes, type Accessory } from "@officehub/brand";
import { Button, Card, Icon, Mascot, cn, useToast } from "@officehub/ui";
import type { Mascot as MascotTraits } from "@officehub/shared";
import { errorMessage } from "@/lib/errors";
import { useUpdateMascot } from "@/lib/hooks";
import { useWorkspace } from "./workspace";

export const ACCESSORY_LABEL_VI: Record<NonNullable<Accessory> | "none", string> = {
  none: "Không phụ kiện",
  headphones: "Tai nghe",
  glasses: "Kính",
  cap: "Mũ lưỡi trai",
  scarf: "Khăn quàng",
  plant: "Chậu cây",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const same = (a: MascotTraits, b: MascotTraits) => a.species === b.species && a.palette === b.palette && a.accessory === b.accessory && a.seed === b.seed;

/** "Make it yours": choose species, palette and accessory with a live preview across all six moods (MAS-02). */
export function MascotStudio() {
  const { slug, me } = useWorkspace();
  const toast = useToast();
  const router = useRouter();
  const save = useUpdateMascot(slug);
  const [draft, setDraft] = useState<MascotTraits>(me.mascot);
  const [mood, setMood] = useState<(typeof MOODS)[number]>("relaxed");
  const fallback = useMemo(() => defaultMascotFor(me.id), [me.id]);
  const dirty = !same(draft, me.mascot);
  const set = (patch: Partial<MascotTraits>) => setDraft((d) => ({ ...d, ...patch }));

  const shuffle = () => {
    const pick = <T,>(l: readonly T[]) => l[Math.floor(Math.random() * l.length)]!;
    setDraft({ species: pick(SPECIES), palette: pick(PALETTES), accessory: pick(ACCESSORIES), seed: Math.floor(Math.random() * 1_000_000) });
  };

  const submit = () =>
    save.mutate(draft, {
      onSuccess: () => {
        toast("Đã lưu mascot. Cả văn phòng sẽ thấy bạn như thế này.", "success");
        router.push(`/w/${slug}`);
      },
      onError: (e) => toast(errorMessage(e), "danger"),
    });

  const traitName = `${SPECIES_LABEL_VI[draft.species as (typeof SPECIES)[number]]} ${mascotPalettes[draft.palette as keyof typeof mascotPalettes]?.label.toLowerCase() ?? ""}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-oh-2xl font-bold">Mascot của tôi</h1>
        <p className="text-oh-sm text-oh-ink-muted">Chọn một bạn đồng hành. Linh vật đổi tư thế theo trạng thái của bạn, nên đồng đội nhìn là biết bạn đang thế nào.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* live preview */}
        <Card as="section" aria-label="Xem trước" className="flex flex-col items-center gap-4 self-start bg-oh-primary-soft/30 p-6 lg:sticky lg:top-24">
          <div className="oh-floor flex w-full flex-col items-center gap-3 rounded-oh-xl border border-oh-border p-6">
            <div className="oh-bob">
              <Mascot mascot={draft} mood={mood} size={160} title={`${me.displayName}, ${MOOD_LABEL_VI[mood]}`} />
            </div>
            <p className="rounded-oh-lg bg-oh-surface px-3 py-1.5 text-center text-oh-sm shadow-oh-sm">
              Chào, mình là <b>{traitName}</b> của {me.displayName}
            </p>
          </div>
          <p className="text-oh-xs text-oh-ink-muted">Đang xem tư thế: {MOOD_LABEL_VI[mood]}</p>
          <div className="flex w-full flex-wrap justify-center gap-2">
            <Button variant="primary" icon="check" onClick={submit} loading={save.isPending} disabled={!dirty} className="flex-1">
              Lưu mascot
            </Button>
          </div>
          <div className="flex w-full flex-wrap justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={shuffle}>
              Ngẫu nhiên
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(fallback)} disabled={same(draft, fallback)}>
              Về mặc định
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(me.mascot)} disabled={!dirty}>
              Hoàn tác
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card as="section" aria-label="Sáu tâm trạng">
            <h2 className="text-oh-lg font-semibold">Sáu tâm trạng</h2>
            <p className="mb-3 text-oh-xs text-oh-ink-muted">Mỗi trạng thái của bạn trên bảng có một tư thế riêng. Bấm để xem lớn.</p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {MOODS.map((m) => (
                <li key={m}>
                  <button
                    type="button"
                    aria-pressed={mood === m}
                    onClick={() => setMood(m)}
                    className={cn(
                      "flex w-full flex-col items-center gap-1 rounded-oh-lg border-2 p-2 focus-visible:outline-3 focus-visible:outline-oh-focus",
                      mood === m ? "border-oh-primary bg-oh-primary-soft" : "border-oh-border hover:bg-oh-surface-2",
                    )}
                  >
                    <Mascot mascot={draft} mood={m} size={48} title={MOOD_LABEL_VI[m]} />
                    <span className="text-oh-xs">{cap(MOOD_LABEL_VI[m])}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <OptionGroup legend="Loài">
            {SPECIES.map((s) => (
              <Option key={s} on={draft.species === s} label={SPECIES_LABEL_VI[s]} onClick={() => set({ species: s })}>
                <Mascot mascot={{ ...draft, species: s }} mood="relaxed" size={48} title={SPECIES_LABEL_VI[s]} />
              </Option>
            ))}
          </OptionGroup>

          <OptionGroup legend="Bảng màu">
            {PALETTES.map((p) => (
              <Option key={p} on={draft.palette === p} label={mascotPalettes[p].label} onClick={() => set({ palette: p })}>
                <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center">
                  <span className="relative inline-block size-9 overflow-hidden rounded-oh-full border border-oh-border-strong" style={{ background: mascotPalettes[p].base }}>
                    <span className="absolute bottom-0 left-0 h-1/2 w-full" style={{ background: mascotPalettes[p].light }} />
                    <span className="absolute right-0 top-0 size-3 rounded-oh-full" style={{ background: mascotPalettes[p].accent }} />
                  </span>
                </span>
              </Option>
            ))}
          </OptionGroup>

          <OptionGroup legend="Phụ kiện">
            {ACCESSORIES.map((a) => (
              <Option key={a ?? "none"} on={draft.accessory === a} label={ACCESSORY_LABEL_VI[a ?? "none"]} onClick={() => set({ accessory: a })}>
                {a ? <Mascot mascot={{ ...draft, accessory: a }} mood="relaxed" size={48} title={ACCESSORY_LABEL_VI[a]} /> : <span aria-hidden="true" className="flex size-12 items-center justify-center text-oh-ink-muted"><Icon name="cancel" size={24} /></span>}
              </Option>
            ))}
          </OptionGroup>
        </div>
      </div>
    </div>
  );
}

function OptionGroup({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <Card as="section">
      <fieldset>
        <legend className="mb-3 text-oh-lg font-semibold">{legend}</legend>
        <div role="radiogroup" aria-label={legend} className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {children}
        </div>
      </fieldset>
    </Card>
  );
}

function Option({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-oh-lg border-2 p-2 text-center focus-visible:outline-3 focus-visible:outline-oh-focus",
        on ? "border-oh-primary bg-oh-primary-soft" : "border-oh-border hover:bg-oh-surface-2",
      )}
    >
      {children}
      <span className="text-oh-xs">{label}</span>
    </button>
  );
}
