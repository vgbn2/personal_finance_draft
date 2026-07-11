# Deployment Plan

Deployment is still local-first. The repo does not ship a public production service yet, but the local prototype now has a buildable CLI, web/API bridge, and repo-local state files that make packaging work easier to stage later.

## Current Status

Current runtime remains local-only.

Current runtime:

- local prototype docs and starter assets
- optional legacy local executable
- optional local config examples
- no network access
- Supabase-backed database/auth available when local or deployment env vars are provided
- secrets required for deployment targets that use Supabase or protected write routes
- no deployment target

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

The repo now includes a local container starter under `docker/`:

- `docker/Dockerfile` builds the web/API bridge on top of `node:22-slim`
- `docker/docker-compose.yml` runs the web service on port `8787`
- `docker/.dockerignore` keeps build outputs, logs, and notebook/data noise out of the image context

The container starter is for reproducibility and local packaging, not a replacement for direct CLI verification.

## Secrets Policy

The current local prototype should not need live secrets for ordinary validation.

Future deployment work must never hardcode credentials. Credentials should come from an approved secret source such as environment variables, a local encrypted store, or a deployment secret manager.

## Starter Manifests

The repo now includes starter deployment assets under `deployment/`:

- `deployment/heroku/` for a Node process entrypoint and environment hints
- `deployment/kubernetes/` for a web/API deployment, config map, and service
- `deployment/terraform/` for managing the Kubernetes web surface from variables and outputs

These are intentionally web-first and assume the local dashboard bridge is the supported runtime target until the live execution stack is promoted.

## Always-On Data And Scorecard Host

The supported small-host shape is one Docker host running the `web` and `backfill`
services from the repository root:

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build web backfill
```

The backfill service writes directly to the host-mounted `storage/data/ts/` index. The
web service calculates scorecards on the same machine from that index; market data is
not copied to the browser. Scorecard results are cached in memory for 30 seconds and
identical concurrent requests share one calculation.

The scorecard endpoint requires `SOVEREIGN_API_TOKEN`:

```bash
curl -H "X-Sovereign-Token: $SOVEREIGN_API_TOKEN" \
  "http://127.0.0.1:8787/api/scorecard?family=crypto&top=20"
```

Keep port `8787` private. Reach it through an SSH tunnel or private VPN rather than
publishing it directly to the internet. The API and scorecard are CPU-only; no GPU is
used. Storage and memory pressure come mainly from deep 1-minute backfills and their
merge-write path, not from the scorecard calculation.

Compose binds the host port to `127.0.0.1` by default. Set `SOVEREIGN_WEB_BIND` to a
specific private VPN interface address only when that interface is access-controlled;
do not use `0.0.0.0` on an internet-reachable host.

Start with 2 shared vCPU, 8 GB RAM, and enough SSD space for at least twice the current
`storage/` footprint. The backfill container is configured with a 6 GB V8 heap ceiling,
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
docker compose -f infra/docker/docker-compose.yml --profile monitoring up -d --build web backfill portfolio-monitor host-health host-backup

# Bounded Polymarket research archive capture
docker compose -f infra/docker/docker-compose.yml --profile research up -d --build polymarket-research
```

`portfolio-monitor` polls the aggregated portfolio snapshot from the local gateway and writes a
status file for unattended risk checks. `host-health` probes canonical-data freshness, disk capacity,
and other state visible inside its own container. It does not infer another container's health from
host PID files. `host-backup` creates timestamped, hash-backed snapshots of repo-local state, excludes
disposable provider caches, and prunes snapshots after 30 days or beyond the newest 14 by default.
Configure those bounds with `HOST_BACKUP_RETENTION_DAYS` and `HOST_BACKUP_MAX_COUNT`.
The monitor, health, and backup loops exit nonzero on failed checks, critical risk breaches, or failed
retention so Compose exposes and restarts the failure rather than sleeping in a healthy-looking loop.
A retention-only failure is throttled for the configured backup interval before restart because the
new snapshot is already valid; this prevents a persistent prune error from rapidly creating duplicates.

`polymarket-research` requires a local `POLYMARKET_RESEARCH_SCOPE_FILE` JSON file that names the
active markets and token ids to watch. The scheduler is bounded by archive-size and per-token
retention limits, so it is a research archive, not a full live orderbook recorder. Enable the
persisted `polymarket` feature flag before starting the profile. A missing scope, disabled feature,
invalid scope, or failed capture cycle exits nonzero so Compose reports and restarts the failure
instead of leaving an idle loop that appears healthy.

All non-web profile services explicitly disable the image's inherited HTTP healthcheck because they
do not listen on port `8787`. The research service carries its own image build definition, so the
research-only `up --build` command does not depend on a prior web-service build.
Runtime knobs are read from the ordered `env_file` entries inside each container; this allows optional
`.env.production` values to override `.env` without being erased by host-side Compose interpolation.
