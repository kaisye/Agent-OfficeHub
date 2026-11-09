/** The 6 Desk Buddies: static clay-style mascots. Assets live in assets/mascots/ (WebP 512/128, PNG 256 fallback). */
import { MascotBuddy, type MascotMood } from "@officehub/shared";
import { brandPalette } from "./tokens.js";

export const BUDDY_IDS = MascotBuddy.options;
export type BuddyId = (typeof BUDDY_IDS)[number];

export interface BuddyMeta {
  id: BuddyId;
  name: string;
  /** Role tagline (Vietnamese) from the Desk Buddies handoff. */
  role: string;
  /** Distinguishing look. */
  trait: string;
  /** Brand colour token name and its hex. */
  colorToken: "cognac" | "forest" | "cream" | "cobalt" | "walnut" | "terracotta";
  color: string;
  /** Soft background tint for the arch stage behind the buddy. */
  tint: string;
}

export const BUDDIES: Record<BuddyId, BuddyMeta> = {
  milo: { id: "milo", name: "Milo", role: "Điều phối & lập kế hoạch", trait: "Cognac, kính, sổ", colorToken: "cognac", color: brandPalette.cognac, tint: "#F2E9DA" },
  sage: { id: "sage", name: "Sage", role: "Nghiên cứu & tổng hợp", trait: "Forest, tai nghe, laptop", colorToken: "forest", color: brandPalette.forest, tint: "#E6ECDF" },
  pip: { id: "pip", name: "Pip", role: "Nội dung & sáng tạo", trait: "Cream, beret, bút", colorToken: "cream", color: brandPalette.cream, tint: "#F4EFDF" },
  blu: { id: "blu", name: "Blu", role: "Code & sản phẩm", trait: "Cobalt, túi đeo", colorToken: "cobalt", color: brandPalette.cobalt, tint: "#E5E9F0" },
  mocha: { id: "mocha", name: "Mocha", role: "Kiểm tra & phản biện", trait: "Walnut, cốc gốm", colorToken: "walnut", color: brandPalette.walnut, tint: "#ECE3D7" },
  fern: { id: "fern", name: "Fern", role: "Kiến thức & tài liệu", trait: "Terracotta, cây xanh", colorToken: "terracotta", color: "#C7704D", tint: "#F2E5DC" },
};

export const MOODS = ["focused", "waiting", "worried", "curious", "relaxed", "sleeping"] as const;
export type Mood = (typeof MOODS)[number];
// compile-time guarantee that we cover every mood the shared contract can produce
type _MoodCovered = Exclude<MascotMood, Mood> extends never ? true : never;
export const _moodCovered: _MoodCovered = true;

export const MOOD_LABEL_VI: Record<Mood, string> = {
  focused: "đang làm",
  waiting: "đang chờ",
  worried: "bị kẹt",
  curious: "đang xem",
  relaxed: "rảnh",
  sleeping: "ngoại tuyến",
};
/** Glyph on the mood badge: shape + text, never colour alone. */
export const MOOD_GLYPH: Record<Mood, string> = {
  focused: "●", waiting: "…", worried: "!", curious: "?", relaxed: "✓", sleeping: "zzz",
};

export type MascotImageSize = 128 | 256 | 512;
/** File under `assets/` (128 and 512 are WebP, 256 is the PNG fallback). */
export function mascotFile(buddy: BuddyId, size: MascotImageSize): string {
  return `mascots/${buddy}-${size}.${size === 256 ? "png" : "webp"}`;
}
/** URL under a mount point; the web app serves the assets at /mascots/. */
export function mascotSrc(buddy: BuddyId, size: MascotImageSize = 256, base = "/mascots"): string {
  return `${base}/${buddy}-${size}.${size === 256 ? "png" : "webp"}`;
}
