import { createHttpClient } from "./http";
import { createMockClient } from "./mock";
import type { ApiClient } from "./types";

export * from "./types";
export { createHttpClient } from "./http";
export { createMockClient, MockServer, SEED_MEMBERS, detectSecret } from "./mock";

export const API_MODE: "mock" | "http" = process.env.NEXT_PUBLIC_API_MODE === "http" ? "http" : "mock";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
/** The workspace slug comes from `Me` (/me). This env var is only a fallback in mock mode. */
export const FALLBACK_SLUG: string | null = API_MODE === "mock" ? (process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE ?? "tripflix") : null;
/** Login page has no session yet, so it asks for dev members of this workspace slug. */
export const LOGIN_WORKSPACE = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE ?? "tripflix";
export const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL ?? "http://localhost:8788/mcp";
export const SHOW_DEV_LOGIN = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEV_LOGIN === "1";

const g = globalThis as unknown as { __officehubApi?: ApiClient };

/** One client per browser tab (kept across HMR so the mock's in-memory state survives edits). */
export function getApi(): ApiClient {
  if (!g.__officehubApi) {
    g.__officehubApi =
      API_MODE === "http" ? createHttpClient({ baseUrl: API_URL }) : createMockClient({ latencyMs: 120 });
  }
  return g.__officehubApi;
}
