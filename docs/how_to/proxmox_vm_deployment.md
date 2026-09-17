# Deployment Plan

Deployment is local/private-first. The repo supports one private, single-writer Docker host for market-data
polling, scorecard calculation, and dashboard/API access. It does not ship a public production service or
approve live-money execution.

## Current Status

Current runtime supports local use and a private central research host.

Current runtime:

- local prototype docs and starter assets
- optional legacy local executable
- optional local config examples
- private dashboard/API access through an SSH tunnel or access-controlled VPN
- Supabase-backed database/auth available when local or deployment env vars are provided
- secrets required for deployment targets that use Supabase or protected write routes
- no repository-owned public/cloud target; the operator supplies the private host

## Deployment Goals

Later phases may need:

- reproducible release builds
- Docker images
- CI build and test jobs
- artifact publishing
- environment-specific config
- secrets handling
- monitoring and operational logs

## Deployment Shape

The current build is organized for local verification first:

- CLI commands run locally against recorded or cached data.
- The web/API bridge is a local inspection surface.
- C++ and Node modules are wired for local test runs before any packaging work.
- Generated artifacts should stay out of source control.

## Future Production Requirements

Before any live execution deployment, the project must have:

- dry-run mode
- explicit live flag
- confirmation gate
- credential storage policy
- audit logs
- kill switch behavior
- connection failure behavior
- rollback procedure

## Docker Status

Docker is optional for the local prototype and should not be required for ordinary repo verification.

The repo includes the central-host container stack under `infra/docker/`:

- `infra/docker/Dockerfile` builds the web/API bridge and native runtime
- `infra/docker/docker-compose.yml` runs the default `web` + `backfill` stack
- `.dockerignore` keeps secrets, build output, and runtime data out of the image context

The stack is a private research/data deployment, not a live-trading promotion.

GitHub Actions is not the host. `.github/workflows/deploy.yml` is a manual readiness check that validates
the tracked preflight, updater, and Compose inputs on an ephemeral runner; it does not provision a server,
retain `storage/`, poll providers continuously, or update a remote machine. Actual deployment starts only
after an operator selects a persistent private host and runs the host-side updater below.

## Secrets Policy

The current local prototype should not need live secrets for ordinary validation.

Future deployment work must never hardcode credentials. Credentials should come from an approved secret source such as environment variables, a local encrypted store, or a deployment secret manager.

## Deployment Infrastructure

The platform runs containerized services under `infra/docker/` and `infra/mt5/` for the dedicated Proxmox VM host (`hpdesk-1`):

- `infra/docker/Dockerfile` builds the native runtime and web/API bridge
- `infra/docker/docker-compose.yml` runs the multi-service stack (`sv-web`, `sv-bot-alpaca-paper`, `sv-backfill`, `sv-strategy-explorer`, `sv-mt5`)
- `infra/mt5/Dockerfile` builds headless MetaTrader 5 on Wine64 with Xvfb, audio nullification, and auto-update locking (`profiles: [paper-mt5]`)
- `infra/systemd/` contains systemd service and timer units for automated host-side updates

## Always-On Data And Scorecard Host

The supported small-host shape is one Docker host running the `web` and `backfill`
services from the repository root:

```bash
npm run host:prepare-central-env
SOVEREIGN_CENTRAL_ENV_FILE="$PWD/.env.central" infra/docker/update-central-host.sh
```

Running the environment preparer and Compose/config tests on a developer laptop is validation only. It does
not select that laptop as the persistent host and must not install the timer, change its power policy, or
start continuous provider polling. The eventual host remains an explicit operator decision.

### Central Host Updater Invariants

The automated updater executes under strict serialized safeguards on the central host:

| Pipeline Stage | Guard / Invariant | Failure Action |
|---|---|---|
| **Git Pre-Flight** | Clean working tree on `main`, zero local unpushed commits | Abort update; leave running containers untouched |
| **Lock Acquisition** | Exclusive deployment file lock `/var/lock/sovereign-deploy.lock` | Fail immediately if another update is active |
| **Validation** | Run `central_host_preflight.js` and Compose config checks | Halt deployment if environment variables fail whitelist |
| **Image Build** | Build container image tagged with exact commit and source hash | Abort cutover on build error |
| **Service Cutover** | Recreate `web` and `backfill`; preserve existing optional profiles | Auto-rollback to previous tagged image on health-check failure |

### Automated 5-Minute Pull Timer Setup

After initial manual deployment, install the host-side automated pull timer:

```bash
# Install the 5-minute pull timer on the central host
sudo infra/systemd/install-central-updater.sh

# Monitor timer activity and journal output
journalctl -u sovereign-updater.timer -f
```

### Storage Concurrency & Scorecard Invariants

- **Direct Storage Access**: `backfill` writes directly to host-mounted `storage/data/ts/`. `web` reads scorecards from disk without browser data replication.
- **In-Memory Caching**: Scorecard calculations are cached in memory for 30 seconds to deduplicate concurrent browser queries.
- **Append Path**: New market candles use an append path rather than full file rewrites.
- **File Locking**: Every symbol/timeframe write holds a POSIX file lock (`withFileLockSync`) to prevent concurrent writer corruption. Stale locks from crashed processes are safely reclaimed after timeout.

The scorecard endpoint requires `SOVEREIGN_API_TOKEN`:

```bash
curl -H "X-Sovereign-Token: $SOVEREIGN_API_TOKEN" \
  "http://127.0.0.1:8787/api/scorecard?family=crypto&top=20"
```

Keep port `8787` private. Reach it through an SSH tunnel or private VPN rather than
publishing it directly to the internet. The API and scorecard are CPU-only; no GPU is
used. Storage and memory pressure come mainly from deep 1-minute backfills and their
overlap/correction merge path, not from ordinary live-candle appends or scorecard calculation.

Compose binds the host port to `127.0.0.1` by default. Set `SOVEREIGN_WEB_BIND` to a
specific private VPN interface address only when that interface is access-controlled;
do not use `0.0.0.0` on an internet-reachable host.

Central containers force `SOVEREIGN_RUNTIME_MODE=cloud-compute`, `LIVE_TRADING=false`, and
`SOVEREIGN_EXECUTION_AUTHORIZED=false` after loading the environment file. The preflight rejects execution
PINs and Polymarket private/L2 credentials in `.env.central`; keep live broker custody on a separately
reviewed local/private runner. The paper bot is also opt-in under the `paper` profile and is never started by
the central updater.

Alpaca credentials use explicit account scopes. Central hosts accept only
`ALPACA_PAPER_API_KEY`, `ALPACA_PAPER_SECRET_KEY`, and
`ALPACA_PAPER_BASE_URL=https://paper-api.alpaca.markets`. Live runners use the corresponding
`ALPACA_LIVE_*` names. The legacy generic `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, and
`ALPACA_BASE_URL` names remain a compatibility fallback only when their URL agrees with the requested
Paper/Live scope.

Start with 2 shared vCPU, 8 GB RAM, and enough SSD space for at least twice the current
`storage/` footprint. The backfill container is configured with a 2560 MB V8 heap ceiling within a 3072 MB container cgroup limit,
so a 4 GB host is not a reliable choice for the full crypto/equity universe. A reduced
family/symbol deployment can operate below this recommendation, but it is a different
runtime profile and must be measured separately.

Kubernetes starter manifests now expect a `sovereign-supabase` secret with `url`, `publishable_key`, and `secret_key` keys when the web/API bridge is deployed with Supabase-backed private data enabled.

## Optional Always-On Profiles

The compose file now exposes opt-in profiles for read-only monitoring, host maintenance, and bounded
Polymarket research capture. They are intentionally separate from the default `web` plus `backfill`
runtime.

```bash
# Read-only portfolio and host monitors
docker compose --env-file .env.central -f infra/docker/docker-compose.yml --profile monitoring up -d --build web backfill portfolio-monitor host-health host-backup

# Bounded Polymarket research archive capture
docker compose --env-file .env.central -f infra/docker/docker-compose.yml --profile research up -d --build polymarket-research

# Optional paper bot; still forced into cloud-compute/non-live mode
docker compose --env-file .env.central -f infra/docker/docker-compose.yml --profile paper up -d web backfill bot
```

`portfolio-monitor` polls the aggregated portfolio snapshot from the local gateway and writes a
status file for unattended risk checks. Its central-host default is `PORTFOLIO_MONITOR_SCOPE=both`,
which assesses the combined real-funds and Alpaca broker-paper buckets so paper-account visibility
does not hide Gate.io or Polymarket exposure. Set the scope to `live` or `live_paper` only when that
narrower risk boundary is intentional. `PORTFOLIO_MONITOR_ALPACA_SCOPE=paper` prevents the central
monitor from attempting an Alpaca live-account connection with paper credentials. The monitor
projection receives only the `ALPACA_PAPER_*` account keys/base URL needed by that read path; live
credentials are execution-class inputs and cannot enter the central-host projection. Cloud-compute,
`LIVE_TRADING=false`, and execution authorization false remain fixed, and no trade PIN or private
wallet credential is projected. Alpaca account keys may still carry provider-side trading authority,
so operators should use paper-account or provider-restricted credentials rather than treating the
container boundary as broker-side permission scoping.

`host-health` probes canonical-data freshness, disk capacity,
and other state visible inside its own container. It does not infer another container's health from
host PID files. `host-backup` creates timestamped, hash-backed snapshots of repo-local state, excludes
disposable provider caches, and prunes snapshots after 30 days or beyond the newest 14 by default.
Configure those bounds with `HOST_BACKUP_RETENTION_DAYS` and `HOST_BACKUP_MAX_COUNT`.
Node owns the monitor, health, and backup intervals. Breaches and degraded checks remain visible in status
and heartbeat files without terminating otherwise healthy containers. Direct one-shot commands retain
nonzero failure exits for operator and CI use. Backup watch mode preserves `next_run_at` across recreation
and falls back to the newest verified completed-backup manifest, preventing an immediate duplicate backup.

`polymarket-research` requires a local `POLYMARKET_RESEARCH_SCOPE_FILE` JSON file that names the
active markets and token ids to watch. The scheduler is bounded by archive-size and per-token
retention limits, so it is a research archive, not a full live orderbook recorder. Enable the
persisted `polymarket` feature flag before starting the profile. A missing scope, disabled feature,
invalid scope, or failed capture cycle exits nonzero so Compose reports and restarts the failure
instead of leaving an idle loop that appears healthy.

All non-web profile services explicitly disable the image's inherited HTTP healthcheck because they
do not listen on port `8787`. The research service carries its own image build definition, so the
research-only `up --build` command does not depend on a prior web-service build.
Runtime knobs come from the operator-owned `.env.central` selected through `SOVEREIGN_CENTRAL_ENV_FILE`.
The same file is passed to Compose for private-bind interpolation and injected into the containers; explicit
central-runtime overrides then enforce the non-live boundary.
