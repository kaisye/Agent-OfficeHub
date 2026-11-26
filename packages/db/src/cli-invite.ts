/**
 * Server-side bootstrap: print a one-time invite link for a member (default: the first admin).
 * Needed on a fresh install where nobody can sign in yet to press "Tạo link mời".
 *   pnpm db:invite            → first admin of the only/first workspace
 *   pnpm db:invite "Trang"    → member by display name (case-insensitive)
 */
import { adminSql, closeAll, loadEnv } from "./client.js";
import { createInvite } from "./passwords.js";

loadEnv();
const name = process.argv[2];
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const sql = adminSql();
const [admin] = await sql`SELECT id, workspace_id FROM members WHERE role = 'admin' ORDER BY created_at LIMIT 1`;
if (!admin) {
  console.error("No admin member found. Run `pnpm db:seed` first.");
  process.exit(1);
}
const [target] = name
  ? await sql`SELECT id, display_name FROM members WHERE workspace_id = ${admin.workspace_id} AND lower(display_name) = lower(${name})`
  : await sql`SELECT id, display_name FROM members WHERE id = ${admin.id}`;
if (!target) {
  console.error(`No member named "${name}" in this workspace.`);
  process.exit(1);
}
const r = await createInvite({ kind: "human", workspaceId: admin.workspace_id, memberId: admin.id, role: "admin" }, target.id, origin);
console.log(`Invite for ${target.display_name} (single use, expires ${r.expiresAt}):\n${r.url}`);
await closeAll();
