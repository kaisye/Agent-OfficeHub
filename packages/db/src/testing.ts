/** Test fixtures (owner connection, bypasses RLS). Import from "@officehub/db/testing". Never used by servers. */
import { randomUUID } from "node:crypto";
import { adminSql } from "./client.js";
import { migrate } from "./migrate.js";
import { createAgent } from "./services.js";
import type { Principal } from "./core.js";
import type { AgentScope } from "@officehub/shared";

export { migrate };

export interface TestWorkspace {
  id: string;
  slug: string;
  alice: string; // admin
  bob: string;
  carol: string;
  human: (who: "alice" | "bob" | "carol") => Extract<Principal, { kind: "human" }>;
}

export async function makeWorkspace(prefix = "t"): Promise<TestWorkspace> {
  const sql = adminSql();
  const id = randomUUID();
  const slug = `${prefix}-${id.slice(0, 8)}`;
  await sql`INSERT INTO workspaces (id, name, slug, connectors) VALUES (${id}, ${"WS " + slug}, ${slug}, ${["github"]}::text[])`;
  const mk = async (name: string, role: "admin" | "member") => {
    const mid = randomUUID();
    await sql`INSERT INTO members (id, workspace_id, display_name, github_login, role, areas, mascot)
      VALUES (${mid}, ${id}, ${name}, ${`${name.toLowerCase()}-${id.slice(0, 6)}`}, ${role}, ${["x"]}::text[],
      ${sql.json({ buddy: "milo" })})`;
    return mid;
  };
  const alice = await mk("Alice", "admin");
  const bob = await mk("Bob", "member");
  const carol = await mk("Carol", "member");
  const roles = { alice: "admin", bob: "member", carol: "member" } as const;
  const ids = { alice, bob, carol };
  return {
    id,
    slug,
    alice,
    bob,
    carol,
    human: (who) => ({ kind: "human", workspaceId: id, memberId: ids[who], role: roles[who] }),
  };
}

export async function makeAgentToken(
  ws: TestWorkspace,
  who: "alice" | "bob" | "carol",
  scopes: AgentScope[] = ["board:read", "inbox:read", "status:write:self", "request:draft"],
) {
  return createAgent(ws.human(who), { kind: "claude-code", label: `agent of ${who}`, scopes });
}
