# Global Market Monitor - Mass-Implement Plan

Status: active; Batches 1-2 implemented and committed on 2026-07-27, Batches 3-6 remain.

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
  937 pass / 0 fail / 4 intentional skips; tracked secrets pass 860/0; hygiene and diff checks pass.
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

## Next-session first action

Run the mass-implement preflight against Batch 3, then implement only truthful CLI/API parity over the committed
snapshot owner. Keep dashboard, service heartbeats, provider polling, data writes, symbol-database migration,
public exposure, and segment enablement outside that batch.
