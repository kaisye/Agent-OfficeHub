/** Writes packages/brand/preview/gallery.html — static, no server needed. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRESENCE_TO_MOOD } from "@officehub/shared";
import {
  ACCESSORIES, MOODS, MOOD_LABEL_VI, PALETTES, SPECIES, SPECIES_LABEL_VI, buildTokensCss, colorLight, googleFontsHref,
  mascotPalettes, renderMascot,
} from "../src/index.js";

const base = { species: "cat", palette: "sunrise", accessory: null as string | null, seed: 1 };
const cell = (svg: string, label: string) => `<figure>${svg}<figcaption>${label}</figcaption></figure>`;

const speciesMoodGrid = `
<table class="grid"><thead><tr><th></th>${MOODS.map((m) => `<th>${m}<br><small>${MOOD_LABEL_VI[m]}</small></th>`).join("")}</tr></thead>
<tbody>${SPECIES.map(
  (s, i) =>
    `<tr><th>${s}<br><small>${SPECIES_LABEL_VI[s]}</small></th>${MOODS.map((m) =>
      `<td>${renderMascot({ ...base, species: s, palette: PALETTES[i % PALETTES.length]!, seed: i }, { mood: m, size: 96 })}</td>`,
    ).join("")}</tr>`,
).join("")}</tbody></table>`;

const presenceMap = Object.entries(PRESENCE_TO_MOOD)
  .map(([presence, mood]) => cell(renderMascot({ ...base, species: "bear", palette: "forest", seed: 2 }, { mood, size: 96 }), `${presence} → ${mood}`))
  .join("");

const palettes = PALETTES.map((p) =>
  cell(renderMascot({ ...base, species: "blob", palette: p, accessory: "cap", seed: 3 }, { mood: "relaxed", size: 96 }),
    `${p}<br><small>${mascotPalettes[p].label}</small>`),
).join("");

const accessories = ACCESSORIES.map((a, i) =>
  cell(renderMascot({ ...base, species: SPECIES[i % SPECIES.length]!, palette: PALETTES[(i + 2) % PALETTES.length]!, accessory: a, seed: i }, { mood: "relaxed", size: 96 }),
    String(a)),
).join("");

const badge = cell(renderMascot(base, { mood: "focused", size: 96 }), "người") +
  cell(renderMascot(base, { mood: "focused", size: 96, agentBadge: true }), "agent soạn");

const sizes = [24, 32, 48, 96, 160]
  .map((px) => cell(renderMascot({ ...base, species: "fox", palette: "coral", accessory: "headphones", seed: 5 }, { mood: "curious", size: px, agentBadge: px >= 32 }), `${px}px`))
  .join("");
const smallMoods = SPECIES.map(
  (s) => `<div class="row">${MOODS.map((m) => renderMascot({ ...base, species: s, palette: "ocean" }, { mood: m, size: 32 })).join("")}</div>`,
).join("");

const seed = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../docs/business/seed-tripflix.json", import.meta.url)), "utf8"),
) as { members: { displayName: string; mascot: { species: string; palette: string; accessory: string | null; seed: number } }[] };
const tripflix = `<table class="grid"><thead><tr><th></th>${MOODS.map((m) => `<th>${m}<br><small>${MOOD_LABEL_VI[m]}</small></th>`).join("")}</tr></thead><tbody>${seed.members
  .map(
    (m) =>
      `<tr><th>${m.displayName}</th>${MOODS.map(
        (mood, i) => `<td>${renderMascot(m.mascot, { mood, size: 64, title: `${m.displayName}, ${MOOD_LABEL_VI[mood]}`, agentBadge: i % 2 === 1 })}</td>`,
      ).join("")}</tr>`,
  )
  .join("")}</tbody></table><small>Cột chẵn có huy hiệu agent soạn để so sánh.</small>`;

const section = (title: string, body: string) => `<section><h2>${title}</h2><div class="flex">${body}</div></section>`;

const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Office Hub — Mascot gallery</title>
<link rel="stylesheet" href="${googleFontsHref}">
<style>
${buildTokensCss()}
body{margin:0;background:var(--oh-bg);color:var(--oh-ink);font-family:var(--oh-font-sans);line-height:1.55;padding:24px 16px 64px}
main{max-width:1100px;margin:0 auto}
h1{font-size:1.75rem;margin:0 0 4px} h2{font-size:1.2rem;margin:32px 0 12px} small{color:var(--oh-ink-muted)}
.flex{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end}
figure{margin:0;text-align:center;font-size:.8rem;background:var(--oh-surface);border:1px solid var(--oh-border);border-radius:var(--oh-radius-lg);padding:12px;box-shadow:var(--oh-shadow-sm)}
figcaption{margin-top:6px}
.grid{border-collapse:separate;border-spacing:8px;display:block;overflow-x:auto}
.grid td,.grid th{background:var(--oh-surface);border:1px solid var(--oh-border);border-radius:var(--oh-radius-lg);padding:8px;text-align:center;font-size:.8rem}
.grid th{background:transparent;border:none}
.row{display:flex;gap:8px;margin:6px 0}
.panel{background:var(--oh-surface);border:1px solid var(--oh-border);border-radius:var(--oh-radius-lg);padding:12px 16px}
.toolbar{display:flex;gap:8px;margin:12px 0}
button{font:inherit;padding:8px 14px;border-radius:var(--oh-radius-md);border:1px solid var(--oh-border-strong);background:var(--oh-surface);color:var(--oh-ink);cursor:pointer}
button:focus-visible{outline:3px solid var(--oh-focus);outline-offset:2px}
.swatches{display:flex;flex-wrap:wrap;gap:8px}
.sw{width:112px;font-size:.72rem}.sw i{display:block;height:36px;border-radius:8px;border:1px solid var(--oh-border)}
</style></head>
<body><main>
<h1>Office Hub — Mascot gallery</h1>
<small>Tạo bởi <code>pnpm --filter @officehub/brand gallery</code>. Dùng nút bên dưới để đổi sáng / tối.</small>
<div class="toolbar">
  <button onclick="document.documentElement.dataset.theme='light'">Sáng</button>
  <button onclick="document.documentElement.dataset.theme='dark'">Tối</button>
  <button onclick="delete document.documentElement.dataset.theme">Theo hệ thống</button>
</div>
<section><h2>6 loài × 6 tâm trạng (96px)</h2>${speciesMoodGrid}</section>
<section><h2>7 thành viên Tripflix (seed) × 6 mood</h2>${tripflix}</section>
${section("PresenceState → mood (bản đồ từ @officehub/shared)", presenceMap)}
${section("7 bảng màu", palettes)}
${section("Phụ kiện (null, headphones, glasses, cap, scarf, plant)", accessories)}
${section("Huy hiệu agent (góc phải dưới)", badge)}
${section("Kích thước 24 / 32 / 48 / 96 / 160", sizes)}
${section("Biểu tượng ứng dụng / favicon (assets/)", [16, 32, 64, 180].map((n) => cell(`<img src="../assets/${n === 180 ? "apple-touch-icon.png" : n === 32 ? "favicon-32.png" : "icon.svg"}" width="${n}" height="${n}" alt="Office Hub ${n}px">`, `${n}px`)).join(""))}
<section><h2>Đọc được ở 32px? (6 loài × 6 mood)</h2><div class="panel">${smallMoods}</div></section>
<section><h2>Màu ngữ nghĩa</h2><div class="swatches">${Object.entries(colorLight)
  .filter(([, v]) => v.startsWith("#"))
  .map(([k, v]) => `<div class="sw"><i style="background:${v}"></i>${k}<br>${v}</div>`)
  .join("")}</div></section>
</main></body></html>
`;

const out = fileURLToPath(new URL("./gallery.html", import.meta.url));
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
