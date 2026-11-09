import { API_URL, MCP_URL } from "./api";

/**
 * Claude Code connection snippets shown once, next to a new agent token.
 * Source of truth: docs/tech/agent-setup.md. If Backend changes the hook command, edit HOOK_COMMAND only.
 * The token itself is never written into a file: it comes from the OFFICEHUB_AGENT_TOKEN environment variable.
 */
export const TOKEN_ENV = "OFFICEHUB_AGENT_TOKEN";

/** Placeholder: users replace /ABS/PATH/TO with the absolute path of their checkout. */
export const HOOK_COMMAND = (event: "SessionStart" | "UserPromptSubmit") => `npx tsx /ABS/PATH/TO/apps/agent-hooks/src/cli.ts ${event}`;

export const exportEnvLine = (token: string) => `export ${TOKEN_ENV}=${token}`;

export function mcpJson(): string {
  return JSON.stringify(
    {
      mcpServers: {
        "office-hub": {
          type: "http",
          url: MCP_URL,
          headers: { Authorization: `Bearer \${${TOKEN_ENV}}` },
        },
      },
    },
    null,
    2,
  );
}

export function hookJson(): string {
  const entry = (event: "SessionStart" | "UserPromptSubmit") => [{ hooks: [{ type: "command", command: HOOK_COMMAND(event) }] }];
  return JSON.stringify({ hooks: { SessionStart: entry("SessionStart"), UserPromptSubmit: entry("UserPromptSubmit") } }, null, 2);
}

/** The hook reads OFFICEHUB_API_URL (default http://localhost:8787). */
export const hookEnvNote = `Hook cần biến môi trường ${TOKEN_ENV} (bắt buộc) và OFFICEHUB_API_URL (mặc định ${API_URL}). Thay /ABS/PATH/TO bằng đường dẫn tuyệt đối tới thư mục Office Hub.`;
