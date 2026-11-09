import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { adminUrl, loadEnv } from "./client.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Apply pending raw-SQL migrations (as the owner role) in filename order, each in a transaction. */
export async function migrate(log: (s: string) => void = () => {}): Promise<string[]> {
  loadEnv();
  const sql = postgres(adminUrl(), { max: 1, onnotice: () => {} });
  const applied: string[] = [];
  try {
    await sql`SELECT pg_advisory_lock(7265001)`; // serialize concurrent runners (parallel test workers)
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const done = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name as string));
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const text = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
      });
      applied.push(f);
      log(`applied ${f}`);
    }
    if (process.env.APP_DB_PASSWORD) {
      await sql.unsafe(`ALTER ROLE officehub_app PASSWORD '${process.env.APP_DB_PASSWORD.replace(/'/g, "''")}'`);
    }
    await sql`SELECT pg_advisory_unlock(7265001)`;
  } finally {
    await sql.end({ timeout: 2 });
  }
  return applied;
}
