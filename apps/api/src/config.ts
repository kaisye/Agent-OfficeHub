import { AgentRateLimiter, loadEnv } from "@officehub/db";

export interface ApiConfig {
  webOrigin: string;
  devLoginEnabled: boolean;
  githubClientId: string;
  githubClientSecret: string;
  githubWebhookSecret: string;
  sessionSecret: string;
  limiter: AgentRateLimiter;
}

export function loadConfig(over: Partial<ApiConfig> = {}): ApiConfig {
  loadEnv();
  const e = process.env;
  const cfg: ApiConfig = {
    webOrigin: e.WEB_ORIGIN ?? "http://localhost:3000",
    devLoginEnabled: e.DEV_LOGIN_ENABLED === "true",
    githubClientId: e.GITHUB_CLIENT_ID ?? "",
    githubClientSecret: e.GITHUB_CLIENT_SECRET ?? "",
    githubWebhookSecret: e.GITHUB_WEBHOOK_SECRET ?? "",
    sessionSecret: e.SESSION_SECRET ?? "change-me-dev-only",
    limiter: new AgentRateLimiter(),
    ...over,
  };
  assertSafeForProduction(cfg, e.NODE_ENV);
  return cfg;
}

export const DEFAULT_SESSION_SECRET = "change-me-dev-only";

/** SEC-06: refuse to start a production API with dev login on or a guessable session secret. */
export function assertSafeForProduction(cfg: Pick<ApiConfig, "devLoginEnabled" | "sessionSecret">, nodeEnv: string | undefined) {
  if (nodeEnv !== "production") return;
  const problems: string[] = [];
  if (cfg.devLoginEnabled) problems.push("DEV_LOGIN_ENABLED must be false");
  if (cfg.sessionSecret === DEFAULT_SESSION_SECRET || cfg.sessionSecret.length < 32) problems.push("SESSION_SECRET must be a random value of 32+ characters");
  if (problems.length) throw new Error(`Refusing to start in production: ${problems.join("; ")}`);
}
