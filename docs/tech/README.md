# Office Hub — Technical README (Backend)

Packages: `packages/db` (migrations, services, scanner, seed) · `apps/api` (Hono, :8787) · `apps/mcp` (MCP Streamable HTTP, :8788 `/mcp`) · `apps/agent-hooks` (`officehub-hook`).
All business rules live ONCE in `packages/db/src` (`requests.ts`, `services.ts`, `secrets.ts`, …) and are imported by both the API and the MCP gateway.

## Run locally

```bash
cp .env.example .env          # never commit .env
pnpm install
pnpm db:up                    # postgres 16 on :5433
pnpm --filter @officehub/db migrate
pnpm --filter @officehub/db seed          # add -- --reset to wipe and reseed (uses docs/business/seed-tripflix.json)
pnpm --filter @officehub/api dev          # http://localhost:8787
pnpm --filter @officehub/mcp dev          # http://localhost:8788/mcp
```

Seed prints member ids and one dev agent token per seeded agent (shown once; only SHA-256 is stored).

## Tests

```bash
pnpm --filter @officehub/db test     # unit + integration (docker Postgres must be up; migrations run automatically)
pnpm --filter @officehub/api test
pnpm --filter @officehub/mcp test
pnpm --filter @officehub/agent-hooks test
```

## curl walkthrough

```bash
API=http://localhost:8787
MEMBER=<member id printed by seed>
# state-changing calls need the CSRF header (and Origin, if sent, must equal WEB_ORIGIN)
H='-H content-type:application/json -H x-officehub-csrf:1'
curl -s -c jar $H -X POST $API/auth/dev-login -d "{\"memberId\":\"$MEMBER\"}"      # sets oh_session cookie
curl -s -b jar $API/me
curl -s -b jar $API/w/tripflix/board
curl -s -b jar $API/w/tripflix/inbox
curl -s -b jar $H -X POST $API/w/tripflix/requests -d '{"receiverId":"<id>","title":"Tag?","body":"Which tag is pinned?","taskId":null,"dueAt":null}'   # -> draft
curl -s -b jar $H -X POST $API/w/tripflix/requests/<reqId>/actions -d '{"action":"send"}'                                                                 # human click
curl -s -b jar $H -X POST $API/w/tripflix/agents -d '{"kind":"claude-code","label":"mine","scopes":["board:read","inbox:read","status:write:self","request:draft"]}'  # token shown ONCE
curl -sN -b jar $API/w/tripflix/stream                                             # SSE: event "change" {kind,id}
curl -s -b jar $API/w/tripflix/audit

# agent side
TOKEN=oh_agent_...
curl -s -H "authorization: Bearer $TOKEN" "$API/agent/inbox?unread=1"              # wrapped as untrusted
curl -s -X POST http://localhost:8788/mcp -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_board","arguments":{}}}'
```

GitHub webhook: point a repo webhook (content type JSON, events: pull requests, check suites, workflow runs, issues, deployment statuses) at `POST /hooks/github/<workspaceId>` with secret `GITHUB_WEBHOOK_SECRET`.

## Layout

| Path | What |
|---|---|
| `packages/db/migrations/000*.sql` | schema, RLS + roles + append-only triggers + auth lookup functions, NOTIFY triggers, v0.2 additions |
| `packages/db/src/client.ts` | admin vs app connections, `withWorkspace()` |
| `packages/db/src/requests.ts` | request state machine glue, visibility (C13), unread, inbox |
| `packages/db/src/services.ts` | board, status (self only), decisions (human only), agents, audit, handoff |
| `packages/db/src/secrets.ts` | secret scanner |
| `packages/db/src/untrusted.ts` | untrusted wrapping for agents |
| `packages/db/src/github.ts`, `reminders.ts` | webhook mapping, overdue reminders |
| `packages/db/src/testing.ts` | test fixtures (`@officehub/db/testing`) |
| `apps/api/src/app.ts` | all human routes, `/agent/inbox`, webhook, SSE |
| `apps/mcp/src/app.ts` | the 5 MCP tools + auth/scope/rate-limit/audit pipeline |
