# Backend / Technical — HANDOFF

Round 2: built against contract v0.3. Tests: db 47, api 22, mcp 16, agent-hooks 6 = 91 passing against the docker Postgres; `tsc` clean. New migration `0005_v03.sql` (additive; run `pnpm db:migrate`). See "Round 2 changes" at the bottom.

## Built (works, tested)
- `packages/db`: raw SQL migrations 0001-0004 + runner, `withWorkspace()`, RLS on all tenant tables with non-superuser `officehub_app`, append-only `events`/`audit_log` (grants + triggers), NOTIFY triggers, seed (loads `docs/business/seed-tripflix.json`, falls back to a built-in Tripflix seed), services shared by API and MCP.
- `apps/api` (:8787): every human route in `Routes` incl. `inbox` and `markRead`; dev-login, GitHub OAuth code, `oh_session` cookie, CSRF, CORS; agent bearer rejected on human routes (403 `human_only`); secret scanner on all text fields; SSE via LISTEN/NOTIFY filtered by workspace and by request visibility; GitHub webhook (HMAC, idempotent, task upsert); handoff markdown; audit of reads and writes; per-agent rate limit on `/agent/*`; reminder job (every 10 min).
- `apps/mcp` (:8788 `/mcp`): the 5 `McpTools`, bearer -> revoked check -> scope -> rate limit -> audit, untrusted wrapping, stateless Streamable HTTP (verified with the SDK client).
- `apps/agent-hooks`: `officehub-hook` CLI for SessionStart / UserPromptSubmit (calls `GET /agent/inbox?unread=1&mark=1`).
- Docs: `README.md`, `security.md`, `agent-setup.md`.

## Mocked / not verified
- GitHub OAuth callback is implemented but untested (no real client id); only dev-login is covered by tests.
- Codex/Gemini config snippets follow their documented shapes but were not run against live installs.
- No Jira/CI/deploy connectors besides the GitHub webhook. `check_suite`/`workflow_run` link to a PR task only when the payload lists `pull_requests`.
- Reminders: first at due time, then every 24 working hours (Mon-Fri 09-12, 13-18, UTC+7); in-process interval, no admin summary digest, no chat notification (events only: `request.reminded`).
- Sessions have no sliding expiry or "log out everywhere".

## Environment variables
| Var | Used by | Default |
|---|---|---|
| `DATABASE_URL` | migrate, seed, tests (owner role) | `postgres://officehub:officehub@localhost:5433/officehub` |
| `APP_DATABASE_URL` | api, mcp (non-superuser) | derived from `DATABASE_URL` with user `officehub_app` / pw `officehub_app` |
| `APP_DB_PASSWORD` | migrate sets role password; used to derive app URL | `officehub_app` (CHANGE IN PRODUCTION) |
| `API_PORT`, `MCP_PORT` | servers | 8787, 8788 |
| `WEB_ORIGIN` | CORS, CSRF Origin check, OAuth redirects, cookie `Secure` if https | `http://localhost:3000` |
| `SESSION_SECRET` | signs the OAuth state cookie | `change-me-dev-only` |
| `DEV_LOGIN_ENABLED` | enables `POST /auth/dev-login` (must be `true`) | off |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth (`/auth/github`, `/auth/github/callback`; register callback `http://localhost:8787/auth/github/callback`) | empty = 500 `internal` |
| `GITHUB_WEBHOOK_SECRET` | server key for per-workspace webhook secrets (`GET /w/:slug/connectors/github`) | empty = webhook returns 500 `internal` |
| `AGENT_RATE_PER_MIN`, `AGENT_STATUS_PER_MIN`, `AGENT_DRAFTS_PER_HOUR` | rate limits | 60, 6, 20 |
| `OFFICEHUB_AGENT_TOKEN`, `OFFICEHUB_API_URL` | hook CLI | -, `http://localhost:8787` |

## Notes for Frontend
- Every state-changing request (POST/PUT/DELETE, including `/auth/dev-login`, `/auth/logout`) must send header `x-officehub-csrf: 1` and `credentials: "include"`.
- `/auth/dev-login` and `/me` return the `Member` plus extras `workspaceSlug`, `workspaceName` (needed to build `/w/:slug` URLs).
- Request messages in responses include an extra `authorMemberId`. All `Request`s carry `unreadForViewer`.
- `GET /w/:slug/inbox` = requests where the viewer must act next (unread first). `POST /w/:slug/requests/:id/read` marks read. The viewer's own actions never make a request unread for them.
- Audit `GET /w/:slug/audit`: admin all, member own + own agents (contract). `action` strings: `read <route>`, `request.<action>`, `mcp.<tool>`, `secret.rejected`, ...
- `DELETE /w/:slug/agents/:id` and `GET .../agents`: owner sees/revokes own; admin sees/revokes all in the workspace (per Business matrix).
- SSE sends `ready`, `change` `{kind,id}` (kinds: card, task, event, request, decision, member, agent) and `ping` every 25s; refetch the relevant resource on `change`.

## Contract change requests (packages/shared)
1. `Untrusted` wrapper: allow `authorMemberId: Id.nullable()` plus optional `source: string`. External content (GitHub PR/issue titles, event data) has no member author. Today the MCP uses the task assignee id (or `null`) and adds `source`.
2. `Me` response: add a shared `Me = Member.extend({ workspaceSlug, workspaceName })` (the API already returns this shape) so the web app does not guess slugs.
3. `Routes.audit`/`AuditEntry`: `targetId` is `Id.nullable()` but some targets are not uuids (e.g. task `#7`); we return null for those. Consider `targetId: z.string().nullable()`. Also `outcome` has only `ok|denied|rejected`; we map HTTP/validation failures and human_only/wrong_side to `denied`.
4. `RequestMessage`: add `authorMemberId: Id` (we already return it) so the UI can label who wrote a draft written by an agent for an owner.
5. `Routes.markRead` and `Routes.agents` delete: add `res: z.object({ ok: z.literal(true) })`.
6. `ApiErrorCode`: we map out-of-enum cases as follows; confirm or extend: invalid receiver/task/waitingOn, bad JSON, missing body, oversize body -> `validation_failed` 400; OAuth not configured / webhook secret not set -> `internal` 500.
7. `Routes.recordDecision.body.rationale` still `max(5000)` without `.min(1)` (only `Decision` has min(1)); the server rejects empty rationale with `validation_failed`. Make the route body match.
8. `McpTools`: consider adding `inputSchema`s to the contract so the MCP and docs share them (currently defined in `apps/mcp/src/app.ts`).

## Open questions
- Should an admin's agent get the admin's read-only visibility of others' requests? We chose NO (least privilege: agents only see requests where the owner is a party).
- Is a member allowed to see `request.*` events of requests they are not part of? We filter them out (C13) from board events and SSE.
- Should `list_inbox` mark as read automatically (current, per C8 "counts as read") or only on an explicit flag?
- Root convenience (belongs to the Leader): add root scripts `"db:migrate": "pnpm --filter @officehub/db migrate"`, `"db:seed": "pnpm --filter @officehub/db seed"`, and a `dev` that excludes packages without a `dev` script (`pnpm -r --parallel dev` already skips them). `pnpm test` at the root runs the db-backed suites in parallel against one database; they use unique workspaces so this is safe.
- Business matrix says `GET /w/:slug/audit` is admin-only; contract v0.2 says member sees own. We followed the contract.

## Round 2 changes (contract v0.3)
- Routes: `GET /auth/dev-members` (dev only), `GET /w/:slug/requests/:id`, `markRead` -> `{ok:true}`, `revokeAgent` -> `Agent`, `/me` + dev-login validated against `Me`. Audit `targetId` is the raw string. Every message has `authorMemberId`.
- MCP registers input schemas from shared `McpToolInputs` (our `.describe()` texts layered on top). Task titles in `read_board` are `{trust:"untrusted", authorMemberId:null, source:"github"}` (never "self", even for your own PR). SSE `change.kind` is validated against `ChangeKind`.
- Rate limits live in Postgres (`rate_buckets`), shared by API and MCP; 10-open-drafts-per-agent cap (429 `rate_limited`).
- Visibility: the handoff pack leaked titles/status/timeline of requests the viewer was not party to (fixed, tested). Board/SSE/MCP were already filtered; tests now pin that, and that `request.*` events carry ids only.
- Hooks: `apps/agent-hooks` builds to `dist/cli.js` (`pnpm --filter @officehub/agent-hooks build`); exact settings in `agent-setup.md`.
- `secret_detected` message keeps `(rule: <id>)`; documented in README.
- Not done: rate bucket rows are never purged; the hook is only exercised against stub + real API, not inside a live Claude Code session.
