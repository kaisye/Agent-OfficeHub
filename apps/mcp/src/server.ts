import { serve } from "@hono/node-server";
import { loadEnv } from "@officehub/db";
import { createMcpApp } from "./app.js";

loadEnv();
const port = Number(process.env.MCP_PORT ?? 8788);
serve({ fetch: createMcpApp().fetch, port }, (i) => console.log(`@officehub/mcp listening on http://localhost:${i.port}/mcp`));
