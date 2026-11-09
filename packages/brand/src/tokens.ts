/**
 * Office Hub design tokens — single source of truth.
 * `tokens.css` and `tailwind-theme.css` are GENERATED from this file
 * (`pnpm --filter @officehub/brand build:css`); a test keeps them in sync.
 */

/** Semantic colors. Every `fg` / text pairing is checked for WCAG AA in tokens.test.ts. */
export interface ColorTokens {
  bg: string; // page background
  surface: string; // cards
  surface2: string; // nested / hover surface
  border: string; // decorative borders
  borderStrong: string; // borders of controls (>= 3:1 against surface)
  ink: string; // primary text
  inkMuted: string; // secondary text (still AA)
  /** Human action color — approve / send buttons. Always solid. */
  primary: string;
  primaryHover: string;
  primaryFg: string;
  primarySoft: string;
  primarySoftFg: string;
  /** Agent-authored content (drafts). Cool hue, dashed borders. */
  agent: string;
  agentFg: string;
  agentSoft: string;
  agentSoftFg: string;
  /** Untrusted content from someone else. Ochre. */
  untrusted: string;
  untrustedSoft: string;
  untrustedSoftFg: string;
  success: string;
  successSoft: string;
  successSoftFg: string;
  warning: string;
  warningSoft: string;
  warningSoftFg: string;
  danger: string;
  dangerHover: string;
  dangerFg: string;
  dangerSoft: string;
  dangerSoftFg: string;
  focus: string;
  overlay: string;
}

export const colorLight: ColorTokens = {
  bg: "#FBF7F0",
  surface: "#FFFFFF",
  surface2: "#F5EFE4",
  border: "#E7DECF",
  borderStrong: "#8F8372",
  ink: "#241F2D",
  inkMuted: "#5E5668",
  primary: "#B93C0E",
  primaryHover: "#9A3009",
  primaryFg: "#FFFFFF",
  primarySoft: "#FFEBDD",
  primarySoftFg: "#7A2606",
  agent: "#2C5F86",
  agentFg: "#FFFFFF",
  agentSoft: "#E6F0F8",
  agentSoftFg: "#1E4568",
  untrusted: "#8A5F00",
  untrustedSoft: "#FFF4D6",
  untrustedSoftFg: "#6B4A00",
  success: "#1F7A4D",
  successSoft: "#E1F4EA",
  successSoftFg: "#15593A",
  warning: "#8A5F00",
  warningSoft: "#FFF4D6",
  warningSoftFg: "#6B4A00",
  danger: "#B42318",
  dangerHover: "#8F1B12",
  dangerFg: "#FFFFFF",
  dangerSoft: "#FDE8E6",
  dangerSoftFg: "#8F1B12",
  focus: "#2C5F86",
  overlay: "rgba(36, 31, 45, 0.45)",
};

export const colorDark: ColorTokens = {
  bg: "#1B1713",
  surface: "#26211C",
  surface2: "#312B24",
  border: "#3F372E",
  borderStrong: "#8C8070",
  ink: "#F6EFE5",
  inkMuted: "#BDB2A3",
  primary: "#F28A4B",
  primaryHover: "#F59E66",
  primaryFg: "#1B1208",
  primarySoft: "#432A1A",
  primarySoftFg: "#FFD3B5",
  agent: "#7DB6E0",
  agentFg: "#0E2132",
  agentSoft: "#1D2E3D",
  agentSoftFg: "#BFDDF3",
  untrusted: "#E0B040",
  untrustedSoft: "#3A2F12",
  untrustedSoftFg: "#F4D98A",
  success: "#63C592",
  successSoft: "#1A3427",
  successSoftFg: "#B5E8CE",
  warning: "#E0B040",
  warningSoft: "#3A2F12",
  warningSoftFg: "#F4D98A",
  danger: "#F27A6E",
  dangerHover: "#F59A90",
  dangerFg: "#2A0A06",
  dangerSoft: "#401C18",
  dangerSoftFg: "#FFC9C2",
  focus: "#7DB6E0",
  overlay: "rgba(0, 0, 0, 0.6)",
};

/** Mascot palettes. `base` body, `light` belly/muzzle, `dark` outline + facial features, `accent` accessories. */
export interface MascotPalette {
  label: string; // Vietnamese
  base: string;
  light: string;
  dark: string;
  accent: string;
}

export const mascotPalettes = {
  sunrise: { label: "Bình minh", base: "#FFB84D", light: "#FFE6B0", dark: "#7A3E0B", accent: "#FF6F59" },
  ocean: { label: "Đại dương", base: "#6EC1E4", light: "#D6F0FA", dark: "#124A6B", accent: "#FF8A65" },
  forest: { label: "Rừng xanh", base: "#7CCB8C", light: "#DCF3E0", dark: "#1E5632", accent: "#F4B942" },
  grape: { label: "Nho tím", base: "#B79CEB", light: "#EBE2FC", dark: "#44307A", accent: "#FF9EBB" },
  coral: { label: "San hô", base: "#FF8F8A", light: "#FFDCD9", dark: "#7F2630", accent: "#4FB6A8" },
  slate: { label: "Đá phiến", base: "#9AA8BC", light: "#E3E8EF", dark: "#2B3648", accent: "#F2B84B" },
  sand: { label: "Cát", base: "#E8CFA0", light: "#F9F0DF", dark: "#6B4F28", accent: "#6BA3D6" },
} as const satisfies Record<string, MascotPalette>;

/** Fixed mascot details shared by all palettes. */
export const mascotShared = {
  cheek: "#FF8FA3",
  white: "#FFFFFF",
  leaf: "#5DBB6E",
  leafDark: "#2F7A3E",
  sweat: "#8ED4F5",
  star: "#F5B93A",
  agentBadge: "#2C5F86",
  chipFill: "#FFFFFF",
  alert: "#C0392B",
  info: "#2C5F86",
} as const;

export const fontFamily = {
  sans: `"Be Vietnam Pro", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  mono: `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
} as const;

/** Google Fonts stylesheet (both families ship the Vietnamese subset). */
export const googleFontsHref =
  "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap&subset=vietnamese";

/** Type scale: size px / line-height. Body line-height is generous for stacked Vietnamese diacritics. */
export const typeScale = {
  xs: { size: 12, line: 18 },
  sm: { size: 14, line: 21 },
  base: { size: 16, line: 25 },
  lg: { size: 18, line: 27 },
  xl: { size: 20, line: 29 },
  "2xl": { size: 24, line: 32 },
  "3xl": { size: 30, line: 38 },
  "4xl": { size: 36, line: 44 },
} as const;

/** 4px grid. */
export const spacing = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64,
} as const;

export const radius = { sm: 6, md: 10, lg: 16, xl: 24, full: 9999 } as const;

export const shadowLight = {
  sm: "0 1px 2px rgba(60, 40, 20, 0.08)",
  md: "0 4px 12px rgba(60, 40, 20, 0.10)",
  lg: "0 12px 32px rgba(60, 40, 20, 0.16)",
} as const;
export const shadowDark = {
  sm: "0 1px 2px rgba(0, 0, 0, 0.4)",
  md: "0 4px 12px rgba(0, 0, 0, 0.45)",
  lg: "0 12px 32px rgba(0, 0, 0, 0.55)",
} as const;

export const motion = {
  duration: { fast: 120, base: 200, slow: 360 },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    out: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
} as const;

/* ---------- helpers ---------- */

export const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

/** WCAG relative luminance contrast ratio of two #RRGGBB colors. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- CSS generation ---------- */

const colorVars = (c: ColorTokens, indent: string) =>
  Object.entries(c)
    .map(([k, v]) => `${indent}--oh-${kebab(k)}: ${v};`)
    .join("\n");
const shadowVars = (s: Record<string, string>, indent: string) =>
  Object.entries(s)
    .map(([k, v]) => `${indent}--oh-shadow-${k}: ${v};`)
    .join("\n");

export function buildTokensCss(): string {
  const staticVars = [
    `  --oh-font-sans: ${fontFamily.sans};`,
    `  --oh-font-mono: ${fontFamily.mono};`,
    ...Object.entries(typeScale).flatMap(([k, v]) => [
      `  --oh-text-${k}: ${v.size / 16}rem;`,
      `  --oh-text-${k}-line: ${v.line / 16}rem;`,
    ]),
    ...Object.entries(spacing).map(([k, v]) => `  --oh-space-${k}: ${v / 16}rem;`),
    ...Object.entries(radius).map(([k, v]) => `  --oh-radius-${k}: ${v === 9999 ? "9999px" : v / 16 + "rem"};`),
    ...Object.entries(motion.duration).map(([k, v]) => `  --oh-duration-${k}: ${v}ms;`),
    `  --oh-ease-standard: ${motion.easing.standard};`,
    `  --oh-ease-out: ${motion.easing.out};`,
    ...Object.entries(mascotPalettes).flatMap(([name, p]) => [
      `  --oh-mascot-${name}-base: ${p.base};`,
      `  --oh-mascot-${name}-light: ${p.light};`,
      `  --oh-mascot-${name}-dark: ${p.dark};`,
      `  --oh-mascot-${name}-accent: ${p.accent};`,
    ]),
  ].join("\n");

  return `/* GENERATED by packages/brand/scripts/build-css.ts from src/tokens.ts — do not edit by hand. */

:root {
  color-scheme: light;
${colorVars(colorLight, "  ")}
${shadowVars(shadowLight, "  ")}
${staticVars}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${colorVars(colorDark, "    ")}
${shadowVars(shadowDark, "    ")}
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
${colorVars(colorDark, "  ")}
${shadowVars(shadowDark, "  ")}
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --oh-duration-fast: 0ms;
    --oh-duration-base: 0ms;
    --oh-duration-slow: 0ms;
  }
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;
}

export function buildTailwindThemeCss(): string {
  const colors = Object.keys(colorLight)
    .filter((k) => k !== "overlay")
    .map((k) => `  --color-oh-${kebab(k)}: var(--oh-${kebab(k)});`)
    .join("\n");
  const overlay = `  --color-oh-overlay: var(--oh-overlay);`;
  const palettes = Object.keys(mascotPalettes)
    .flatMap((n) => ["base", "light", "dark", "accent"].map((r) => `  --color-oh-${n}-${r}: var(--oh-mascot-${n}-${r});`))
    .join("\n");
  const text = Object.keys(typeScale)
    .map((k) => `  --text-oh-${k}: var(--oh-text-${k});\n  --text-oh-${k}--line-height: var(--oh-text-${k}-line);`)
    .join("\n");
  const radii = Object.keys(radius)
    .map((k) => `  --radius-oh-${k}: var(--oh-radius-${k});`)
    .join("\n");
  const shadows = Object.keys(shadowLight)
    .map((k) => `  --shadow-oh-${k}: var(--oh-shadow-${k});`)
    .join("\n");

  return `/* GENERATED by packages/brand/scripts/build-css.ts from src/tokens.ts — do not edit by hand.
 * Requires tokens.css (defines the --oh-* variables) and \`@import "tailwindcss"\`.
 * Utilities: bg-oh-surface, text-oh-ink-muted, border-oh-border, rounded-oh-md, shadow-oh-md, font-sans, font-mono ... */
@theme inline {
  --font-sans: var(--oh-font-sans);
  --font-mono: var(--oh-font-mono);
${colors}
${overlay}
${palettes}
${text}
${radii}
${shadows}
  --ease-oh: var(--oh-ease-standard);
  --ease-oh-out: var(--oh-ease-out);
  --animate-oh-pop: oh-pop var(--oh-duration-base) var(--oh-ease-out);
  --animate-oh-fade: oh-fade var(--oh-duration-base) var(--oh-ease-standard);
}

@keyframes oh-pop {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
@keyframes oh-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@layer base {
  html { font-family: var(--oh-font-sans); }
  body { background: var(--oh-bg); color: var(--oh-ink); line-height: 1.55; }
  :focus-visible { outline: 3px solid var(--oh-focus); outline-offset: 2px; }
}
`;
}
