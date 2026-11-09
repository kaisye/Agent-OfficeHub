#!/usr/bin/env node
/**
 * officehub-hook — Claude Code hook helper.
 *   officehub-hook [session-start|user-prompt-submit]   (also accepts SessionStart / UserPromptSubmit)
 * Reads the hook JSON from stdin (to learn hook_event_name), calls GET {OFFICEHUB_API_URL}/agent/inbox?unread=1&mark=1
 * with OFFICEHUB_AGENT_TOKEN, and prints unread inbox items (wrapped as untrusted) as additionalContext.
 * It NEVER blocks the session: every failure exits 0 with a note on stderr.
 */
import { buildHookOutput, parseHookEvent, type HookEvent, type WrappedInbox } from "./format.js";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const token = process.env.OFFICEHUB_AGENT_TOKEN;
  if (!token) {
    console.error("officehub-hook: OFFICEHUB_AGENT_TOKEN not set; skipping");
    return;
  }
  let event: HookEvent | undefined = parseHookEvent(process.argv[2]);
  if (!event) {
    try {
      const j = JSON.parse((await readStdin()) || "{}");
      event = parseHookEvent(j.hook_event_name);
    } catch {
      /* ignore */
    }
  }
  if (!event) {
    console.error("officehub-hook: unknown hook event; skipping");
    return;
  }
  const base = (process.env.OFFICEHUB_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
  const res = await fetch(`${base}/agent/inbox?unread=1&mark=1`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) {
    console.error(`officehub-hook: inbox returned ${res.status}; skipping`);
    return;
  }
  const out = buildHookOutput(event, (await res.json()) as WrappedInbox);
  if (out) process.stdout.write(out + "\n");
}

main().catch((e) => console.error("officehub-hook:", e instanceof Error ? e.message : e)).finally(() => process.exit(0));
