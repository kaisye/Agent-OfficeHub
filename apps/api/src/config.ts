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
  return {
    webOrigin: e.WEB_ORIGIN ?? "http://localhost:3000",
    devLoginEnabled: e.DEV_LOGIN_ENABLED === "true",
    githubClientId: e.GITHUB_CLIENT_ID ?? "",
    githubClientSecret: e.GITHUB_CLIENT_SECRET ?? "",
    githubWebhookSecret: e.GITHUB_WEBHOOK_SECRET ?? "",
    sessionSecret: e.SESSION_SECRET ?? "change-me-dev-only",
    limiter: new AgentRateLimiter(),
    ...over,
  };
}
