"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUDDIES, BUDDY_IDS, MOODS, MOOD_GLYPH, MOOD_LABEL_VI } from "@officehub/brand";
import { Button, Icon, Mascot, StatusBadge, cn, useToast } from "@officehub/ui";
import { PRESENCE_TO_MOOD, type Mascot as MascotTraits, type PresenceState } from "@officehub/shared";
import { errorMessage } from "@/lib/errors";
import { useUpdateMascot } from "@/lib/hooks";
import { useWorkspace } from "./workspace";

const MOOD_PRESENCE = Object.fromEntries(Object.entries(PRESENCE_TO_MOOD).map(([p, m]) => [m, p])) as Record<(typeof MOODS)[number], PresenceState>;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Mascot của bạn": pick one of the 6 Desk Buddies and see all 6 moods (badges) live. Several members may share a buddy. */
export function MascotStudio() {
  const { slug, me } = useWorkspace();
  const toast = useToast();
  const router = useRouter();
  const save = useUpdateMascot(slug);
  const [draft, setDraft] = useState<MascotTraits>(me.mascot);
  const [mood, setMood] = useState<(typeof MOODS)[number]>("relaxed");
  const dirty = draft.buddy !== me.mascot.buddy;
  const buddy = BUDDIES[draft.buddy];

  const submit = () =>
    save.mutate(draft, {
      onSuccess: () => {
        toast("Đã lưu mascot. Cả văn phòng sẽ thấy bạn như thế này.", "success");
        router.push(`/w/${slug}`);
      },
      onError: (e) => toast(errorMessage(e), "danger"),
    });

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.15em] text-oh-ink-muted">MỘT CHÚT TÍNH CÁCH CỦA BẠN</p>
        <h1 className="text-oh-3xl font-bold tracking-tight">Mascot của bạn</h1>
        <p className="mt-1 max-w-2xl text-oh-sm text-oh-ink-muted">
          Chọn một bạn đồng hành. Bạn ấy hiện kèm huy hiệu tâm trạng theo trạng thái của bạn; nhiều người có thể chọn cùng một buddy, thẻ tên sẽ phân biệt.
        </p>
      </div>

      <div className="grid max-w-[1100px] gap-6 lg:grid-cols-[minmax(260px,.8fr)_1.2fr]">
        <section aria-label="Xem trước" className="flex flex-col items-center rounded-oh-lg border border-oh-border bg-oh-surface-2 p-8 shadow-oh-md">
          <div className="oh-arch mb-6 h-72 w-64" style={{ background: buddy.tint }}>
            <Mascot mascot={draft} mood={mood} size={220} title={`${me.displayName}, ${buddy.name}, ${MOOD_LABEL_VI[mood]}`} />
          </div>
          <h2 className="text-oh-2xl font-bold">{me.displayName}</h2>
          <p className="mt-1 text-oh-sm text-oh-ink-muted">
            {buddy.name} · {buddy.role}
          </p>
          <div className="mt-3">
            <StatusBadge presence={MOOD_PRESENCE[mood]} />
          </div>
          <p className="mt-3 text-oh-xs text-oh-ink-muted">Đang xem tâm trạng: {MOOD_LABEL_VI[mood]}</p>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="pick-h" className="rounded-oh-lg border border-oh-border bg-oh-surface p-6 shadow-oh-md">
            <h2 id="pick-h" className="mb-3 text-oh-lg font-semibold">
              Chọn buddy
            </h2>
            <div role="radiogroup" aria-labelledby="pick-h" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BUDDY_IDS.map((id) => {
                const b = BUDDIES[id];
                const on = draft.buddy === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${b.name}, ${b.role}`}
                    onClick={() => setDraft({ buddy: id })}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-oh-md border-2 p-3 text-center focus-visible:outline-3 focus-visible:outline-oh-focus",
                      on ? "border-oh-primary bg-oh-primary-soft" : "border-transparent bg-oh-surface-2 hover:border-oh-border-strong",
                    )}
                  >
                    {on && <Icon name="check" size={15} className="absolute right-2 top-2 text-oh-primary" />}
                    <Mascot mascot={{ buddy: id }} size={64} noBadge decorative />
                    <span className="text-oh-sm font-semibold">{b.name}</span>
                    <span className="text-[11px] leading-tight text-oh-ink-muted">{b.role}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="moods-h" className="rounded-oh-lg border border-oh-border bg-oh-surface p-6 shadow-oh-md">
            <h2 id="moods-h" className="mb-1 text-oh-lg font-semibold">
              6 tâm trạng, xem trực tiếp
            </h2>
            <p className="mb-3 text-oh-xs text-oh-ink-muted">Tâm trạng đi theo trạng thái. Duy hiệu và chữ luôn đi cùng nhau, không chỉ dùng màu.</p>
            <div role="radiogroup" aria-labelledby="moods-h" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mood === m}
                  aria-label={`${cap(MOOD_LABEL_VI[m])} (${MOOD_GLYPH[m]})`}
                  onClick={() => setMood(m)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-oh-md border-2 p-2 focus-visible:outline-3 focus-visible:outline-oh-focus",
                    mood === m ? "border-oh-primary bg-oh-primary-soft" : "border-transparent bg-oh-surface-2 hover:border-oh-border-strong",
                  )}
                >
                  <Mascot mascot={draft} mood={m} size={64} decorative />
                  <span className="text-oh-xs">{cap(MOOD_LABEL_VI[m])}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon="check" loading={save.isPending} disabled={!dirty} onClick={submit}>
              Lưu & về văn phòng
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(me.mascot)}>
                Hoàn tác
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
