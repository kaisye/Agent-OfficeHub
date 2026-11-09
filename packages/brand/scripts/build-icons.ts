/** Generates assets/icon.svg (+ favicon-32.png, apple-touch-icon.png 180px, icon-512.png) from the brand mark. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { colorLight, mascotPalettes } from "../src/tokens.js";

const dir = fileURLToPath(new URL("../assets/", import.meta.url));
mkdirSync(dir, { recursive: true });

/**
 * The mark is the "blob" mascot (round, friendly, species-neutral) on the primary color:
 * Office Hub = a little creature that keeps your team's status. Simple shapes so it holds at 16-32px.
 * `pad` adds safe-area for maskable/Apple icons (iOS rounds the corners itself, so 180px is full-bleed).
 */
export function iconSvg({ rounded = true }: { rounded?: boolean } = {}): string {
  const p = mascotPalettes.sunrise;
  const bg = colorLight.primary;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Office Hub">
<title>Office Hub</title>
<rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="${bg}"/>
<path d="M32 12c11 0 19 8 19 19 0 11-8 20-19 20S13 42 13 31c0-11 8-19 19-19Z" fill="${p.base}" stroke="${p.dark}" stroke-width="3" stroke-linejoin="round"/>
<path d="M21 22c3-5 9-7 15-6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
<circle cx="25" cy="31" r="3.2" fill="${p.dark}"/>
<circle cx="39" cy="31" r="3.2" fill="${p.dark}"/>
<path d="M26 40c3 3.2 9 3.2 12 0" fill="none" stroke="${p.dark}" stroke-width="3" stroke-linecap="round"/>
</svg>
`;
}

const png = async (svg: string, size: number, file: string) =>
  sharp(Buffer.from(svg), { density: (72 * size) / 64 * 4 }).resize(size, size).png({ compressionLevel: 9 }).toFile(dir + file);

writeFileSync(dir + "icon.svg", iconSvg());
await png(iconSvg(), 32, "favicon-32.png");
await png(iconSvg({ rounded: false }), 180, "apple-touch-icon.png");
await png(iconSvg(), 512, "icon-512.png");
console.log("wrote assets/icon.svg, favicon-32.png, apple-touch-icon.png (180), icon-512.png");
