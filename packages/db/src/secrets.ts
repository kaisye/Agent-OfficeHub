/**
 * Rule 4: secret scanner (gitleaks-style). Applied to EVERY user/agent-supplied text field on create/update/draft.
 * On a match the whole message is rejected (422 secret_detected, names the RULE never the value) and nothing is stored.
 */
import { HubError } from "./errors.js";

export interface SecretRule {
  id: string;
  re: RegExp;
  /** optional extra check on the first capture group (or whole match) */
  accept?: (m: RegExpExecArray) => boolean;
}

export function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export const SECRET_RULES: SecretRule[] = [
  { id: "anthropic-api-key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: "openai-project-key", re: /\bsk-proj-[A-Za-z0-9_-]{20,}/ },
  { id: "openai-api-key", re: /\bsk-[A-Za-z0-9]{20,}/ }, // also matches DeepSeek-style sk-<32 hex>
  { id: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/ },
  { id: "github-fine-grained-pat", re: /\bgithub_pat_[A-Za-z0-9_]{22,}/ },
  { id: "aws-access-key-id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}/ },
  { id: "slack-token", re: /\bxox[abpr]-[A-Za-z0-9-]{10,}/ },
  { id: "private-key-block", re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
  {
    id: "generic-high-entropy-secret",
    re: /(?<![A-Za-z0-9])(?:api[_-]?key|apikey|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|token|passwd|password|client[_-]?secret)["']?\s*[:=]\s*["']?([A-Za-z0-9_\-/+=.]{16,})["']?/i,
    accept: (m) => shannonEntropy(m[1] ?? "") >= 3.3,
  },
];

export interface SecretMatch {
  rule: string;
  field: string;
}

export function scanText(text: string): string | null {
  for (const r of SECRET_RULES) {
    const re = new RegExp(r.re.source, r.re.flags.replace("g", ""));
    const m = re.exec(text);
    if (m && (!r.accept || r.accept(m))) return r.id;
  }
  return null;
}

/** Scan a set of named fields. Returns the first hit (rule id + field name, never the value). */
export function scanFields(fields: Record<string, string | null | undefined>): SecretMatch | null {
  for (const [field, v] of Object.entries(fields)) {
    if (typeof v !== "string" || !v) continue;
    const rule = scanText(v);
    if (rule) return { rule, field };
  }
  return null;
}

export function secretError(hit: SecretMatch): HubError {
  return new HubError(
    "secret_detected",
    `Rejected: field "${hit.field}" looks like a secret (rule: ${hit.rule}). Nothing was stored. Remove it and share it through a secret manager, not through Office Hub.`,
    422,
    { rule: hit.rule, field: hit.field },
  );
}
