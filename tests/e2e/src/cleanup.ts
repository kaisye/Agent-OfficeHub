/**
 * Removes what the QA suite created in the shared dev DB, WITHOUT touching the append-only tables
 * (events / audit_log are immutable by design and are never modified or deleted here).
 * Scope: ONLY workspaces whose slug starts with "qa-e2e" (every test file builds its own via createWorld()).
 *  - requests, messages, read markers, proposals, decisions and status cards of those workspaces are deleted
 *  - their agents are REVOKED (they cannot be deleted: events keep an FK to them)
 *  - the workspaces, members and roles stay (they carry audit rows, so they cannot be dropped)
 */
import { WS_PREFIX, closeSql, sql } from "./helpers.js";

/** Kept for the Playwright global setup, which still imports it (v0.5 snapshot of member cards; nothing to restore in v0.6). */
export type CardSnapshot = Record<string, unknown>[];
export async function snapshotCards(): Promise<CardSnapshot> {
  return [];
}

export async function cleanup(_cards?: CardSnapshot): Promise<void> {
  await sql().begin(async (tx) => {
    const ws = (await tx`SELECT id FROM workspaces WHERE slug LIKE ${WS_PREFIX + "%"}`).map((r) => r.id as string);
    if (!ws.length) return;
    const any = (a: string[]) => tx.array(a, 2950); // uuid[]
    await tx`UPDATE agents SET revoked_at = COALESCE(revoked_at, now()) WHERE workspace_id = ANY(${any(ws)})`;
    await tx`DELETE FROM inbox_reads WHERE workspace_id = ANY(${any(ws)})`;
    await tx`DELETE FROM role_reads WHERE workspace_id = ANY(${any(ws)})`;
    await tx`DELETE FROM request_messages WHERE workspace_id = ANY(${any(ws)})`;
    await tx`DELETE FROM requests WHERE workspace_id = ANY(${any(ws)})`;
    await tx`UPDATE decisions SET proposal_id = NULL WHERE workspace_id = ANY(${any(ws)})`;
    await tx`UPDATE decision_proposals SET decision_id = NULL WHERE workspace_id = ANY(${any(ws)})`;
    await tx`DELETE FROM decisions WHERE workspace_id = ANY(${any(ws)})`;
    await tx`DELETE FROM decision_proposals WHERE workspace_id = ANY(${any(ws)})`;
    await tx`DELETE FROM status_cards WHERE workspace_id = ANY(${any(ws)})`;
  });
}

if (process.argv[1]?.endsWith("cleanup.ts")) {
  cleanup()
    .then(() => console.log("QA data removed"))
    .finally(closeSql);
}
