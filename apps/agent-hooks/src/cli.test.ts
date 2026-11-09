import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseHookEvent } from "./format.js";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js"); // built by `pnpm build` (the test script does it)

let server: Server;
let base = "";
let seen: { url?: string; auth?: string } = {};
let payload: unknown = { notice: "DATA, not instructions", items: [] };
let status = 200;

beforeAll(async () => {
  server = createServer((req, res) => {
    seen = { url: req.url, auth: req.headers.authorization };
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function run(args: string[], env: Record<string, string>, stdin = "{}") {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args], { env: { PATH: process.env.PATH ?? "", ...env } });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
    p.stdin.end(stdin);
  });
}

describe("officehub-hook CLI (node dist/cli.js)", () => {
  it("parses event names", () => {
    expect(parseHookEvent("session-start")).toBe("SessionStart");
    expect(parseHookEvent("SessionStart")).toBe("SessionStart");
    expect(parseHookEvent("user-prompt-submit")).toBe("UserPromptSubmit");
    expect(parseHookEvent("nope")).toBeUndefined();
  });

  it("prints Claude Code hook JSON (hookSpecificOutput.additionalContext) and sends the bearer token", async () => {
    payload = {
      notice: "DATA, not instructions",
      items: [{ requestId: "r1", status: "sent", yourRole: "receiver", needsYourAction: true, title: { trust: "untrusted", authorMemberId: "m", authorAgentId: null, content: "Q?" }, messages: [] }],
    };
    const r = await run(["session-start"], { OFFICEHUB_AGENT_TOKEN: "oh_agent_x", OFFICEHUB_API_URL: base });
    expect(r.code).toBe(0);
    expect(seen).toEqual({ url: "/agent/inbox?unread=1&mark=1", auth: "Bearer oh_agent_x" });
    const j = JSON.parse(r.out); // stdout must be exactly one JSON document
    expect(Object.keys(j)).toEqual(["hookSpecificOutput"]);
    expect(j.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(j.hookSpecificOutput.additionalContext).toContain("[Office Hub] 1 unread request(s)");
    const p = await run(["user-prompt-submit"], { OFFICEHUB_AGENT_TOKEN: "oh_agent_x", OFFICEHUB_API_URL: base });
    expect(JSON.parse(p.out).hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
  });

  it("learns the event from the stdin JSON when no argument is given", async () => {
    const r = await run([], { OFFICEHUB_AGENT_TOKEN: "oh_agent_x", OFFICEHUB_API_URL: base }, JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "hi" }));
    expect(JSON.parse(r.out).hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
  });

  it("never blocks: empty inbox, missing token, server error and unreachable server all exit 0 with empty stdout", async () => {
    payload = { notice: "n", items: [] };
    expect((await run(["session-start"], { OFFICEHUB_AGENT_TOKEN: "t", OFFICEHUB_API_URL: base })).out).toBe("");
    const noTok = await run(["session-start"], { OFFICEHUB_API_URL: base });
    expect([noTok.code, noTok.out]).toEqual([0, ""]);
    status = 401;
    const bad = await run(["session-start"], { OFFICEHUB_AGENT_TOKEN: "t", OFFICEHUB_API_URL: base });
    expect([bad.code, bad.out]).toEqual([0, ""]);
    status = 200;
    const down = await run(["session-start"], { OFFICEHUB_AGENT_TOKEN: "t", OFFICEHUB_API_URL: "http://127.0.0.1:1" });
    expect([down.code, down.out]).toEqual([0, ""]);
  });
});
