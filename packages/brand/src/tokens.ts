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

/** Desk Buddies — Warm Studio raw palette (handoff DNA). Not themed: use the semantic tokens below in UI. */
export const brandPalette = {
  cream: "#F3EEE5",
  cognac: "#AC633B",
  walnut: "#594032",
  forest: "#355B47",
  cobalt: "#355BA6",
  charcoal: "#292C28",
  canvas: "#F8F8F2",
  border: "#E5E4DA",
  /** Extra tones used by the prototype CSS. */
  sidebar: "#F0F0E7",
  white: "#FFFEFA",
  muted: "#85877E",
  sageTint: "#DFE8D8",
} as const;

/** Office map "furniture" tones (floor, wood, rug) shared by the 2D office. Decorative only. */
export const officeTones = {
  floor: "#F1E9DA",
  floorLine: "#EADDC9",
  wall: "#E8DFCC",
  woodLight: "#C8A47A",
  wood: "#B58C63",
  woodDark: "#896347",
  rug: "#E4DFC8",
} as const;

export const colorLight: ColorTokens = {
  bg: "#F8F8F2", // Canvas
  surface: "#FFFEFA",
  surface2: "#F0F0E7",
  border: "#E5E4DA", // Border
  borderStrong: "#85877E",
  ink: "#292C28", // Charcoal
  inkMuted: "#5C6056",
  primary: "#355B47", // Forest
  primaryHover: "#284A38",
  primaryFg: "#FFFDF4",
  primarySoft: "#E1EADA",
  primarySoftFg: "#284A38",
  agent: "#355BA6", // Cobalt
  agentFg: "#FFFFFF",
  agentSoft: "#E8ECF6",
  agentSoftFg: "#2A478A",
  untrusted: "#94502B", // Cognac, darkened for text
  untrustedSoft: "#F7EBDD",
  untrustedSoftFg: "#6E3A1C",
  success: "#2F6B4F",
  successSoft: "#E1EADA",
  successSoftFg: "#244F3B",
  warning: "#8A5F00",
  warningSoft: "#F7EFDE",
  warningSoftFg: "#6B4A00",
  danger: "#A8402A",
  dangerHover: "#862F1D",
  dangerFg: "#FFFFFF",
  dangerSoft: "#F9E9DF",
  dangerSoftFg: "#7F2D1B",
  focus: "#355BA6",
  overlay: "rgba(38, 43, 35, 0.32)",
};

/** Warm dark: Walnut-tinted charcoal. */
export const colorDark: ColorTokens = {
  bg: "#1B1814",
  surface: "#25211B",
  surface2: "#2F2A23",
  border: "#3E382E",
  borderStrong: "#8C8473",
  ink: "#F3EEE5", // Cream
  inkMuted: "#BDB5A5",
  primary: "#86C2A2",
  primaryHover: "#9DD0B5",
  primaryFg: "#10241A",
  primarySoft: "#233A2E",
  primarySoftFg: "#C2E4D1",
  agent: "#8FAAE8",
  agentFg: "#0F1E3F",
  agentSoft: "#202A45",
  agentSoftFg: "#C7D6F6",
  untrusted: "#E3A878",
  untrustedSoft: "#3A2B1D",
  untrustedSoftFg: "#F2D4B0",
  success: "#7DC59A",
  successSoft: "#1D3427",
  successSoftFg: "#B5E8CE",
  warning: "#E0B040",
  warningSoft: "#3A2F12",
  warningSoftFg: "#F4D98A",
  danger: "#F08A78",
  dangerHover: "#F5A394",
  dangerFg: "#2A0A06",
  dangerSoft: "#40201A",
  dangerSoftFg: "#FFCDC2",
  focus: "#8FAAE8",
  overlay: "rgba(0, 0, 0, 0.6)",
};

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

/** Handoff: input/button 9-10, card 14-16, modal 20. */
export const radius = { sm: 6, md: 10, lg: 16, xl: 20, full: 9999 } as const;

export const shadowLight = {
  sm: "0 1px 2px rgba(89, 64, 50, 0.06)",
  md: "0 3px 18px rgba(89, 64, 50, 0.08)",
  lg: "0 15px 60px rgba(41, 44, 40, 0.14)",
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

/** camelCase -> kebab-case; digits start a new segment (surface2 -> surface-2). */
export const kebab = (s: string) => s.replace(/[A-Z]|\d+/g, (m) => "-" + m.toLowerCase());

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
    // Deprecated alias (pre-0.3 name). Canonical: --oh-surface-2 / bg-oh-surface-2.
    `  --oh-surface2: var(--oh-surface-2);`,
    `  --oh-ease-standard: ${motion.easing.standard};`,
    `  --oh-ease-out: ${motion.easing.out};`,
    ...Object.entries(brandPalette).map(([k, v]) => `  --oh-brand-${k}: ${v};`),
    ...Object.entries(officeTones).map(([k, v]) => `  --oh-office-${kebab(k)}: ${v};`),
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
  const palettes = [...(["cream", "cognac", "walnut", "forest", "cobalt", "charcoal"] as const).map((k) => `  --color-oh-${k}: var(--oh-brand-${k});`)].join("\n");
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
