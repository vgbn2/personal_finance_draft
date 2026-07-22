# Deploy — Sovereign Trading Platform

## Prerequisites on VPS
- Docker 24+ and Docker Compose plugin
- 8GB RAM for the full-universe backfill profile
- Git, `flock`, and `curl`
- SSH tunnel or access-controlled private VPN; do not publish port 8787 to the internet

## First deploy

```bash
# 1. Clone to VPS
git clone <your-repo-url> personal_finance
cd personal_finance

# 2. Create the data/research-only environment.
cp .env.central.example .env.central
chmod 600 .env.central
nano .env.central
# Required: a random SOVEREIGN_API_TOKEN plus only the provider keys used for polling.
# Forbidden here: SOVEREIGN_TRADE_PIN and Polymarket private/L2 execution credentials.

# 3. Preflight, fast-forward, build, and start only web + backfill.
SOVEREIGN_CENTRAL_ENV_FILE="$PWD/.env.central" infra/docker/update-central-host.sh

# 4. Verify
curl http://localhost:8787/health
# Expected: {"ok":true, ...}
```

## Subsequent deploys

```bash
SOVEREIGN_CENTRAL_ENV_FILE="$PWD/.env.central" infra/docker/update-central-host.sh
```

The updater refuses dirty, wrong-branch, divergent, or locally-ahead Git state; uses `git merge --ff-only`;
requires `HEAD` to equal the fetched remote branch; serializes deployments with `flock`; validates
Docker/Compose/disk/private-bind/secret policy; recreates only `web` and `backfill`; and verifies both
`http://127.0.0.1:8787/health` and a running backfill container before succeeding.

## Services

| Service | Purpose |
|---|---|
| `web` | REST API + React dashboard on port 8787 |
| `backfill` | Sole canonical market-data poller/writer |
| `bot` | Opt-in paper loop under the `paper` profile; never live on this host |

Note: the TypeScript execution gateway (`backend/gateway/src/index.ts`) is a one-shot
CLI dispatcher, not a persistent server — `web`, `bot`, and the CLI/TUI spawn it
on demand as a subprocess (`buildTradeGatewayLaunch`). It does not run as its own
compose service.

Start only the web service for read-only dashboard:
```bash
docker compose --env-file .env.central -f infra/docker/docker-compose.yml up -d web
```

Enable the optional paper stack:
```bash
docker compose --env-file .env.central -f infra/docker/docker-compose.yml --profile paper up -d web backfill bot
```

Stop the bot without stopping the dashboard:
```bash
docker compose --env-file .env.central -f infra/docker/docker-compose.yml stop bot
```

## Logs

```bash
docker compose --env-file .env.central -f infra/docker/docker-compose.yml logs -f web
docker compose --env-file .env.central -f infra/docker/docker-compose.yml logs -f backfill
```

## Private client access

```bash
ssh -N -L 8787:127.0.0.1:8787 user@central-host
# Open http://127.0.0.1:8787 on the client.
```

An access-controlled private VPN bind is also supported. Public reverse-proxy exposure is not approved.

## Storage persistence

The compose file mounts:
- `./storage` → `/app/storage`  (market data cache — preserved across restarts)
- `./workspace` → `/app/workspace`  (session state — preserved across restarts)

These directories are created automatically if missing.

## Configuration model

The central host uses **`.env.central`**, selected through `SOVEREIGN_CENTRAL_ENV_FILE`. Compose forces
cloud-compute/non-live values after loading it. Local/private execution uses a separate environment and
is not part of this deployment.

## Secrets

Never commit `.env.central`; it is ignored and injected at runtime. The tracked `.env.central.example`
contains names and safe defaults only.
Generate API tokens with: `openssl rand -hex 32`

## Troubleshooting

| Symptom | Check |
|---|---|
| `/health` returns 404 | Container not started — check `docker compose logs web` |
| `/health` returns 500 | Check SOVEREIGN_SUPABASE_URL and SECRET_KEY in .env |
| `env file ... not found` | Copy `.env.central.example`, fill `.env.central`, and set mode 600 |
| Preflight rejects credentials | Remove execution PIN/private/L2 keys from the central environment |
| Preflight rejects Docker | Install the Compose plugin and grant the operator daemon access |
| C++ build fails | Ensure the host has sufficient RAM and disk headroom |
| Dashboard blank | Frontend dist is built inside image — check `docker compose build` output for vite errors |
