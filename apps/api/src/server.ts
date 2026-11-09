import { serve } from "@hono/node-server";
import { loadEnv } from "@officehub/db";
import { createApp } from "./app.js";

loadEnv();
const port = Number(process.env.API_PORT ?? 8787);
const { app, hub } = createApp();
await hub.start().catch((e) => console.error("LISTEN failed (SSE disabled until DB is up):", e.message));
serve({ fetch: app.fetch, port }, (i) => console.log(`@officehub/api listening on http://localhost:${i.port}`));
