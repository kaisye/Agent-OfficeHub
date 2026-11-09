import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MascotBuddy, PRESENCE_TO_MOOD } from "@officehub/shared";
import { BUDDIES, BUDDY_IDS, MOODS, MOOD_GLYPH, MOOD_LABEL_VI, mascotFile, mascotSrc } from "./buddies.js";

const asset = (f: string) => new URL(`../assets/${f}`, import.meta.url);

describe("BUDDIES metadata", () => {
  it("covers exactly the six buddies of the shared contract", () => {
    expect([...BUDDY_IDS].sort()).toEqual([...MascotBuddy.options].sort());
    expect(Object.keys(BUDDIES).sort()).toEqual([...MascotBuddy.options].sort());
  });
  it("has Vietnamese role taglines and a hex colour for each buddy", () => {
    for (const b of Object.values(BUDDIES)) {
      expect(b.name.length).toBeGreaterThan(1);
      expect(b.role).toMatch(/&|\s/);
      expect(b.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(BUDDIES.blu.role).toBe("Code & sản phẩm");
  });
  it("every mood a presence can produce has a label and glyph", () => {
    for (const mood of Object.values(PRESENCE_TO_MOOD)) {
      expect(MOODS).toContain(mood);
      expect(MOOD_LABEL_VI[mood]).toBeTruthy();
      expect(MOOD_GLYPH[mood]).toBeTruthy();
    }
  });
});

describe("mascot assets", () => {
  const sizes = [128, 256, 512] as const;
  it.each(BUDDY_IDS.flatMap((b) => sizes.map((s) => [b, s] as const)))("%s @%i exists, is the right format and < 120 KB", (b, s) => {
    const url = asset(mascotFile(b, s));
    expect(statSync(url).size).toBeLessThan(120 * 1024);
    const buf = readFileSync(url);
    if (s === 256) expect(buf.subarray(1, 4).toString()).toBe("PNG");
    else {
      expect(buf.subarray(0, 4).toString()).toBe("RIFF");
      expect(buf.subarray(8, 12).toString()).toBe("WEBP");
    }
  });
  it("mascotSrc builds URLs", () => {
    expect(mascotSrc("milo", 512)).toBe("/mascots/milo-512.webp");
    expect(mascotSrc("pip", 256)).toBe("/mascots/pip-256.png");
    expect(mascotSrc("fern", 128, "/x")).toBe("/x/fern-128.webp");
  });
});
