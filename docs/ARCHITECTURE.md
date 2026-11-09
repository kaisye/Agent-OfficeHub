# Office Hub — Architecture & team ownership (Leader)

Read `docs/proposal.md` first. The domain contract lives in `packages/shared` (zod + TS). It is the single
source of truth for shapes, the request state machine (`canTransition`), API routes (`Routes`) and MCP tool
names (`McpTools`). **Only the Leader edits `packages/shared`.** If you need a change, write it in your
team's `HANDOFF.md` under "Contract change requests" and code against the current contract meanwhile.

## Leader decisions (v0.1)
| Topic | Decision | Why |
|---|---|---|
| Repo | pnpm workspaces monorepo, TypeScript strict, ESM | One language end to end |
| DB | Postgres 16 (docker compose, port 5433), raw SQL migrations | Self-host path from day 1; Supabase CLI not installed |
| Tenant isolation | Postgres row-level security keyed on `current_setting('app.workspace_id')`, set per transaction | Proposal rule 6 |
| Realtime | API exposes SSE (`/w/:slug/stream`) fed by Postgres `LISTEN/NOTIFY` | Alternative listed in proposal; no Supabase dependency |
| Auth (humans) | GitHub OAuth + dev login (`DEV_LOGIN_ENABLED`), httpOnly session cookie | Teams all have GitHub |
| Auth (agents) | Bearer `oh_agent_…`, stored as SHA-256 hash, scoped, revocable; accepted ONLY by MCP + agent paths | Rules 3 & 5 |
| API | Hono on Node (`apps/api`, port 8787) | Light, typed |
| MCP | `@modelcontextprotocol/sdk`, Streamable HTTP (`apps/mcp`, port 8788, path `/mcp`) | Claude Code / Codex / Gemini CLI speak MCP |
| Events | CloudEvents 1.0 shape (`HubEvent`) | Connectors map to one form |
| Web | Next.js (App Router) + React + Tailwind v4 (`apps/web`, port 3000) | Team knows it |
| Design system | `packages/brand` (tokens, mascot generator — pure TS → SVG string) + `packages/ui` (React components) | Mascot works on server, client, bot images |
| Language | UI copy Vietnamese-first, code/identifiers English | Users are Vietnamese |
| Tests | vitest everywhere; API integration tests hit the docker Postgres | — |

## Directory ownership (do not write outside yours)
| Team | Owns |
|---|---|
| Leader | `packages/shared/**`, root config files, `docs/ARCHITECTURE.md`, `docs/proposal.md` |
| Business | `docs/business/**` |
| Design (UI-UX, Branding DNA) | `packages/brand/**`, `packages/ui/**`, `docs/design/**` |
| Backend (Technical) | `packages/db/**`, `apps/api/**`, `apps/mcp/**`, `apps/agent-hooks/**`, `docs/tech/**` |
| Frontend (wave 2) | `apps/web/**` |
| QA & Security (wave 3) | `tests/e2e/**`, `docs/qa/**` |

Each team ends with `<their docs folder>/HANDOFF.md`: what was built, how to run it, what is mocked/missing,
contract change requests, open questions.

## Ports
web 3000 · api 8787 · mcp 8788 · postgres 5433
