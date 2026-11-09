import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

let envLoaded = false;
/** Load the repo-root .env (if present) without overriding real environment variables. */
export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const f = join(dir, ".env");
    if (existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        /* ignore */
      }
      return;
    }
    dir = resolve(dir, "..");
  }
}

const DEFAULT_ADMIN_URL = "postgres://officehub:officehub@localhost:5433/officehub";

/** Owner/migrator connection (bypasses RLS). Used ONLY by migrate, seed and test fixtures. */
export function adminUrl(): string {
  loadEnv();
  return process.env.DATABASE_URL ?? DEFAULT_ADMIN_URL;
}

/** App connection: the non-superuser officehub_app role, so RLS really applies. */
export function appUrl(): string {
  loadEnv();
  if (process.env.APP_DATABASE_URL) return process.env.APP_DATABASE_URL;
  const u = new URL(adminUrl());
  u.username = "officehub_app";
  u.password = process.env.APP_DB_PASSWORD ?? "officehub_app";
  return u.toString();
}

let _app: Sql | undefined;
let _admin: Sql | undefined;

export function appSql(): Sql {
  return (_app ??= postgres(appUrl(), { max: 10, onnotice: () => {} }));
}
export function adminSql(): Sql {
  return (_admin ??= postgres(adminUrl(), { max: 3, onnotice: () => {} }));
}
export async function closeAll(): Promise<void> {
  await Promise.all([_app?.end({ timeout: 2 }), _admin?.end({ timeout: 2 })]);
  _app = undefined;
  _admin = undefined;
}

/**
 * Run `fn` in a transaction where `app.workspace_id` is set for the transaction only
 * (set_config(..., is_local = true) == SET LOCAL, but parameterizable). RLS policies key on it.
 */
export async function withWorkspace<T>(workspaceId: string, fn: (tx: Tx) => Promise<T>, sql: Sql = appSql()): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new Error("invalid workspace id");
  return (await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;
    return fn(tx);
  })) as T;
}
