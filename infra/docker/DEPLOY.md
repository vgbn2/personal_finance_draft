# Deploy — Sovereign Trading Platform

## Prerequisites on the central host
- Docker 24+ and Docker Compose plugin
- System-wide Node.js 22 LTS (Node.js 20 is the minimum for the host-side preflight)
- 8GB RAM for the full-universe backfill profile
- Git, `flock`, and `curl`
- SSH tunnel or access-controlled private VPN; do not publish port 8787 to the internet

## Local validation without hosting

This checkout can validate the deployment inputs without designating the current laptop as the always-on host:

```bash
# Creates owner-only .env.central, generates a separate API token, and copies only
# allowlisted data/research settings from .env. It never copies execution credentials.
npm run host:prepare-central-env
docker compose --env-file .env.central -f infra/docker/docker-compose.yml config --quiet
node --test tests/scripts/operational/prepare_central_env.test.js \
  tests/scripts/operational/central_host_preflight.test.js \
  tests/scripts/architecture/cli/core/deployment_manifest_contract.test.js
```

Local validation must not install the updater timer, change lid/sleep policy, or start the continuous
`backfill` service. The actual persistent host remains a separate operator decision.

## First deploy

```bash
# 1. Clone to the central host
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
Docker/Compose/disk/private-bind/secret policy; recreates only `web` and `backfill`; and verifies the web
container's internal healthcheck plus a running backfill container before succeeding.
If the fetched branch matches the last successfully deployed commit, the web health endpoint passes, and the
backfill container is running, it exits
without rebuilding or restarting. The success marker lives under `.git/`, so a failed build or health check is
retried on the next timer cycle even though Git already fast-forwarded. Set `SOVEREIGN_DEPLOY_FORCE=true` for
an intentional rebuild after an environment-only change.

## Automatic host-side updates

After the first successful deploy, install the five-minute systemd pull timer from the host checkout:

```bash
sudo infra/systemd/install-central-updater.sh "$PWD" "$USER" "$(command -v node)"
systemctl list-timers sovereign-central-update.timer
journalctl -u sovereign-central-update.service -n 100 --no-pager
```

Before enabling it, prove that the chosen service user can fetch the private repository non-interactively:

```bash
git fetch origin main
```

The developer machine then only pushes reviewed commits to `main`. The central host fetches and fast-forwards
itself; GitHub-hosted runners never receive the host environment or provider credentials. Git/preflight/build
failures occur before service replacement. A failure after Compose recreation can leave the new containers
unhealthy; there is no automatic rollback. Persisted `storage/` remains mounted, the success marker stays old,
and the timer retries the same commit while the failure remains visible in the systemd journal.
Protect `main` and require the automatic Test and Build checks before merge; the host timer does not query
GitHub check status itself.

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
