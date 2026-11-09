import { serve } from "@hono/node-server";
import { loadEnv, runReminders } from "@officehub/db";
import { createApp } from "./app.js";

loadEnv();
const port = Number(process.env.API_PORT ?? 8787);
const { app, hub } = createApp();
await hub.start().catch((e) => console.error("LISTEN failed (SSE disabled until DB is up):", e.message));
serve({ fetch: app.fetch, port }, (i) => console.log(`@officehub/api listening on http://localhost:${i.port}`));

// Overdue reminders: emit request.reminded (never auto-close). Simple in-process interval (every 10 min).
const tick = () => runReminders().then((n) => n && console.log(`reminders sent: ${n}`)).catch((e) => console.error("reminders", e.message));
setInterval(tick, 10 * 60_000).unref();
void tick();
