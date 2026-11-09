import { describe, expect, it } from "vitest";
import { PRESENCE_TO_MOOD } from "@officehub/shared";
import { ACCESSORIES, MOODS, PALETTES, SPECIES, defaultMascotFor, renderMascot } from "./mascot.js";

const base = { species: "cat", palette: "ocean", accessory: null, seed: 7 };

/** Minimal well-formedness check: tags balance. */
function wellFormed(svg: string): boolean {
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const [, close, name, self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else stack.push(name!);
  }
  return stack.length === 0;
}

describe("renderMascot", () => {
  it("is deterministic", () => {
    const a = renderMascot(base, { mood: "focused", size: 48 });
    const b = renderMascot({ ...base }, { mood: "focused", size: 48 });
    expect(a).toBe(b);
  });

  it("renders every species x mood as accessible, well-formed SVG", () => {
    for (const species of SPECIES) {
      for (const mood of MOODS) {
        const svg = renderMascot({ ...base, species }, { mood, size: 96 });
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg).toContain('role="img"');
        expect(svg).toMatch(/<title>[^<]+<\/title>/);
        expect(svg).not.toMatch(/<script/i);
        expect(svg).not.toMatch(/\bon\w+=/i);
        expect(svg).not.toContain("href=");
        expect(wellFormed(svg)).toBe(true);
        expect(svg).not.toContain("NaN");
        expect(svg).not.toContain("undefined");
      }
    }
  });

  it("every mood looks different (shape, not only color) for each species", () => {
    for (const species of SPECIES) {
      const outs = new Set(MOODS.map((mood) => renderMascot({ ...base, species }, { mood, size: 48 })));
      expect(outs.size).toBe(MOODS.length);
    }
  });

  it("every palette and accessory renders and differs", () => {
    const pal = new Set(PALETTES.map((palette) => renderMascot({ ...base, palette }, { mood: "relaxed" })));
    expect(pal.size).toBe(PALETTES.length);
    const acc = new Set(ACCESSORIES.map((accessory) => renderMascot({ ...base, accessory }, { mood: "relaxed" })));
    expect(acc.size).toBe(ACCESSORIES.length);
    for (const species of SPECIES)
      for (const accessory of ACCESSORIES)
        expect(wellFormed(renderMascot({ ...base, species, accessory }, { mood: "curious", size: 32 }))).toBe(true);
  });

  it("falls back safely on unknown keys and bad numbers", () => {
    const svg = renderMascot(
      { species: "dragon", palette: "neon", accessory: "crown", seed: Number.NaN },
      { mood: "angry", size: Number.NaN },
    );
    expect(svg).toContain('data-species="blob"');
    expect(svg).toContain('data-mood="relaxed"');
    expect(wellFormed(svg)).toBe(true);
    expect(renderMascot(base, { mood: "focused", size: 99999 })).toContain('width="512"');
    expect(renderMascot(base, { mood: "focused", size: 1 })).toContain('width="16"');
  });

  it("escapes the title", () => {
    const svg = renderMascot(base, { mood: "focused", title: `</title><script>alert(1)</script>"` });
    expect(svg).not.toMatch(/<script/i);
    expect(wellFormed(svg)).toBe(true);
  });

  it("agent badge is optional and adds a marker", () => {
    expect(renderMascot(base, { mood: "focused" })).not.toContain("data-agent-badge");
    const withBadge = renderMascot(base, { mood: "focused", agentBadge: true });
    expect(withBadge).toContain("data-agent-badge");
    expect(withBadge).toContain("agent soạn");
  });

  it("keeps output small", () => {
    for (const species of SPECIES) {
      const svg = renderMascot({ ...base, species, accessory: "headphones" }, { mood: "worried", size: 160, agentBadge: true });
      expect(svg.length).toBeLessThan(6000);
    }
  });

  it("drops detail at small sizes", () => {
    const small = renderMascot(base, { mood: "relaxed", size: 24 });
    const big = renderMascot(base, { mood: "relaxed", size: 160 });
    expect(small.length).toBeLessThan(big.length);
  });

  it("covers every mood produced by PRESENCE_TO_MOOD", () => {
    for (const mood of Object.values(PRESENCE_TO_MOOD)) expect(MOODS).toContain(mood);
  });
});

describe("defaultMascotFor", () => {
  it("is stable and yields valid traits", () => {
    const id = "6f1a0a7e-2c1d-4a6b-9f3e-0d2b6c4e8a11";
    expect(defaultMascotFor(id)).toEqual(defaultMascotFor(id));
    const m = defaultMascotFor(id);
    expect(SPECIES).toContain(m.species);
    expect(PALETTES).toContain(m.palette);
    expect(ACCESSORIES).toContain(m.accessory);
    expect(Number.isInteger(m.seed) && m.seed >= 0).toBe(true);
  });
  it("spreads across species", () => {
    const seen = new Set(Array.from({ length: 60 }, (_, i) => defaultMascotFor("member-" + i).species));
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});
