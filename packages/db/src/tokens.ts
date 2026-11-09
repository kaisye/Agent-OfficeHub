import { createHash, randomBytes } from "node:crypto";
import type { AgentScope } from "@officehub/shared";

export const AGENT_TOKEN_PREFIX = "oh_agent_";
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function base62(buf: Uint8Array): string {
  let n = 0n;
  for (const b of buf) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out.padStart(Math.ceil((buf.length * 8) / Math.log2(62)), "0");
}

/** `oh_agent_<base62 of 32 random bytes>` (>= 43 chars of entropy-bearing body). */
export function generateAgentToken(): { token: string; hash: string; prefix: string } {
  const body = base62(randomBytes(32));
  const token = AGENT_TOKEN_PREFIX + body;
  return { token, hash: hashToken(token), prefix: body.slice(0, 8) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeAgentToken(s: string | undefined | null): s is string {
  return !!s && s.startsWith(AGENT_TOKEN_PREFIX);
}

/** Extract a bearer token from an Authorization header value. */
export function bearer(header: string | undefined | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1]! : null;
}

export function hasScope(scopes: readonly string[], needed: AgentScope): boolean {
  return scopes.includes(needed);
}
