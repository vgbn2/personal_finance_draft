# Global Market Monitor - Mass-Implement Plan

Status: active; Batches 1-4 are committed through `883681fd`; Batch 5 is committed as the 2026-07-27 session
closeout; Batch 6 remains.

## Objective

Build a loopback-private, read-only Global Market Monitor for every configured price-bearing instrument.
Each row must show the latest canonical value, source, exact observation time, age, freshness state, and
update/provider state. The UI and CLI must make stale, missing, degraded, and updating data visible without
claiming tick-by-tick live pricing or enabling execution.

Global means the complete configured instrument universe, not every instrument available on the internet.

## Current evidence

- BTCUSDT has more than four million 1-minute rows; a refresh must not deserialize the entire bin.
- `shared/lib/market/validation.js` owns `familyFreshnessThresholdMs()` and `readTsIndexSince()`.
- `shared/lib/market/coverage.js` owns cheap coverage/freshness checks.
- `backend data summary` can read the shallow cache and report zero BTC bars while deep canonical data exists.
- `QuoteHealthPanel.tsx` shows provider-level health, not one row per configured instrument.
- `backfill_daemon.js` owns the configured writer universe and emits cycle status.
- The current container stack has web/backfill/bot/host-health/host-backup running; portfolio-monitor is
  restarting on an Alpaca 401; Polymarket research is not configured and remains off.

## Contract

Each price row contains:

```text
instrument_id, symbol, display_name, family, market, base_timeframe,
value, value_kind, currency_or_unit, provider, observed_at, age_ms,
freshness_threshold_ms, expected_next_at, freshness_state,
provider_state, update_state, last_update_attempt_at,
last_update_error, record_count, source_mode
```

`freshness_state` is exactly one of `fresh`, `delayed`, `stale`, `missing`, or `invalid`.
`provider_state` is independent: `reachable`, `degraded`, `unreachable`, or `unknown`.
`update_state` is independent: `idle`, `queued`, `running`, `succeeded`, or `failed`.

Freshness boundaries use the existing family/timeframe threshold:

- fresh: age <= 50% of threshold
- delayed: age > 50% and <= 100% of threshold
- stale: age > threshold
- missing: no valid canonical value
- invalid: value, timestamp, identity, or integrity validation fails

Counters for freshness must reconcile exactly:

```text
fresh + delayed + stale + missing + invalid = price_bearing_total
```

Use “latest price” or “last known price.” Never label a stale cached value “live.”

## Ranked batches

### Batch 1 - Constant-memory latest-record reader

Objective: read one verified tail record per instrument without loading full history.

Why now: BTC alone makes full-bin reads too expensive for a global refresh.

Sources: `shared/lib/market/validation.js`, `shared/lib/market/coverage.js`, segment integrity helpers.

Work: add a canonical `readLatestTsRecord()` abstraction; decode only the final valid record; verify
metadata, timestamp, finite value, identity, file length, checksum, and active segment membership. Preserve
canonical storage as default and keep segment mode disabled.

Edge cases:

- Trigger: missing/empty/truncated/corrupt bin. Expected: `missing` or `invalid`, never a fabricated zero.
- Trigger: active segment missing or checksum mismatch. Expected: fail closed with source error.
- Trigger: concurrent append. Expected: read a consistent prior record or retry boundedly; never parse a
  partial tail.

Proof: synthetic binary fixtures, a large-bin bounded-read test, and a real BTCUSDT tail probe.

Expected movement: runtime safety, contract truth, verification.

### Batch 2 - Canonical universe and snapshot owner

Objective: produce one deterministic snapshot for every configured price-bearing instrument.

Why now: writer, API universe, shallow cache, and monitor must not drift into separate symbol lists.

Sources: `backend/cli/commands/data/backfill_daemon.js`, market configuration, existing freshness policy.

Work: reuse/extract one configured-universe resolver; emit one row per instrument at its base timeframe;
keep non-price metrics in a separate `not_price_bearing` count; evaluate the three state dimensions; include
snapshot generation time, policy version, storage mode, and snapshot duration.

Edge cases:

- Trigger: duplicate symbol across families. Expected: unique `instrument_id`, no counter double-counting.
- Trigger: stale value while a writer is running. Expected: stale row plus independent `update_state=running`.
- Trigger: market closed or calendar unknown. Expected: expose the schedule basis; do not silently call it live.
- Trigger: unsupported/non-price family. Expected: explicit exclusion reason, not a fake price row.

Proof: fixture universe with duplicates, non-price entries, mixed families, stale/missing rows, and exact
counter reconciliation.

Expected movement: contract truth, path clarity, duplication reduction.

### Batch 3 - Truthful API and CLI parity

Objective: expose one read-only machine and terminal interface with identical snapshot data.

Sources: `backend/cli/commands/tools/backend.js`, `backend/api/server/routes/index.js`,
`backend/api/server/services/cli_executor.js`.

Work: repair the default data-summary path to use canonical time-series data; add `market monitor --json`
and bounded watch mode; add protected `GET /api/market/monitor`; reuse existing read-only capability;
support filters/pagination while always returning global counters; use a bounded 5-second snapshot cache.

Edge cases:

- Trigger: unauthenticated/protected request. Expected: existing 401/403 contract, no data leak.
- Trigger: provider or writer failure during read. Expected: degraded response with last-known state,
  never a successful-looking empty response.
- Trigger: concurrent API clients. Expected: bounded cached snapshot work, no provider calls or writes.
- Trigger: invalid filter/pagination. Expected: deterministic validation error and bounded limits.

Proof: API auth tests, CLI/API parity fixtures, shallow-cache/deep-index BTC regression, zero-write probe.

Expected movement: contract truth, verification, API clarity.

### Batch 4 - User-facing global display

Objective: turn the provider-only quote panel into an operator-readable global monitor.

Sources: `Frontend/dashboard/src/components/panels/QuoteHealthPanel.tsx`, `App.tsx`, `lib/api.ts`,
responsive dashboard tests.

Work: add summary counters for configured/fresh/delayed/stale/missing/provider failures/updating; show a
sortable/filterable table with symbol, value, family, source, observed time, age, freshness, and update
state; display snapshot age; preserve provider health beneath instrument health; refresh every 10 seconds,
pause when hidden, and allow manual refresh.

Edge cases:

- Trigger: loading, empty, stale snapshot, API error, unauthorized session, malformed row. Expected: explicit
  text state and retry path, never an empty green panel.
- Trigger: narrow viewport or long symbol/source. Expected: internal table scroll with no page overflow.
- Trigger: stale row. Expected: “last known” label plus timestamp and age.
- Trigger: counter mismatch. Expected: visible degraded state and diagnostic count.

Proof: component/API contract tests and browser checks at 360, 768, and 1440 pixels.

Expected movement: user-visible truth, UX clarity, doc alignment.

### Batch 5 - Service heartbeat observability

Objective: show whether a stale market value is caused by schedule, writer failure, provider failure, or
service restart without giving the web container Docker-socket access.

Sources: backfill status output, paper bot loop, portfolio monitor, host-health, and backup services.

Work: atomically write small sanitized heartbeat files with service, instance, state, heartbeat, last
success, next run, attempts, and sanitized error; expose them in a separate service-health section.

Edge cases:

- Trigger: heartbeat absent or older than its service threshold. Expected: service stale/unavailable.
- Trigger: repeated authentication failure such as current Alpaca 401. Expected: degraded service state,
  not a market-price failure.
- Trigger: restart/interrupted atomic write. Expected: preserve last valid record or mark unavailable.
- Trigger: secret-like error content. Expected: sanitize before persistence/API/UI.

Proof: atomic-write, restart, TTL, sanitization, and simulated 401 tests; verify no Docker socket mount.

Expected movement: false-health reduction, runtime safety, operational observability.

### Batch 6 - Stress, regression, and operator runbook

Objective: prove the monitor is cheap, truthful, reproducible, and understandable during failure.

Work: stress 100 and 1,000 synthetic instruments; record latency/heap/bytes-read; add contract tests;
document states, commands, thresholds, stale-data triage, writer failures, restart loops, and the distinction
between cached freshness and streaming quotes.

Edge cases:

- Trigger: high instrument count or repeated refresh. Expected: bounded latency/memory and no full-bin loads.
- Trigger: disk-full, thermal pressure, or provider rate limits. Expected: degraded status and preserved data.
- Trigger: rollback to an older artifact. Expected: monitor fails closed if schema is incompatible.

Proof targets: 100 rows <=250 ms and <=25 MiB transient heap; 1,000 rows <=2 s and <=64 MiB; no provider
request or write from monitor reads.

Expected movement: verification, artifact hygiene, documentation alignment.

## Verification gate

Start with Batch 1 and the BTC deep-index regression. Then run the focused monitor tests, API/contracts,
frontend build/responsive checks, secrets, hygiene, diff integrity, and the full host-capable Node suite.
Use Compose static validation only until a separately approved runtime qualification step.

## Safety and non-goals

- Keep web loopback/private and read-only.
- Do not add provider polling, execution, public exposure, Docker-socket access, or new credentials.
- Do not enable `SOVEREIGN_TS_STORAGE=segments` before its separate storage qualification gates pass.
- Preserve all existing history and backups; no destructive migration or cleanup is part of this plan.
- Do not infer host, recovery, backup, rollback, MCP, or soak readiness from monitor tests.

## Batch 1 implementation checkpoint - 2026-07-27 session 106

Batch 1 is committed at `b1816b94`. `readLatestTsRecord()` now returns `null` only for genuinely missing,
empty, or valid dead-marker state; valid data returns one `{ record, sourceMode }`; corrupt, unsafe, or
persistently changing state throws an explicit integrity error.

Canonical reads open regular files without following symlinks, validate metadata identity and count, require an
exact file length, decode at most two tail records, reject non-finite/non-monotonic tails, and retry boundedly
when append/rename publication changes the header, size, or metadata. Active segments validate manifest identity,
regular-file ownership, exact length, SHA-256, first/last range, finite values, and provider precedence while
hashing in 64 KiB chunks. Segment mode remains disabled.

Additional edge cases proved: unsafe timeframe traversal, canonical-bin and manifest symlinks, metadata identity
collision, concurrent canonical append, mixed canonical/segment timestamp conflicts, and corrupted active
segments. The canonical format has no persisted full-file checksum, so full canonical checksum verification is
explicitly deferred rather than adding an O(file-size) global-refresh cost or an unapproved format migration.

Evidence:

- Synthetic 200,000-row canonical bin: less than 4 KiB requested by the latest-reader path.
- Real BTCUSDT 1m: 4,067,702 records / 195,249,704 bytes; 294 requested bytes, 4 reads, 2.382 ms cold.
- Repeated real probe: 100 reads in 10.211 ms total, 0.102 ms average, bin/meta size, inode, and mtime unchanged.
- Host-capable contracts: 96/96 pass.
- Host-capable aggregate: 936 total / 932 pass / 0 fail / 4 intentional skips.
- Clean committed `HEAD` archive: focused latest-reader and segment regressions 2/2 pass.
- Secrets: 860 tracked files / 0 violations; hygiene, skill validation, mirror parity, and diff checks pass.

No provider poll, data write, runtime/profile change, bot cycle, order, public exposure, migration, or promotion
occurred.

## Batch 2 implementation checkpoint - 2026-07-27 session 107

Batch 2 is committed at `a65f907a`. `config/markets/data_sources.yaml` remains the canonical configured-symbol
registry. The backfill writer and monitor now resolve that registry through one shared owner, including one
base-timeframe/provider policy, exact `family:symbol` identities, deterministic ordering, and explicit
unsupported/non-price exclusions. Existing Yahoo provider symbols were moved into one shared translation table;
they are not a second configured universe.

The read-only snapshot owner emits one row per supported configured price instrument with independent
freshness, provider, update, and market-schedule states. It fails individual corrupt/future/identity-mismatched
records closed as `invalid`, keeps missing separate, preserves stale while an update is running, exposes unknown
calendar basis, and reconciles freshness counters exactly. Canonical latest reads now return the already-verified
header count; bounded segment/merged reads report an honest null count where exact overlap deduplication would
require full materialization.

Current-config evidence:

- 89 supported price rows: crypto 18, equities 41, indices 11, commodities 9, and FX 10.
- 44 configured price entries are explicit unsupported exclusions; 93 configured non-price coordinates are
  counted separately.
- One read-only real snapshot completed in 59 ms: 1 fresh, 51 delayed, 36 stale, 1 missing, 0 invalid. Provider
  states remained unknown and update states idle because Batch 2 does not yet integrate heartbeat/provider
  context.
- Focused universe/storage/backfill tests pass; contracts pass 101/101; aggregate Node passes 941 total /
  937 pass / 0 fail / 4 intentional skips; tracked secrets pass 863/0; hygiene and diff checks pass.
- Clean committed archive focused tests pass 3/3.

Security post-review found no open P0/P1. Malformed symbols are excluded before filesystem path construction;
latest-record identity, timestamps, finite values, and integrity failures fail closed; provider/update enums are
bounded; raw update errors are not echoed. The new shared owners contain no provider, network, process, or write
primitive. API/auth/UI/runtime integration remains outside this batch.

### Deferred symbol-registry database candidate

The suggestion to replace config arrays and provider-symbol code with a symbol database is recorded as a
roadmap feature, not an in-batch migration. A later design pass should compare the current version-controlled
YAML registry with a local SQLite registry carrying stable `instrument_id`, aliases, provider symbols, market,
base timeframe, schedule policy, enabled state, and schema version.

Acceptance gates before migration: dry-run import with zero identity loss; writer/monitor universe parity against
the current registry; explicit collision and unsupported reports; deterministic export for review; backup,
rollback, and old-artifact compatibility; no ts-index rekey or destructive data rewrite. Remote/shared database
hosting, automatic internet discovery, provider polling, and live symbol mutation are out of scope. Keep YAML as
the source of truth until those gates are approved and verified.

## Batch 3 implementation checkpoint - 2026-07-27 session 108

Batch 3 is committed at `8322adfd`. One shared service now validates filters/pagination, caches
one unfiltered snapshot for at most five seconds, deduplicates concurrent refreshes, preserves global counters
across every page, and returns a sanitized degraded last-known snapshot when refresh fails. The CLI command
`market monitor` and protected `GET /api/market/monitor` use the same payload adapter; bounded watch mode defaults
to 10-second intervals and 60 iterations.

The default `backend data summary` path now reports canonical ts-index coverage plus the verified latest record
without materializing history. Explicit `--input` behavior remains available behind the existing privileged
file-override API gate. A real BTCUSDT probe reported 4,067,940 canonical 1m rows rather than a shallow-cache
zero, and mutated no data.

Security and edge-case proof:

- The API route requires `data.read`; missing/malformed credentials return 401 and insufficient capabilities
  remain 403 through the existing access policy.
- Unknown query fields, malformed symbols/enums, `limit` outside 1-100, and `offset` outside 0-100000 return
  deterministic validation errors. Monitor queries accept no path or URL.
- Filter-varied and concurrent clients reuse one global snapshot; a failed refresh is throttled for the same
  cache window and exposes no raw error/path/token text.
- Canonical fixture stat probes prove no bin/meta size, inode, or mtime mutation. New monitor source contains no
  provider/network/process/write primitive.

Evidence:

- Host-capable contracts: 108/108 pass.
- Host-capable aggregate: 948 total / 944 pass / 0 fail / 4 intentional skips.
- One intermediate compact aggregate run hit two unrelated dashboard timing flakes; the exact file passed 7/7
  immediately, and the final aggregate was green at the counts above.
- Tracked secret scan: 863 files / 0 violations; direct new-production-source scan found no credential pattern.
- Syntax, repository hygiene, and `git diff --check` pass.
- The committed archive passes the new monitor/summary tests 7/7 before dependency-bound files load and passes
  all four focused files when using the checkout's installed root dependencies. A fresh install remains a
  separate gate.

No provider poll, data write, runtime/profile change, bot cycle, order, public exposure, symbol-database
migration, segment enablement, destructive action, or promotion occurred.

## Next-session first action

Run the mass-implement preflight for Batch 5 service heartbeat observability. Keep provider polling changes,
market-data writes, symbol-database migration, public exposure, and segment enablement outside Batch 5.

## Batch 4 implementation checkpoint - 2026-07-27 session 109

Batch 4 is committed at `883681fd`. The Quote Health view now uses current browser authentication to read the
canonical global-monitor API, fetches all pages within a 100,000-row hard bound, rejects inconsistent pagination
or snapshot identity changes, and validates rows plus freshness/provider/update counter reconciliation before
rendering.

The dashboard shows configured/fresh/delayed/stale/missing/provider-failure/updating counters, snapshot age,
sortable/filterable instrument rows, explicit last-known wording, manual retry, and independent provider-level
context beneath instrument truth. Ten-second refresh work is skipped while the document is hidden and duplicate
in-flight requests are suppressed.

Loading, empty, stale, malformed, duplicate, counter-mismatch, unauthorized, network/API failure, long labels,
and narrow viewport states fail visibly. Malformed and duplicate rows are excluded rather than rendered; stale
or failed refreshes preserve last-known data with a degraded banner. React text rendering is used throughout,
raw backend error strings are not displayed, and there is no privileged browser token fallback.

Evidence:

- Focused dashboard model/security tests: 4/4 pass.
- Host browser production-build checks: 10/10 pass at 360, 768, and 1440 pixels.
- Frontend TypeScript and production build pass.
- Host-capable contracts: 112/112 pass.
- Host-capable aggregate: 952 total / 948 pass / 0 fail / 4 intentional skips.
- Secret scan: 866 tracked files / 0 violations; hygiene and diff checks pass.

No provider poll, writer/data mutation, runtime/profile change, bot cycle, order, public exposure,
symbol-database migration, segment enablement, destructive action, or promotion occurred. Fresh installation,
service heartbeat truth, deployment, recovery, MCP, rollback, and soak qualification remain open.

## Deep blast-through audit - 2026-07-27 session 110

The prior Batches 1-4 were re-audited in `full` / Hard Reading Mode against the committed range
`b1816b94..883681fd`, the current source, tests, deployment manifest, and read-only integrity output.

Confirmed Batch 5 findings:

1. **P1 - paper-loop status is not an atomic/sanitized heartbeat.** `shared/lib/runtime/run_loop.js:21-30`
   rewrites `run_status.json` directly, and `:49-64` stores raw exception messages. An interrupted write can
   leave malformed status, and authenticated status consumers can receive provider/token/path text.
2. **P1 - backfill status crosses the monitor boundary with raw outcomes.**
   `backend/cli/commands/data/backfill_daemon.js:72-76,577-582` publishes atomically but stores nested outcome
   errors; `backend/api/server/services/client_snapshot.js:146` returns `last_outcome` without a sanitized
   projection. The writer heartbeat must publish only bounded fields and stable error codes.
3. **P1 - monitoring services have no durable heartbeat owner.** `host-health` and `host-backup` in
   `infra/docker/docker-compose.yml:118-165` emit stdout and exit on failure, but do not persist attempt,
   success, next-run, or sanitized error state. A missing file alone cannot distinguish never-started, interrupted,
   or repeatedly failing service state.

The prior monitor reader, configured universe, snapshot, CLI/API parity, authentication, dashboard validation,
pagination, and viewport contracts remain green and have no confirmed P0/P1 in this pass. `backend integrity
--json` remains read-only evidence only: 92/92 cached, 14 policy-stale required windows, DCS 0.954348, and
`ok:false`.

## Batch 5 plan gate - sanitized service heartbeat observability

### Batch 5A - shared heartbeat contract and atomic store

- **Objective:** create one small local-file heartbeat owner with atomic publication, schema validation, TTL
  classification, and stable sanitized error codes.
- **Why now:** the three P1 findings above are competing status formats and can expose torn/raw failure state.
- **Source:** `shared/lib/runtime/run_loop.js`, `backend/cli/commands/data/backfill_daemon.js`,
  `infra/docker/docker-compose.yml`, and the Batch 5 contract in this plan.
- **Expected movement:** runtime safety, verification, path clarity, false-health reduction.
- **Edge cases:** missing/invalid/expired heartbeat -> `unavailable`; interrupted temp publication -> previous
  valid file remains readable; repeated 401/token/secret text -> stable `authentication_failed` code only;
  concurrent writers -> unique temp files and last atomic rename wins; owner is heartbeat store, proof is focused
  fault-injection tests.
- **Security:** no auth or provider call is added; sanitize before persistence, reject path/service traversal,
  expose no token, URL, PID liveness claim, stack, or raw error; prove with secret-pattern negative tests.
- **Verification:** unit tests for atomic write/read, malformed JSON, TTL, sanitization, and concurrent publication.

### Batch 5B - wire the five service owners

- **Objective:** publish heartbeats for `paper_bot`, `backfill`, `portfolio_monitor`, `host_health`, and
  `host_backup` with service-specific cadence/TTL and last-success/attempt/next-run fields.
- **Why now:** current host-health/backup are stdout-only, while paper/backfill status is not a safe shared contract.
- **Source:** `backend/cli/commands/runner/run.js`, `shared/lib/runtime/run_loop.js`,
  `backend/cli/commands/data/backfill_daemon.js`, `backend/cli/commands/operational/portfolio_monitor.js`,
  `backend/scripts/ops/host_health.js`, `backend/scripts/ops/host_backup.js`, and Compose loop commands.
- **Expected movement:** operational observability, runtime safety, contract truth.
- **Edge cases:** one failed cycle retains last success and marks degraded; graceful stop records stopped rather
  than deleting state; once-mode publishes completion; service restart preserves prior valid record and updates
  instance identity; host-health/backup command failure still publishes sanitized failure before exit.
- **Security:** no Docker socket, credential, provider, or execution capability; only mounted storage heartbeat
  directory is written; prove Compose has no socket and service code has no network/process expansion beyond its
  existing owner.
- **Verification:** focused owner tests, Compose static contract, simulated 401, interrupted write, restart, TTL,
  and no-Docker-socket checks.

### Batch 5C - separate authenticated service-health surface

- **Objective:** expose a bounded `data.read` service-health payload and render it separately beneath canonical
  instrument/provider health without changing freshness counters.
- **Why now:** stale prices must distinguish writer/provider/service failure without falsifying the price row.
- **Source:** `backend/api/server/routes/index.js`, new system service-health route/service, and
  `Frontend/dashboard/src/components/panels/QuoteHealthPanel.tsx`.
- **Expected movement:** user-visible truth, contract parity, doc alignment.
- **Edge cases:** absent/stale/malformed files -> explicit unavailable/degraded card; mixed service states do not
  change instrument freshness; bounded row count and fixed safe errors; unauthorized remains 401/403.
- **Security:** retain existing bearer/capability policy; no raw heartbeat errors or private paths in API/UI;
  prove auth, sanitization, bounded output, and React text rendering.
- **Verification:** API contract, CLI/API if a CLI surface is added, dashboard model/UI tests at 360/768/1440,
  and no-write/no-provider probe.

### Batch 5 pre-implementation gate

**GO WITH FIXES:** the three P1 defects are confirmed but are fully inside the approved Batch 5 scope. No other
P0/P1 was found in Batches 1-4. Intended files are limited to the Batch 5A-5C owners above plus focused tests,
Compose/docs contracts, and this plan/state record. No provider polling, canonical-data write, symbol-registry
migration, segment enablement, public binding, live execution, Docker-socket mount, or operational-qualification
claim is authorized. The first code edit must implement Batch 5A and prove its focused tests before wiring owners.
