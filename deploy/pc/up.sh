#!/usr/bin/env bash
# Run Office Hub 24/7 on a Linux box you own (no compose plugin or root needed).
# Idempotent: first run installs, later runs update (git pull → install → migrate → build → restart).
#
#   deploy/pc/up.sh [HOST]      HOST = address teammates open (default: this machine's Tailscale IPv4)
#
# Postgres: docker container "officehub-pg" (restart unless-stopped, bound to 127.0.0.1:5433).
# api / mcp / web: systemd --user units, restarted on failure.
# After reboot they only start without a login if lingering is on: sudo loginctl enable-linger "$USER"
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$PWD
HOST=${1:-$(tailscale ip -4 2>/dev/null | head -1)}
[ -n "$HOST" ] || { echo "Pass the host/IP teammates will use: deploy/pc/up.sh 100.x.y.z"; exit 1; }
export PATH="$HOME/.local/bin:$PATH"

# 1. pnpm (user-level, via corepack)
if ! command -v pnpm >/dev/null; then
  mkdir -p "$HOME/.local/bin"
  corepack enable --install-directory "$HOME/.local/bin"
fi

# 2. .env with random secrets (kept on first run; only WEB_ORIGIN follows HOST)
if [ ! -f .env ]; then
  rnd() { openssl rand -hex 24; }
  PG_PW=$(rnd)
  umask 077
  cat > .env <<EOF
DATABASE_URL=postgres://officehub:${PG_PW}@127.0.0.1:5433/officehub
APP_DB_PASSWORD=$(rnd)
API_PORT=8787
MCP_PORT=8788
WEB_ORIGIN=http://${HOST}:3000
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
DEV_LOGIN_ENABLED=false
ANTHROPIC_API_KEY=
OFFICEHUB_ASSISTANT_PER_DAY=40
GITHUB_REPO=
GITHUB_TOKEN=
EOF
  echo "wrote .env (secrets generated)"
fi
sed -i "s|^WEB_ORIGIN=.*|WEB_ORIGIN=http://${HOST}:3000|" .env
PG_PW=$(sed -n 's|^DATABASE_URL=postgres://officehub:\([^@]*\)@.*|\1|p' .env)

# 3. Postgres
if ! docker inspect officehub-pg >/dev/null 2>&1; then
  docker run -d --name officehub-pg --restart unless-stopped \
    -e POSTGRES_USER=officehub -e POSTGRES_PASSWORD="$PG_PW" -e POSTGRES_DB=officehub \
    -p 127.0.0.1:5433:5432 -v officehub-pgdata:/var/lib/postgresql/data postgres:16-alpine >/dev/null
fi
docker start officehub-pg >/dev/null
until docker exec officehub-pg pg_isready -U officehub -d officehub >/dev/null 2>&1; do sleep 1; done

# 4. Code, deps, schema, first seed, web build
[ -d .git ] && git pull --ff-only
pnpm install --frozen-lockfile
pnpm db:migrate
# Seed is idempotent (skips when the workspace exists). Only a fresh seed prints agent tokens: keep them, once.
SEED_OUT=$(pnpm --silent db:seed)
if printf '%s' "$SEED_OUT" | grep -q '^seeded workspace'; then
  (umask 077; printf '%s\n' "$SEED_OUT" > "$HOME/.officehub-seed.txt")
  echo "seeded: role ids + one agent token per role in ~/.officehub-seed.txt (shown once)"
  echo "sign-in link for the orchestrator:"; pnpm --silent db:invite
fi
# Marketing workspace + agent runner config (first run only; tokens and the sign-in link are written once, chmod 600).
RUNNER_CFG="$HOME/.config/officehub/runner.json"
if [ ! -f "$RUNNER_CFG" ]; then
  MKT_OUT=$(pnpm --silent db:seed:marketing)
  TOKENS=$(printf '%s\n' "$MKT_OUT" | sed -n 's/^RUNNER_TOKENS=//p')
  if [ -n "$TOKENS" ]; then
    mkdir -p "$(dirname "$RUNNER_CFG")" "$HOME/agents/marketing/knowledge"
    (umask 077; cat > "$RUNNER_CFG" <<EOF
{
  "mcpUrl": "http://127.0.0.1:8788/mcp",
  "model": "deepseek/deepseek-v4.1-flash-1017",
  "tokens": $TOKENS,
  "apiKeyFile": "~/.config/vietnote/openrouter.env",
  "knowledgeDir": "~/agents/marketing/knowledge",
  "artifactsDir": "~/agents/marketing/an-pham",
  "stateDir": "~/agents/marketing/state",
  "pollSeconds": 20,
  "dailyBudgetUsd": 2
}
EOF
    printf '%s\n' "$MKT_OUT" | sed -n 's/^INVITE=//p' > "$HOME/.officehub-marketing-invite.txt")
    echo "marketing workspace seeded: runner config in $RUNNER_CFG, sign-in link in ~/.officehub-marketing-invite.txt"
  fi
fi

export NEXT_PUBLIC_API_MODE=http NEXT_PUBLIC_API_URL="http://${HOST}:8787" NEXT_PUBLIC_MCP_URL="http://${HOST}:8788/mcp"
pnpm --filter @officehub/web build

# 5. systemd --user units
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
unit() { # name, description, command
  cat > "$UNIT_DIR/officehub-$1.service" <<EOF
[Unit]
Description=Office Hub $2
After=network-online.target

[Service]
WorkingDirectory=$ROOT
Environment=PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
Environment=NEXT_PUBLIC_API_MODE=http
Environment=NEXT_PUBLIC_API_URL=http://${HOST}:8787
Environment=NEXT_PUBLIC_MCP_URL=http://${HOST}:8788/mcp
ExecStart=$3
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
}
unit api "API (:8787)" "$HOME/.local/bin/pnpm --filter @officehub/api start"
unit mcp "MCP (:8788)" "$HOME/.local/bin/pnpm --filter @officehub/mcp start"
unit web "web (:3000)" "$HOME/.local/bin/pnpm --filter @officehub/web start"
unit runner "agent runner (marketing team)" "$HOME/.local/bin/pnpm --filter @officehub/agent-runner start"
systemctl --user daemon-reload
systemctl --user enable officehub-api officehub-mcp officehub-web >/dev/null
systemctl --user restart officehub-api officehub-mcp officehub-web
# The runner needs its config and the model API key; without them it stays off.
if [ -f "$RUNNER_CFG" ] && [ -f "$HOME/.config/vietnote/openrouter.env" ]; then
  systemctl --user enable officehub-runner >/dev/null
  systemctl --user restart officehub-runner
  echo "agent runner: on (journalctl --user -u officehub-runner -f)"
else
  systemctl --user disable --now officehub-runner >/dev/null 2>&1 || true
  echo "agent runner: off (needs $RUNNER_CFG and ~/.config/vietnote/openrouter.env)"
fi

echo
echo "Office Hub: http://${HOST}:3000   (API :8787, MCP http://${HOST}:8788/mcp)"
echo "First sign-in link: pnpm db:invite        Logs: journalctl --user -u officehub-api -f"
[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ] || echo "To survive reboots without logging in: sudo loginctl enable-linger $USER"
