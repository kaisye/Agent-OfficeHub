/**
 * Create the VietNote marketing workspace (idempotent) and, on first creation, print one runner config
 * (JSON with a token per role) and a sign-in link for its orchestrator. Both are shown once.
 *   pnpm db:seed:marketing              → JSON + invite on first run
 *   pnpm db:seed:marketing --invite     → only a fresh sign-in link
 */
import { adminSql, closeAll, loadEnv } from "./client.js";
import { migrate } from "./migrate.js";
import { createInvite } from "./passwords.js";
import { MARKETING_SLUG, seedMarketing } from "./seed-marketing.js";

loadEnv();
await migrate();
const r = process.argv.includes("--invite") ? null : await seedMarketing();
if (r && !r.skipped) console.log(`RUNNER_TOKENS=${JSON.stringify(Object.fromEntries(r.agentTokens.map((a) => [a.key, a.token])))}`);
if (r?.skipped) console.log(`workspace "${MARKETING_SLUG}" already exists`);
if (!r || !r.skipped) {
  const sql = adminSql();
  const [admin] = await sql`SELECT m.id, m.workspace_id FROM members m JOIN workspaces w ON w.id = m.workspace_id
    WHERE w.slug = ${MARKETING_SLUG} AND m.role = 'admin' ORDER BY m.created_at LIMIT 1`;
  if (admin) {
    const inv = await createInvite({ kind: "human", workspaceId: admin.workspace_id, memberId: admin.id, role: "admin" }, admin.id, process.env.WEB_ORIGIN ?? "http://localhost:3000");
    console.log(`INVITE=${inv.url}`);
  }
}
await closeAll();
