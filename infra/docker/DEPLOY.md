# Deploy — Sovereign Trading Platform

## Prerequisites on VPS
- Docker 24+ and Docker Compose plugin
- 2GB RAM minimum (C++ build needs ~1.5GB)
- Port 8787 open (or reverse proxy on 443 → 8787)

## First deploy

```bash
# 1. Clone to VPS
git clone <your-repo-url> personal_finance
cd personal_finance

# 2. Create your config file (.env is the single source for both the CLI and Docker)
cp .env.example .env
nano .env                     # fill in your values  (or: ./node_modules/.bin/sovereign setup <broker>)
# Required: SOVEREIGN_API_TOKEN, all SOVEREIGN_SUPABASE_* keys, SOVEREIGN_TRADE_PIN
# If using the Polymarket bot: POLYMARKET_PRIVATE_KEY + L2 API keys
# Optional: create .env.production to override any value in production (loaded on top of .env)
# Verify before deploying: ./node_modules/.bin/sovereign doctor --json --no-network

# 3. Build and start
docker compose -f infra/docker/docker-compose.yml build
docker compose -f infra/docker/docker-compose.yml up -d

# 4. Verify
curl http://localhost:8787/health
# Expected: {"ok":true, ...}
```

## Subsequent deploys

```bash
git pull
docker compose -f infra/docker/docker-compose.yml build --no-cache
docker compose -f infra/docker/docker-compose.yml up -d
```

## Services

| Service | Purpose |
|---|---|
| `web` | REST API + React dashboard on port 8787 |
| `bot` | Paper-trading loop — one cycle every 30 min (set `BOT_INTERVAL_SECS` to override) |

Note: the TypeScript execution gateway (`backend/gateway/src/index.ts`) is a one-shot
CLI dispatcher, not a persistent server — `web`, `bot`, and the CLI/TUI spawn it
on demand as a subprocess (`buildTradeGatewayLaunch`). It does not run as its own
compose service.

Start only the web service for read-only dashboard:
```bash
docker compose -f infra/docker/docker-compose.yml up -d web
```

Enable the full bot stack (paper trading):
```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

Stop the bot without stopping the dashboard:
```bash
docker compose -f infra/docker/docker-compose.yml stop bot
```

## Logs

```bash
docker compose -f infra/docker/docker-compose.yml logs -f web
docker compose -f infra/docker/docker-compose.yml logs -f bot
```

## Reverse proxy (Caddy — recommended)

```
your-domain.com {
    reverse_proxy localhost:8787
}
```

For nginx, see `infra/deployment/nginx/` if present.

## Storage persistence

The compose file mounts:
- `./storage` → `/app/storage`  (market data cache — preserved across restarts)
- `./workspace` → `/app/workspace`  (session state — preserved across restarts)

These directories are created automatically if missing.

## Configuration model

One config file drives everything: **`.env`** (the same file the local CLI reads). Docker loads
`.env` first (required), then `.env.production` on top of it **if present** (optional overrides for
things like a production Supabase key or a different `BOT_INTERVAL_SECS`). Most self-hosters only need
`.env`. Start from the template: `cp .env.example .env`.

## Secrets

Never commit `.env` or `.env.production` — both are in `.gitignore`, and `.dockerignore` keeps them
out of the image (compose injects them at runtime via `env_file`).
Generate API tokens with: `openssl rand -hex 32`

## Troubleshooting

| Symptom | Check |
|---|---|
| `/health` returns 404 | Container not started — check `docker compose logs web` |
| `/health` returns 500 | Check SOVEREIGN_SUPABASE_URL and SECRET_KEY in .env |
| `env file ... not found` | You skipped step 2 — `cp .env.example .env` and fill it in |
| C++ build fails | Ensure VPS has ≥1.5GB RAM available during build |
| Dashboard blank | Frontend dist is built inside image — check `docker compose build` output for vite errors |
