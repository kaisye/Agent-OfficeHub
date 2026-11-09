/**
 * SEC-09: the single gate for any `href` that comes from data (task external URLs, markdown links, ...).
 * Returns the normalized URL only for absolute `http:` / `https:` URLs; anything else (javascript:, data:,
 * vbscript:, file:, relative, protocol-relative, garbage, non-strings) returns null so callers render plain text.
 */
export function safeExternalHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Control chars inside the value are stripped by browsers ("java\tscript:"); reject outright.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}
