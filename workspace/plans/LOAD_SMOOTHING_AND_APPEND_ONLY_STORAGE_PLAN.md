# Load Smoothing and Append-Only Storage Plan

Status: Batch 1 and the compatibility portion of Batch 3 implemented; adaptive host thresholds,
durable queue state, compaction CLI, and storage budgets remain open
Date: 2026-07-26

## Objective

Run backfill polling as a paced, resumable workload that shares provider and machine capacity over time,
while preserving historical storage and reducing SSD write amplification during mass backfill.

Assumption: “instead” means new observations should be written as immutable segments or generations and
merged through a manifest/read layer, with verified compaction later. It does not mean retaining unlimited
duplicate copies forever; that would require an explicit storage budget and retention policy.

## Current evidence

- `backend/cli/commands/data/backfill_daemon.js` runs Binance, Alpaca, and Yahoo lanes concurrently with
  default caps of 3, 3, and 5 jobs. The 1-minute lanes have hard ceilings to limit V8 memory use.
- The daemon starts the lanes immediately, fills each pool, and then sleeps for the full interval. There is
  no warm-up, global start-rate budget, CPU/temperature feedback, or jittered job schedule.
- `shared/lib/market/validation.js` has an append fast path for non-overlapping suffixes, but overlapping
  windows merge into a newly allocated full binary buffer and atomically replace the current `.bin` file.
- `backend/cli/commands/data/data_rollup.js` intentionally clean-rebuilds timeframes above daily by removing
  and recreating derived bins. This is logically safe but not an immutable historical write model.
- The live rehearsal measured a backfill process above one full CPU core and a short-lived system load burst;
  the existing controls are concurrency bounds, not gradual load sharing.

## In scope

### Batch 0 — instrumentation and baseline

- Add per-job and per-cycle metrics: poll-start time, provider, lane, queue wait, active jobs, fetch bytes,
  incoming rows, existing-bin bytes, output bytes, append versus rewrite, rollup bytes, and failure/backoff.
- Record SSD write amplification and peak resource observations without changing persistence semantics.
- Establish baseline runs for suffix-only incremental updates, overlapping incremental updates, and mass backfill.

### Batch 1 — paced scheduler

- Replace immediate pool filling with a central queue and lane-aware round-robin scheduling.
- Add a global poll-start budget and per-provider minimum spacing. Keep provider-specific concurrency caps as
  upper bounds, not targets.
- Add a warm-up ramp: begin with one active job per lane, increase only after a stable observation window,
  and stop increasing when the configured CPU, RAM, temperature, or disk-write budget is reached.
- Add bounded jitter to job starts so symbols do not synchronize into repeated bursts.
- Preserve resumability: every job has a durable state (`queued`, `running`, `succeeded`, `failed`, `retry_at`)
  and a restart-safe next-due time. A failed job must not block other lanes.

### Batch 2 — adaptive protection

- Default policy targets a configurable CPU utilization band rather than 100% saturation.
- Reduce active concurrency or pause new poll starts when any threshold is exceeded. Resume gradually after a
  cool-down window, with hysteresis so the scheduler does not oscillate.
- Suggested initial defaults, to be measured rather than treated as hardware truths:
  - target CPU: 45–60% total;
  - reduce concurrency: sustained CPU above 70%, package temperature above 75 C, RAM above 80%, or free disk
    below 20%;
  - pause new work: package temperature above 85 C, free disk below 15%, or repeated provider throttling;
  - resume only after 60 seconds below the lower threshold.
- Never use this controller to bypass provider rate limits or runtime safety policy.

### Batch 3 — immutable segment storage

- Introduce versioned, immutable segments per symbol/timeframe/date window rather than replacing the canonical
  `.bin` for every overlapping poll.
- Add a manifest containing segment path, coverage range, row count, provider priority, checksum, creation time,
  and schema version.
- New polls write a new segment or append only to a write-once segment. Existing segment files and checksums
  must remain unchanged.
- Reads merge visible segments by timestamp and provider priority, with deterministic duplicate resolution.
- Keep the current `.bin` reader as a compatibility path during migration; do not silently switch readers until
  parity is proven.

### Batch 4 — verified compaction and SSD policy

- Compaction is a separate, explicit maintenance operation. It writes a new generation, verifies row counts,
  checksums, coverage, and read parity, then atomically advances the manifest.
- Old generations are retained until verification succeeds and the configured retention window expires.
- No automatic deletion of old data. Any pruning requires a dry-run report, a minimum-free-space gate, an
  explicit retention policy, and a recoverable archive/backup path.
- Derived weekly/monthly bins should be generation outputs, not destructive `remove + rebuild` operations during
  normal polling.
- Add a storage budget: maximum segment age/count, maximum temporary compaction space, minimum free disk, and
  maximum write amplification per cycle. Stop safely when the budget is exceeded.

## Out of scope

- Live trading, public exposure, deployment timers, or changes to authentication/RBAC.
- Provider replacement or bypassing provider rate limits.
- Automatic deletion, unreviewed cache pruning, or indefinite duplicate-history retention.
- A full storage-format migration before baseline measurements and compatibility tests exist.

## Acceptance criteria

- No provider lane starts all jobs at once; the first cycle demonstrates a measured ramp and a bounded global
  poll-start rate.
- Sustained CPU, temperature, RAM, and disk thresholds trigger backoff; recovery is gradual and hysteretic.
- Restarting the daemon does not duplicate a completed job or lose a queued/failed job.
- Existing immutable segment hashes remain unchanged after new polls and compaction staging.
- Read results before and after segment migration are byte-equivalent for representative symbols/timeframes,
  including overlapping provider revisions and duplicate timestamps.
- Normal overlapping polling never replaces an old segment in place.
- Compaction can be interrupted and resumed without losing the previous manifest generation.
- SSD write amplification is measured and stays below an agreed budget; free-space checks fail closed.
- Focused scheduler, restart, rate-limit, segment, manifest, compaction-crash, parity, and disk-budget tests pass.

## Verification

1. Pure scheduler tests for lane fairness, ramp, jitter bounds, retry timing, hysteresis, and provider spacing.
2. Fake-provider integration tests with 89-job-scale queues and deterministic timestamps.
3. Storage tests for append-only segments, overlap resolution, checksums, manifest atomicity, interrupted
   compaction, and old-generation recovery.
4. One controlled laptop run with the foreground monitor, no live execution, and a fixed write budget.
5. Rerun API/contracts/full Node gates, hygiene, secrets, and a read-only integrity comparison.

## Implementation note - 2026-07-26

- `backfill_daemon.js` now uses a global poll-start pacer with warm-up spacing, bounded jitter, and load/RAM
  backoff. Per-lane concurrency remains an upper bound. `--poll-gap-ms`, `--warmup-jobs`,
  `--warmup-gap-ms`, and `--poll-jitter-ms` expose the pacing controls.
- `append_only_segments.js` provides immutable SOVT segments, atomic manifests, compatibility reads, cheap
  coverage, and explicit compaction that retains superseded files. Set `SOVEREIGN_TS_STORAGE=segments` only
  for a controlled parity run; canonical `.bin` output remains the default.
- Focused verification currently passes 16 backfill tests and 3 segment-storage tests. This is source and
  fixture proof, not a production soak or SSD write-amplification measurement.

## Safety and handoff

- Preserve the current dirty working tree; implement this plan in a separate reviewed batch.
- Keep the API loopback/private and runtime non-live.
- Do not enable segment mode for the active provider workload until read parity, recovery, free-space, and
  write-amplification gates are run on a disposable copy of storage.
- Next implementation action: add durable queued/retry state and a controlled compaction command with a
  minimum-free-space gate; do not add automatic deletion.
