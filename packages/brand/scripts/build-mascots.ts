/** Converts the Desk Buddies source PNGs (1.2 MB each, NOT committed) to WebP 512/128 + PNG 256 fallback.
 *  Usage: tsx scripts/build-mascots.ts <dir containing milo.png, sage.png, ...> */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("usage: build-mascots.ts <source dir>");
const out = fileURLToPath(new URL("../assets/mascots/", import.meta.url));
mkdirSync(out, { recursive: true });
const fit = (b: string, n: number) => sharp(`${src}/${b}.png`).trim({ threshold: 1 }).resize({ width: n, height: n, fit: "inside" });
for (const b of ["milo", "sage", "pip", "blu", "mocha", "fern"]) {
  await fit(b, 512).webp({ quality: 80, alphaQuality: 90, effort: 6 }).toFile(`${out}${b}-512.webp`);
  await fit(b, 128).webp({ quality: 80, effort: 6 }).toFile(`${out}${b}-128.webp`);
  await fit(b, 256).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(`${out}${b}-256.png`);
}
console.log("wrote mascots");
