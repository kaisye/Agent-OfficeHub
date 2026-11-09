# Office Hub

A virtual office for software teams that work with coding agents. Each person's agent reads the team's real state and drafts structured requests. **Humans approve every send and every decision.** Each member appears on the board as a mascot whose mood shows what they are doing.

Status: pre-pilot (v0.3 contract), built for a 2-week pilot with the Tripflix team.

## Run it locally

Requirements: Node ≥ 22, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env   # then set DEV_LOGIN_ENABLED=true for local dev login
pnpm db:seed           # first time only: Tripflix demo data

pnpm dev               # Postgres (docker) + migrate + API :8787 + MCP :8788 + web :3000, one terminal
```

`Ctrl+C` stops everything except Postgres (`pnpm db:down` stops that). For the UI alone with mock data and no database: `pnpm dev:ui`.

Open http://localhost:3000/login and pick a member (dev login). For a UI-only demo with no database, run `pnpm dev:web` (the default mock mode).

Connect Claude Code as an agent: create a token under **Agent của tôi**, then follow [docs/tech/agent-setup.md](docs/tech/agent-setup.md).

## Sign-in

Members sign in with **email + password**, so no GitHub account or email service is needed:

1. An admin opens a member's profile on the office map and clicks **Tạo link mời**, which creates a one-time link valid for 48h.
2. The admin sends the link privately (Zalo, Messenger). The member opens it and sets their email and password.
3. After that, they log in at `/login`. A forgotten password is handled the same way: the admin creates a new link.

For the very first admin, use dev login locally (`DEV_LOGIN_ENABLED=true`) to create your own link. GitHub login is optional: set `GITHUB_CLIENT_ID`/`SECRET` on the API and `NEXT_PUBLIC_GITHUB_LOGIN=1` on the web.

## What is where

| Path | What | Team |
|---|---|---|
| `packages/shared` | Domain contract: zod shapes, request state machine, API routes, MCP tools | Leader |
| `packages/db` | Migrations, row-level security, domain services, seed | Backend |
| `apps/api` | Hono HTTP API, SSE, GitHub webhook | Backend |
| `apps/mcp` | MCP server for agents (5 tools) | Backend |
| `apps/agent-hooks` | `officehub-hook`, a Claude Code hook that injects the unread inbox | Backend |
| `packages/brand` | Tokens and the mascot generator (pure TS → SVG) | Design |
| `packages/ui` | React UI kit | Design |
| `apps/web` | Next.js web app | Frontend |
| `tests/e2e` | Black-box API/MCP tests and Playwright journeys | QA |
| `docs/` | Proposal, architecture, business, design, tech, QA | all |

Start with [docs/proposal.md](docs/proposal.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The safety model is described in [docs/tech/security.md](docs/tech/security.md).

## Checks

```bash
pnpm typecheck
pnpm test        # unit + integration (needs the docker Postgres)
pnpm e2e         # black-box API/MCP + Playwright against a running stack (QA suite)
```
