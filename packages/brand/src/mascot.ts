/**
 * Procedural mascot renderer: pure function -> self-contained accessible SVG string.
 * No external assets, no ids, no scripts. Same input => same output.
 */
import { MascotAccessory, MascotPalette as MascotPaletteEnum, MascotSpecies, type Mascot, type MascotMood } from "@officehub/shared";
import { mascotPalettes, mascotShared, type MascotPalette } from "./tokens.js";

/** One source of truth: the zod enums in @officehub/shared. */
export const SPECIES = MascotSpecies.options;
export type Species = (typeof SPECIES)[number];
export const PALETTES = MascotPaletteEnum.options;
export type PaletteKey = (typeof PALETTES)[number];
export const ACCESSORIES = [null, ...MascotAccessory.options] as const;
export type Accessory = (typeof ACCESSORIES)[number];
// palettes in tokens must cover every key of the shared enum
const _paletteCovered: Record<PaletteKey, unknown> = mascotPalettes;
void _paletteCovered;
export const MOODS = ["focused", "waiting", "worried", "curious", "relaxed", "sleeping"] as const;
export type Mood = (typeof MOODS)[number];
// compile-time guarantee that we cover every mood the shared contract can produce
type _MoodCovered = Exclude<MascotMood, Mood> extends never ? true : never;
export const _moodCovered: _MoodCovered = true;

export const SPECIES_LABEL_VI: Record<Species, string> = {
  blob: "Bé Blob", cat: "Mèo", owl: "Cú", bot: "Robot", fox: "Cáo", bear: "Gấu",
};
export const MOOD_LABEL_VI: Record<Mood, string> = {
  focused: "đang làm",
  waiting: "đang chờ",
  worried: "bị kẹt",
  curious: "đang xem",
  relaxed: "rảnh",
  sleeping: "ngoại tuyến",
};

export interface MascotTraits {
  species: string;
  palette: string;
  accessory: string | null;
  seed: number;
}
export interface RenderOptions {
  mood: Mood | string;
  size?: number;
  agentBadge?: boolean;
  title?: string;
  /** Purely decorative (a visible name sits next to it): aria-hidden, no <title>. */
  decorative?: boolean;
}

/* ---------- helpers ---------- */

const n = (x: number) => String(Math.round(x * 10) / 10);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const isIn = <T extends string>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

/** FNV-1a 32-bit. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function defaultMascotFor(memberId: string): Mascot {
  const h = hash32(memberId);
  const h2 = hash32(memberId + "#2");
  return {
    species: SPECIES[h % SPECIES.length]!,
    palette: PALETTES[(h >>> 4) % PALETTES.length]!,
    accessory: ACCESSORIES[h2 % ACCESSORIES.length]!,
    seed: h2 % 1_000_000,
  };
}

/* ---------- geometry per species ---------- */

interface Ctx {
  p: MascotPalette;
  sw: number;
  full: boolean; // size >= 48: decorative detail
  mid: boolean; // size >= 32: highlights
  large: boolean; // size >= 96: extra polish
  v: number; // seed % 3
  accessory: Accessory;
}
interface Geo {
  top: number; // head top at x=50 (accessory anchor)
  bot: number; // body bottom
  side: number; // half width at eye level
  ey: number; // eye line
  my: number; // mouth y
  ex: number; // eye offset from center
  cheekDx: number; // 0 = no cheeks
  glassR: number;
  back(c: Ctx): string;
  body(c: Ctx): string;
  deco(c: Ctx): string;
  front(c: Ctx): string;
}

const line = (d: string, c: Ctx, extra = "") => `<path d="${d}" fill="none"${extra}/>`;

const GEO: Record<Species, Geo> = {
  blob: {
    top: 14, bot: 90, side: 36, ey: 52, my: 64, ex: 17, cheekDx: 26, glassR: 10,
    back: (c) =>
      c.accessory === "plant"
        ? ""
        : c.v === 0
          ? line("M50 15 Q46 4 56 6", c)
          : c.v === 1
            ? line("M44 16 Q42 8 47 7 M56 16 Q58 8 53 7", c)
            : "",
    body: (c) =>
      `<path d="M50 14 C75 14 88 36 88 58 C88 80 72 90 50 90 C28 90 12 80 12 58 C12 36 25 14 50 14Z" fill="${c.p.base}"/>`,
    deco: (c) => (c.full ? `<ellipse cx="50" cy="75" rx="20" ry="12" fill="${c.p.light}" stroke="none"/>` : ""),
    front: () => "",
  },
  cat: {
    top: 21, bot: 87, side: 36, ey: 54, my: 67, ex: 17, cheekDx: 27, glassR: 10,
    back: (c) =>
      `<path d="M16 42 L22 10 L45 26Z M84 42 L78 10 L55 26Z" fill="${c.p.base}"/>` +
      `<path d="M24 31 L26 19 L38 26Z M76 31 L74 19 L62 26Z" fill="${mascotShared.cheek}" stroke="none"/>`,
    body: (c) => `<ellipse cx="50" cy="54" rx="37" ry="33" fill="${c.p.base}"/>`,
    deco: (c) =>
      (c.full ? `<ellipse cx="50" cy="69" rx="14" ry="9" fill="${c.p.light}" stroke="none"/>` : "") +
      `<ellipse cx="50" cy="61" rx="3.2" ry="2.2" fill="${c.p.dark}" stroke="none"/>`,
    front: (c) =>
      c.full ? line("M4 59 L21 62 M5 70 L21 67 M96 59 L79 62 M95 70 L79 67", c, ` stroke-width="${n(c.sw * 0.6)}"`) : "",
  },
  owl: {
    top: 14, bot: 90, side: 33, ey: 46, my: 70, ex: 17, cheekDx: 0, glassR: 14.5,
    back: (c) => `<path d="M22 24 L19 7 L40 16Z M78 24 L81 7 L60 16Z" fill="${c.p.base}"/>`,
    body: (c) => `<ellipse cx="50" cy="52" rx="34" ry="38" fill="${c.p.base}"/>`,
    deco: (c) =>
      (c.full ? `<ellipse cx="50" cy="75" rx="19" ry="12" fill="${c.p.light}" stroke="none"/>` : "") +
      `<circle cx="33" cy="46" r="13.5" fill="${c.p.light}" stroke-width="${n(c.sw * 0.6)}"/>` +
      `<circle cx="67" cy="46" r="13.5" fill="${c.p.light}" stroke-width="${n(c.sw * 0.6)}"/>` +
      `<path d="M45 55 L55 55 L50 63Z" fill="${c.p.accent}"/>`,
    front: (c) => (c.full ? line("M17 60 Q13 74 24 80 M83 60 Q87 74 76 80", c, ` stroke-width="${n(c.sw * 0.7)}"`) : ""),
  },
  bot: {
    top: 22, bot: 84, side: 32, ey: 54, my: 65, ex: 16, cheekDx: 0, glassR: 10,
    back: (c) =>
      `<path d="M50 28 L50 14" fill="none"/><circle cx="50" cy="11" r="5" fill="${c.p.accent}"/>` +
      `<rect x="10" y="45" width="9" height="18" rx="3" fill="${c.p.accent}"/>` +
      `<rect x="81" y="45" width="9" height="18" rx="3" fill="${c.p.accent}"/>`,
    body: (c) => `<rect x="18" y="26" width="64" height="58" rx="18" fill="${c.p.base}"/>`,
    deco: (c) => `<rect x="26" y="37" width="48" height="36" rx="12" fill="${c.p.light}" stroke-width="${n(c.sw * 0.6)}"/>`,
    front: () => "",
  },
  fox: {
    top: 26, bot: 86, side: 38, ey: 54, my: 70, ex: 17, cheekDx: 29, glassR: 10,
    back: (c) =>
      `<path d="M15 46 L18 9 L43 28Z M85 46 L82 9 L57 28Z" fill="${c.p.base}"/>` +
      `<path d="M21 35 L22 19 L34 28Z M79 35 L78 19 L66 28Z" fill="${c.p.dark}" stroke="none"/>`,
    body: (c) =>
      `<path d="M14 50 Q14 28 50 26 Q86 28 86 50 Q86 62 70 78 Q58 90 50 90 Q42 90 30 78 Q14 62 14 50Z" fill="${c.p.base}"/>`,
    deco: (c) =>
      (c.full
        ? `<path d="M19 59 Q35 53 50 67 Q65 53 81 59 Q72 79 50 87 Q28 79 19 59Z" fill="${c.p.light}" stroke="none"/>`
        : "") + `<ellipse cx="50" cy="63" rx="3.6" ry="2.6" fill="${c.p.dark}" stroke="none"/>`,
    front: () => "",
  },
  bear: {
    top: 22, bot: 90, side: 34, ey: 52, my: 70, ex: 17, cheekDx: 27, glassR: 10,
    back: (c) =>
      `<circle cx="24" cy="30" r="12" fill="${c.p.base}"/><circle cx="76" cy="30" r="12" fill="${c.p.base}"/>` +
      (c.full
        ? `<circle cx="24" cy="30" r="5.5" fill="${c.p.light}" stroke="none"/><circle cx="76" cy="30" r="5.5" fill="${c.p.light}" stroke="none"/>`
        : ""),
    body: (c) => `<circle cx="50" cy="56" r="34" fill="${c.p.base}"/>`,
    deco: (c) =>
      `<ellipse cx="50" cy="68" rx="14" ry="10" fill="${c.p.light}" stroke="none"/>` +
      `<ellipse cx="50" cy="62" rx="4" ry="3" fill="${c.p.dark}" stroke="none"/>`,
    front: () => "",
  },
};

/* ---------- face ---------- */

function face(mood: Mood, g: Geo, c: Ctx): string {
  const { p } = c;
  const ex1 = 50 - g.ex, ex2 = 50 + g.ex, y = g.ey, my = g.my;
  const dark = p.dark;
  const W = mascotShared.white;
  const hl = (x: number, yy: number) => (c.mid ? `<circle cx="${n(x)}" cy="${n(yy)}" r="1.5" fill="${W}" stroke="none"/>` : "");
  const dot = (x: number, rx: number, ry: number) =>
    `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${rx}" ry="${ry}" fill="${dark}" stroke="none"/>` + hl(x + 1.4, y - 1.6);
  const open = (x: number, r: number, px: number, py: number, pr: number) =>
    `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${W}" stroke-width="${n(c.sw * 0.8)}"/>` +
    `<circle cx="${n(x + px)}" cy="${n(y + py)}" r="${pr}" fill="${dark}" stroke="none"/>`;
  const brow = (d: string) => `<path d="${d}" fill="none"/>`;
  const cheeks =
    c.full && g.cheekDx && mood !== "worried"
      ? `<circle cx="${50 - g.cheekDx}" cy="${y + 11}" r="4.6" fill="${mascotShared.cheek}" opacity=".55" stroke="none"/>` +
        `<circle cx="${50 + g.cheekDx}" cy="${y + 11}" r="4.6" fill="${mascotShared.cheek}" opacity=".55" stroke="none"/>`
      : "";
  const arcUp = (x: number) => `<path d="M${n(x - 6)} ${n(y + 2.5)} Q${n(x)} ${n(y - 6.5)} ${n(x + 6)} ${n(y + 2.5)}" fill="none"/>`;
  const arcDown = (x: number) => `<path d="M${n(x - 6)} ${n(y - 1.5)} Q${n(x)} ${n(y + 5.5)} ${n(x + 6)} ${n(y - 1.5)}" fill="none"/>`;

  switch (mood) {
    case "focused":
      return (
        dot(ex1, 4.2, 4.8) + dot(ex2, 4.2, 4.8) +
        brow(`M${n(ex1 - 7)} ${n(y - 10)} L${n(ex1 + 5)} ${n(y - 7)}`) +
        brow(`M${n(ex2 + 7)} ${n(y - 10)} L${n(ex2 - 5)} ${n(y - 7)}`) +
        `<path d="M44 ${my} L56 ${my}" fill="none"/>` + cheeks
      );
    case "waiting":
      return (
        open(ex1, 6.4, 2.4, -2.4, 3) + open(ex2, 6.4, 2.4, -2.4, 3) +
        `<path d="M43 ${my} Q46.5 ${my - 3} 50 ${my} Q53.5 ${my + 3} 57 ${my}" fill="none"/>` + cheeks
      );
    case "worried":
      return (
        open(ex1, 6.6, 0, 1.6, 2.7) + open(ex2, 6.6, 0, 1.6, 2.7) +
        brow(`M${n(ex1 - 7)} ${n(y - 9)} L${n(ex1 + 4)} ${n(y - 14)}`) +
        brow(`M${n(ex2 + 7)} ${n(y - 9)} L${n(ex2 - 4)} ${n(y - 14)}`) +
        `<path d="M43 ${my + 3} Q50 ${my - 4} 57 ${my + 3}" fill="none"/>` +
        (c.full
          ? `<path d="M22 30 Q29 40 22 45 Q15 40 22 30Z" fill="${mascotShared.sweat}" stroke-width="${n(c.sw * 0.5)}"/>`
          : "")
      );
    case "curious":
      return (
        dot(ex1, 4.4, 5) + open(ex2, 7, 1, 0, 3.2) +
        brow(`M${n(ex1 - 6)} ${n(y - 11)} Q${n(ex1)} ${n(y - 15)} ${n(ex1 + 6)} ${n(y - 11)}`) +
        brow(`M${n(ex2 - 6)} ${n(y - 15)} Q${n(ex2)} ${n(y - 20)} ${n(ex2 + 6)} ${n(y - 15)}`) +
        `<path d="M45 ${my} Q52 ${my + 6} 57 ${my - 2}" fill="none"/>` + cheeks
      );
    case "relaxed":
      return arcUp(ex1) + arcUp(ex2) + `<path d="M41 ${my - 2} Q50 ${my + 9} 59 ${my - 2}" fill="none"/>` + cheeks;
    case "sleeping":
      return (
        arcDown(ex1) + arcDown(ex2) +
        `<ellipse cx="50" cy="${my + 1}" rx="2.6" ry="3.2" fill="${dark}" stroke="none"/>` + cheeks
      );
  }
}

/** Small symbol chip at top-right: shape (not color) carries the meaning. */
function symbol(mood: Mood, c: Ctx): string {
  const chip = (inner: string) =>
    `<circle cx="84" cy="16" r="11.5" fill="${mascotShared.chipFill}" stroke-width="${n(Math.max(2.4, c.sw * 0.7))}"/>${inner}`;
  const sw = n(Math.max(2.6, c.sw * 0.8));
  switch (mood) {
    case "waiting":
      return chip(
        [78, 84, 90].map((x) => `<circle cx="${x}" cy="17" r="2" fill="${c.p.dark}" stroke="none"/>`).join(""),
      );
    case "worried":
      return chip(
        `<path d="M84 9.5 L84 17" fill="none" stroke="${mascotShared.alert}" stroke-width="${sw}"/>` +
          `<circle cx="84" cy="22" r="1.8" fill="${mascotShared.alert}" stroke="none"/>`,
      );
    case "curious":
      return chip(
        `<path d="M79.5 12.5 Q79.5 8 84 8 Q88.5 8 88.5 12 Q88.5 15 84 17 L84 18.5" fill="none" stroke="${mascotShared.info}" stroke-width="${sw}"/>` +
          `<circle cx="84" cy="22.6" r="1.7" fill="${mascotShared.info}" stroke="none"/>`,
      );
    case "sleeping":
      return chip(
        `<path d="M77 12 H84.5 L77 20 H84.5" fill="none" stroke-width="${n(c.sw * 0.7)}"/>` +
          `<path d="M86.5 8 H90.5 L86.5 13 H90.5" fill="none" stroke-width="${n(c.sw * 0.55)}"/>`,
      );
    case "relaxed":
      return `<path d="M84 6 Q85.5 14 94 16 Q85.5 18 84 26 Q82.5 18 74 16 Q82.5 14 84 6Z" fill="${mascotShared.star}" stroke-width="${n(c.sw * 0.5)}"/>`;
    case "focused":
      return "";
  }
}

function accessoryShapes(g: Geo, c: Ctx): { under: string; over: string } {
  const { p } = c;
  const s = g.side, top = g.top, ey = g.ey, bot = g.bot;
  const acc = c.accessory;
  if (acc === "headphones") {
    const band = `M${n(50 - s - 1)} ${n(ey + 4)} C${n(50 - s - 3)} ${n(top - 20)} ${n(50 + s + 3)} ${n(top - 20)} ${n(50 + s + 1)} ${n(ey + 4)}`;
    return {
      under: "",
      over:
        `<path d="${band}" fill="none" stroke-width="${n(c.sw + 3.5)}"/>` +
        `<path d="${band}" fill="none" stroke="${p.accent}" stroke-width="${n(c.sw * 0.9)}"/>` +
        `<rect x="${n(50 - s - 7)}" y="${n(ey - 7)}" width="11" height="19" rx="5" fill="${p.accent}"/>` +
        `<rect x="${n(50 + s - 4)}" y="${n(ey - 7)}" width="11" height="19" rx="5" fill="${p.accent}"/>`,
    };
  }
  if (acc === "glasses") {
    const r = g.glassR;
    return {
      under: "",
      over:
        `<circle cx="${50 - g.ex}" cy="${ey}" r="${r}" fill="${mascotShared.white}" fill-opacity=".3"/>` +
        `<circle cx="${50 + g.ex}" cy="${ey}" r="${r}" fill="${mascotShared.white}" fill-opacity=".3"/>` +
        `<path d="M${n(50 - g.ex + r)} ${ey} Q50 ${ey - 3} ${n(50 + g.ex - r)} ${ey}" fill="none"/>`,
    };
  }
  if (acc === "cap") {
    return {
      under: "",
      over:
        `<path d="M${n(50 - s + 2)} ${n(top + 14)} C${n(50 - s + 2)} ${n(top - 8)} ${n(50 + s - 2)} ${n(top - 8)} ${n(50 + s - 2)} ${n(top + 14)}Z" fill="${p.accent}"/>` +
        `<rect x="${n(50 - s + 2)}" y="${n(top + 11)}" width="${n(2 * s + 10)}" height="7" rx="3.5" fill="${p.accent}"/>` +
        `<circle cx="50" cy="${n(top - 1.5)}" r="2.6" fill="${p.dark}" stroke="none"/>`,
    };
  }
  if (acc === "scarf") {
    const y = bot - 13, x1 = 50 - s + 8, x2 = 50 + s - 8;
    return {
      under: "",
      over:
        `<path d="M${n(x1)} ${n(y)} Q50 ${n(y + 9)} ${n(x2)} ${n(y)} L${n(x2 - 2)} ${n(y + 10)} Q50 ${n(y + 19)} ${n(x1 + 2)} ${n(y + 10)}Z" fill="${p.accent}"/>` +
        `<rect x="${n(x2 - 14)}" y="${n(y + 8)}" width="11" height="15" rx="4" fill="${p.accent}"/>`,
    };
  }
  if (acc === "plant") {
    return {
      under: "",
      over:
        `<path d="M50 ${n(top + 2)} Q50 ${n(top - 4)} 51 ${n(top - 9)}" fill="none"/>` +
        `<ellipse cx="45" cy="${n(top - 9)}" rx="6.5" ry="3.6" transform="rotate(-28 45 ${n(top - 9)})" fill="${mascotShared.leaf}" stroke="${mascotShared.leafDark}" stroke-width="${n(c.sw * 0.6)}"/>` +
        `<ellipse cx="57" cy="${n(top - 11)}" rx="6.5" ry="3.6" transform="rotate(28 57 ${n(top - 11)})" fill="${mascotShared.leaf}" stroke="${mascotShared.leafDark}" stroke-width="${n(c.sw * 0.6)}"/>`,
    };
  }
  return { under: "", over: "" };
}

const POSE: Record<Mood, string> = {
  focused: `rotate(-3 50 90)`,
  waiting: `rotate(5 50 90)`,
  worried: `rotate(-6 50 90)`,
  curious: `rotate(8 50 90)`,
  relaxed: ``,
  sleeping: `translate(50 90) rotate(7) scale(1 .93) translate(-50 -90)`,
};

function agentBadge(c: Ctx, size: number): string {
  const r = size <= 32 ? 16 : 13;
  const s = r / 13;
  const col = mascotShared.agentBadge;
  const cx = size <= 32 ? 80 : 82, cy = cx;
  const t = `translate(${cx} ${cy}) scale(${n(s)}) translate(-82 -82)`;
  return (
    `<g transform="${t}" data-agent-badge="true">` +
    `<circle cx="82" cy="82" r="13" fill="${col}" stroke="${mascotShared.white}" stroke-width="3"/>` +
    `<rect x="74" y="77.5" width="16" height="11.5" rx="3.2" fill="${mascotShared.white}" stroke="none"/>` +
    `<path d="M82 77.5 V73.5" stroke="${mascotShared.white}" stroke-width="2" fill="none"/>` +
    `<circle cx="82" cy="72.6" r="1.9" fill="${mascotShared.white}" stroke="none"/>` +
    `<circle cx="78.6" cy="83" r="1.7" fill="${col}" stroke="none"/><circle cx="85.4" cy="83" r="1.7" fill="${col}" stroke="none"/>` +
    `</g>`
  );
}

/* ---------- public API ---------- */

export function renderMascot(traits: MascotTraits, opts: RenderOptions): string {
  const species: Species = isIn(SPECIES, traits.species) ? traits.species : "blob";
  const paletteKey: PaletteKey = isIn(PALETTES, traits.palette) ? (traits.palette as PaletteKey) : "sunrise";
  const accessory: Accessory = (ACCESSORIES as readonly (string | null)[]).includes(traits.accessory)
    ? (traits.accessory as Accessory)
    : null;
  const mood: Mood = isIn(MOODS, opts.mood) ? opts.mood : "relaxed";
  const seed = Number.isFinite(traits.seed) ? Math.abs(Math.trunc(traits.seed)) : 0;
  const size = Number.isFinite(opts.size) ? Math.min(512, Math.max(16, Math.round(opts.size!))) : 48;

  const c: Ctx = {
    p: mascotPalettes[paletteKey],
    sw: size >= 96 ? 3 : size >= 48 ? 3.2 : size >= 32 ? 3.8 : 4.6,
    full: size >= 48,
    mid: size >= 32,
    large: size >= 96,
    v: seed % 3,
    accessory,
  };
  const g = GEO[species];
  const acc = accessoryShapes(g, c);

  // seed-driven tiny marks (large sizes only): freckles or forehead dot
  const mark = c.large
    ? c.v === 1
      ? `<circle cx="${50 - g.ex - 4}" cy="${g.ey + 5}" r="1" fill="${c.p.dark}" stroke="none"/><circle cx="${50 - g.ex + 1}" cy="${g.ey + 8}" r="1" fill="${c.p.dark}" stroke="none"/><circle cx="${50 + g.ex + 4}" cy="${g.ey + 5}" r="1" fill="${c.p.dark}" stroke="none"/><circle cx="${50 + g.ex - 1}" cy="${g.ey + 8}" r="1" fill="${c.p.dark}" stroke="none"/>`
      : c.v === 2 && species !== "bot" && species !== "owl"
        ? `<circle cx="50" cy="${g.top + 12}" r="2.2" fill="${c.p.dark}" opacity=".35" stroke="none"/>`
        : ""
    : "";
  const shine = c.large ? `<path d="M26 40 Q30 28 42 24" fill="none" stroke="${mascotShared.white}" stroke-opacity=".5" stroke-width="3"/>` : "";

  const label = esc(
    opts.title?.trim() ||
      `Linh vật ${SPECIES_LABEL_VI[species].toLowerCase()}, ${MOOD_LABEL_VI[mood]}${opts.agentBadge ? ", agent soạn" : ""}`,
  );
  const pose = POSE[mood];
  const sleepDim = mood === "sleeping" ? ` opacity=".88"` : "";

  const inner =
    g.back(c) + g.body(c) + g.deco(c) + shine + mark + face(mood, g, c) + g.front(c) + acc.under + acc.over;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ${opts.decorative ? 'aria-hidden="true" focusable="false"' : 'role="img"'} width="${size}" height="${size}" viewBox="0 0 100 100" data-species="${species}" data-mood="${mood}">` +
    (opts.decorative ? "" : `<title>${label}</title>`) +
    `<g fill="none" stroke="${c.p.dark}" stroke-width="${n(c.sw)}" stroke-linecap="round" stroke-linejoin="round">` +
    `<g${pose ? ` transform="${pose}"` : ""}${sleepDim}>${inner}</g>` +
    symbol(mood, c) +
    (opts.agentBadge ? agentBadge(c, size) : "") +
    `</g></svg>`
  );
}
