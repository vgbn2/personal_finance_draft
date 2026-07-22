# Central Host Single-Writer Rollout

Date: 2026-07-22

## Refined prompt

- **Objective:** produce one reproducible, privately reachable central research host that is the sole
  market-data writer, continuously runs the supported backfill poller, serves the dashboard/API from the
  same canonical time-series index, and accepts reviewed code updates through a fail-closed Git/Compose
  deployment path without enabling live execution.
- **In scope:** ts-index write serialization; adversarial writer tests; Docker service/profile safety;
  central-host environment and toolchain preflight; fast-forward-only update automation; private bind
  documentation; storage-preserving restart behavior; repository verification; reviewed commits and push;
  target-host smoke/catch-up when the current host has the required authority.
- **Out of scope:** public port exposure; real-money order execution; schema-v3 promotion; remote Supabase
  RLS approval; deleting or shrinking historical data; copying secrets into browser code; inventing or
  purchasing an unspecified server.
- **Evidence:** `workspace/DEV_REVIEW.md` records the missing per-bin writer lock; `shared/lib/market/validation.js`
  performs direct append and overlap rewrites; `infra/docker/docker-compose.yml` already has `web` and
  `backfill` but leaves the paper bot in the default service set; `infra/docker/DEPLOY.md` uses a broad
  `docker compose up -d`; the current checkout is dirty and 273 commits ahead of `origin/main`; the current
  cache has 92/92 configured assets but 72 stale required windows.
- **Requirements:** one writer per bin across processes; stale lock recovery must be bounded and ownership-
  checked; no historical shrink; central services must force `SOVEREIGN_RUNTIME_MODE=cloud-compute` and
  `LIVE_TRADING=false`; the host bind stays loopback unless it is a concrete private/VPN address; the
  updater refuses dirty or divergent Git state, serializes deployments, builds before replacing services,
  starts only `web` and `backfill`, and verifies local health; runtime storage remains host-mounted.
- **Safety constraints:** preserve all unrelated dirty-tree changes until reviewed; use explicit Git staging;
  no destructive cache operation; no public `0.0.0.0` host bind; no live-trading profile; no direct main-agent
  external polling; external provider data must pass the repository's structured air-gap rule.
- **Handoff:** if no target Docker authority is available, the first external action is to provision Docker
  Compose on the chosen private host, clone the pushed commit, supply a server-only `.env`, run the preflight,
  and execute the central updater while keeping port 8787 behind an SSH tunnel or private VPN.

## Ranked batches

### Batch 1 - Cross-process time-series write serialization

- **Objective:** make append and overlap writes to one symbol/timeframe mutually exclusive across processes.
- **Why now:** this is the only confirmed data-loss risk in the proposed one-host polling design.
- **Source:** `workspace/DEV_REVIEW.md` P1 concurrency finding and
  `shared/lib/market/validation.js` `tryAppendBin` / `mergeWriteBin` path.
- **Expected score movement:** runtime safety and data preservation.
- **Files:** `shared/lib/runtime/file_lock.js`, `shared/lib/market/validation.js`,
  `tests/scripts/data/cache/ts_merge_write.test.js`.
- **Verification:** focused ts-merge suite with visible final row/count evidence, including a child blocked by
  a held production lock and concurrent append/append plus append/merge unions.

### Batch 2 - Central runtime separation and deployment truth

- **Objective:** make the ordinary central stack data/research-only and require explicit opt-in for the paper bot.
- **Why now:** broad `docker compose up` currently includes a bot and inherits the full environment, which is
  inconsistent with the requested central poller/read-only boundary.
- **Source:** `infra/docker/docker-compose.yml`, `infra/docker/DEPLOY.md`, and
  `shared/lib/brokers/capabilities.js` cloud-compute execution block.
- **Expected score movement:** contract truth, runtime safety, and documentation alignment.
- **Files:** `infra/docker/docker-compose.yml`, `.env.example`, deployment guides, deployment contract test.
- **Verification:** deployment manifest contract proves central runtime mode, live=false, opt-in paper profile,
  loopback default, explicit `web backfill` commands, and persistent storage mounts.

### Batch 3 - Fail-closed host preflight and updates

- **Objective:** let a developer machine push code while the central host accepts only clean fast-forward updates
  and recreates the single supported stack under a deployment lock.
- **Why now:** the current manual `git pull` / broad Compose instructions can deploy a dirty/divergent tree or
  start unintended services without proving toolchain, bind, token, disk, or health prerequisites.
- **Source:** `infra/docker/DEPLOY.md`, current Docker probe failure, and current dirty/ahead Git evidence.
- **Expected score movement:** deployment reproducibility, false-health prevention, and artifact hygiene.
- **Files:** `backend/scripts/ops/central_host_preflight.js`, `infra/docker/update-central-host.sh`, tests, docs.
- **Verification:** pure preflight unit cases, shell syntax, static deployment contract, a no-network local
  preflight report, and Docker Compose validation when the host provides a usable daemon/plugin.

### Batch 4 - Reproducible repository and runtime proof

- **Objective:** turn the reviewed working-tree proof into pushed commit proof, then validate the chosen host.
- **Why now:** a central clone cannot reproduce uncommitted changes, and `origin/main` is currently 273 commits
  behind the tested local branch.
- **Source:** `git status`, `git rev-list --left-right --count origin/main...HEAD`, and session-87 verification.
- **Expected score movement:** clean-clone reproducibility and operational confidence.
- **Verification:** focused tests, strict Node/API/contracts/secrets, native CTest, frontend/gateway/MCP builds,
  hygiene/diff checks, clean archive smoke, logical commits, fast-forward push, central preflight/health, and a
  post-poller integrity summary. Provider catch-up is not complete until freshness is green on the actual host.

## Acceptance criteria

1. Two production writers cannot enter one bin's append/merge critical section simultaneously.
2. Concurrent test writers produce the exact timestamp union with correct bin/meta counts and no lock residue.
3. Default central Compose commands start only `web` and `backfill`; `bot` requires an explicit `paper` profile.
4. Every central service forces non-live cloud-compute mode; port 8787 remains loopback/private-only.
5. Preflight returns nonzero for public binds, live mode, blank API token, dirty Git, missing Compose, or
   inadequate disk; its JSON output contains no secret values.
6. The updater uses a deployment lock, fast-forward-only Git, explicit services, storage-preserving Compose
   recreation, and local health verification.
7. The pushed commit reproduces the broad test/build matrix from a clean archive.
8. Runtime completion requires Docker health and data integrity with zero unexplained grain; live trading and
   schema-v3 promotion remain explicitly unapproved.
