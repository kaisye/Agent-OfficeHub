/**
 * Test-only: runs the product's own Hono app on a spare port WITH a known GITHUB_WEBHOOK_SECRET, because the live API
 * is deployed without one (webhook returns 500 "not set"). Same code, same DB, no reminders, no LISTEN hub.
 */
import { serve } from "@hono/node-server";
import { createApp } from "../../../apps/api/src/app.js";

const port = Number(process.env.QA_WEBHOOK_PORT ?? 18797);
const { app } = createApp({ githubWebhookSecret: process.env.QA_WEBHOOK_SECRET ?? "qa-webhook-secret" });
serve({ fetch: app.fetch, port }, () => console.log(`qa webhook api up on ${port}`));
