/** Generates assets/icon.svg (+ favicon-32.png, apple-touch-icon.png 180px, icon-512.png) from the Desk Buddies leaf mark. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { brandPalette } from "../src/tokens.js";

const dir = fileURLToPath(new URL("../assets/", import.meta.url));
mkdirSync(dir, { recursive: true });

/** Leaf mark path: two leaves (like the brand board wordmark) in Cream on a Forest tile. */
export function iconSvg({ rounded = true }: { rounded?: boolean } = {}): string {
  const { forest, cream, cognac } = brandPalette;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Office Hub">
<title>Office Hub</title>
<rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="${forest}"/>
<g transform="rotate(-5 32 32)">
<path d="M31 50C20 48 13 40 14 28c0-5 3-9 7-10 10-2 17 6 16 18-1 6-3 11-6 14Z" fill="${cream}"/>
<path d="M33 48c0-9 3-17 10-22 4-3 8-4 9-3 1 6-1 13-5 18-3 4-8 7-14 7Z" fill="${cream}" fill-opacity=".72"/>
<path d="M30 49c0-9 1-18 6-26" fill="none" stroke="${forest}" stroke-width="2.4" stroke-linecap="round"/>
</g>
<circle cx="49" cy="15" r="3.2" fill="${cognac}"/>
</svg>
`;
}

const png = async (svg: string, size: number, file: string) =>
  sharp(Buffer.from(svg), { density: ((72 * size) / 64) * 4 }).resize(size, size).png({ compressionLevel: 9 }).toFile(dir + file);

writeFileSync(dir + "icon.svg", iconSvg());
await png(iconSvg(), 32, "favicon-32.png");
await png(iconSvg({ rounded: false }), 180, "apple-touch-icon.png");
await png(iconSvg(), 512, "icon-512.png");
console.log("wrote assets/icon.svg, favicon-32.png, apple-touch-icon.png (180), icon-512.png");
