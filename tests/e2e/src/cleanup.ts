/**
 * Removes what the QA suite created in the shared dev DB, WITHOUT touching the append-only tables
 * (events / audit_log are immutable by design and are never modified or deleted here).
 *  - requests, messages, read-markers and decisions tagged "QA-*" are deleted (the log rows that mention them stay)
 *  - QA agents are REVOKED (they cannot be deleted: events keep an FK to them)
 *  - the dedicated second workspace "qa-e2e-other" is kept and reused between runs (it carries audit rows, so it cannot be dropped)
 *  - status cards are restored to the snapshot taken before the run
 */
import { closeSql, sql } from "./helpers.js";

export type CardSnapshot = Record<string, unknown>[];

export async function snapshotCards(): Promise<CardSnapshot> {
  return (await sql()`SELECT * FROM status_cards`) as unknown as CardSnapshot;
}

export async function cleanup(cards?: CardSnapshot): Promise<void> {
  await sql().begin(async (tx) => {
    const agents = (await tx`SELECT id FROM agents WHERE label LIKE 'qa-%'`).map((r) => r.id as string);
    const reqs = (
      await tx`SELECT id FROM requests WHERE title LIKE 'QA-%' OR id IN (SELECT request_id FROM request_messages WHERE author_agent_id = ANY(${agents}::uuid[]))`
    ).map((r) => r.id as string);
    await tx`DELETE FROM inbox_reads WHERE request_id = ANY(${reqs}::uuid[])`;
    await tx`DELETE FROM request_messages WHERE request_id = ANY(${reqs}::uuid[])`;
    await tx`DELETE FROM requests WHERE id = ANY(${reqs}::uuid[])`;
    await tx`DELETE FROM decisions WHERE title LIKE 'QA-%'`;
    await tx`UPDATE agents SET revoked_at = COALESCE(revoked_at, now()) WHERE id = ANY(${agents}::uuid[])`;
    for (const c of (cards ?? []) as any[]) {
      await tx`UPDATE status_cards SET presence = ${c.presence}, doing = ${c.doing}, branch = ${c.branch}, waiting_on = ${c.waiting_on}::uuid[], updated_by = ${c.updated_by}, updated_at = ${c.updated_at} WHERE member_id = ${c.member_id}`;
    }
  });
}

if (process.argv[1]?.endsWith("cleanup.ts")) {
  cleanup()
    .then(() => console.log("QA data removed"))
    .finally(closeSql);
}
