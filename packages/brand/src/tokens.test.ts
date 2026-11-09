import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTailwindThemeCss, buildTokensCss, colorDark, colorLight, contrastRatio, type ColorTokens } from "./tokens.js";

const css = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("generated css", () => {
  it("tokens.css and tailwind-theme.css are in sync with tokens.ts", () => {
    expect(css("./tokens.css")).toBe(buildTokensCss());
    expect(css("./tailwind-theme.css")).toBe(buildTailwindThemeCss());
  });
  it("supports dark via media query and data-theme", () => {
    const t = css("./tokens.css");
    expect(t).toContain("prefers-color-scheme: dark");
    expect(t).toContain('[data-theme="dark"]');
    expect(t).toContain("prefers-reduced-motion");
  });
});

// [foreground, background] pairs that must reach WCAG AA for normal text (4.5:1)
const TEXT_PAIRS: [keyof ColorTokens, keyof ColorTokens][] = [
  ["ink", "bg"], ["ink", "surface"], ["inkMuted", "bg"], ["inkMuted", "surface"], ["inkMuted", "surface2"],
  ["primaryFg", "primary"], ["primaryFg", "primaryHover"], ["primarySoftFg", "primarySoft"], ["primary", "surface"],
  ["agentFg", "agent"], ["agentSoftFg", "agentSoft"], ["agent", "surface"],
  ["untrustedSoftFg", "untrustedSoft"], ["untrusted", "surface"],
  ["successSoftFg", "successSoft"], ["success", "surface"],
  ["warningSoftFg", "warningSoft"],
  ["dangerFg", "danger"], ["dangerFg", "dangerHover"], ["dangerSoftFg", "dangerSoft"], ["danger", "surface"],
];

describe.each([["light", colorLight], ["dark", colorDark]] as const)("WCAG AA (%s)", (_name, c) => {
  it.each(TEXT_PAIRS)("%s on %s >= 4.5", (fg, bg) => {
    expect(contrastRatio(c[fg] as string, c[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });
  it("control borders and focus ring >= 3:1 against surface", () => {
    expect(contrastRatio(c.borderStrong, c.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(c.focus, c.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(c.focus, c.bg)).toBeGreaterThanOrEqual(3);
  });
});
