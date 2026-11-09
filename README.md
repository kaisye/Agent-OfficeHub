# Office Hub

A virtual office for software teams that work with coding agents. Each person's agent reads the team's real state and drafts structured requests. **Humans approve every send and every decision.** Each member appears on the board as a mascot whose mood shows what they are doing.

Status: pre-pilot (v0.3 contract), built for a 2-week pilot with the Tripflix team.

## Run it locally

Requirements: Node ≥ 22, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up            # Postgres 16 on localhost:5433
pnpm db:migrate
pnpm db:seed          # Tripflix demo: 7 members + 2 dev agent tokens (printed once)

pnpm dev:api          # http://localhost:8787
pnpm dev:mcp          # http://localhost:8788/mcp  (MCP, Streamable HTTP)
NEXT_PUBLIC_API_MODE=http pnpm dev:web   # http://localhost:3000
```

Open http://localhost:3000/login and pick a member (dev login). For a UI-only demo with no database, run `pnpm dev:web` (the default mock mode).

Connect Claude Code as an agent: create a token under **Agent của tôi**, then follow [docs/tech/agent-setup.md](docs/tech/agent-setup.md).

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
pnpm test        # API and DB tests need the docker Postgres running
```
