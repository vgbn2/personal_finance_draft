# Project State - Sovereign Trading Platform

## 2026-07-28 ENV-1B3-A Compose contract closure

- TEST-1, ENV-1B2-A, and ENV-1B3-A are closed for working-tree source. Schema-3 environment policy now owns
  exact contracts for all seven Compose services and rejects unsafe, unknown, incomplete, or inconsistent rows.
- The central-environment preparer exposes a value-free projection report; focused contract verification passes
  13/13 and the final CPU-capped strict run passes 1,003 total / 999 pass / 0 fail / 4 intentional skips.
- Compose remains unchanged and all seven services still share the central `env_file`. Runtime isolation
  (ENV-1B3-B), broader direct-entrypoint projection, exact-commit/authenticated-CI proof, deployed-host,
  recovery, rollback, one-writer, and soak qualification remain open.
- Rotate the FRED credential and Polymarket private key exposed to the session tool transcript before reuse.

## 2026-07-28 mass-implement partial closure - environment and Polymarket boundaries

- ENV-1A is closed: environment-manifest schema 2 classifies 118 canonical entries / 138 names and aliases by
  class, profile, and surface. Browser inputs are exactly the three declared `VITE_*` names; server aliases were
  removed from dashboard source.
- ENV-1B1 is closed: explicit `SOVEREIGN_ENV_FILE` selection is exclusive, and tested projection primitives
  strip known forbidden names by surface/profile. This is not automatic entrypoint or Compose isolation.
- PM-1 is closed: public interactive Polymarket browsing performs no entry-time live auth or parent authorization
  mutation; Buy authorizes before credentialed access and submit receives only a scoped module-private grant.
  Cockpit portfolio evidence distinguishes credentialed account reads from cached/local state.
- Verification: host contracts 118/118; aggregate 979 total / 975 pass / 0 fail / 4 intentional skips;
  host-capable Polymarket preflight/CLI 48/48; dashboard type/build, secrets 900/0, hygiene, structure, and diff
  checks pass.
- ENV-1B2 entrypoint wiring, ENV-1B3 Compose projection, and SYNC-1 remain deferred. No real environment file,
  service, container, provider, canonical data, remote host, order, public bind, deletion, timer, or live mode
  changed.
- The ENV-1B2/B3 inventory now confirms 55 CLI commands plus API, MCP, dashboard-child, gateway, direct-script,
  and package boot paths; gateway and child launchers still inherit broadly, and all seven Compose services share
  one central `env_file`. The smallest safe next candidate is ENV-1B2-A projected child launch wiring for gateway
  and MCP only; direct boots, standalone scripts, and ENV-1B3 remain deferred pending fixture matrices.
- Production test truth is release-gated: host-capable strict source tests pass, but the current fresh-install
  run stopped before PASS, the verifier includes untracked files, and CI does not execute its five-root path.
  Treat it as worktree-snapshot evidence only until a versioned committed-archive/CI evidence protocol exists;
  deployed host, recovery, restart/rollback, one-writer, and soak remain distinct external qualification.
- The proposed combined source-only execution order is recorded in
  `workspace/plans/ENVIRONMENT_AND_PRODUCTION_EVIDENCE_MASS_IMPLEMENT_PLAN.md`: TEST-1 evidence truth first,
  ENV-1B2-A gateway/MCP projected children second, ENV-1B3-A service-key contract third, and ENV-1B3-B Compose
  projection remains NO-GO until the prior contract is verified and separately approved.
- The plan is now refined and implementation-ready but still unapproved/unstarted. TEST-1 has fixed
  `worktree_snapshot` versus `committed_archive` semantics, atomic schema-v1 pass/fail evidence, and an
  exact-commit/CI closure boundary. ENV-1B2-A requires exhaustive argument-sensitive gateway classification and
  structured least-privilege MCP denials. ENV-1B3-A uses environment-manifest schema 3 as the sole seven-service
  contract owner; actual per-service Compose injection remains ENV-1B3-B and requires separate approval.
- TEST-1 source implementation is now verified, reviewed, and closed in the working tree. The coordinator emits
  atomic schema-v1 evidence for distinct snapshot/archive modes, overwrites stale PASS before work, runs the
  five-root/CI surface, and defaults to `job_limit:2`; the canonical Node runner also defaults to two workers.
  Focused contracts pass 15/15; the bounded snapshot passes
  26/26 steps with native 30/30, API 25/25, contracts 118/118, structure 15/15, and aggregate 987/977/0/10.
  Exact-commit and authenticated-CI evidence remain open; no host/recovery/soak/live claim is implied.
- ENV-1B2-A is now verified, reviewed, and closed for working-tree source. Gateway launches are exhaustively
  classified as public/account/execution, receive frozen projected environments, cannot reload local env files,
  and fail closed without a launcher-supplied surface. All six direct gateway spawns consume `launch.env`.
  MCP children receive only the MCP projection; account/live/auto-trade/credential-derivation requests are
  denied before spawn. Manifest discovery is 120 entries / 140 names and aliases / 0 unclassified; focused
  sequential checks, a 250-iteration poisoned-parent stress test, MCP build, and host-capable two-worker
  `verify:strict` pass. Direct boots and Compose are not qualified.
- One diagnostic command printed a local FRED credential and Polymarket private key into the tool transcript.
  Those credentials must be rotated; no value is retained in workspace documentation.

## 2026-07-28 planning preflight - environment and remote mirror boundaries

- Mass-implement preflight refined the deferred environment/sync plans after independent development review.
- Existing central-host isolation is partly correct, but the default env loader can fall through from an explicit
  file to `.env.local`/`.env`, the gateway independently loads dotenv, and service naming alone does not enforce
  process authority. Implementation is NO-GO until a per-entrypoint capability matrix is approved.
- The rich-terminal `polymarket markets` path is source-confirmed to request live authorization before browsing
  and temporarily set execution authorization. The planned correction keeps browsing public and moves auth to
  Buy/Sell only; no gate was weakened in this planning pass.
- Remote sync Batch 1 is GO WITH FIXES after host/root/repository scope decisions. Deletion/mirror and scheduling
  remain NO-GO. No source, environment, secret, storage, runtime, remote, provider, or order state changed.

## Session 116 - private auth, combined engine, and qualification closeout (2026-07-28)

- Private-by-default API authorization is implemented. Human roles come from trusted server-side identity
  metadata; service API and MCP consumers use distinct salted-hash service principals with explicit
  capabilities. IP remains risk/audit metadata and never grants authority.
- The exact-asset combined research engine now composes cached schema-2 technical evidence with
  point-in-time macro evidence through CLI, protected API, and capability-gated MCP paths. Promotion and
  reviewed paper-intent endpoints use same-principal, hash-chained, idempotent records and never submit to a
  provider. Combined results remain `research_only:true` and `decision_ready:false`.
- A restricted CPI/US02YIELD refresh fetched 86 rows with zero provider errors, but 0/86 are point-in-time
  eligible: the adapter drops release/vintage metadata, the remote schema lacks `available_at`, and the
  scoped ingest snapshot is not the combined reader's global snapshot. Real combined output therefore
  remains truthfully degraded with `macro_observation_missing`.
- Fresh-source reproducibility is closed for this working-tree batch: isolated installs/builds passed,
  native CTest passed 30/30, environment discovery classified 138/138 names, source secrets found 0
  violations across 895 files, and the clean-export aggregate passed **972 total / 962 pass / 0 fail /
  10 intentional skips**.
- Authorized bounded data recovery refreshed 14 stale VN daily equity windows (172 records, 0 provider
  errors). Integrity is now `ok:true`, 92/92 cached, 0 policy-stale, and DCS 1.0. This proves configured
  cache health only, not remote persistence or operational readiness.
- Security release remains blocked: the read-only five-root advisory found 61 vulnerable package nodes
  (24 high, 11 moderate, 26 low, 0 critical). Real Supabase/RLS, remote MCP/SSH, backup/restore,
  restart/rollback, single-writer, and soak proof remain open; live execution and public exposure stay blocked.
- `HEAD` remains `80df461f`; this source proof is an uncommitted working tree combined with preserved
  pre-existing workflow changes, not a committed-release claim.

## Session 115 - deep blast-through + Global Market Monitor exercise (2026-07-28)

- Full Hard Reading audit and bounded feature exercise completed against `HEAD 80df461f` plus the preserved
  dirty workflow batch. Host aggregate is **960 total / 956 pass / 0 fail / 4 intentional skips**; focused
  monitor/API contracts are 4/4; host-capable dashboard browser checks are 10/10.
- Monitor CLI truthfully reports `degraded:true` with 19 fresh, 52 delayed, 17 stale, 1 missing, and 0 invalid
  rows. Read-only integrity remains `ok:false` with 14 policy-stale required windows, 9 cadence-plausible
  notices, 0 unexplained grain, and one RNDRUSDT exception; DCS remains 0.954348.
- Fresh-install reproducibility is still open: the nested API install reports the locked Supabase dependency
  missing, and 93 production env names versus 78 example-file names require alias/optional classification.
- No provider, canonical-data, runtime, trading, public, migration, destructive, or promotion action occurred.


## Session 114 - deterministic skill workflow implemented (2026-07-27)

- Canonical tracked inventory now contains nine complete skill packages with exact `.agents/skills` discovery
  mirrors, consistent UI metadata, and manifest-backed recursive hygiene.
- `session-orchestrator` owns boot/routing/closeout; `blast-through` is audit-only and mode-routed;
  `feature-exerciser` diagnoses before requesting implementation; `codex` owns bounded changes; and
  `mass-implement` owns approved broad batch state transitions.
- Host aggregate passes 960 total / 956 pass / 0 fail / 4 intentional skips; skill validation, mirror,
  structure, hygiene, secrets, focused CLI/API/dashboard exercises, and diff checks pass.
- This is uncommitted working-tree proof, not fresh-clone or operational qualification. No runtime, provider,
  canonical-data, trading, public, migration, destructive, or promotion action occurred.

## Session 113 - feature exercise workflow added (2026-07-27)

- Added and validated canonical `skills/feature-exerciser/SKILL.md`; `AGENTS.md` now invokes it for systematic
  current-feature use and verification.
- The skill requires a feature matrix, bounded/read-only exercises, evidence classification, and explicit
  separation from host/operational qualification.
- `.agents/skills/feature-exerciser` could not be created because the environment exposes that mirror read-only;
  mirror synchronization remains open when writable authority is available.
- No application code, provider poll, runtime, canonical-data, trading, public, migration, or promotion state changed.

## Session 110 boot - global market monitor Batch 5 queued (2026-07-27)

- Continuity boot revalidated `HEAD 15df68a2` and a clean working tree after committed global-monitor Batch 4.
- The next scoped objective is Batch 5 sanitized service-heartbeat observability; keep provider polling, canonical
  writes, public exposure, live execution, and operational-qualification claims outside that batch.
- `graphify-out` remains unavailable because the graphify command/module is not installed.
- Fresh-install and operational-qualification gates remain open; no code, runtime, provider, trading, public,
  migration, or data state changed during boot.

## Session 105 closeout - global market monitor plan (2026-07-27)

- Stored the deferred global monitor mass-implement plan at
  `workspace/plans/GLOBAL_MARKET_MONITOR_MASS_IMPLEMENT_PLAN.md`.
- The plan is global over the configured price-bearing universe, not BTC-only. It requires a constant-memory
  canonical tail reader, exact freshness/provider/update state separation, API/CLI/dashboard parity, service
  heartbeats, edge-case proofs, and bounded resource tests.
- Updated `skills/mass-implement/SKILL.md` and the ignored `.agents/skills` discovery mirror with the mandatory
  edge-case review protocol. Both copies match; skill validation, hygiene, and diff checks pass.
- Closeout source checkpoint before this batch: `8af72c2e feat: harden private paper runtime`. The next session
  starts with global-monitor Batch 1 and must not alter running container profiles as part of that first batch.
- Runtime was inspected, not changed: web healthy; backfill, paper bot, host-health, and host-backup running;
  portfolio-monitor restarting on Alpaca 401; Polymarket research off because its scope file is absent.
- Operational qualification remains open: stale-data recovery, fresh-clone proof, host login/SSH/MCP,
  backup/restore, restart/rollback, one-writer, and soak. Live execution and public exposure remain blocked.

<!-- BLAST-THROUGH AUDIT ANCHOR (read by the Recency-Ranked Audit Queue) -->
last_audited_commit: e0de66de
last_audit_date: 2026-07-24

## Mass-Implement Verification - 2026-07-23 session 95

- Revalidated the session-93 MCP, central-preflight, deployment, and documentation implementation without
  starting any provider, writer, container, timer, bot, order, or promotion path.
- Focused deployment/MCP/preflight/structure gate: **32/32 pass**. Full contract gate: **31/31 pass**.
- Canonical full Node suite: **859 total / 855 pass / 0 fail / 4 intentional skips**. The two API suites
  initially reported failures only because the restricted sandbox denied loopback bind with `EPERM`; the
  approved host-capable rerun passed both suites, and the full suite passed under the same capability.
- Batch-0 sealing remains incomplete: Git cannot create `.git/index.lock` because the host exposes `.git` as
  read-only. No staging or commit was performed, so the functional implementation remains working-tree proof,
  not committed-`HEAD` proof. Existing workspace/plans/research continuity artifacts were preserved.
- Next gate: restore writable Git-index authority, stage functional session-93 paths separately from continuity
  files, commit, then run clean-archive/fresh-clone verification. Keep the Lenovo test-only and all live,
  provider, host, and promotion boundaries unchanged.

## Current Phase
Phase 9: Research-platform operational stabilization - ACTIVE; model/schema/live-capital promotion BLOCKED

## Blast-Through Triage - 2026-07-24 session 101

- Fast-reading triage reviewed the current `87d896de` working-tree paper/runtime batch without running a bot,
  provider poll, data mutation, container, timer, order, or promotion path.
- Confirmed two P1 paper-state defects: non-live bot exits can remove an aged `bot_state.json` position after
  the now-undefined CLOB client yields `fairPrice=0`, and repeated-token settlement uses an idempotency key that
  suppresses the second legitimate close. The latter was reproduced directly: accepted 0, duplicate settlement,
  one position still open, and cash 100.2.
- Read-only integrity is still `ok:false`: 92/92 cached, 87 required-window stale, 9 cadence-plausible notices,
  0 unexplained grain, and 1 declared exception. DCS remains 0.716, so promotion stays blocked.
- Focused paper-ledger passed 12/12, bot-risk passed 5/5, host-capable live guard passed 4/4, and hygiene/diff checks
  passed. The source batch is still uncommitted after `87d896de`.
- Next critical move: repair bot/ledger lifecycle ownership and tests, rerun focused plus aggregate host gates,
  then review/commit and prove a clean archive before any separate-host freshness work.

## Full Blast-Through Note - 2026-07-24 session 99

- Full Fast Reading Mode audit completed against `HEAD 111b1f6f` plus continuity-only working-tree edits.
- Read-only integrity remains **ok:false**: 92/92 cached, 87 required-window stale, 9 cadence-plausible grain
  notices, 0 unexplained grain, 1 declared exception. DCS remains **0.716**; no provider poll or data mutation ran.
- Archive extraction, canonical entrypoint syntax, and `npm run hygiene` passed.
- Aggregate Node verification is currently **122/138 pass / 16 fail** in both default and `--test-concurrency 1`
  runs, while representative failed files and the first six analysis files pass when run in focused groups. This is
  recorded as a test-isolation/order-dependence gate, not as 16 independently reproduced production defects.
- Current critical path is now: repair aggregate test isolation -> converge one paper event ledger and one runtime
  policy -> qualify the separate host and recover freshness -> prove host MCP/restart/soak. Combined actionable
  engine, real-money execution, and schema/model promotion remain blocked.

## Planning Note - 2026-07-24 session 100

- Refined the full audit into `workspace/plans/SESSION_100_DEEP_PRIVATE_PAPER_RECOVERY_PLAN.md`.
- Corrected the stale prior Batch 0 assumption: session-93 implementation is committed; current dirty state is
  four continuity/audit files, and `HEAD 111b1f6f` is one commit ahead of `origin/main`.
- New mandatory order: clean source boundary -> aggregate test-trust recovery -> unified runtime policy ->
  canonical replayable paper ledger -> architecture truth -> separate-host freshness/MCP/recovery -> read-only
  combined research -> release certification.
- Planning only. No production code, provider/data state, host, container, timer, bot, order, or promotion changed.

## Mass-Implement Note - 2026-07-24 session 100

- Sealed the continuity boundary in commit `87d896de`; source implementation after that commit remains in the
  working tree pending review/commit.
- Corrected the session-99 aggregate diagnosis. The 16-file failures were caused by the restricted sandbox
  denying child processes with `spawnSync ... EPERM`, not by repository test isolation or order dependence.
  Host-capable proof is green: two default runs and one serial run at 859 total / 855 pass / 0 fail / 4 skip
  before implementation; the final post-implementation JUnit run is 876 total / 872 pass / 0 fail / 4 skip.
- Added one fail-closed runtime policy owner and exposed its fingerprinted decision through CLI, API system
  status, and MCP's CLI-backed status. Permanent paper/test and unknown profiles cannot execute under poisoned
  live/auth/PIN/credential inputs. Paper paths do not initialize credentialed execution clients.
- Added the canonical internal Polymarket paper event ledger: checksum chain, sequence, idempotency keys,
  ownership-token lock, deterministic replay, atomic projection, crash recovery, settlement, and fail-closed
  legacy migration with read-only archive. Paper-run, runner paper loops, portfolio display, settlement, and
  restart replay use this owner.
- Batch 3 remains open: non-live `bot cycle` still writes `bot_state.json` as a separate projection and must be
  adapted to the canonical ledger before `private-paper-v1`. No provider polling, canonical data mutation, host,
  container, timer, bot cycle, live order, or promotion ran.
- Current gates: focused runtime policy 9/9; paper ledger 12/12; TypeScript no-emit pass; hygiene pass; canonical
  Node 876 total / 872 pass / 0 fail / 4 intentional skips. DCS remains the prior read-only 0.716 snapshot.

## Implementation Note - 2026-06-15 session 37 - unify rollup to ALL timeframes + custom-TF support (fixes crypto 1w:1)
- **Symptom:** `backend integrity` showed `1w:1` for every crypto symbol (BTCUSDT had `1d:3223`
  but a single weekly bar) and deep-backfill "made no difference." Root cause: the rollup chain
  was hard-capped at `4h` (`INTRADAY_TF_ORDER`/`rollupTargetsAboveBase`), so deep-backfill / daemon
  / `intraday-rollup` never derived `1d`/`1w`/`1mo`. Weekly only ever came from a manual
  `ingest --timeframe 1w` nobody ran.
- **Change (mass-implement, 4 batches):** ingest the base grain, derive *everything* above it.
  - `constants.js`: `parseTimeframe`/`parseTimeframeMs`/`bucketStartFor` — arbitrary `<n><unit>`
    timeframes (`2h`,`6h`,`8h`,`12h`,`3d`…) + **calendar-correct** weekly (Monday 00:00 UTC) and
    monthly (1st 00:00 UTC) bucketing (was fixed 7d-from-Thursday / 30d).
  - `ingest_market_data/index.js` `aggregateCandles`: buckets via `bucketStartFor`, resolves
    interval via `SUPPORTED_INTERVALS[tf] ?? parseTimeframeMs(tf)` (custom TFs work). The existing
    `deriveHighTfFromLocalDaily` inherits the calendar fix for free.
  - `data.js`: `FULL_TF_ORDER = [1m…1mo]`; `rollupTargetsAboveBase` returns the whole ladder above
    the base; **two-stage `rollupFromBase`** — stage 1 (interval ≤ 1d) from the intraday base bin
    (windowed via `sinceMs`); stage 2 (> 1d: 1w/1mo/N-day) clean-rebuilt from the **full 1d bin**
    (small, no OOM, immune to the daemon's day-aligned window → no partial weekly/monthly bars).
    Custom TFs routed by parsed interval (8h→from base, 3d→from daily) with no special-casing.
  - `intraday-rollup` accepts ANY coarser `--timeframes` (validated via parser); default = full
    ladder above 5m. Daemon needed no logic change (delegates to `rollupFromBase`).
- **Result (live, local, no network — `intraday-rollup --family <all>`):** crypto `1w` 1→462
  (BTCUSDT), `1mo` 107; weekly lands Monday, monthly on the 1st. Deep daily preserved everywhere
  via merge (SPY/SPX `1d` still 1998→2026; XAUUSD 2003→2026), each now with proper `1w`/`1mo`.
  Yahoo families keep authoritative native daily (SPX `1d:7000` unchanged); `1m`/`5m` untouched.
- **Cleanup:** quarantined the stray single-bar `XAUUSD_1m` stub (the phantom `1m:1`) to
  `storage/data/_quarantine_grain/` (reversible).
- **Decisions (user):** 5m floor for Yahoo-only families (no fabricated 1m — provider-bound:
  crypto=Binance, US-equities/ETFs=Alpaca; indices/raw-commodities/FX/VN-stocks=Yahoo→5m); make
  weekly/monthly calendar-correct; add custom-TF rollup.
- Suite **490 tests / 488 pass / 0 fail / 2 skipped** (the 2 skips are session-36 git-cross-check
  tests; +2 new rollup tests). All changes UNCOMMITTED on `feat/session-guard-intraday-rollup`
  (commit decision = user). Data (`storage/data/ts`) is gitignored — the rebuilt 1w/1mo live only
  in the working tree.

## Fix Note - 2026-06-15 session 36 - backfill-daemon OOM fixed at the root (streaming ts-index merge + windowed rollup + 1m-lane cap)
- **Symptom:** `backfill-daemon --once --concurrency 5` crashed with `FATAL ERROR: ... JavaScript heap
  out of memory` in the crypto lane (~4GB). Not corruption — integrity confirmed all bins intact.
- **Root cause:** each crypto incremental job materialized the entire multi-million-row 1m bin as JS
  objects **twice** — (1) the merge-write inside `ingestMarketData` (`writeTsIndex` read the existing bin
  via `readTsIndex` to merge-protect it), and (2) `rollupFromBase` read the whole 1m bin again to derive
  coarser TFs. BTCUSDT 1m = 3.08M records (each with a fresh ISO timestamp string); at concurrency 3-5
  across BTC/ETH/SOL this blew the ~4GB default V8 old-space.
- **Fix (3 parts):**
  - `shared/lib/market/validation.js`: `mergeWriteBin` — `writeTsIndex` now reads the existing bin as a
    **Buffer only** (external memory, off the V8 heap) and two-sorted-stream-merges with the incoming
    window, copying retained rows as raw 48-byte slices. Byte-identical semantics to the old object merge
    (merge-protect all TFs; higher-priority provider wins on tie else incoming; sort+dedup). Also kills a
    latent `push(...existing)` call-spread RangeError. New `readTsIndexSince` binary-searches the sorted
    bin and materializes only the tail.
  - `backend/cli/commands/data/data.js`: `rollupFromBase(...,{sinceMs})` re-derives only the recent
    window for incremental jobs (UTC-day-aligned start = lossless, no partial coarse bars).
  - `backend/cli/commands/data/backfill_daemon.js`: `LANE_MAX_CONCURRENCY={binance:3,alpaca:3}` clamps
    `--concurrency` on the 1m lanes (Yahoo honors full); windowed-rollup wiring + clamp note.
    `infra/docker/docker-compose.yml`: daemon `NODE_OPTIONS=--max-old-space-size=6144` (insurance).
- **Hard-tested:** new `tests/scripts/tests/ts_merge_write.test.js` — byte-equivalence (bin+meta) vs a
  FROZEN reference transcription of the original merge + 3 real deep bins; a child-process **OOM
  differential** (original child status 134 on a 1.3M-row bin under a 192MB cap, new child exit 0); both
  git-dependent checks are **skip-safe** so the suite survives commit. Live: `backfill-daemon --once
  --families crypto --concurrency 5` at the stock 4GB heap → 18/18 crypto, 0 errors, exit 0, 170s, peak
  RSS 2.68GB, ~3× faster per symbol; post-run integrity clean (bins grew, deep history preserved).
- Suite **488/488**. Committed on `feat/session-guard-intraday-rollup` (3 commits incl. the still-pending
  session-35 batch + docs).

## Data-Repair Note - 2026-06-15 session 35 - mixed-grain intraday corruption fixed + guard added
- **Found (user-reported via integrity output):** coarse data had leaked into intraday bins — e.g.
  `CORN_15m.bin` spanned 2002→2026 with ~1.5 bars/day (daily data mislabeled as 15m), frozen in place
  by `writeTsIndex` merge-protection. Proven by timestamp-gap inspection (early bars days apart, not
  15 min). Root class: old daily-aggregation/synthetic-LTF era leaking into intraday bins.
- **Scan (non-destructive):** early-window median bar-gap detector over all bins → 38 symbols / 83 bins
  corrupt: (a) 9 commodity/metal `15m`+some `4h` (2002 leak); (b) 13 orphan crypto alts (AAVE/DOT/UNI/
  MKR/MATIC/RNDR/… NOT in the active 18-symbol config) whose every intraday TF was synthetic daily.
- **Fix (user-authorized, REVERSIBLE):** quarantined corrupt/synthetic bins to
  `storage/data/_quarantine_grain/` (8.3M, gitignored — NOT deleted) and re-derived clean bins from the
  deepest clean divisor: commodity `15m`/`4h`←`5m`, VN-stock `4h`←`1h` (preserves the ~508d native 1h
  span). Also quarantined 4 stray `1m:5` stub bins (EURUSD/GBPUSD/USDJPY/XAUUSD). Verified: CORN 15m now
  3,733 real 15m bars (medianGap 15min, 2025→2026); NG 4h medianGap 240min; full re-scan 0 corrupt.
- **Guard (recurrence tripwire):** `isGrainSuspect(tf,count,firstMs,lastMs)` in coverage.js — cheap
  (head/tail only): flags an intraday bin spanning >2yr with density below per-TF floor (calibrated
  below legit p05). Wired into `backend integrity` (advisory `grain_suspect` flag + `total_grain_suspect`
  in JSON, yellow report line; non-gating). Verified 0 flagged across 941 live bins; catches the 2002
  leak shape, ignores honest-thin 4h + deep-dense 5m + native-deep 1h. Tested in coverage.test.js.
- Data lives in gitignored `storage/data/ts`; quarantine is reversible (move files back). Suite 471/471.

## Implementation Note - 2026-06-15 session 35 - deep blast: integrity 144× faster + marker fix + over-export scan
- **`backend integrity` optimized 57s → 0.4s (144×), output-identical.** The report looped
  `readTsIndex` over every (symbol×tf), loading whole bins (a 1m crypto bin ≈ 525k record objects)
  just to read count + first/last ts. Now uses `readCoverage` (header + two 8-byte reads). Extended
  `shared/lib/market/coverage.js` with `firstBarMs`. Proven equivalent over all **1009 real bins
  (0 mismatches)**; live run 57,069 ms → 396 ms, same ok:false/92 cached/4 stale.
- **Dead-symbol marker clobber fixed** (`data.js commandCryptoDeepBackfill`): the 0-bar not-found
  marker is now written only when no `.bin` exists, so a transient 0-bar fetch can't strip
  coordinate_id/config_*/derived_from off an existing sidecar. +2 regression tests in coverage.test.js.
- **Unused-code scan:** 94 `shared/lib` exports have no external importer, but only **1 is genuinely
  dead** — removed the redundant `generatePolymarketFeatures` alias in `polymarket_features.js` (real
  fn `buildPolymarketFeatureRows` stays). The other ~88 are alive internal helpers (over-exports), NOT
  dead logic. A bulk regex prune was attempted and **reverted**: an exported name often also lives in a
  second internal object literal (e.g. `bollingerBands` in the `IndicatorMethods` registry), so
  line-removal corrupted internal state and broke `indicators.manifest_parity.test.js`. Safe trimming
  needs AST-scoped editing; given zero importers the risk isn't worth it — left as DEV_REVIEW backlog.
- Suite **467/467** (was 465; +2). Anchor stays `e0cb6aa2` (changes uncommitted, pending user).

## Implementation Note - 2026-06-14 session 33 - repo-portability bundler (Ubuntu transfer)
- Added `scripts/dev/make_bundle.js` (+ `npm run bundle`): a repeatable `git bundle` generator so the
  old Ubuntu PC can `git clone` this repo with full history. **The git root is the CODEPTIT monorepo**
  (personal_finance_draft is a subdir), so a bundle is necessarily whole-repo — user chose monorepo.
- **Embedded-repo handling (the non-obvious part):** the monorepo has **22 embedded git repos**
  (gitlinks, NO `.gitmodules`), incl. `personal_finance_draft/backend/polymarket-cli` (51 commits). A
  plain `--all` bundle carries only their commit POINTERS, not contents → the bundler emits a companion
  bundle per populated embedded repo. Default `--embedded pfd` (only those under personal_finance_draft);
  `--embedded all` for all 22; `--embedded none` to skip.
- Output defaults OUTSIDE the working tree (`<gitRoot>/../portable_exports`) so it never bloats future
  bundles or trips `check_hygiene.js` (which flags untracked `*.bundle`/`*.zip`). Generates
  `bundle_manifest.json` + a generated `RESTORE_UBUNTU.md` (clone → npm install → build C++ → re-ingest).
- **Data does NOT need transferring:** `storage/data` (8.6 GB, gitignored) re-ingests on Ubuntu —
  crypto (Binance), indices/commodities/FX (Yahoo/Frankfurter), daily equities are all KEYLESS; only
  Alpaca equity intraday + macro extras need keys. Deep crypto backfill is multi-hour (USB-copy is the
  fast alternative).
- **Verified:** `npm run bundle` → `CODEPTIT-2026-06-14.bundle` (382.6 MiB) + polymarket-cli companion
  (242.7 KiB). Test-cloned into temp: HEAD `a4c85fe9`, all 4 branches, 58,076 files, pfd checks out,
  embedded restored (49 files/51 commits). `npm run hygiene` all-pass; `test:structure` 8/8.

## Fix Note - 2026-06-14 session 32 - ALL 7 suite fails fixed; suite 465/465 (first fully green since s12)
- The 7 long-standing "env-dependent" fails were **3 distinct root causes**, not one class:
  (1) **3 gateway tests** (polymarket auth-health/preflight, trade proposed-order) — `backend/gateway/
  node_modules/dotenv` was a CORRUPTED partial install (missing `config.js`/`package.json`/`lib/main.js`)
  → `import 'dotenv/config'` threw MODULE_NOT_FOUND, every gateway spawn exited 1. Reinstalled
  `dotenv@^17.4.2` (gitignored — no repo change). (2) **3 cockpit/status tests** — `storage/data/cache/
  last_fetch.json` absent → `buildStatusPayload` crashed on `null.mode` + cockpit showed mode `unknown`.
  **Real code fix `31f1357a`:** `loadStatusSnapshot()` now recovers a `recovered_live` snapshot from
  partitioned history when the primary is MISSING (was scoped-only), carries a non-null fallback,
  null-guards `cache_mode`/`fetched_at`, and `buildCockpitModel` uses the recovering loader. (3) **1
  hygiene test** — stray untracked `.agents/skills/rigorous-feature-testing` (orphan SKILL.md) → removed.
- Also committed the 3-session-stale 22-file caller migration (`6da0232b`, shim→canonical require paths;
  shims retained) + this audit's STATE note (`2567d8f4`). Suite 458/465 → **465/465**.
- Local-env caveat: causes (1) and (3) touch gitignored/untracked paths — they won't persist in git and
  may recur on another clone or if the skill-loader recreates the stray dir.

## Audit Note - 2026-06-14 session 31 - blast-through Focused Audit (anchor d95b92a7 -> 483d45cc)
- DCS 0.96 start/end. Tier 1 = commit `483d45cc` (session 31 prod, age <1d); the two intervening
  commits are docs/chore. **Verdict: session-31 code is CLEAN and verified.**
- New `shared/lib/market/coverage.js` (133 LOC) cheap-probe reads the bin header + 8-byte tail only;
  binary layout (TS_MAGIC/8-byte header/48-byte record) mirrors validation.js — verified loads + 4/4 tests.
- New `backend/cli/commands/data/backfill_daemon.js` (226 LOC): injected-executor design (unit-testable
  no-network), registered in `sovereign_cli.js:52` (manifest↔handler parity OK), cache-gate decides
  deep/incremental/skip. Loads clean; 4/4 tests. No eval/exec/secret/stub signatures.
- `data.js` rollup generalized losslessly: `rollupFromBase(tsDir,sym,baseTf,targets)` +
  `rollupTargetsAboveBase` over `INTRADAY_TF_ORDER=['1m','5m','15m','30m','1h','4h']`; thin 5m wrappers
  kept for legacy callers. 1m→5m/15m lossless proven by test. Docker `backfill` service image name
  matches web/bot (`personal_finance:latest`).
- **FINDING A (uncommitted caller migration — debt, NOT a defect):** 22 tracked files carry uncommitted
  1–2 line require-path swaps off root shims onto canonical category paths (`../env`→`../runtime/env`,
  `#shared/env`→`#shared/runtime/env`, `../../shared/lib/env`→`.../runtime/env`, quote_router/validation/
  registry/mt5_profiles/etc.). 32 ins / 32 del, pure path swaps. Empirically SAFE: all 12 changed prod
  modules load with no MODULE_NOT_FOUND; the 7 changed test files pass 53/53. This is the
  "migrate direct callers, keep the shim" hygiene work from session 29 sitting unstaged. Action: commit
  as one `refactor(shared): migrate direct callers to canonical lib paths` (shims stay — aliases/dist still
  use them). NOT urgent; one `git clean`/`checkout` from loss but tree is otherwise quiet.
- **FINDING B (doc drift — low):** STATE.md L605-631, HANDOFF L198-217, and MEMORY.md
  `project_mass_implement_state` all still say session-31 daemon work is "ALL UNCOMMITTED"; it is in fact
  committed as `483d45cc`. The earlier carryover narrative is stale. (This note corrects the record.)
- No new stub/security findings; no orphan commands; no new duplicate configs. 1m base bins not yet on
  disk (live provider smoke deferred — needs network + Binance/Alpaca keys), which is expected, not a gap.

## Audit Note - 2026-06-14 session 30 - blast-through Focused Audit (anchor 51b20b6c -> d95b92a7)
- DCS 0.97 start/end. Tier 1 = commit `217d21e5` (session 29 prod work, age <1d). Code is clean: P3
  guard (`equity_session.js`) verified wired into BOTH consumers (`research.js:347` backtest +
  `dataset.js:171` ML); `intraday-rollup` has manifest↔handler parity; no stub/security signatures
  in touched files. Suite baseline carried 447/453 (6 pre-existing env fails).
- **FINDING 1 (data-depth, debt-clearing) — RESOLVED (session 30 mass-implement):** 30m + 4h intraday
  bins were stale/shallow (session-29 catch-up rollup only refreshed 15m/1h). Ran `intraday-rollup
  --family crypto` + `--family equities` (local, idempotent). Verified lossless: BTCUSDT 30m 1,440→154,404
  / 4h 180→19,319 (both now span 2017-08-17→2026-06-13, matching 5m); AAPL 30m 777→81,502 / 4h 859→11,260
  (span 2016-01-01→2026-06-12). 30m=5m/6, 4h=5m/48 exactly. Data only (storage/data/ts gitignored), no code change.
- **FINDING 2 (config drift) — RESOLVED (session 30 mass-implement):** deleted the DEAD DIVERGENT
  `config/markets/asset_mapping.json` (zero readers; production reads `config/asset_mapping.json` via
  manifest.js:31; the stub diverged in content AND keys). Full suite still 447/453 (baseline, 6 pre-existing
  env fails) — deletion broke nothing. config gate C→B.

## Implementation Note - 2026-06-13 session 29 - blast-through refine + P3 wiring + deep-intraday rollup
- Blast-through SKILL refined (global): recency-ranked audit queue, repo-wide hygiene sweep, agent-consistency contract, audit anchor (`last_audited_commit` above).
- P3 equity session guard is now WIRED (was inert): `guardEquitySessionBars` runs in `loadAssetSourcesFromCache` (ML) + `loadHistoricalSources` (backtest), gated to equity/index sub-daily bars.
- Deep-intraday rollup: new `intraday-rollup` command derives 15m/30m/1h/4h from the deep 5m (lossless); crypto/equity-deep-backfill now auto-derive coarser TFs (`--no-rollup` opt-out). Deep depth was 5m-only before.
- `intraday_yahoo.js` slimmed to constants-only (Yahoo accepts `1h` natively); intraday silent-zero fixed; dead `config/data_sources.yaml` dup deleted.
- CORRECTION: 8 `shared/lib` root shims are LOAD-BEARING (consumed via relative requires, `#shared/*` aliases, compiled `dist/`), NOT dead — a literal-grep deletion broke the build; restored all 8, migrated direct callers to canonical. See DEV_REVIEW session 29 + the four-layer dead-file rule.
- Suite 447/453 (6 pre-existing env-dependent failures: cockpit/status cache state + polymarket/trade creds). Zero new failures.

## Implementation Note - 2026-06-13 session 28 - P3/P4 + sessions 26-27 batch committed
- Committed sessions 26-27 uncommitted batch (5 commits): docs reorg with ENOENT fix, correlation preflight, mass-backfill report, hygiene/C++ purge.
- P3: equity session-gap guard implemented (shared/lib/market/equity_session.js, filterEquitySessionGaps, 6 tests).
- P4: ML 5m cap 100k/symbol (was 50k generic) with --max-rows-5m flag and [VISIBILITY] log.
- FW1 verified pre-existing in validation.js:620-623 (atomicTempPath with process.pid).
- FX integrity: total_stale:0 already green.
- Suite baseline: 438/438 JS (was 432).
- FW3 native intraday delegated to subagent; crypto alt resume launched.

## Hygiene & Skill Automation Note - 2026-06-13
- Automated repository hygiene checks with a new script: [check_hygiene.js](file:///C:/Users/Lenovo/Desktop/VGBN/.vscode/CODEPTIT/personal_finance_draft/scripts/dev/check_hygiene.js).
- Wired `check_hygiene.js` to the npm script `npm run hygiene` and integrated it into the structure contract test suite [structure_contract.test.js](file:///C:/Users/Lenovo/Desktop/VGBN/.vscode/CODEPTIT/personal_finance_draft/tests/scripts/structure_contract.test.js).
- Verified repository hygiene checks are 100% green and verified by `npm run test:structure` / `npm test` (now 432/432 passing).
- Documented automated verification inside the [repo-hygiene SKILL.md](file:///C:/Users/Lenovo/Desktop/VGBN/.vscode/CODEPTIT/personal_finance_draft/skills/repo-hygiene/SKILL.md) file to provide a strict checklist process for all future agents.
- Resolved a stale comment marker (`//ide error-dev review`) inside [cnn_tensor_builder.cpp](file:///C:/Users/Lenovo/Desktop/VGBN/.vscode/CODEPTIT/personal_finance_draft/backend/core/src/ml/cnn_tensor_builder.cpp#L99) detected by the new hygiene automation.

## Audit Note - 2026-06-13 session 27 - blast-through streak audit
- Performed a streak-wide `/blast-through` audit. Re-verified the repository state against clean-clone reproducibility, data integrity, and pipeline boundaries.
- Verification: Full test suite is 100% green (`429/429` JS tests pass, `29/29` C++ core tests pass). Backend integrity is completely clean (`92/92` cached, `0` stale, `"ok": true`).
- Gaps isolated: Identified P0 Coinbase routing bug in crypto native subdaily ingestion, tracked runtime report JSON git noise, lack of intraday caps in ML dataset builder, lack of session-gap guards in equity backtesting, and stale C++ dev review comments.
- Updated `workspace/BLAST_THROUGH_REPORT.md` and created the `blast_through_report.md` artifact.

## Fix Note - 2026-06-13 session 26c - correlation 5m sector preflight
- Fixed a misleading failure in `backend correlation --timeframe 5m --method auto` when the TUI
  selector expands a sector whose members have no common 5m date overlap. The Layer1 crypto set
  currently fails overlap because `MATICUSDT` 5m ends on `2024-09-10` while `POLUSDT` starts on
  `2024-09-13`; previously the wrapper fell back to stale `storage/data/cache` JSON and produced
  misleading C++ `no_matching_bars` errors for other symbols.
- The wrapper now fails at CLI preflight with `code:"no_common_correlation_dates"`, reports per-symbol
  coverage, and names blockers (`MATICUSDT`, `POLUSDT`) instead of pretending the ts-index data is
  absent.
- Verification: `node --check backend/cli/commands/tools/backend.js`; reproduced Layer1 command now
  returns the preflight blocker report; an overlapping 7-symbol crypto 5m command still succeeds via
  a temp snapshot; backend human surfaces passed `12/12`, TUI automation `6/6`, and TUI search/heatmap
  contracts `8/8`.
- Checklist plan created: `workspace/CORRELATION_INPUT_CHECKLIST.md` covers the remaining regression
  tests, selector UX warning, optional blocker-dropping mode, and the MATIC/POL overlap decision.

## Implementation Note - 2026-06-13 session 26e - correlation checklist mass implementation
- Mass-implemented the correlation input checklist except for the actual MATIC/POL data refresh
  decision. Added isolated ts-index regression coverage for no-overlap preflight, blocker-dropping,
  and C++ consumption of overlapping focused snapshots.
- Added `--drop-non-overlap` to `backend correlation` and exposed it in the TUI manifest. Without
  the flag, Layer1 5m now fails before C++ with coverage/blocker output; with the flag, the same
  set drops `MATICUSDT` and `POLUSDT` and returns a 9-symbol matrix.
- Verification: `node --check backend/cli/commands/tools/backend.js`, `node --check
  backend/cli/tui/manifest.js`, new preflight test `4/4`, combined backend/TUI/correlation slice
  `30/30`, and FW1 backfill regression `3/3`.

## Implementation Note - 2026-06-13 session 26f - mass-backfill integrity-style report
- Added an integrity-style final renderer for `data mass-backfill`. Non-JSON execution now ends with
  `[MASS BACKFILL REPORT]`, coverage totals, policy line, family/timeframe sections, skipped preview,
  failure table, and next-step guidance. Windows `EPERM rename` failures are classified as
  `filesystem_rename_eperm` and point to serialization/write-lock follow-up.
- JSON mode remains machine-readable and now includes `type:"mass_backfill_report"`, `families`,
  `failures`, `failure_codes`, and `skipped_preview`.
- Verification: `node --check backend/cli/commands/data/data.js`, `node --check
  tests/scripts/backend_cli_human_surfaces.test.js`, backend human surfaces `6/6`, focused
  backfill/deep-data slice `33/33`, and `npm.cmd run test:data` `5/5`.
- Remaining limitation: provider fetch logs such as `[YAHOO] Fetched ...` still stream during the run;
  this pass standardizes the final report. A separate quiet/log-routing pass is needed if the live
  stream itself must be fully table-driven.

## Audit Note - 2026-06-13 session 26b - remaining-section blast plan
- Second blast covered the handoff sections not deeply closed by FW1: FW3 native-poll
  intraday, FW6 backward-gap fetch, FW2 ingestion structure, equity 5m session/backtest
  semantics, ML intraday caps, compatibility hygiene, and TUI exposure.
- Highest-priority fix order: Coinbase native-subdaily provider routing, silent-zero
  deep-backfill failures, gap-aware resume fetches, ML 5m row caps, and equity session-gap
  backtest semantics. See `workspace/DEV_REVIEW.md` "Remaining Section Blast - 2026-06-13
  session 26b" for the detailed plan.
- Focused verification during the audit stayed green: data/backfill/ML/backtest focused
  tests passed `56/56`, and TUI automation passed `6/6`. The gaps are missing-case and
  algorithmic coverage gaps, not current suite failures.

## Audit Note - 2026-06-13 session 26 - deep blast-through integrity correction + FW1 writer fix
- **Current integrity is not green.** Fresh `backend integrity --json` during session 26 returned
  `ok:false`, `92/92 cached`, `0 missing`, `total_stale:3`, `total_exceptions:1`; stale configured
  cache entries are FX `GBPUSD`, `USDJPY`, and `AUDUSD` on `1d`. `status --json` remains green for
  the latest-fetch snapshot (`quality:"ok"`), which confirms the health-scope split is working, but
  data-cache integrity needs a targeted FX refresh/exception decision before claiming full green.
- **FW1 landed locally:** `writeTsIndex` now uses process-unique atomic temp filenames for `.bin`
  and `.meta.json` writes instead of the shared `<bin>.tmp` path that could EPERM-crash when two
  separate Node backfill processes wrote the same bin. Regression coverage added in
  `tests/scripts/tests/backfill_regression.test.js`.
- **Verification:** `node --check shared/lib/market/validation.js`, focused backfill regression,
  `npm.cmd run test:data`, `npm.cmd run test:structure`, `npm.cmd run test:api`, and full
  `npm.cmd test` all passed; full suite baseline is now **423/423** after adding the FW1 test.
- **Open audit queue:** see `workspace/DEV_REVIEW.md` session 26 for the remaining runtime JSON
  artifact hygiene, TradingView stub, and C++ ML dev-review comment findings.

## Direction Note - 2026-06-13 session 25 — 5m deep data complete for all families; daily-history regression fixed; Polymarket archive built
- **Data layer is now broad + deep.** Native 5m: crypto (BTC/ETH to 2017, most alts 5y), US equities
  (to 2016 via Alpaca SIP), indices/commodities/fx (Yahoo rolling ~84-day window via the repeatable
  `five-min-accumulate` — re-run weekly to grow forward), + commodity ETF proxies on the Alpaca path.
  Daily (1d) history is deep again across all families (1998-2017 by symbol) after fixing a real
  regression where `writeTsIndex` REPLACE-semantics truncated deep daily bins to 1 bar on every ingest
  (now merge-protected for all timeframes). Polymarket historical archive went from a 20-market sample
  to ~2,045 volume-ordered resolved markets / 82,616 price points.
- **No direction change** — this is data-completeness + correctness work within Phase 9, not a pivot.
  ML/backtests still read daily from the cache; the deep daily restore unblocks honest daily training.
- **Free-provider depth is now maxed** for the chosen symbols; true 20y/1M-bar 5m would need a paid
  vendor (Polygon/FirstRate/Databento) — a future budget decision, not started.
- **Known operational constraint:** deep crypto 5m backfills are inherently multi-hour (paginated
  Binance + delays); `writeTsIndex` is not safe for two concurrent backfill PROCESSES (shared temp
  filename → EPERM). Serialize backfills until FW1 (per-pid temp) lands. Full trail + follow-ups:
  `workspace/handoff/2026-06-13.md` session 25 and `~/.claude/plans/hidden-exploring-river.md`.

## Direction Note - 2026-06-08 session 5 — TUI sub-menus fixed + first real-ONNX-driven order submissions proven

- **Direction unchanged** (Phase 9 continues; ML buildout milestone advances within the established plan —
  not a pivot). Two pieces of work:
  1. **TUI correction applied**: Strategy/Prop Firm/Persistent Runners now use genuine `promptSelect`
     sub-menus (mirroring `commandMt5`), per the user's explicit rejection of an earlier flat-merge approach.
  2. **First proof that REAL trained ONNX models can drive REAL order submission**, closing a gap the ML
     buildout had left open (models existed + were proven accurate in Phase 3, but nothing actually used
     them to place an order). New `scripts/strategies/ml_signal.js` solves the "how do you get a single
     live prediction out of a batch-only `ml predict`" problem via the `--limit 1` single-row trick — this
     is now the reusable bridge for ANY future strategy that wants a real-time ONNX read.
- **New capability unlocked**: `scripts/strategies/ml_smoke_{alpaca,polymarket}.js` are runnable, real,
  end-to-end smoke tests — Polymarket leg fully verified live (real ledger writes); Alpaca leg verified up
  to the user's own login/PIN gate (untested leg pending `sovereign login`).
- **Scope guardrail reaffirmed by the user**: MT5 multi-account design and live (non-paper) Polymarket
  order submission are explicitly future work ("still have to see") — do not start either without the user
  re-raising it. Full detail: HANDOFF + SESSION_MEMORY (session 5).

## Direction Note - 2026-06-07 session 4 — DOCKER DEPLOY SUCCEEDED (C3 closed, first time)

- **C3 closed**: `docker compose build && up -d` now produces a stable, healthy 2-service stack (`web`+`bot`).
  `curl /health` -> `{"ok":true,"service":"sovereign-web"}`; both `RestartCount=0`. First successful deploy
  in project history. Found+fixed 3 NEW blockers beyond session 3's portability pass (these only surface in
  the full build+run path, not a source-only compile check):
  1. GCC 12 `-Wrestrict` false positive in `macro_features.cpp:32` (scoped pragma suppression).
  2. Missing `npm ci` layers for standalone sub-packages `backend/api`/`backend/gateway` (web crashed on
     `Cannot find module 'socket.io'`).
  3. **Architectural fix**: removed the `gateway` compose service — it was crash-looping because
     `gateway.main()` is a one-shot CLI dispatcher, not a daemon (`SOVEREIGN_GATEWAY_MODE=managed` was dead
     config). Topology is now 2 services, not 3 — **user should review this change before committing**.
  Also disabled `bot`'s inherited HEALTHCHECK (cosmetic `unhealthy` status; it runs no HTTP server).
  4 files changed, none committed: `macro_features.cpp`, `Dockerfile`, `docker-compose.yml`, `DEPLOY.md`.
  Full detail: HANDOFF + SESSION_MEMORY (session 4).

## Direction Note - 2026-06-07 session 3 (Docker build attempted — code now Linux-portable)
- **Docker build status**: code-ready. Surfaced + fixed 8 Windows/MSVC-only-green portability bugs (GCC
  `-Werror` + GCC10 from_chars); full `make -k all` in gcc:12 = 0 errors, `npm run build` green. Image build
  BLOCKED only on Docker Desktop registry connectivity (WSAEACCES; node:22-bookworm not cached). Resume after
  user restarts Docker Desktop. Full detail: HANDOFF + SESSION_MEMORY (session 3).
- **Durable gotcha**: `shared/lib/paths.js` BACKEND_CANDIDATES doesn't include the Make single-config path
  `backend/core/build/sovereign_wealth`; native Linux builds need SOVEREIGN_BACKEND_BIN set (Dockerfile does).
- **Test quality**: core test mains assert-only → no-ops under Release NDEBUG; should run in Debug. Pre-existing.

## Direction Note - 2026-06-07 (re-anchor to core platform) + Docker config readiness
- **Direction**: ML buildout reached a real, verified honest core (Phases 0-3). User flagged drift; ML is
  now PARKED — Phases 4-5 (TUI section, backtest swap) deemed low-leverage polish on weak models. Priority:
  test-gate fix → Docker/bot deploy → data freshness. See `feedback-stay-on-core-goal` memory.
- **Git hygiene**: untracked node_modules/backend/gateway/node_modules/storage/data/cache (8870 files,
  index-only). `.mcp.json` still tracked — harness blocks the agent; USER must run `git rm --cached .mcp.json`
  to make structure_contract pass (suite 240→241).
- **Docker deploy-ready** (config only; daemon was down so no build ran): compose `env_file` now reads `.env`
  (required) + `.env.production` (optional override) — one config file for CLI and Docker; fixed DEPLOY.md
  onboarding (it referenced a nonexistent `.env.production.example`); `.dockerignore` now excludes `.env*`
  (was baking secrets into image) + `backend/core/build`. `docker compose config -q` clean.
- **Known gap — fix in flight, blocked (2026-06-08 session 8)**: `infra/docker/Dockerfile:46` edited
  to add `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON`, but left **uncommitted** — verification blocked by a
  wedged Docker Desktop daemon (zombie `com.docker.build` process, idle ~22h, predates the session;
  user deferred the restart needed to clear it). Resume steps + full trace in
  `workspace/handoff/2026-06-08.md` session 8 and `workspace/DEV_REVIEW.md`. Also surfaced: trained
  `.onnx` files are gitignored (`.gitignore:64`), so a genuine remote-node deploy would silently fall
  back to baseline — a separate latent gap flagged for a future user decision.

## Correction Log - 2026-06-07 (ML Phase 3 — C++ ONNX inference + train/serve parity PROVEN)
- **C++ now runs the real trained models.** New `ml predict` / `ml compare` command in
  `backend/core/src/main.cpp`: reads `storage/models/serving_manifest.txt` (column order + train
  medians + model list, emitted by train.py — C++ has no JSON/YAML parser, so a whitespace manifest),
  reads the JS feature CSV, median-fills + orders columns identically to training, runs each `.onnx`
  batched, outputs per-model accuracy + class counts as JSON.
- **New `OnnxModel::predictBatch`** (`backend/core/src/ml/onnx_model.{hpp,cpp}`): float `[batch,n]` input,
  converter-agnostic output handling (queries output names/types; int64 label tensor and/or float prob
  tensor) — works for both skl2onnx and onnxmltools-xgboost outputs. Existing `predict()` (int64 token
  smoke path) left untouched; onnx_model_test/cnn_inference_test/model_registry_test still 3/3.
- **NO-SKEW PROOF (the anti-cheat gate)**: `scripts/ml/verify_parity.py` replicates the C++ logic in
  Python via onnxruntime. C++ `ml compare` and Python are **bit-identical** on the full 19,480-row frame:
  - xgboost_v1 acc 0.666376, counts {0:7061,1:1275,2:11144}
  - logistic_v1 acc 0.468378, counts {0:7208,1:223,2:12049}
  - regime_classifier acc 0.456982, counts {0:6802,1:162,2:12516}
  C++ == Python to 6 decimals AND every class count → C++ inference is real and skew-free.
  (Full-frame accuracy > Phase-2 holdout accuracy because it includes training rows; xgboost overfits
  the train portion — expected.)
- **Build**: `cmake --build backend/core/build --config Release --target sovereign_wealth` clean
  (ONNX ON). `backend()=="onnx_runtime"` confirmed on all 3 models.
- **Next**: Phase 4 — JS `backend_bridge` call to `ml compare` + TUI "Machine Learning" section
  (model comparison table). Phase 5 — route backtest `model.predict` through the C++ ONNX path; relabel
  JS heuristics `heuristic_baseline`.

## Correction Log - 2026-06-07 (ML Phase 2 — real trained models exported to ONNX)
- **First real trained ML in the repo.** `scripts/ml/train.py` (new, runs in `.venv_ml`) reads the JS
  feature CSV and trains the starter set, all predicting the 3-class N-bar forward label {down,flat,up}:
  - `xgboost_v1` (all 32 feats) — holdout acc **0.4233** vs majority baseline 0.3894 (**+3.4%**)
  - `logistic_v1` (StandardScaler→logreg, all feats) — **0.4199** (+3.1%)
  - `regime_classifier` (cross-family feats only: regime_*_mom + xf_corr_*) — **0.3976** (+0.8%)
  - All 3 exported to `storage/models/*.onnx` at **ir_version=9** (C++ onnxruntime 1.17.1 ceiling),
    opsets `ai.onnx.ml:1` + `ai.onnx:15` (both within 1.17.1) → ready to load in the C++ path (Phase 3).
  - Modest lifts are honest for daily directional prediction; the point is real models that beat baseline,
    not alpha.
- **No train/serve skew**: missing cells filled with TRAIN-split medians; medians + per-model feature-column
  order written to `storage/models/feature_config.yaml` (new v2 schema). Linear-model scaling is baked INTO
  the ONNX graph, so the only external serving contract is the median fill. `metadata.json` rewritten to the
  real models (schema `sovereign.ml.metadata/v2`, real metrics, `promoted` = beats-baseline).
- **Deps**: installed scikit-learn 1.9, xgboost 3.2, skl2onnx 1.20, onnxmltools 1.16, pandas 3.0 into `.venv_ml`.
- **Dataset**: re-dumped 20-symbol liquid universe, `--days 1000 --deadzone 0.01` → 19,480 rows, true 3-class
  balance {down 7456 / flat 3495 / up 8529}.
- **Safe overwrite**: nothing at runtime reads `metadata.json`/`feature_config.yaml` yet (`cnn_v3` in
  `models.js` is only a JS-heuristic alias). Phase 3 C++ will be the first consumer. `smoke.onnx` preserved.
- **Gate**: `npm test` → **240/241** (unchanged; the 1 fail is the pre-existing structure_contract git-drift).
- **Next**: Phase 3 — C++ `ml predict`/`ml compare` command reading `feature_config.yaml` + the .onnx files
  (feature vector in → ONNX → 3-class prediction, batched). Then Phase 4 TUI section, Phase 5 backtest swap.
  CNN/LightGBM deferred (needs torch + windowing tensor builder).

## Correction Log - 2026-06-07 (ML Phase 1 FINISH — full-universe data + aggregates job)
- **Phase 1 closed**: `ml dump` now covers the FULL backfilled universe, not just the 3 JSON-cached
  crypto coins. Root gap was that `shared/lib/ml_dataset.js` only read `cache/<family>/backtest_history.json`
  (PEPE/POL/SUI only) while the core universe (BTC/ETH/SOL, XAU/XAG/XCU, USOIL/NG, SPY, equities) lives in
  the binary `storage/data/ts/*.bin` index (633 .bin files).
  - **Fix (JS binary-ts reader, Design B)**: `ml_dataset.js` now unions JSON-cache records with
    `readTsIndex()` (already in `market_validation.js`) per symbol, deduped by symbol+timestamp (JSON wins).
    Added `readTsSources`/`tsSymbolsForTimeframe`. `cacheCloseSeriesAnchor` also merges ts closes.
    New `STORAGE_TS_DIR` constant in `shared/lib/paths.js`. `opts.tsDir` overridable for tests.
  - **`ml aggregates refresh` (first production caller for `buildCryptoAggregateSeries`)**: new
    `backend/cli/commands/ml.js` subcommand + testable `refreshCryptoAggregates()` writes
    `storage/data/cache/crypto_aggregates.json` in the exact shape `loadCryptoAggregateAnchors` reads
    (throttle/backoff via `--throttle-ms`, `--days`, `--universe`). CoinGecko free-tier; run is optional.
  - **LIVE verified**: `ml dump --symbols BTCUSDT,ETHUSDT,SOLUSDT,XAUUSD,USOIL,SPY --days 365 --no-fred`
    → 6/6 assets, **2034 rows × 36 cols** (these all returned `no_asset_sources` before this session).
    Anchors now resolve from ts (GOLD 5566d, OIL 5998d, etc.).
  - **Gate**: `npm test` → **240/241 pass** (was 237; +4 new ML tests, all green). The 1 fail is the
    PRE-EXISTING `structure_contract.test.js` (see below), unrelated to this work.
- **[FOUND — needs user decision] artifact-hygiene regression**: `.mcp.json` + `backend/gateway/node_modules/`
  (~6847 files) are git-TRACKED and no longer matched by `.gitignore` (`git check-ignore` returns empty).
  This is what fails `structure_contract.test.js:84`. Session 75 had `git rm --cached`'d these; they drifted
  back. Fix = restore `.gitignore` coverage + `git rm --cached` (index-only, no disk delete), but staging
  6847 deletions is a large op left for explicit approval — NOT bundled with the ML change.

## Correction Log - 2026-06-07 (ML reality + ONNX Phase 0)
- **Grade-relevant correction**: the "ML" was not machine learning. All models in
  `shared/lib/models.js` + `backend/core/src/ml/model_registry.cpp` are heuristics tagged
  `deterministic_adapter`; `onnx_model.cpp` was real but OFF/unreachable; no `.onnx` files existed.
  Treat prior "CNN/XGBoost/transformer" claims as heuristic baselines, not trained models.
- **Phase 0 DONE**: real ONNX inference now runs in C++ (onnxruntime 1.17.1 enabled on local build,
  `onnx_model_test` proves `backend()=="onnx_runtime"`). Buildout tracked in `workspace/ML_SECTION_PLAN.md`.
- onnxruntime 1.17.1 constraint: model **IR version ≤ 9** for exports. Training env = gitignored `.venv_ml/`.

## Key Accomplishments (User-Driven Innovation)
- **100% Core Integrity**: All 29/29 C++ core tests passing on Win32 MSVC 2026.
- **Waterproof Data Plane**: 69/69 symbols cached with full daily historical depth (DCS: 1.0 at daily timeframe).
- **Execution Gateway Hardened**: Implemented dollar-based sizing (`amount:USD`) and verified across Alpaca, Gate.io, and Polymarket.
- **Historical FX Sync**: Multi-decade FX data enabled via Frankfurter/ECB endpoints. All 9 currency pairs fully cached.
- **MCP Tool Mastery**: 13 tools registered and verified for LLM-driven platform orchestration.
- **Stress-Tested Analytics**: C++ correlation engine verified for large-scale matrix computations (47x47 matrix in 95s).
- **Macro-Market Correlation Breakthrough**: Enabled cross-asset correlation (e.g., AAPL vs CPI) by implementing a synthetic daily bar generation layer and populating a 2000-day historical macro cache.
- **Multi-Agent Verification**: Implemented a 5-agent parallel testing sweep to ensure system-wide reliability.
- **TUI Strategy Wizard**: Implemented interactive creation and registration of strategies.
- **Backtest Intelligence**: Enabled YAML-driven parameter overrides and registry-driven strategy selection for backtesting and optimization.

## Phase 8 Engineering History (Consolidated & Filtered)

### Data Plane & Ingestion
- **Architecture**: Migrated monolithic `backtest_history.json` to family-partitioned directory structure (`storage/data/cache/<family>/*.json`). (Waterproof)
- **Performance**: Implemented binary `ts_index` (`storage/data/ts/`) with 48-byte packed Float64 records. AAPL 1d read: 9ms (66x speedup).
- **FX & Macro**: Enabled multi-decade FX ingestion via Frankfurter API; resolved 9 missing currency pairs. Fixed FRED/Macro fetcher symbol resolution.
- **Integrity**: Rebuilt `backend integrity` as a JS-native report for per-family availability and freshness tracking.

### C++ Core & Analytics
- **Reliability**: Refactored JSON parsing to zero-copy `std::string_view` scanning; eliminated `std::regex` recursion to resolve stack overflow crashes.
- **Correlation Engine**: Implemented `pearson-returns` and `fx-returns` methods (log-transform close levels). Added dual-window Pearson divergence telemetry.
- **Verification**: Verified 47x47 matrix stability and identity diagonal (1.0) for a 70-symbol universe.

### Execution Gateway
- **Order Sizing**: Implemented `amount:USD` parsing for dollar-based quantity calculation across all adapters.
- **Broker Integration**: Hardened Alpaca (SDK), Gate.io, and Polymarket adapters; fixed Alpaca quote fetcher argument type mismatch.
- **Persistence**: Migrated `EXECUTION_MEMORY` to persistent JSON-backed utility (`shared/lib/execution_memory.js`) to survive restarts. (Waterproof)

### TUI & User Experience
- **Navigation**: Redesigned search bar with ANSI save/restore, multi-select search (ampersand-delimited), and sector cascade toggling.
- **Visualization**: Implemented `backend visualize` with Student-t density charts and sigma-band positioning (+1.41σ indicators).
- **Heatmap Polish**: Centered compact cells (9-char symbols), vertical column separators, and simplified color semantics (Green=Pos, Red=Neg).
- **Workflow**: Added post-command footer actions (Enter=Menu, R=Rerun, B=Back).

## Remaining Gaps
- [ ] Automated trading & cloud hosting: Actually deploy the Docker container to a remote Linux node.
- [ ] Indicator Innovations: Implement "Crypto-Stable Inverse Correlation" logic from `DEV_COMMENTS.md`.
- [ ] Advanced Correlation: Implement hierarchical volume-based sorting for the heatmap.
- [ ] Production Scaling: Further optimize storage I/O for 100+ symbol universes.
- [ ] Storage Optimization: Implement NDJSON streaming for large partitions to further reduce memory floor.

## Technical Details
- **Backend**: C++ Core (MSVC), Node.js API, Socket.io Telemetry/Streaming.
- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons, Socket.io-client.
- **Persistence**: Supabase (PostgreSQL + Realtime).
- **Broker**: Alpaca (SDK Integrated, Production Ready), Gate.io, Polymarket (Stubbed).

# dev suggest:*do not delete
- [x] switchin strategies use config files for automating purpose
- [x] anti crash methods
- [x] better user experience, more TUI like, suggestion when choosing sth...
- [x] better UI, more visualy attractive, std deviation visualization
- [x] incorparate quantitative measure from previous project (Kalman filter)
- [x] options trading intergration (G/T/V)
- [x] prediction market trading using keys, tracks the portfolio of it
- [x] automated tradin, sever hosting via linux, cloud etc
- [x] for portfolio tracking:,use every live broker's portfolio and then sum it
- [x] backtesting optimization: overfit detection and OOS validation
- [x] collect major quotes data,economic data lookback to 20 years


---

_Older Correction Log / Update entries (sessions ~20-79, 2026-05-31 to 2026-06-07) archived to `workspace/STATE_ARCHIVE.md` on 2026-06-08 — read there for deep history._
## Update - 2026-06-08 Docs truth refresh

- Refreshed `docs/engineering/tui_feature_map.md` to the current audit baseline so the docs no longer carry the retired backend-integrity failure as current truth.
- Updated `workspace/FEATURE_TEST_MATRIX.md` and `workspace/FEATURE_REPAIR_PLAN.md` so the docs row now matches the refreshed map and the repair plan no longer treats the doc drift as active.
- Current repo truth now separates the two live data scopes cleanly: `backend integrity --json` remains policy-green on configured cache, while `status --json` still reports separate latest-fetch freshness degradation.

## Update - 2026-06-08 Skills refresh

- Refreshed the active repo-local skill inventory and trimmed the live tree to the three umbrella skills: `codex`, `claude`, and `gemini`.
- The current loaded focus now stays on those three skills only, with the older secondary skill directories removed from both `skills/` and `.agents/skills/`.
- This refresh is a state sync only, not a skill-content change.

## Update - 2026-06-08 Shared lib organization

- Started the `shared/lib` category reorganization with canonical folders for `ui/`, `ai/`, `mcp/`, and `compat/`.
- Moved the actual implementations for ANSI, local AI client, MCP gate/agent, and adapters into those folders while keeping legacy root shims in place for compatibility.
- Updated the canonical folder map and the direct ANSI/MCP consumers so the new grouped paths are now exercised by live code.
- Continued the split with `runtime/`, `market/`, `brokers/capabilities.js`, and `supabase/` buckets, plus root shims for legacy callers.
- Verified the moved modules and compatibility imports with `node --check` and direct `require()` probes.
- Extended the reorg into `strategy/`, `ml/`, `profiles/`, and `data/` buckets for backtest, dataset, model, prop-firm, macro, crypto, backfill, ingestion, execution-memory, and pruning helpers.
- Flattened `shared/lib/indicators/price_action.js` into `shared/lib/market/price_action.js` so the indicator bundle now stays inside the market bucket with a compatibility shim at the old path.
- Migrated tracked backend/script/test callers off the legacy root shim imports and onto canonical category paths under `runtime/`, `market/`, `strategy/`, `ml/`, `profiles/`, `data/`, `brokers/`, `supabase/`, and `ui/`.

## Correction - 2026-06-08 mass-implement: shared/lib reorg follow-up (shims removed, real bug fixed)

- Audited the "compatibility shim" layer the entry above describes and found `shared/lib/centralized_lib/ansi.js`, `shared/lib/indicators/price_action.js`, and `shared/lib/auth/ai_client.js` had **zero importers anywhere** (grepped the full tree, tracked and untracked) — they were not legacy paths anything still used, just defensive placeholders.
- Worse: `shared/lib/centralized_lib/ansi.js` was the *only* one wired up, and its sole caller — `backend/cli/lib/auth.js:11` (untracked, last touched 2026-06-03, predates the shim's creation by 5 days) — had been importing a path that **didn't exist until today's reorg session created the shim to patch the hole**, rather than fixing the caller. That's a real bug masquerading as a compatibility layer.
- Fix applied: repointed `backend/cli/lib/auth.js:11` to the canonical `shared/lib/ansi` (the same shim every other migrated caller uses → `ui/ansi`), then deleted all three zero-caller shim files plus the now-empty `centralized_lib/` and `indicators/` directories. `auth/supabase_env.js` (real module, not a shim) stays. Verified clean: `node -e "require('./backend/cli/lib/auth.js')"` loads, and a full-tree grep for the three removed paths returns nothing.
- Also added unit tests for the rsi_backtest statistical primitives (`tests/scripts/rsi_backtest_primitives.test.js`, 15/15 passing against independent closed-form references — Beta(2,2)'s polynomial CDF, the Cauchy distribution for Student-t df=1, pandas quantile interpolation) and exported `betaCdf/betaPpf/tCdf/tPpf` from `shared/lib/strategy/rsi_backtest.js` to make its existing "exposed for tests / inspection" comment true.
- Committed the previously-untracked `scripts/strategies/` directory (8 files, ~1,900 LOC incl. the new RSI reversal stack) — `c47e3f91`.

## Correction - 2026-06-09 mass-implement: shared/lib reorg + workspace doc archival landed (was at-risk uncommitted)

- Found the `shared/lib` category reorg this same STATE.md already documented as "done" was
  entirely **uncommitted** — ~30 new canonical dirs/files (`runtime/`, `market/`, `strategy/`,
  `ml/`, `ui/`, etc.) sat untracked while the old root files existed only as gutted one-line
  shims in the working tree. One `git clean -fd` away from permanently destroying a
  multi-session restructure. Same exposure for the workspace-doc archival
  (`STATE_ARCHIVE.md`, `workspace/handoff/`, `workspace/archive/` — all untracked, while
  `STATE.md`/`HANDOFF.md` looked like they'd lost ~2,800 lines that had actually moved there).
- Landed both as separate commits after smoke-testing the working tree
  (`require('./shared/lib/{paths,strategy/rsi_backtest,runtime/config_loader,market/quote_router}')`,
  `require('./backend/cli/lib/auth.js')` all load clean): `f4a97e94` (191 files, the reorg +
  ~50 caller import-path updates) and a follow-up commit (21 files, the doc archival).
  Deliberately excluded `backend/cli/target/` (2,151 untracked Rust build-artifact files that
  `git add backend/` would otherwise have swept in) and two unrelated stray files
  (`frame_backtester.{cpp,hpp}`, `polymarket-cli/`) — left untouched, out of scope.
- Also closed the gap flagged in the prior session's closeout: added
  `tests/scripts/rsi_backtest_analyze.test.js` — a seeded-fixture (mulberry32 PRNG) end-to-end
  test of `analyzeSeries`/`extractActionable` running the real rsi→atr→crossover→Bayesian-summarize
  pipeline and pinning the exact deterministic signal it produces (kelly=0.5715, hit=0.7692,
  CAUTION/MED). 6/6 passing — full `rsi_backtest` suite now 21/21 (`c5114e90`).

## Update - 2026-06-11 session 11 — blast-through audit of feat/ml-onnx-section (unrecorded 2026-06-10 work)

- Repo is on NEW branch `feat/ml-onnx-section` with ~28 uncommitted modified files from an
  unrecorded 2026-06-10 session. Audit verdict: **DCS 0.87, tree NOT safe to commit** —
  `runGatewayCommand` throws on every call (backend_bridge.js:72), 7 NEW failing test files
  (suite 12✖ vs 6✖ baseline), and tracked code depends on 3 untracked files (4th occurrence of
  the drift class). Ingestion upgrades (binance pagination, 1w/1mo local aggregation) verified
  REAL (BTCUSDT 1w 4→464 bars). Full ledger: DEV_REVIEW.md "Focused Audit - 2026-06-11";
  gate table: workspace/handoff/2026-06-11.md.
- Grade trend vs 2026-06-06 audit: trade B→D (broken migration), shared/lib market A→C (failing
  feature contract), runtime bridge new at D, providers B (binance solid), ingest B,
  tui/engine C→B (markers cleared — ungated), gateway B→C (redaction contract), api/app.js C
  (cached). No section at D/F for 2+ consecutive audits yet — no domain-level escalation; the
  D grades are first-occurrence and tied to ONE fixable root cause each.
- Carryover closed: `backend/cli/target/` now gitignored (edit in tree, uncommitted).
  Carryover direction set in-tree: `storage/models/*.onnx` un-ignored (= "commit binaries").

## Update - 2026-06-11 session 12 — audit findings fixed + landed; suite fully green (263/263)

- All session-11 audit findings fixed same-day (Sonnet-delegated implementation, Fable-verified)
  and committed in 6 batches (`358476f6`..`8e8b4adf`) on `feat/ml-onnx-section`. Bonus root cause:
  `bot_state.ts` stale reorg import meant the gateway could not boot under ts-node at all (tsx has
  been missing from node_modules since ~06-09).
- **`npm test` = 263/263, 0 failures — first fully green suite in project history** (prior best
  226/232; the 6 pre-existing baseline failures were also cleared per user decision).
- Gate table regrades vs session 11: bridge D→B, trade D→B, shared/lib market C→B, backend/cli C→B,
  gateway C→B. No gated sections remain except backend/api/app.js C (cached, GET-auth question)
  and the Docker carryover.
- Carryovers CLOSED: trained `.onnx` binaries committed (fresh-clone fallback gap),
  `backend/cli/target/` gitignored. Still open: Docker/ONNX verification (daemon restart),
  centralization backlog (gateway launcher call sites, local runBackendCommand copy),
  untracked `notebooks/`, stale graphify-out.

## Update - 2026-06-11 deep blast-through repo-hygiene audit

- Runtime/no-spend health is strong locally: `npm.cmd test` passed 269/269, MCP lists 17 tools,
  status reports `recovered_live` with 293 usable records / 0 stale, and backend integrity is
  policy-green with only `RNDRUSDT` as the active exception.
- Main active blocker is now **clean-clone reproducibility**, not runtime behavior. Tracked files
  reference untracked or ignored assets: `frame_backtester.{cpp,hpp}`,
  `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`,
  `backend/api/tests/correlation_contract.test.js`, and ignored notebook fixtures.
- `workspace/DEV_REVIEW.md`, `workspace/BLAST_THROUGH_REPORT.md`,
  `workspace/FEATURE_TEST_MATRIX.md`, and `workspace/FEATURE_REPAIR_PLAN.md` carry the full
  evidence and grades. Close those load-bearing artifact decisions before any broad commit.

## Update - 2026-06-11 deep blast gap-closure plan

- Added `workspace/DEEP_BLAST_GAP_CLOSURE_PLAN.md` as the executable plan for the open gaps.
- Plan priority is clean-clone reproducibility: track load-bearing source/proof files, rewrite the
  notebook contract away from ignored `.ipynb` files, and add structure guards so future tests/docs
  cannot silently depend on untracked artifacts.
- Later waves are intentionally separated: repo protocol/skill truth, Docker ONNX verification,
  provider extraction stubs, and C++ ML review-comment cleanup.

## Update - 2026-06-11 repo skill restoration

- Trimmed the repo-local skill tree down to the three umbrella skills: `codex`, `claude`, and
  `gemini`.
- Kept matching `SKILL.md` files in both `skills/` and `.agents/skills/` so repo-local skill
  discovery stays consistent.
- Updated stale path references in `AGENTS.md`, `GEMINI.md`, `docs/memory/SESSION_MEMORY.md`, and
  `docs/operational/bootstrap.md` to point at the remaining tracked skill paths.

## Update - 2026-06-11 mass-implement clean-clone repair batch

- Applied the first reproducibility wave from `workspace/DEEP_BLAST_GAP_CLOSURE_PLAN.md`.
- Staged the load-bearing source/proof assets that tracked code and docs depended on:
  `.dockerignore`, `backend/core/src/backtest/frame_backtester.{cpp,hpp}`,
  `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`,
  `backend/api/tests/correlation_contract.test.js`, and `notebooks/signal_library.json`.
- Rewired `package.json` so `test:api` includes the correlation contract, expanded
  `tests/scripts/structure_contract.test.js` to guard tracked clean-clone assets and local-only
  ignores, and rewrote `tests/scripts/notebooks_contract.test.js` to validate tracked fixture
  notebooks under `tests/fixtures/notebooks/` instead of ignored live `.ipynb` files.
- Verification is green in the current staged state:
  `test:structure`, `test:api`, notebook contract, full `npm.cmd test` (`272/272`), RSI signal
  library probe (`35` actionable signals), and native `sovereign_wealth` build all passed.
- Also fixed a verification blocker: TUI boot no longer performs a network auth refresh just to
  paint the menu header, which removed the Supabase `EACCES` noise that had broken the TUI
  automation harness in this environment.

## Update - 2026-06-12 session 17 - Polymarket CLOB V2 migration; first real matched order; Alpaca 422 fixed

- **Polymarket order placement works again** (was dead since the 2026-04-28 CLOB V2 cutover).
  Gateway migrated to `@polymarket/clob-client-v2`; funder corrected to the real proxy wallet
  (`0x1e7955...`, sig1) after on-chain triage; new `polymarket sell` subcommand. Proven with a
  real user-approved matched SELL order. Commits `ac21d19a`, `fd15e2e2`.
- **Alpaca 422 fixed** (`c385959f`): fractional equity orders now sent TIF=day, BTCUSDT-style
  symbols mapped to Alpaca slash pairs, Alpaca error bodies surfaced. Proven with two live paper
  orders (one filled).
- **Bots verified online**: docker bot cycling (daemon unwedged), edge-trader decision engine
  green end-to-end in dry mode. Live-loop enablement deliberately left as a user decision —
  candidate filtering needs deadline/liquidity guards first.
- **"DNS issues" reclassified**: host-level flapping `connect EACCES` egress blocks, not DNS.
  SDK-level retry enabled; shared fetch retry helper queued.
- User's 9-item roadmap recorded in `workspace/handoff/2026-06-12.md`; next waves: TUI revamp,
  monolith deconstruction, C++ verify, RAM optimization, deep 5-min data, login barrier.

## Correction - 2026-06-12 session 17c - C++ test claim + audit findings cleared

- The "All 29/29 C++ core tests passing" claim above is STALE: currently 27/29. Both failures are
  fixture-path debt (ingestion_adapter_test resolves config/data_sources.yaml relative to the
  build dir; kronos_integration_test missing its empirical fixture), not logic. Engines verified
  healthy behaviorally: ml compare reproduces Phase-3 ONNX parity EXACTLY; correlation/risk green.
- All 7 session-17 blast-through findings RESOLVED same-day via delegated Sonnet waves
  (37d2d6d2 kill-switch auth, 32cb5637 failure semantics + classifier + masking, cafe6eea
  FOK/deadline guard, 6875f1fa dedup + retry rollout). Suite 284/284. backend/api/app.js gate
  expected to lift C->B next audit.

## Update - 2026-06-12 Polymarket historical archive/backtest implementation

- Added the repo-local `polymarket-history-backfill` skill and implemented the first archive-first
  research slice: normalized resolved markets, CLOB price curves, generated point-in-time feature
  rows, and local archive coverage under ignored `storage/data/polymarket_history/`.
- New command surface: `polymarket research ingest` / `polymarket history ingest` writes the
  generated archive; `polymarket backtest` now prefers archive replay by default and labels archive
  coverage, fallback-only Gamma markets, gross/net PnL, execution costs, EV, drawdown, and hold time.
- Order-book history is deliberately not dense-archived. PMXT/order-book-lite remains phase 2 for
  candidate trade windows only, after price-history signals survive basic replay.

## Update - 2026-06-12 Polymarket orderbook-lite phase 2

- Added PMXT-based candidate-window snapshots behind `--capture-orderbook-lite`. The archive now
  stores derived order-book rows under `storage/data/polymarket_history/orderbooks-lite/` with
  best bid/ask, mid, spread, 1% and 5% depth, timestamp, and source.
- PMXT requests use `https://api.pmxt.dev` and require `PMXT_API_KEY`; the feature stays opt-in
  and the tests inject mock fetchers so the suite remains no-network.

## Update - 2026-06-12 session 18b - roadmap waves 2/6/7/8 progress; "29/29 C++ tests" claim TRUE again

- C++ ctest fixture debt CLEARED (`e0ad1ff7`): ctest -C Debug 29/29 (the Key Accomplishments
  "29/29" claim is accurate again). Bonus real bug fixed: regime_detector off-by-one guard
  (Release NDEBUG had masked 2 regime-test failures; honest prior baseline was 25/29).
- TUI Phase A landed (`d51bfbc1`) per workspace/TUI_REVAMP_SPEC.md: spinner + progress utilities,
  SEMANTIC color language, render-helper extraction, terminal-height-aware page sizes. Phase B
  (status/asset_picker/manifest polish) UNBLOCKED by the user checkpoint 76ef48fb committing the
  formerly-parked 2026-06-11 batch.
- ML data layer perf (`ac7b10ed`): readFamilySources 60s-TTL memoization + loop-invariant hoist;
  ml dump 21.9s -> 2.8s, anchor stage 1452MB -> 754MB, output SHA256-identical. Next RAM target
  (needs user sign-off): NDJSON streaming for the 377MB family JSONs (hotspot #2).
- Item 8 scoped (workspace/FIVE_MIN_DATA_SCOPING.md): Phase 1 = crypto 5m via Binance, sequential
  backfill mandatory (rate-weight budget), ~259MB/3y for 18 symbols; user decisions in section 7.
- Concurrent Codex polymarket archive/backtest slice reviewed + integrated (`0e90e2a0`), 28/28
  tests. Suite at close: 342/342.

## Update - 2026-06-12 session 21 - Codex slice integrated, TUI Phase B landed, 5m crypto deep data Phase 1 live

- Sessions 19/20 Codex polymarket slice (orderbook-lite backfill lane + history-backfill repoint +
  --start-offset) reviewed and committed (`1f6b5e45`); focused bundle 35/35, gateway tsc clean.
- TUI Phase B landed (`b64cf57c`) per TUI_REVAMP_SPEC.md: rich-gated cockpit glyphs (user decision:
  Unicode default-on for rich terminals), asset-picker 60s hierarchy cache, `?` keybind help overlay,
  manifest tuning. TUI surface 99/99; `--json` still 0 ANSI bytes.
- 5-minute crypto historical data Phase 1 is REAL (`c3fbc3ba`): new `crypto-deep-backfill` command
  (sequential, Binance-pinned, 5y default), native 5m routing in fetchCryptoSnapshot, 90-day JSON cap
  applied at write time only, merge-protected sub-daily ts-index bins. Full 18-symbol 5-year backfill
  launched at session close (background).
- **Durable gotcha (grade-relevant):** the crypto provider chain lists TwelveData before Binance and
  TwelveData silently caps history at exactly 5,000 bars; first-success break means any deep fetch
  through the generic chain gets 5,000 bars max. `ingestMarketData` now accepts `options.provider`
  to pin the chain. Watch for the same trap in equities/indices/commodities (twelve is first there too).
- Correction: DEV_REVIEW 2026-06-12 C++ table finding #2 (indicators default --input) was already
  fixed in `e0ad1ff7`; entry was stale. ctest -C Debug still 29/29.
- Suite: **385/385 exit 0** (new baseline; was 342).

## Update - 2026-06-12 session 23 - synthetic 5m consumer guard + backfill still running

- Implemented the session-22 user decision that synthetic/daily-aggregated 5m is experimental-only:
  future aggregate records now carry `derived_from_timeframe` / `experimental_only` metadata; validation
  rejects daily-derived lower-timeframe records as `synthetic_lower_timeframe`; `ml dump` excludes
  experimental 5m by default and exposes `--include-experimental-5m` for explicit research opt-in.
- Added regression coverage in `tests/scripts/tests/ml_dataset.test.js` and
  `tests/scripts/strategy_backtest_contract.test.js`; verification passed:
  `node --test tests/scripts/tests/ml_dataset.test.js tests/scripts/strategy_backtest_contract.test.js`,
  `node --test tests/scripts/tests/crypto_5m_backfill.test.js`, and full `npm.cmd test` = **389/389**.
- The session-22 1825d crypto backfill process is still active as of this update:
  PID 14380, command `backend/cli/sovereign_cli.js crypto-deep-backfill --days 1825 --delay-ms 250 --json`.
  Header probes show it is making progress and has rewritten bins through NEAR/AVAX/FET/POL, but INJ/RNDR
  still need final verification after the process exits.

## Update - 2026-06-12 session 23b - US equity 5m Phase 2 landed; crypto rerun verified complete

- Verified the session-22 crypto 1825d 5m rerun has exited. Ts-index header probe found 13 configured
  crypto symbols at the full 525,506 bars; newer/listing/provider-limited symbols remain shorter
  (SUI/PEPE/WIF/POL/RNDR), not a live process issue.
- Implemented native US-equity 5m Phase 2 via Alpaca:
  `fetchAlpacaBaseCandles` now maps internal timeframes to Alpaca (`5m` -> `5Min`), follows
  `next_page_token`, defaults to `feed=iex`, and requests `adjustment=split`; `fetchPaginated`
  uses 10,000-bar equity chunks and supports `chunkDelayMs`; `fetchEquityOrIndexSnapshot` routes
  Alpaca sub-daily requests through native paginated bars and refuses to synthesize missing Alpaca 5m
  from daily data.
- Added `equity-deep-backfill` CLI. Dry run over real config planned 33 Alpaca-eligible US symbols
  and 44 explicit non-US skips. Live run:
  `node backend/cli/sovereign_cli.js equity-deep-backfill --days 1825 --chunk-delay-ms 500 --json`
  succeeded for 33/33, skipped 44, reported 3,100,888 fetched bars; ts-index verification found
  3,101,322 merged `provider=alpaca` 5m rows across the 33 US symbols, no missing bins.
- Added no-network coverage in `tests/scripts/tests/equity_5m_backfill.test.js` for Alpaca pagination,
  equity chunk sizing, native ingestion, no-synthetic fallback, dry-run skips, and provider-pinned
  command execution. Affected bundle passed 47/47; full `npm.cmd test` passed **395/395**.
- Remaining 5m work: Phase 3 indices/commodities/FX provider decision or Yahoo 60-day accumulate-forward
  stop-gap, equity session-gap guard before indicators/backtests, and ML 5m cap/performance gates.

## Update - 2026-06-14 session 31 - Background backfill daemon + mixed base grain (1m crypto/equities, 5m Yahoo)

- Added the **1m grain**: `'1m'` in `SUPPORTED_INTERVALS` (constants.js) and prepended to the
  Binance/Coinbase intraday `ORDER` (index.js:2011); Alpaca already mapped `1m`->`1Min` and its
  routing ORDER already led with `1m`, so no provider work was needed. 48-byte binary record
  format is unchanged.
- **Mixed base grain**: crypto + US equities now backfill a native 1m base (Binance/Alpaca SIP
  serve deep 1m) and derive 5m/15m/30m/1h/4h locally; Yahoo families (indices/commodities/fx)
  stay on a 5m base (Yahoo only serves ~7d of 1m). Per-family map `FAMILY_BASE_TF` in data.js.
- Generalized the rollup: `rollupFiveMinForSymbol` -> `rollupFromBase(tsDir,symbol,baseTf,targets)`
  (+ `listDeepSymbols`, `rollupTargetsAboveBase`); thin 5m wrappers kept for existing callers.
  `crypto-deep-backfill` / `equity-deep-backfill` default to the 1m base with a `--base-tf` override.
- New cache-availability probe `shared/lib/market/coverage.js` (`readCoverage`/`isFresh`/
  `summarizeUniverse`): cheap header + 8-byte tail read for count/last-bar; reuses
  `familyFreshnessThresholdMs` (added 1m thresholds: crypto 2h, equities 96h).
- New top-level `backfill-daemon` CLI command (`backend/cli/commands/data/backfill_daemon.js`,
  registered in sovereign_cli.js; invoke as `sovereign_cli.js backfill-daemon`, NOT under a `data`
  prefix): cache-aware orchestrator — per (symbol, baseTf) it DEEP-fetches missing,
  INCREMENTAL-refreshes stale, SKIPs fresh; rolls up after each fetch; prints per-symbol decision
  lines + a per-cycle JSON summary. New Docker `backfill` service mirrors `bot`.
- **Cost note:** 1m is ~5x the storage/fetch volume of 5m for crypto/equities. No destructive
  migration — 1m backfill is additive and existing native 5m bins are refreshed via merge-protected rollup.
- Verification: `node --test` on intraday_rollup (5/5, incl 1m->5m/15m lossless), coverage (4/4),
  backfill_daemon (4/4, cold DEEP+rollup / warm SKIP no-wasted-fetch). Live 1m provider smoke
  (Binance/Alpaca) NOT run in this session — requires network + API keys.
- **Future phase (deferred):** 1m grain for Yahoo families is intentionally NOT pursued (provider
  cap). If a finer-than-1m or tick grain is ever wanted, it is a separate record-format decision.

## Audit Note - 2026-07-15 session 82 - deep blast-through after July 14 merges

- Full / Hard audit at `49560981` found the dirty tree masks a broken commit: four canonical shared
  modules contain merge markers in `HEAD`, while repaired copies and four shims are uncommitted.
- Live execution is **blocked for safety**. The merge removed Polymarket session/PIN and gateway live
  authorization, broker-backed risk context, explicit price validation, and native pre-trade approval.
- `npm test` cannot start because `tests/run_node_tests.js` is missing. Direct fallback: 815 total,
  747 pass, 59 fail, 9 skip. API 5/7, contracts 30/31, TUI 32/37, analysis 19/19.
- Archive integrity is degraded: 4,896 workspace-history lines were removed relative to parent 1,
  including session 73-81 review detail. The July 13 handoff and review ledger survive.
- Local data is 92/92 cached and 0 stale, but 9 grain suspects remain advisory-only and do not gate
  scorecard consumers. This seam is degraded pending source/rebuild proof.
- DCS `0.635 -> 0.590`; promotion remains blocked. Full evidence is in DEV_REVIEW session 82.

## Planning Note - 2026-07-15 session 82 - objective grade recovery

- `mass-implement` Planning Mode is recorded in
  `workspace/plans/SESSION_82_MERGE_RECOVERY_GRADE_PLAN.md`.
- Ranked order: restore Polymarket fail-closed execution; repair clean-HEAD/test truth; recover workspace
  history; repair API fallback truth; reconcile TUI manifests; then classify/gate grain suspects.
- Diagnostic correction: the weekly/monthly correlation failure currently has zero observations because
  `tests/fixtures/backend_history_sample.json` was deleted with the test runner. Restore the fixture before
  changing correlation production code. Data-summary separately mishandles an unspawnable native binary.
- Realistic post-recovery ceiling is C+/B- engineering health, not A and not live-capital approval. Grades
  move only after the plan's named verification gates pass.

## Correction - 2026-07-15 session 82 - fail-closed Polymarket execution restored locally

- Merge-recovery Batch 1 restored direct-order `--live` enforcement, CLI session/PIN authorization,
  gateway authorization handoff, explicit prediction-market price bounds, broker-derived quote/equity/
  drawdown risk context, and native pre-trade approval before either Polymarket order-placement path.
- The same reconciliation restored the Polymarket bot feature/PIN gate and canonical position-lifecycle
  projection. Truncated fill history and unknown/ended markets now fail valuation closed, and position
  pricing no longer mutates process-global `console.error`.
- Local safety evidence is green: gateway TypeScript passed; the combined authorization, risk-context,
  lifecycle, proposed-order, MCP, runtime-settings, cloud-guard, and dashboard PIN bundle passed 58/58;
  a wider focused bundle including bot state/cycle passed 49/49; `git diff --check` passed.
- Gateway live-safety posture moves from F to at most C+ on local evidence. Real-capital approval remains
  blocked pending independent review and live soak. Repository-wide verification is still blocked by
  Batch 2: `npm test` exits 1 because `tests/run_node_tests.js` is missing.

## Correction - 2026-07-15 session 82 - bot gateway authorization parity

- The direct gateway `bot cycle`, `bot run`, and `bot sell` live paths now require the same
  `SOVEREIGN_EXECUTION_AUTHORIZED=true` marker as direct Polymarket buys and sells. `commandBot()` forwards
  that marker only after the shared Polymarket live authorization and PIN gate succeeds.
- Regression evidence: the focused P0 suite passed 26/26, including direct buy and bot-cycle rejection,
  explicit limit-price enforcement, broker quote/equity/drawdown context, and native-risk rejection.
  Gateway TypeScript and `git diff --check` also passed. This is local contract evidence only; live-capital
  approval remains blocked pending independent review, a clean-HEAD recovery, and live soak.

## Correction - 2026-07-15 session 82 - MCP cached research parity

- Added read-only MCP `get_market_bias` and `get_scorecard` tools to expose the CLI research surface without
  triggering provider refreshes. Both use `--no-backfill`; the bias payload retains per-timeframe freshness,
  while scorecard uses the new opt-in `--envelope` to retain fail-closed eligibility and exclusion reasons
  unless `allow_degraded` is explicitly requested for research.
- These tools do not place orders and must not be used to imply real-capital approval. Focused MCP contract
  tests and the compiled MCP stdio discovery probe are required before claiming the server update is complete.

## Verification Note - 2026-07-15 session 82 - MCP host-bound checks

- `npm run build --prefix backend/mcp_server` and the focused MCP contract test passed. The recorded schema-3
  scorecard fixture also proved `--envelope` emits the full decision/exclusion payload.
- This sandbox denies child-process pipes with `EPERM`: direct bridge invocation cannot `spawnSync` Node, and
  `scripts/mcp_stdio_probe.js` times out before initialization. The compiled output contains both new tool
  registrations, but execute the stdio probe and one cached `get_market_bias` call on the host before relying
  on the MCP runtime.

## Correction - 2026-07-15 session 82 - MCP safety and signal completeness

- Replaced the synchronous MCP CLI bridge with an asynchronous child-process bridge that has a 30-second
  default timeout, a 1 MB combined output cap, structured termination errors, and no MFA-related environment
  override. All MCP CLI wrappers now await that non-blocking bridge.
- `backfill` and `backfill_family` reject writes unless `execute=true`; `backfill_all` is no-write preview
  mode by default and requires `execute=true` for writes. Unbounded market, universe, inspection, and
  scorecard inputs now have explicit schema limits.
- Added cached-only `get_market_signal`: it returns `no_trade` for missing/stale bias data or an ineligible
  scorecard row, otherwise `review_only`; it has no order path. The stdio probe now asserts discovery of all
  three cached research tools.
- Verification: MCP TypeScript build, focused contract suite, explicit bound-rejection smoke check, and
  `git diff --check` passed. The runtime stdio probe still times out before initialization in this sandbox;
  run `node scripts/mcp_stdio_probe.js` on the host to verify real child-process stdio behavior.

## Correction - 2026-07-15 session 82 - backfill daemon freshness recovery

- Root cause of the current stale BTC scorecard was confirmed locally: the recorded backfill-daemon PID
  `463137` is dead, although its old status file still reported `running`. No live daemon process exists.
- Restored the tested scheduler contract: a fresh base bin now receives a bounded local `refresh` rollup,
  so interrupted or missing `1h`/`4h` derivatives heal without another provider poll. Rollup failures now
  increment the cycle error count and are reported through the per-job status callback.
- Restored atomic daemon-status writes, SIGINT/SIGTERM stopped markers, and `stop-backfill-daemon` PID
  validation/signalling. The daemon now updates completed-job and sleeping status instead of leaving a stale
  `running` record after exit.
- Verification: both focused backfill-daemon suites and `git diff --check` passed. Restarting the daemon or
  fetching provider data was not attempted from this sandbox; host runtime verification remains required.

## Audit Note - 2026-07-15 session 82 - schema-2/schema-3 composition

- Data-integrity blast-through confirmed that schema 2 and schema 3 are intentionally isolated, but the
  bridge toward a real combined research engine is incomplete. The strict schema-2 technical adapter has
  no production caller, and schema-3 family services still use synthetic technical parity factors.
- Canonical macro ingestion/storage is point-in-time safe in focused tests, but no schema-3 analyzer reads
  `selectMacroObservationsAsOf`; current family shadows read recorded JSON fixtures directly.
- DCS remains `0.571`: four of seven recorded rows are within declared validity, schema contracts validate,
  and zero of seven rows are eligible. Promotion and actionable buy/sell output remain blocked.
- Verification: focused analysis 27/27 and macro storage/ingestion 8/8. No provider calls, writes, or data
  transformations were performed. Next batch is a research-only exact-asset composition service; schema 2
  remains the default and factor scoring semantics remain unchanged pending calibration evidence.

## Planning Note - 2026-07-15 session 82 - combined research engine

- `blast-through` now grades a combined actionable engine separately from its technical, macro, fundamental,
  or schema-versioned components. Adapters, policies, and fixtures without a production composition caller
  remain D/nonexistent; synthetic, stale, mismatched, or unvalidated actionable output is F/dangerous.
- The implementation plan is `workspace/plans/SCHEMA2_SCHEMA3_COMBINED_ENGINE_PLAN.md`. It requires exact
  canonical asset identity, point-in-time macro selection, schema-2 technical adapter wiring, fail-closed
  freshness/provenance gates, and contract-equivalent read-only CLI/API/MCP exposure.
- No production engine code or promotion changed in this planning pass. Schema 2 remains the default, all
  first-release combined outputs remain research-only and `decision_ready: false`, and merge-recovery gates
  must clear before broad verification claims.

## Audit Note - 2026-07-16 session 83 - merge-recovery triage

- Triage / Fast Reading Mode rechecked the session-82 P0 merge-recovery surface at `98bd86c3` plus the
  current dirty worktree. DCS remains `0.590`; live execution and promotion remain blocked.
- The local direct Polymarket order patch passes focused auth/preflight `5/5`, risk/backend-bridge `6/6`,
  gateway TypeScript, eight current-tree module loads, and `git diff --check`.
- A remaining P0 bot bypass was confirmed statically: `LIVE_TRADING=true` makes cycle and force-sell live,
  while gateway and CLI authorization checks trigger only when `--live` is present. Those paths call CLOB
  `postOrder` directly and do not pass through restored native pre-trade risk approval.
- Clean committed state is still broken: an extracted `git archive HEAD` reports syntax errors in four
  conflict-marked canonical shared modules, and `npm test` cannot start because `tests/run_node_tests.js`
  is absent. Continue merge-recovery Batches 1-2 before any live trading or feature work.

## Mass-Implement Closeout - 2026-07-16 session 83 - merge recovery complete

- Completed the seven-batch session-82 recovery plan in six scoped commits: `bc9ce6de` restored
  fail-closed Polymarket bot execution, `713b1f98` restored clean-clone/test contracts, `d851d7c6`
  recovered session 73-81 history, `8e08ab6d` restored truthful ingest/TUI contracts, `d8d78545`
  made unexplained grain fail closed, and `cb1c349f` restored the final merged data/CLI seams.
- Canonical root verification is green: full Node 821 total / 817 pass / 0 fail / 4 skip; API 7/7;
  contracts 31/31; native CTest 29/29; frontend typecheck/build; gateway and MCP TypeScript; six
  dependency roots; hygiene; diff integrity; and secret scan 814 files / 0 violations.
- A clean `git archive HEAD` loaded all 15 canonical/shim/changed modules and found the root test runner.
  `graphify` and `graphify-out` remain unavailable, so no graph refresh is claimed.
- Current integrity truth is 92/92 cached and 0 required-window stale. Of nine density suspects, eight
  are cadence-plausible and one remains unexplained: `SOYB 5m` has 4,640 rows, 8.89 recent active-day
  bars/day, and a 15-minute median gap. Integrity is correctly `ok:false`, and scorecard consumers exclude
  that seam before analysis. No binary cache was rewritten.
- Engineering recovery reached the planned C+/B- ceiling: bootstrap/tests are reproducible, gateway/CLI
  execution is locally fail-closed, API/contracts are green, workspace history is recovered, and market
  integrity propagates degradation. This does not approve real-capital execution, schema-v3 promotion, or
  the combined actionable engine. Independent live-soak, remote RLS, real evidence/calibration, and the
  unexplained grain repair remain open.

## Recovered Merge History - 2026-07-16 session 83



Source: `49560981^1:workspace/STATE.md`. These sections were restored additively after merge-history loss; existing entries were not rewritten.



## Mass-Implement Closeout - 2026-07-13 session 76 - auth freshness and baseline inventory

- Removed the 30-second authorization-decision cache. Protected bearer requests and database status now
  revalidate the Supabase user before trusting cached results; same-token revocation is covered.
- Dashboard session restoration verifies the persisted candidate token with the provider, fails closed on
  revocation/provider failure, and confirms local logout before clearing UI state.
- Fixed TUI clipping that hid categories/commands at narrow widths and selected rows in wide-short
  terminals; layout capacity is height-aware and uses explicit bounded more markers.
- Kalshi historical fetches now report structured `not_implemented` instead of empty success. Existing
  Polymarket historical contracts remain green.
- Captured valid 80/100/120-column density baselines and classified duplicate/stub ownership. No API bind
  widening or deletion occurred. The web dashboard remains responsive-layout gated.
- Verification: contracts 28/28; full Node suite 730/728/0fail/2skip; frontend typecheck/build; hygiene;
  secret scan 829/0; diff check. DCS remains 0.95 because data/model promotion state did not change.

## Implementation Note - 2026-07-13 session 74 - interrupted TUI/Polymarket batch resumed

- The previously interrupted mass-implement work on the dashboard input bar, layout density, Polymarket
  lifecycle handling, and manifest parity was resumed from the existing dirty worktree and completed.
- The CLI command bar now has a dedicated editor with working mid-line edits and width-aware rendering.
- The dashboard layout now adapts to narrow terminals instead of flooding the TUI.
- Polymarket ended/unknown positions now fail closed, and truncated trade history is treated as incomplete.
- The dashboard manifest parity guard now covers the shared command surface and caught a real missing
  `backfill-daemon --interval-secs` flag, which was restored.
- Verification: focused dashboard/chat/Polymarket suites plus the manifest contract passed; the final
  combined run passed 51/51 with zero failures.
- The worktree still contains unrelated pre-existing changes outside this batch; keep future cleanup
  narrow and preserve those boundaries.

## Audit Note - 2026-07-12 session 74 - TUI interaction and Polymarket lifecycle

- The Ink dashboard is not responsive below 120 columns: fixed 20+76-column panes flood an 80-column
  terminal, and terminal-height resize does not update the component's numeric height/cursor layout.
- The command bar's append, end Backspace, submit, focus, and PIN paths work, but mid-line cursor editing
  is broken by the `showCursor:false` integration with the installed `ink-text-input`.
- Polymarket fill-derived positions do not preserve resolved lifecycle status. Ended positions may be
  labeled active and their cost-basis fallback can enter aggregate equity; this output is decision-gated
  until active/ended/unknown projection fixtures and fail-closed valuation land.
- TUI maintainability remains degraded by two drifting command manifests and a 957-line dashboard `App`.
- This was review-only: focused tests passed 19/19; no production code or live external state changed.

## Audit Note - 2026-07-11 session 73 - production-readiness connective sweep

- Verdict: **not approved for real-money decisions or live Polymarket execution**.
- Gating execution defect: top-level/direct Polymarket `buy`/`sell` can submit without explicit `--live`,
  PIN/auth, runtime-mode approval, or the shared C++ risk path.
- Gating API defects: public research/data routes accept caller-controlled file paths; several response
  caches omit response-shaping inputs; browser-bundled `VITE_API_TOKEN` is used as an admin-style bot
  mutation credential without per-user server authorization.
- Current data fails closed for decision use: crypto scorecard 0/36 eligible, model report expired,
  latest backtest is sample-mode with zero trades, and integrity reports 15 stale symbols plus 9 grain
  suspects. Correlation fallback still incorrectly reports `ok:true` at sample size zero.
- UI is not operationally truthful: hardcoded LIVE state and decorative safety/execution controls; the
  signal-review action currently references undefined `signalIds`. Frontend type-check fails, while Vite
  emits one 945.88 kB JS chunk.
- User-data positives: own-user Supabase RLS policies are committed, secret scan passed 829 files with
  zero violations, and the Node suite passed 704/0/2. Remote RLS state was not verified.
- Full findings, grades, orphan matrix, and clearance gates are in `workspace/DEV_REVIEW.md` under
  "Connective-Tissue Production Readiness Audit - 2026-07-11 session 73".

## Audit Follow-up - 2026-07-11 session 73 - remaining sections and language decision

- Added a second P0 execution blocker: market orders carry no price, so the JS gateway sends zero
  notional to C++ risk; the native engine approves because concentration is skipped. Portfolio equity
  and drawdown are static environment proxies rather than current broker state.
- Model comparison is not trained-ML comparison: architecture-named candidates such as CNN, XGBoost,
  random forest, LSTM, and Transformer are deterministic formulas. Real ONNX candidates exist but are
  excluded from `compareModels()` and the canonical model report.
- MCP defaults backtests to `--allow-degraded`, and MCP live Polymarket inherits the direct order bypass.
- Kubernetes, Terraform, and Heroku starters launch nonexistent `web/app.js`; only Docker Compose is
  aligned. Supabase risk alerts are logging-only scaffolds.
- Architecture decision: consolidate the control plane on TypeScript, retain only benchmark-justified
  C++ compute kernels, keep simple authorization/risk in the typed gateway, and retire the Rust mirror.
- Details and revised grades are appended to `workspace/DEV_REVIEW.md` under
  "Connective-Tissue Follow-up - 2026-07-11 session 73 - remaining sections and language boundary".

## Mass-Implement Closeout - 2026-07-11 session 73 - production safety and bloat

- Direct Polymarket submission now requires explicit `--live`, runtime approval, authenticated CLI/PIN
  authorization, a gateway authorization marker, explicit limit price, broker equity, current drawdown,
  and native pre-trade risk approval. Market orders resolve broker quotes instead of sending zero notional.
- Native risk now rejects non-positive notional/equity and treats the denominator as portfolio equity;
  `--volatility` remains a temporary compatibility alias for older local binaries.
- API path/equity overrides and every non-GET request require either the host token or a verified Supabase
  bearer session. Browser assets no longer compile `VITE_API_TOKEN`; auth cache keys hash bearer tokens,
  and data/correlation/universe cache keys include all response-shaping inputs.
- Handcrafted architecture-named scorers are labeled `handcrafted_heuristic`, `trained=false`, and
  `decision_ready=false`. Signal activation now also requires explicit trained/decision-ready metadata and
  passing model/backtest quality. MCP backtests default to fail-closed data quality.
- Frontend removed seven zero-consumer direct packages, added missing React typings, fixed signal review,
  and lazy-loads secondary panels. Typecheck and build pass; initial JS fell from about 946 kB to 471 kB.
- Kubernetes, Terraform, Heroku, and setup paths now use real entrypoints. Nine zero-reference native
  placeholder headers were removed. Rust mirror deletion remains unperformed because it exceeds the
  safe-deletion confirmation threshold.
- Verification: full Node suite 710 total / 708 pass / 0 fail / 2 skip; API and focused safety contracts
  pass; frontend typecheck/build pass; MCP and gateway TypeScript builds pass; model registry parity,
  hygiene, deployment contract, and secret scan (829 files / 0 violations) pass. Native compiles fully;
  26/29 CTest cases pass from `/tmp`, while three fixture-relative tests cannot locate repo data there.
- Verdict remains research-only, not approved for real capital: current data integrity/freshness is still
  failed, no validated decision-ready model is promoted, remote RLS was not verified, and live broker soak/
  failure-mode tests remain outstanding. Frontend install also reports three high-severity transitive advisories.

## Mass-Implement Closeout - 2026-07-13 session 75 - package and verification truth

- Removed unused `express`, `ejs`, and `dotenv` API dependencies and regenerated the nested lockfile
  offline. The API package now installs only its actual external runtime dependency, `socket.io`.
- Pinned the MCP SDK to tested version `1.29.0`; the package, lockfile, installed tree, and TypeScript
  build now agree on that exact version.
- Repaired 15 stale npm-script test paths after the test-tree reorganization, serialized the aggregate
  API gates that own process-global server state, and added a structure contract that rejects future
  references to missing `.test.js` files.
- Correlation fallback now requires at least two aligned observations and returns
  `insufficient_aligned_observations` with `ok:false` instead of publishing a zero-sample healthy matrix.
  Weekly/monthly derivation tests now use a stable checked-in fixture rather than mutable runtime cache.
- Updated active API architecture docs to describe the native `node:http` plus Socket.IO bridge and the
  built React dashboard path. Updated the portfolio-monitor fixture to satisfy the verified-active
  Polymarket valuation contract without weakening production fail-closed behavior.
- Verification: API package and MCP dependency roots resolve cleanly; MCP build passes; `test:api` passes
  6/6; `test:contracts` passes 23/23 with 22 macro rows and 9 reserves rows; portfolio monitor passes 8/8;
  the full Node suite completes with no failures; hygiene and `git diff --check` pass.
- Grade-factor movement: `backend/api` clears dependency bloat and zero-sample false health but remains
  trust-gated by broader production-readiness items; `backend/mcp_server` clears reproducibility drift but
  remains policy-gated by the degraded-backtest behavior recorded in the review ledger.

## Deferred Refinement - 2026-07-13 session 75 - API auth, UI density, and duplicate cleanup

- User explicitly deferred implementation to a future session.
- Added repo-local `$refine-suggestion` skill to convert rough or preference-based suggestions into
  sourced objectives, measurable acceptance criteria, ranked batches, verification, and safety gates.
- Refined the deferred work into `workspace/plans/FUTURE_API_AUTH_UI_DEDUP_REFINEMENT.md`.
- Future order is: capture baselines; prove automatic Supabase session restoration; gate any wider API
  bind behind authentication; reduce persistent UI characters with measured budgets; then remove or
  consolidate verified duplicate/stub ownership across trade, research, backend, and data.
- No API binding, login, UI, command schema, stub, or duplicate runtime behavior changed in this update.

## Blast-Through + Mass-Implement Closeout - 2026-07-13 session 78

- Continued the deferred responsive-dashboard batch from the current session handoff.
- Added a dependency-free production-build Chrome/CDP harness at 375, 768, and 1440 pixels. The baseline
  passed 1/6 and exposed unnamed navigation, persistent mobile controls, and fixed tablet grids.
- Implemented one reachable ten-destination navigation, `aria-current` state, a collapsible research
  sidebar below 1024px, 1/2/4 overview reflow, responsive fixed-grid panels, and bounded table surfaces.
- Final responsive gate passes 6/6 and activates every destination at every viewport while checking page
  and active-main overflow. Frontend typecheck/build, hygiene, and `git diff --check` pass.
- `Frontend/dashboard` moves C / responsive-gated -> B- / live-browser-gated. Authenticated live-provider
  browser soak remains open; no API bind widening, duplicate deletion, or market-data change occurred.
- Next implementation returns to the recorded asset-analysis plan: shared contracts plus the US-equity,
  fixed-3-month shadow schema, with the current scorecard kept live until parity is proven.

## Mass-Implement Closeout - 2026-07-13 session 79 - analysis contracts and taxonomy

- Wrote the eight-batch implementation plan at
  `workspace/plans/ASSET_ANALYSIS_IMPLEMENTATION_BATCHES.md` and delegated only bounded additive work to
  `gpt-5.6-luna`.
- Added schema-v3 runtime contracts and a weight-free section registry for equities, crypto subtypes, FX,
  commodity subtypes, and indices. Synthetic fixtures are explicitly labeled and validators fail closed
  on provenance, timestamps, ranges, policy mismatch, duplicate/inapplicable domains, and missing reasons.
- Added a shadow taxonomy inventory over the real market config. Current evidence: 316 configured inputs,
  122 scoreable candidates, 108 evidence descriptors, 30 unsupported/ambiguous entries, 45 repeated
  declarations, 57 repeated legacy-symbol declarations, and zero identity conflicts/symbol collisions.
- Live schema-v2 scorecard, universe resolver, and market config hashes are unchanged. No provider fetch,
  scoring weight, live ranking, API, UI, or data mutation was added.
- Verification: focused analysis/taxonomy 9/9; live-v2 compatibility 2/2; structure 1/1; hygiene and secret
  scan pass; diff check passes. Full suite 736 pass / 1 fail / 2 skip; the unrelated strategy-label test
  passes 16/16 alone, indicating an existing parallel registry race.
- Next gate is the technical v2-to-v3 shadow adapter, followed by point-in-time macro repair and only then
  the US-equity three-month SEC/fundamental composer.

## Blast-Through + Mass-Implement Closeout - 2026-07-13 session 80 - technical shadow adapter

- Blast-through triage confirmed Batch 3 as the recorded critical path. The prior parallel TUI
  strategy-label failure was not reproduced: its focused 16/16 gate and the full Node suite pass.
- Added a pure schema-v2 to v3 technical shadow adapter. It preserves direction, score, confidence,
  source timing, and validity while deriving deterministic evidence ids from complete timeframe details.
- The adapter fails closed on incomplete rows/timeframes, histories below 20 bars, malformed timing, and
  expired row or timeframe validity. No live ranking, provider, API, TUI, browser UI, or scoring weight changed.
- Scoped DCS started and ended at **1.00** for the fixture-backed path: freshness 1.00, schema 1.00,
  coverage 1.00. This is adapter-fixture confidence, not live-market readiness.
- Verification: focused analysis/freshness gates 12/12; TUI strategy gate 16/16; hygiene; syntax;
  `git diff --check`; full Node suite passes.
- Grade movement: analysis shadow surface B -> B+ / macro-gated. Next gate is point-in-time macro release,
  availability, vintage, and revision truth before any equity composer or policy weights.

## Mass-Implement Closeout - 2026-07-13 session 80 - point-in-time macro truth

- Completed asset-analysis Batch 4. Macro normalization now separates period end from release,
  availability, ingestion, and vintage, and assigns revision identities without deleting legacy rows.
- As-of selection fails closed: a row must have valid release/availability/ingestion order, and both
  availability and local ingestion must precede the decision timestamp. Later visible revisions replace
  earlier vintages only for decisions made after those revisions became usable.
- Added a forward Supabase migration for normalized fields, revision-preserving uniqueness, timestamp
  constraints, and point-in-time lookup indexing. Remote migration state was not changed or verified.
- Evidence: 4 fixture revisions -> 3 point-in-time eligible + 1 legacy rejected; May 1 sees value 100,
  June 1 sees value 102. Existing macro ingest still emits 22 rows and preserves history after merge.
- Verification: focused analysis/macro 12/12; contract suite 29/29; full Node suite 743 total / 741 pass /
  0 fail / 2 skip; hygiene, syntax, migration shape, and `git diff --check` pass.
- Grade movement: macro storage C / period-time-only -> B+ / remote-migration-gated; analysis shadow
  remains B+ and moves from macro-gated to equity-policy-gated. Next is Batch 5 only.

## Session Close - 2026-07-13 session 80 - remaining phases evidence gate

- User requested mass implementation of all remaining asset-analysis phases and session closeout.
- Local evidence search found no recorded SEC EDGAR Company Facts artifact and no SEC fundamentals
  adapter. Only explicitly synthetic analysis fixtures exist.
- Batch 5 therefore remains blocked by its own acceptance gate: a recorded SEC artifact must prove
  filing/release availability, normalized facts, and missing-fundamental degradation before policy weights
  or a shadow equity row can be considered trustworthy.
- Project phase gating prevents Batches 6-8 from starting on top of an unverified Batch 5. No fabricated
  SEC data, invented weights, generic family policies, API/TUI exposure, or schema-v2 retirement was added.
- The implementation plan header was corrected from Batches 1-2 to Batches 1-4 complete. The verified
  session baseline remains full Node 743 total / 741 pass / 0 fail / 2 skip.
- Restart gate: capture one provenance-recorded SEC Company Facts response for a US common equity, then
  implement SEC normalization and the research-only equity 3m composer before advancing to Batch 6.

## Mass-Implement Closeout - 2026-07-13 session 81 - SEC equity shadow policy

- Completed Batch 5 using a recorded official Apple Inc. SEC Company Facts artifact rather than synthetic
  fundamentals: 503 `us-gaap` concepts normalized into 1,392 observations across eight metrics.
- The normalizer retains filing/accession/frame provenance, filters by decision-time availability, selects
  visible restatements, and delays filing-date-only availability to the following UTC day.
- The fundamental analyzer compares like-duration quarterly revenue and fails closed on missing history or
  stale evidence. The research-only composer excludes missing fundamentals and never renormalizes weights.
- Focused analysis 11/11, first full Node run, hygiene, syntax, and diff integrity passed. A repeated full
  run hit unrelated parallel TUI file-level failures.
- Grade movement: B+ / equity-policy-gated -> A- / service-parity-gated. Next is Batch 6 only.

## Mass-Implement Closeout - 2026-07-13 session 81 - analysis phases 6-8

- Completed canonical shadow service and thin CLI/authenticated-API parity. Schema v3 is explicit and
  named-fixture-only; schema v2 remains live/default.
- Added recorded family slices for FX, index, energy, BTC/ETH native-chain, and Aave protocol evidence.
  Official unavailable feeds fail closed. Catalog truth is 7 rows: 0 eligible, 4 degraded, 3 excluded.
- Added terminal research home/screener/workbench behavior to the existing scorecard surface, including
  compact width budgets and provenance drill-down. No browser dashboard or provider ownership was added.
- Added readiness evaluation. Promotion is rejected because synthetic parity evidence remains and no
  point-in-time targets, OOS baseline, turnover/cost model, or calibration sample exists.
- Verification: serialized full Node 755/753/0fail/2skip; focused phase gates pass; hygiene, syntax, API
  auth, manifest parity, diff integrity, and secret checks pass.
- Current grade: A- / promotion-blocked. Schema-v2 retirement is not authorized or evidence-safe.

## Goal Completion Audit - 2026-07-13 session 81

- Re-audited every Batch 6-8 acceptance gate against executable evidence rather than the earlier
  closeout summary. Recorded-provider factors now reject decisions before artifact retrieval, factor
  domains are proven applicable to each family policy, and catalog results are ordered only within the
  requested family/state scope.
- The real Ink dashboard test launches the existing scorecard command with canonical schema-v3 and the
  `all-recorded` fixture; no parallel command or provider owner was introduced.
- Final serialized verification after those repairs: 758 total / 756 pass / 0 fail / 2 skip. Focused
  parity/readiness/family tests, authenticated API tests, TUI/manifest tests, hygiene, per-file syntax,
  `git diff --check`, tracked secret scan (829 files / 0 violations), and direct new-file secret scan pass.
- The persistent implementation goal is complete. This means all research-shadow phases are implemented
  and verified; it does not authorize promotion, real-money use, or schema-v2 retirement.

## Audit Note - 2026-07-13 session 81 - recent-work deep blast-through

- Ran a full fast-reading blast-through against the current recent-work batch: session-81 analysis shadow
  work, the current dirty diff, recent API auth/session surfaces, and the latest ingest/scorecard changes.
- Confirmed one material trust gap in the new recorded-family analysis path: recorded FX, EIA, and
  DefiLlama factors currently label `data_as_of` and derive `valid_until` from fixture retrieval time
  instead of the underlying observation timestamps. The family-shadow catalog therefore overstates
  freshness even though promotion remains blocked.
- Confirmed one audit-integrity gap in `/api/signal/promote`: malformed `signalIds` are mutated by
  sanitization before active-signal validation and audit-event persistence, so an authenticated caller can
  coerce a bad ID into a different active ID instead of receiving a clean rejection.
- Broad gate: `npm run hygiene` passed. `graphify-out` remains unavailable.
- Grade movement: `shared/contracts/analysis` + `shared/lib/analysis` A- / promotion-blocked ->
  B+ / freshness-truth-gated. `backend/api` stays B- and is now labeled audit-integrity-gated.

## Audit Note - 2026-07-13 session 81 - execution and config triage

- Ran a triage, Fast Reading Mode blast-through outside the prior analysis/signal findings. Scoped DCS
  stayed **0.62**; no production code changed and live promotion remains halted.
- Confirmed strategy automation always passes `--allow-degraded`; a direct trust probe showed elevated
  data risk can still score 70/B/`researchable` and reach the default live threshold.
- Confirmed the Polymarket bot uses the Alpaca live-capability gate and omits the Polymarket feature/PIN
  authorization contract used by direct orders, including when invoked by the authenticated API.
- Confirmed `/api/config` requires `public.user_config`, but no checked-in Supabase migration creates the
  table, uniqueness contract, or own-user RLS policy.
- Focused settings/strategy contracts passed 25/25; hygiene and diff integrity passed. Those tests do not
  cover the three failing combinations above.
- Grade movement: `backend/cli` C -> C- / live-integrity-gated; reviewed `backend/gateway` bot seam B+ ->
  B- / caller-auth-gated; `backend/api` + `supabase` move to C+ / schema-contract-gated.

## Mass-Implement Closeout - 2026-07-13 session 81 - audit trust repairs

- Closed all five actionable findings from the two current blast-through reports without changing live
  defaults or authorizing real-capital use.
- Strategy automation no longer permits degraded backtests and independently fails closed on any
  non-verified `data_quality_ok` result before it can reach live trade dispatch.
- Polymarket bot cycles now require both the bot and Polymarket feature flags and reuse canonical
  Polymarket capability, session, and PIN authorization instead of the Alpaca gate.
- Added the forward `public.user_config` migration with composite `(user_id, config_key)` identity,
  own-user RLS, and `updated_at` trigger. The API only persists known config keys with matching shapes.
- Signal review rejects malformed IDs exactly; recorded provider factors now anchor freshness and validity
  to source observations, with retrieval time retained only for availability/provenance diagnostics.
- Verification: focused execution/settings 10/10, Supabase route 4/4, signal/analysis 9/9, full
  `npm test` exit 0, hygiene exit 0, and diff integrity exit 0.
- Grade recovery: `backend/cli` C / duplication-gated; reviewed `backend/gateway` B+ / fail-closed;
  `backend/api` B- / deployment-gated; `supabase` B / remote-RLS-gated; analysis A- / promotion-blocked.
  Real-capital promotion remains blocked by fresh data, validated models, remote RLS, and broker soak tests.

## Mass-Implement Correction - 2026-07-13 session 81 - scorecard recovery contract

- Schema-2 Scorecard now screens only the five price families it can technically analyze. The former
  172-row denominator included 21 macro, sentiment, options, holdings, reserve, and prediction-market
  series that cannot satisfy `1h/4h/1d` OHLCV requirements; the canonical screen/repair universe is 151.
- Terminal output now distinguishes evaluated, eligible, excluded, confidence-filtered, and shown rows,
  with exact exclusion totals grouped by reason and timeframe. Current cache diagnostics report 151
  evaluated, 1 eligible, 150 excluded, and 1 filtered below the 0.30 screen threshold.
- The Scorecard's advertised refresh path is now real: direct CLI runs perform a bounded selected-family
  30-day refresh unless `--no-backfill` is set; a refresh failure blocks scoring. Dashboard defaults remain
  cache-diagnostic to avoid hidden provider work and can explicitly turn the skip flag off for refresh.
- `mass-backfill` now accepts a validated `--families` boundary shared with Scorecard. Its scorecard repair
  dry run schedules 299 pending jobs across 151 symbols and `1h/4h/1d`; no provider write was run here.
- Verification: scorecard/backfill/TUI focused contracts passed, full `npm test` passed, hygiene passed,
  and `git diff --check` passed. Grade movement: schema-2 scorecard **B- / false-health-gated -> B+ /
  refresh-contract-gated**. Remaining runtime gap is successful provider backfill and a fresh post-run
  scorecard; no signal or live-trading claim is implied.

## Blast-Through Triage - 2026-07-17 session 84

- Fast-reading triage kept repository DCS at 0.95; no data transformation or promotion occurred.
- Live integrity remains fail-closed: 92/92 cached, 0 required-window stale, 8 cadence-plausible grain
  suspects, and 1 blocking `SOYB 5m` seam. The active bin has 4,648 Twelve Data rows and a 15-minute
  median recent gap despite its 5-minute label.
- The focused coverage/scorecard gate passes 21/21 and proves unexplained grain is rejected before scoring.
- Dirty `config/trading/research.yaml` reduces the default provider/prediction history window from the
  committed five-year target (1,825 days) to one year (365 days) without a default-window test or policy note.
- Next move remains a source-backed, non-shrinking `SOYB 5m` repair with before/after row, timestamp, gap,
  and checksum evidence. Separately restore 1,825 days unless the one-year research policy is intentional.

## Mass-Implement Closeout - 2026-07-17 session 84

- Closed the blocking `SOYB 5m` seam through an air-gapped Yahoo provider artifact and the canonical
  merge-protected ts-index writer. Cache history grew 4,648 -> 6,052 rows; first/last timestamps were
  preserved, and the bin checksum changed from `0745ebca...c0a8a` to `c73f8c5d...dbed9`.
- Recent cadence improved from 8.81 bars/active-day and a 15-minute median gap to 39.08 and 5 minutes.
  Integrity is now `ok:true`: 92/92 cached, 0 missing, 0 stale, 9 cadence-plausible grain suspects,
  and 0 unexplained.
- Restored the configured research history default from 365 to 1,825 days and added contracts proving
  both provider-history and prediction-market loaders use the five-year default.
- Verification: research/default 46/46; writer/backfill 33 pass / 0 fail / 4 skip; coverage/scorecard
  21/21; full Node 823 total / 819 pass / 0 fail / 4 skip; hygiene and diff integrity pass.
- Grade movement: market integrity B- -> B / integrity-green; research default B- -> B+ / contracted.
  Live trading remains blocked pending independent review and host soak.

## Rigorous Test Triage and Debugging - 2026-07-22 session 87

- Ran the session-orchestrator boot and blast-through `triage` protocol against the working tree, preserving
  all pre-existing session-84 and later uncommitted changes. No network input or data mutation was used.
- Repaired four demonstrated test boundaries: the prediction interest-history import/call, full active API
  discovery inside `test:api` and `verify:strict`, dormant/misaligned native cost-model coverage in both
  CMake manifests, and the dashboard scroll test's false-green zero-inventory path.
- Added architecture enforcement for API-gate completeness, strict-gate inclusion, and native-source
  registration parity. Updated testing docs to match the verified command topology.
- Final verification: API 8/8; contracts 31/31; secrets 818 files / 0 violations; Node 826 total / 822 pass /
  0 fail / 4 intentional skip; native CTest 30/30; dashboard 13/13; responsive browser 6/6; frontend
  lint/typecheck/build; gateway TypeScript; MCP build; all package roots; hygiene; diff integrity.
- Clean-HEAD evidence is limited to canonical runner/entrypoint syntax smoke. The complete repaired proof is
  from the dirty working tree, and no commit was created. DCS moved 0.95 -> 0.98.
- Final independent review found no blocker. A low-priority runner-selection argument-order seam remains;
  live trading and schema-v3 promotion remain blocked. `graphify-out` is unavailable.

## Private Central Host Rollout - 2026-07-22 session 88

- Recorded and executed `workspace/plans/CENTRAL_HOST_SINGLE_WRITER_ROLLOUT.md`. The supported topology is
  one private central `backfill` writer plus the co-located web/API reader; client machines update code by
  Git and reach the service over an SSH tunnel or private VPN, never by sharing the ts-index write mount.
- Added cross-process ownership-token locks around every canonical append/overlap time-series write,
  periodic refresh during deep merges, bounded stale-sidecar reclamation, timeout failure, and
  ownership-checked release. Concurrent production writers preserve exact timestamp unions and metadata.
- Added the isolated data/research-only `.env.central` contract. Central Compose forces cloud-compute,
  live=false, and execution-authorization=false; `bot` is opt-in under `paper`; default services remain
  only `web` and `backfill`.
- Added fail-closed preflight and deployment automation. Updates require clean `main`, fast-forward-only
  fetched remote parity, a deployment `flock`, private bind, owner-only env, no execution credentials,
  adequate disk/tooling, explicit web/backfill recreation, web health, and a running poller.
- Closed the session-87 runner ergonomics seam by parsing Node options before targets and using explicit
  file targets instead of broad discovery when supplied.
- Verification: Node 838/834/0fail/4skip; API 8/8; contracts 31/31; native 30/30; dashboard 13/13;
  responsive 6/6; frontend/gateway/MCP builds; all dependency roots; skill validation; hygiene; diff.
  Clean archive `59045be7` passes new syntax and focused contracts.
- Published commits `f9119729`, `cb47a921`, `59045be7`, and closeout `309679ba` to `origin/main`;
  local `HEAD` and the remote branch match.
- Runtime remains target-host-gated. After closeout, local preflight passes clean Git plus every
  safety/config/disk check and fails only unavailable Compose/daemon. Data is 92/92 cached with 72 stale,
  9 cadence-plausible notices, and 0 unexplained grain. No provider poll was run.
- Live trading, public exposure, remote Supabase/RLS approval, and schema-v3 promotion remain blocked.

## GitHub Deployment Recovery and Host Selection - 2026-07-22 session 89

- Confirmed the former `deploy.yml` never deployed: it was manual-only, had no host, and failed on a moved
  documentation path. It is now a truthful central-host readiness workflow rather than a false deployment.
- Repaired the root-build CTest directory and five native fixture/cache seams. Fresh debug sanitizer CTest is
  30/30; all empirical native paths now use tracked fixtures rather than ignored host cache.
- Replaced the TradingView SSH dependency transport with the same pinned commit over HTTPS for clean runners.
- Added a five-minute systemd host-side pull timer. The updater no-ops only when healthy at the last successful
  commit, so a failed build/health check retries even after Git has fast-forwarded.
- Host primary is Vultr Singapore x86_64, 4 shared vCPU / 8 GB / 160 GB SSD at USD 40/month; DigitalOcean
  Singapore at USD 48/month is the fallback. Provisioning awaits explicit account/payment authorization.
- Verification: Node 844/840/0fail/4skip; API 8/8; contracts 31/31; native debug 30/30; workflow/updater 7/7;
  secrets 827/0; hygiene, shell syntax, YAML parse, lock dry-run, and diff checks pass.
- Current data remains 92/92 cached with 72 stale, 9 cadence-plausible, and 0 unexplained. DCS is 0.765, so
  live trading and schema-v3/model promotion remain blocked. No provider poll or host deployment was run.
- Repository implementation is committed at `54f861eb`; Actions and target-host runtime proof remain external.

## Local Deployment Validation Only - 2026-07-22 session 90

- Corrected the session-89 host direction: paid hosting is rejected, and the current Lenovo laptop is also
  explicitly not the persistent central host. No host is selected.
- Added `host:prepare-central-env`, which generates an ignored mode-600 `.env.central`, creates a separate API
  token, maps only allowlisted research/provider settings, retains the Alpaca paper endpoint, and cannot copy
  trade PIN or Polymarket execution credentials.
- Made the future systemd updater accept an explicit absolute Node binary and grant `docker` only to the service
  process through `SupplementaryGroups`, avoiding dependence on interactive NVM PATH or user-group mutation.
- Docker Compose v2 is installed for local config testing. No updater/timer was installed, no power policy was
  changed, and no web/backfill container or provider poll was started on this laptop.
- Verification at `df3c5c57`: Node 846/842/0fail/4skip; focused deployment 4/4; Compose config, rendered systemd,
  shell syntax, secrets 828/0, hygiene, and diff checks pass. Clean preflight passes every check except Docker
  daemon access for the interactive user, which remains an intentional test-bench boundary.
- DCS remains 0.765 from the session-89 data baseline because no polling or integrity mutation occurred.
  Live trading, public exposure, schema-v3/model promotion, and remote Supabase/RLS approval remain blocked.

## Full Blast-Through - 2026-07-23 session 92

- Ran full / Fast Reading Mode against clean committed `cebd0658` plus audit/planning workspace changes.
  Archive continuity is coherent; `graphify-out` remains unavailable.
- Current integrity is 92/92 cached, 0 missing, 87 required windows stale, 9 cadence-plausible notices,
  0 unexplained grain, and 1 declared exception. DCS is **0.716** (`freshness=5/92`, `schema=1.0`,
  `coverage=1.0`), down from 0.765 because no persistent writer exists.
- The session-91 MCP failure is split into two facts: the compiled server starts directly, while the sandbox
  suppresses nested-child stdio and cannot prove a handshake; independently, `setup_mcp.js` emits a nonexistent
  Windows backend path on Linux. Recovery is planned in
  `workspace/plans/SESSION_91_MCP_RUNTIME_RECOVERY_PLAN.md`.
- Official-source structured research found no permanent-free provider that meets the full as-is workload.
  The known spare Ubuntu machine is the primary zero-provider-fee candidate if it passes amd64, 8 GB RAM,
  persistent disk, power, and uptime gates. Oracle A1 is Arm/reduced-profile-only until the x64 ONNX image
  path is corrected and measured. Current plan:
  `workspace/plans/SESSION_92_ZERO_COST_HOST_AND_TRUST_RECOVERY_PLAN.md`.
- Additional contained debt: dashboard Supabase env-example drift, API direct-dependency ownership,
  stale Rust/stack docs, the old placeholder automation script, and the zero-caller TradingView screener stub.
- The combined actionable engine remains **D / nonexistent**: exact-identity contracts and fixture-only schema-3
  services exist, but no production caller composes point-in-time required domains for one exact asset.
- Verification: hygiene pass, structure 1/1, focused deployment 11/11, clean archive deployment/preparation
  2/2, five installed package roots resolve, and direct Linux native binary discovery succeeds. No provider
  poll, data transformation, container, timer, live order, or model/schema promotion occurred.

## Mass-Implement Closeout - 2026-07-23 session 93

- Completed the repository-side MCP recovery: setup now uses canonical platform-aware binary discovery,
  validates absolute paths before an atomic write, and omits nonexistent native paths.
- Replaced the ambiguous manual timeout probe with a known-good child-stdio gate and pinned MCP SDK
  initialize/list/read-only-status flow. This sandbox now returns the truthful
  `host_child_stdio_unavailable` classification; real-host MCP proof is still pending.
- Central-host preflight now rejects non-x64 machines and memory below the 8 GB-class full-universe floor.
  Deployment guidance recommends 16 GB because the backfill heap permits 6 GB before OS, Docker, API, and
  build overhead.
- Closed contained audit debt: safe dashboard Supabase example variables, exact API Supabase dependency,
  stale Docker comment, Rust retirement and active ONNX/CI docs, zero-caller TradingView screener export,
  and the placeholder automated-strategy script.
- Regenerated the ignored local `.mcp.json`; its absolute compiled-server and Linux native-backend paths both
  exist. This is configuration-path proof, not a successful stdio exchange.
- Verification: focused 20/20; API 8/8; contracts 31/31; full Node 859/855/0fail/4skip; native CTest 30/30;
  secrets 828/0; frontend and MCP builds; Compose render; hygiene and diff checks. A clean temporary Git
  snapshot of current source passed focused contracts and lock refresh without source drift.
- The working tree is not committed, so this is current-source proof rather than committed-`HEAD` proof.
  No data/provider/container/timer/live/promotion action occurred. DCS remains **0.716** and the combined
  actionable engine remains **D / nonexistent**.

## Planning Closeout - 2026-07-23 session 94

- Refined and saved the next implementation plan at
  `workspace/plans/PRIVATE_PAPER_V1_PRODUCTION_PLAN.md`.
- The committed release target is now `private-paper-v1`: private single-user Polymarket paper production,
  Lenovo test-only, qualified spare Ubuntu persistent host, canonical paper ledger, fresh single-writer data,
  private API/dashboard/MCP, read-only combined research, and proven backup/restart/rollback.
- Real-money execution, live canary, public exposure, Alpaca/MT5 certification, Supabase/RLS production,
  strategy-to-live promotion, and combined-engine execution coupling remain explicitly deferred.
- No implementation or runtime mutation occurred in session 94. Current DCS remains **0.716**, current source
  remains uncommitted, and the next session begins with dirty-tree classification and clean-archive proof.

## System Design Review - 2026-07-24 session 96

- Added a source-backed system-design review rubric to the canonical and mirrored `blast-through` skills and
  `docs/engineering/blast_through_checklist.md`. Sources: ISO/IEC/IEEE 42010:2022 architecture-description
  concepts and AWS Well-Architected six quality lenses.
- Applied the rubric to the real provider -> validated data -> identity -> analysis -> decision -> paper/live ->
  risk -> ledger -> monitoring -> recovery path. Whole-system design is **C- / composition-and-operations-gated**.
- Confirmed the critical gaps are architectural composition and operational proof: competing paper state owners,
  non-atomic paper persistence, distributed runtime policy, fixture-only combined engine, unqualified writer host,
  and stale architecture documentation. Component tests remain strong but cannot close these system gates.
- No provider poll, data transformation, host mutation, container, timer, bot cycle, live order, or promotion ran.
- Next critical move: converge one effective runtime policy and one replayable canonical paper ledger; then qualify
  the spare host and prove freshness, MCP, recovery, backup, rollback, and soak.

## Remote Client and Paper Lifecycle Implementation - 2026-07-24 session 101

- Closed the two reproduced paper lifecycle defects: an unpriced aged non-live position can no longer be removed
  as a zero-price time-decay exit, and settlement identity now distinguishes a reopened token's new position.
- Added a distinct read-only `SOVEREIGN_CLIENT_TOKEN`, cached-only client status/bias API routes, and remote CLI
  views with explicit connected, stale, unauthorized, degraded, unavailable, and reconnecting states.
- Added per-user Linux systemd and Windows scheduled-task connectors. They maintain an SSH local forward and
  authenticated cached-status check with bounded reconnect. Token material is kept in private files. Interactive
  CLI auto-open is opt-in and disabled by default.
- The central host remains the sole provider poller and canonical-data writer. The connector never starts polling,
  backfill, a bot, a host, or a write path.
- Independent review found and closed concurrent settlement duplication, missing paper quote evaluation,
  non-finite refresh intervals, non-loopback cleartext HTTP, degraded-state misclassification, and unbounded SSH
  connection setup.
- Verification: host-capable Node 894 total / 890 pass / 0 fail / 4 intentional skips; API 10/10; gateway
  TypeScript, Bash syntax, PowerShell parser, hygiene, and diff checks pass.
- Read-only integrity remains 92/92 cached, 87 required-window stale, 9 cadence-plausible, 0 unexplained, and
  1 declared exception. No service/task/tunnel was installed and no provider or data mutation ran.
- The implementation is committed at `e0de66de`. Real-host, real-login, freshness, MCP, recovery, clean-clone,
  and soak proof remain separate gates.

## Role-Based Portable Hosting Implementation - 2026-07-26 session 103

- Added a capability-based authorization layer for human roles (`viewer`, `analyst`, `operator`, `owner`) and
  explicitly scoped service principals. API-token compatibility maps to owner; the distinct remote-client token
  remains read-only. Route inventory, privileged overrides, kill-switch commands, and unknown mutations are
  classified explicitly; unknown capability names fail closed.
- Added deployment profiles (`all-in-one`, `central-host`, `developer`, `client`) independently from user
  permissions. The laptop `all-in-one` profile can rehearse every machine role, but plain Compose renders only
  `web`; `backfill` is behind the `writer` profile, and the central updater refuses `all-in-one`.
- Added optional owner-only session/IP records using one-way session fingerprints rather than raw tokens.
  Forwarded headers remain untrusted, SSH loopback is marked tunnel-opaque, and `reauth` stays fail closed after
  registry read or repeated write failures.
- Browser HTTP calls now carry the current Supabase bearer token where authorization may be required. Socket.IO
  requires `status.read` and resolves fresh auth for every initial/reconnect handshake.
- Independent review found no P0 and identified two P1 plus three P2 issues. All five were closed: repeated
  registry-write fail-open, accidental all-in-one writer startup, unknown-capability fail-open, sidebar missing
  auth, and stale Socket.IO reconnect auth.
- Verification: host-capable Node **910 total / 906 pass / 0 fail / 4 intentional skips**; API **21/21**;
  contracts **57/57**; review focus **24/24**; frontend TypeScript and production build pass; plain Compose
  services=`web`, writer profile services=`backfill,web`; secrets **846/0**; hygiene and diff checks pass.
- Grade movement: API access control **B / token-gated -> A- / capability-contracted, real-login-gated**.
  Deployment portability **C / testing-only -> B / profile-contracted, runtime-unproven**.
- This is uncommitted current-working-tree proof above `HEAD c2e28993`, not committed archive or fresh-clone
  proof. No service, container, timer, provider poll, writer, bot cycle, order, public exposure, destructive
  migration, or promotion ran. Real login, second-machine SSH, backup/restore, restart, one-writer, MCP,
  freshness, and soak remain open.

## Foreground Host Resource Monitor - 2026-07-26 session 103

- Added `npm run host:monitor`, backed by `backend/scripts/ops/host_resource_monitor.sh`.
- The foreground-only monitor reports sampled CPU usage, average frequency, load, RAM/swap, temperatures,
  NVIDIA/available integrated-GPU activity, disk usage, top processes, and filtered hosting/development apps.
  Optional `--containers` adds bounded Docker stats; `--once`, `--interval`, `--top`, `--filter`, and
  `--no-clear` support scripts and diagnostics.
- Verification: Bash syntax, three focused behavior cases, npm entrypoint, and an authoritative host snapshot
  pass. The host snapshot saw CPU 4.9%, 8.4/26 GiB RAM used, package temperature 49 C, and the RTX 3050 at
  5% GPU / 382 MiB of 6144 MiB VRAM. These readings are momentary, not capacity or soak proof.
- No service or timer was installed; the monitor writes no report and stops with `Ctrl+C`.

## Active Laptop Load Rehearsal - 2026-07-26 session 103

- The local web/API server is running on `127.0.0.1:8787` and passed `/health`.
- Docker Compose could not be used because the current user lacks `/var/run/docker.sock` access. The equivalent
  native workloads were started explicitly with `.env.central`: full 89-job `backfill-daemon` at a 30-minute
  cadence and the non-live Polymarket paper bot at a 30-minute cadence using `low_prob_dip`.
- No live bot, deployment updater, timer, public bind, or container was started. Backfill is actively polling
  configured providers and writing cache data by explicit user request.
- First load snapshot: overall CPU 29.8%, highest backfill process 124% CPU and 2.5 GiB RSS, RAM 11/26 GiB,
  package temperature 67 C, RTX 3050 37% GPU and 369 MiB VRAM. These are momentary readings, not a soak result.
- Stop the native workloads with `Ctrl+C` in their running terminals; stop the web server with `Ctrl+C` in its
  server terminal. Do not leave provider polling enabled unattended without a retention/soak decision.

## Load Smoothing and Append-Only Storage Implementation - 2026-07-26 session 103

- Implemented a global backfill poll-start pacer with provider-lane sharing, warm-up spacing, bounded jitter,
  load/RAM pressure backoff, and daemon status fields for the latest poll start. Existing lane concurrency
  ceilings remain safety caps rather than target utilization.
- Added opt-in immutable SOVT segment storage at `shared/lib/market/append_only_segments.js`, atomic manifests,
  compatibility reads and coverage, and explicit compaction that retains old segment files. The default
  canonical `.bin` writer is unchanged; segment mode requires `SOVEREIGN_TS_STORAGE=segments`.
- Verification: `tests/scripts/data/backfill/backfill_daemon.test.js` **16/16** and
  `tests/scripts/data/cache/append_only_segments.test.js` **3/3**; Node syntax checks pass.
- Remaining gates: durable queued/retry state, temperature/disk hysteresis, compaction command/free-space
  budget, disposable-storage parity/recovery, write-amplification measurement, and laptop soak. The active
  provider workload was not restarted, so it is still running the pre-change daemon code.

## Paper Bot Interval Policy - 2026-07-26 session 103

- Changed the paper-bot default cadence from 30 minutes to **1 minute** through one centralized resolver at
  `shared/lib/settings/interval_policy.js`; the CLI runner and paper Compose profile use the same resolver.
- Policy order is global minimum -> personal requested/settings interval -> administrator host minimum. The
  effective interval is `max(global_minimum, personal_interval, admin_minimum)`, so personal settings cannot
  bypass an administrator safety floor. Defaults are all 1 minute; `SOVEREIGN_ADMIN_BOT_INTERVAL_MIN` may
  intentionally slow the host.
- Added personal `trading.bot_interval_min` support and `settings params --bot-interval N`.
- Verification: interval/settings tests **21/21**, syntax, hygiene, diff, and Compose config pass. The already
  running paper-bot process was not restarted; it retains its prior 30-minute launch configuration until
  explicitly stopped and restarted.

## Deep Blast-Through Audit - 2026-07-26 session 104

- Full / Hard Reading Mode audit completed against clean committed `HEAD c2e28993` plus the 56-file
  (`+3218/-140`, 18 untracked) session-103 working batch.
- Verdict: no P0; whole-system **C+ / integrity-and-qualification-gated**. Current source is not releasable or
  operationally qualified.
- Current read-only integrity improved to 92/92 cached, 14 required `1d` windows stale, 9 cadence-plausible,
  0 unexplained, and 1 declared exception. DCS is **0.954348**, but integrity remains `ok:false`; the
  zero-policy-stale promotion gate still blocks.
- P1: the persistent paper runner crashes before scheduling because `runPaperBotLoop` references undefined
  interval-policy variables.
- P1: keep `SOVEREIGN_TS_STORAGE=segments` disabled. Mixed canonical/segment reads hide new segments;
  checksum/missing-file failures are accepted; manifest coverage can be false; compaction can orphan concurrent
  writes; and segment order can violate provider precedence.
- P1 conditional: IP `reauth` keys human sessions by rotating bearer-token hash and has no explicit recovery
  transition. The default `audit` policy limits immediate exposure.
- P2/P3 follow-ups: separate bot/backfill cadence, enforce machine writer role at the writer entrypoint, add
  complete fsync durability, ignore private runtime session state, align live-cycle/kill-switch capabilities,
  and repair 14 docs-hub links plus the stale README test baseline.
- Current verification: host Node **921 total / 917 pass / 0 fail / 4 intentional skips**; frontend type/build,
  gateway TypeScript, Compose rendering, Bash syntax, hygiene, tracked secrets 846/0, untracked text secrets
  18/0, clean committed archive smoke, and diff integrity pass.
- No production fix, provider poll, canonical-data transformation, runtime start/stop, bot cycle, order, public
  exposure, destructive migration, or promotion was performed by this audit. The prior handoff's native
  workload may continue outside the sandbox's process view.
- Critical order: repair the paper runner; harden segment migration/integrity/concurrency/precedence/durability
  on disposable storage; repair stable reauth; close profile/API/artifact/docs debt; then review/commit and
  prove clean current-source archive/fresh clone before approved runtime qualification.

## Mass-Implement Correction - 2026-07-26 session 104

- Repaired the persistent paper runner: it now resolves the centralized policy inside the paper loop and uses
  the effective interval for the actual scheduler. Backfill retains its independent requested cadence.
- Hardened opt-in segment storage: canonical and segment rows merge by the shared provider-precedence contract;
  active manifests, checksums, byte lengths, timestamps, missing files, and coverage are verified fail closed;
  compaction publishes one active generation while holding its writer lock; and publication fsyncs segment,
  manifest, and containing directories. Segment mode remains non-operational until storage-budget and soak gates.
- Bound human reauthentication records to a stable one-way subject fingerprint rather than a rotating bearer
  token, added authenticated pending-IP confirmation, ignored the private registry file, enforced declared
  writer profiles at the daemon, and required `live.execute` for API live cycles both at request policy and
  route dispatch. Kill-switch POST now has the same `safety.control` contract as GET mutation.
- Repaired the 14 documentation-hub links, replaced the stale README total with a reproducible command, and
  made focused contracts include interval, runner, backfill, and segment tests.
- Verification: host-capable `npm run test:contracts` **87/87 pass**; host-capable `npm test`, hygiene,
  diff integrity, and all repaired documentation target checks pass. Sandbox API-suite failures remain the
  known loopback `listen EPERM` limitation; the host rerun is authoritative.
- Grade movement (source proof only): CLI runner **D -> B / scheduler-contracted**; segment storage
  **D -> B / integrity-contracted**; API/session tracking **B -> B+ / stable-reauth-contracted**; docs
  **C+ -> B / links-and-baseline-aligned**. System remains **C+ / integrity-and-qualification-gated**:
  14 policy-stale windows, clean-current-source archive/fresh clone, storage-budget/retry/thermal/disk proof,
  host login/recovery/MCP/backup/rollback/soak, and review/commit remain open.
- No provider poll, runtime start/stop, bot cycle, order, public exposure, destructive migration, or promotion
  was performed by this implementation pass.

## Commit Checkpoint - 2026-07-26 session 104

- The complete session-103/104 source and continuity batch is committed on `main`; use `git log -1` for the
  immutable checkpoint ID. The repository secret scan passed 846 tracked files with 0 violations immediately
  before the checkpoint. Committed-source proof does not replace fresh-clone, stale-data, host, recovery, or
  soak qualification.

## Global Market Monitor Batch 1 - 2026-07-27 session 106

- Implemented and committed constant-memory `readLatestTsRecord()` at `b1816b94`. It distinguishes missing
  state from invalid state, validates canonical metadata/header/length/finite tail values, retries boundedly
  across in-place append or atomic replacement, and preserves canonical/segment provider precedence.
- Hardened active-segment tail reads with regular-file/no-symlink checks, manifest-entry identity, exact length,
  streaming SHA-256 verification in 64 KiB chunks, timestamp/range/value checks, and fail-closed corruption.
  Segment mode remains disabled and unqualified.
- Added focused missing, empty, dead-marker, truncated, metadata-identity, non-finite, non-monotonic, unsafe
  timeframe, symlink, concurrent-append, bounded canonical/segment memory, precedence, and corruption cases.
- Real BTCUSDT proof: 4,067,702 1m records in a 195,249,704-byte bin; one read requested 294 bytes across four
  reads and took 2.382 ms cold. One hundred repeated reads averaged 0.102 ms and did not change bin/meta size,
  inode, or mtime.
- Verification: host contracts 96/96; host Node 936 total / 932 pass / 0 fail / 4 intentional skips; tracked
  secrets 860/0; clean committed-archive focused storage tests 2/2; hygiene, skill validation, mirror parity,
  syntax, focused storage regressions, and diff checks pass. Sandbox-only API/secret failures were
  `listen EPERM` / `spawnSync git EPERM`; approved host reruns pass.
- Security closeout found no open P0/P1 in Batch 1. Authentication, network, credentials, provider, and trading
  surfaces were not touched. Canonical full-file checksum remains explicitly deferred because the canonical
  format persists no checksum; adding one requires a separate format/writer migration and would otherwise make
  each monitor refresh O(file size).
- Grade movement is limited to market-reader runtime safety, contract truth, and verification. The broader
  system remains integrity-and-qualification-gated; Batch 2 universe/snapshot ownership and all API/UI/runtime
  work remain open. No provider poll, canonical-data write, runtime/profile change, bot cycle, order, public
  exposure, destructive migration, or promotion occurred.

## Global Market Monitor Batch 2 - 2026-07-27 session 107

- Implemented and committed one configured-universe and snapshot owner at `a65f907a`. The backfill daemon and
  monitor now resolve the same YAML-configured supported universe, base timeframe, and provider lane.
- The resolver emits deterministic `family:symbol` identities plus explicit unsafe, unsupported-market,
  missing-provider-map, and non-price exclusions. Current config resolves 89 supported price rows, 44 excluded
  configured price entries, and 93 non-price coordinates.
- The read-only snapshot emits independent freshness/provider/update/schedule states, exact reconciled freshness
  counters, canonical record counts, honest null segment-overlap counts, and fail-closed per-row invalid state.
  A current real snapshot completed in 59 ms: 1 fresh, 51 delayed, 36 stale, 1 missing, 0 invalid.
- Verification: focused universe/storage/backfill/rollup files pass; contracts 101/101; aggregate 941 total /
  937 pass / 0 fail / 4 intentional skips; clean committed archive focus 3/3; secrets 863/0; hygiene, syntax,
  and diff checks pass.
- Security post-review found no P0/P1. New owners have no network/process/write primitives; malformed identities,
  future/corrupt records, unknown state enums, and raw update errors fail closed or remain explicitly unknown.
- The user's symbol-database idea is recorded as a deferred local-registry design with identity, parity, dry-run
  migration, export, backup, rollback, compatibility, and no-rekey gates. YAML remains canonical for now.
- Grade movement is limited to contract truth, path clarity, duplication reduction, runtime safety, and
  verification. API/CLI/dashboard/heartbeat and operational qualification remain open. No provider poll, data
  write, runtime/profile change, bot cycle, order, public exposure, destructive migration, or promotion occurred.

## Global Market Monitor Batch 3 - 2026-07-27 session 108

- Implemented one shared read-only monitor service with strict family/state/symbol filters, `limit` 1-100,
  bounded offset, global counters independent of pagination, five-second unfiltered snapshot caching, concurrent
  refresh deduplication, and sanitized last-known fallback after refresh failure.
- Added `market monitor` JSON/human output plus bounded watch mode, and protected
  `GET /api/market/monitor` with the existing `data.read` capability. CLI and API adapters return the same
  payload; the monitor accepts no caller path, URL, provider, write, or execution option.
- Corrected default `backend data summary` to constant-memory canonical coverage/latest output. A real BTCUSDT
  probe reported 4,067,940 1m rows and the verified latest value instead of a shallow-cache zero. Explicit input
  paths retain their existing privileged override contract.
- Verified missing/malformed auth, insufficient capability policy, invalid filters/pagination, empty pages,
  filter-varied/concurrent cache reuse, degraded last-known refresh fallback, error sanitization, bounded watch
  work, CLI/API parity, and unchanged canonical bin/meta stats.
- Host contracts pass **108/108**. Final host aggregate passes **948 total / 944 pass / 0 fail / 4 intentional
  skips**. One intermediate compact aggregate run hit two unrelated dashboard timing flakes; their exact file
  passed 7/7 immediately and the final aggregate passed. Tracked secrets pass 863/0; direct new-production-source
  scanning, syntax, hygiene, and diff checks pass.
- Security closeout found no open P0/P1 in Batch 3. Grade movement: monitor CLI/API **unimplemented -> B+ /
  contract-and-auth-verified, UI-pending**; default data summary **shallow-cache-drifted -> B+ /
  canonical-coverage-latest**. The broader system remains integrity-and-qualification-gated.
- Batch 3 source/tests/docs are committed at `8322adfd`. The raw committed archive passes the new monitor/summary
  tests 7/7 before dependency-bound files load; all four focused files pass using the checkout's installed root
  dependencies. This is committed-source/archive proof, not fresh-install proof. No provider poll, data write,
  runtime/profile change, bot cycle, order, public exposure, database migration, segment enablement, destructive
  action, or promotion occurred.

## Global Market Monitor Batch 4 - 2026-07-27 session 109

- Replaced the provider-only Quote Health view with an authenticated canonical global monitor while preserving
  provider health as independent context beneath instrument truth.
- Added bounded full pagination, snapshot-identity consistency checks, UI-side row/counter validation,
  duplicate/malformed-row exclusion, safe error mapping, last-known retention, local sorting/filtering,
  manual refresh, and ten-second polling paused while hidden.
- Proved explicit loading, unauthorized, API-error, empty, malformed, stale/last-known, counter, long-label,
  and 360/768/1440 containment states. The table scrolls internally without document/main overflow.
- Security closeout found no open P0/P1. Current browser auth is reused; no privileged token fallback, raw error
  display, path/URL override, provider/write/trading primitive, public bind, migration, or credential persistence
  was introduced.
- Verification: focused dashboard 4/4; host browser 10/10; frontend TypeScript/build pass; host contracts
  112/112; aggregate 952 total / 948 pass / 0 fail / 4 intentional skips; secrets 866/0; hygiene and diff pass.
- Grade movement: global monitor **B+ / contract-and-auth-verified, UI-pending -> A- /
  UI-and-responsive-verified, service-heartbeats-pending**. Source/tests/docs are committed at `883681fd`.
- `graphify-out` refresh remains blocked because the local Python environment has no `graphify` module.
  Fresh-install, service-heartbeat, host, MCP, recovery, rollback, and soak gates remain open.

## Mass-Implement Closure - 2026-07-27 session 110

Batch 5 is implemented in the working tree after the deep Batches 1-4 blast-through. A shared atomic,
sanitized service-heartbeat contract now covers paper-bot, backfill, portfolio-monitor, host-health, and
host-backup; the read-only authenticated `/api/system/service-health` route and separate dashboard context are
wired with bounded error codes. Legacy client snapshots no longer expose raw nested poller outcomes.

Verification: host contracts 116/116; aggregate 956 total / 952 pass / 0 fail / 4 intentional skips; focused
heartbeat/monitor tests 12/12; frontend production build pass; secret scan 867 files with 0 violations; hygiene
and diff checks pass. No provider polling, writer/data mutation, runtime startup, trading, public exposure,
migration, segment enablement, destructive action, or promotion occurred. Source is committed as the session
closeout. Fresh
installation, host/MCP/recovery/rollback/one-writer/soak qualification, and the 14 policy-stale integrity
windows remain open.

## DEP-1 dependency-remediation preflight - 2026-07-28

- DEP-1 network-boundary remediation reached `proposed -> preflight -> NO-GO -> deferred`.
- Current structured evidence identifies affected `ws`/Socket.IO, Axios, Alpaca, and viem graphs but does not
  provide safe patched target versions or fix-availability metadata.
- Local offline registry queries return `ENOTCACHED`; the offline audit's zero findings are invalid because the
  advisory cache is absent.
- No manifest or lockfile changed. Continue to block release/live use until a user-authorized restricted
  dependency worker supplies structured current metadata and the isolated compatibility batch passes.
- The decision-complete batch specification is
  `workspace/plans/DEPENDENCY_REMEDIATION_MASS_IMPLEMENT_PLAN.md`.

## DEP-1A Socket.IO closure - 2026-07-28

- DEP-1A reached `proposed -> preflight -> GO -> implemented -> verified -> reviewed -> closed`.
- API and dashboard Socket.IO lock graphs now resolve patched Engine.IO/adapter/ws versions; direct manifests
  stayed unchanged and deterministic installs are healthy.
- API 25/25 and dashboard TypeScript/build pass against the refreshed installed graphs.
- Two unrelated dashboard highs plus DEP-1B viem, DEP-1C Alpaca/Axios, and DEP-1D Polymarket/ws remain.
- Overall release/live use remains blocked. DEP-1B is the next isolated batch.

## DEP-1B viem closure - 2026-07-28

- DEP-1B reached `proposed -> preflight -> GO WITH FIXES -> implemented -> verified -> reviewed -> closed`.
- Root/gateway viem is 2.55.10 with viem-owned ws 8.21.0; TEST-1 scripts were preserved.
- Gateway TypeScript and 51 focused Polymarket/MCP/paper-safety tests pass.
- DEP-1C Alpaca/Axios is next and requires a structured v3-to-v4 production API map before edits.
- DEP-1D Polymarket/Ethers ws remains NO-GO; overall release/live use remains blocked.

## DEP-1C/DEP-1D decision and SSH usability - 2026-07-28

- DEP-1C Alpaca/Axios reached `proposed -> preflight -> NO-GO -> deferred`. Eight active gateway API seams
  are mapped, but exact Alpaca 4.0.1 package/API inspection did not complete; no semver-major edit was guessed.
- DEP-1D Polymarket/Ethers ws remains NO-GO because the proposed remediation is an unsafe direct-client
  downgrade from 1.0.6 to 0.0.3.
- Current combined five-root evidence is 54 vulnerable nodes: 17 high, 11 moderate, 26 low, 0 critical,
  improving the original 61 total / 24 high without clearing the release gate.
- Final working-tree verification passes 1,003 total / 999 pass / 0 fail / 4 intentional skips.
- A clean worktree snapshot performs deterministic installs for all five package roots and passes builds plus
  aggregate verification at 1,003 total / 993 pass / 0 fail / 10 environment-dependent skips.
- The source is usable for private, read-only research and paper-safe exercise. It is not yet qualified on the
  intended SSH host: that host was previously inspected at `e78e1788` and does not contain this uncommitted
  batch; host install/auth/MCP/startup/recovery evidence remains open.
- Public exposure, live execution, and release promotion remain blocked.

## Third-machine distribution audit - 2026-07-28

- Clean five-root source installation/build is proven for a disposable working-tree snapshot, but no actual
  third-host image startup, health, auth, persistence, restart, or rollback run exists for this dirty source.
- Registry lock entries carry integrity metadata; the sole Git dependency is commit-pinned. Dependencies and
  secrets are excluded from source/container transfer and should be rebuilt, never rsynced.
- Public distribution is not supply-chain qualified: Node/npm are not pinned, Docker/Actions references are
  mutable tags, the ONNX runtime download lacks a CMake `URL_HASH`, and there is no SBOM, signature,
  provenance attestation, or release checksum workflow.
- The runtime image is single-stage, has no non-root `USER`, and retains build tooling, source, and development
  dependencies. It is suitable for private rehearsal, not hardened third-party distribution.
- The personal license does not authorize unrestricted redistribution. Resolve licensing before offering
  public downloads.

## Existing-codebase readability workflow - 2026-07-28

- `blast-through` now has an explicit maintainability mode and Existing-Codebase Coherence Gate for convention
  drift, duplicate ownership, interface readability, large responsibilities, docs truth, cross-boundary
  consistency, and incident comprehension. AI authorship is a risk signal, not an automatic defect.
- `mass-implement` now requires a Readable Implementation Contract: read before editing, respect working legacy
  behavior and local conventions, preserve canonical owners, keep invariants/failures explicit, and record
  split-or-keep decisions for touched files above 1,000 lines.
- Added canonical `refactor-readability` for behavior-preserving cleanup. Behavioral, API, schema, auth, data,
  provider, trading, dependency, deployment, and persistence changes remain routed elsewhere and approval-gated.
- Canonical and `.agents` mirror inventories are synchronized at 10 packages. All skill validations,
  structure contracts 2/2, hygiene, and diff integrity pass.
- `PROJECT_RULES.md`, `AGENTS.md`, and all 10 skills now enforce bounded-context and evidence honesty. Agents
  must build a task-local architecture map, disclose material unread/unverified surfaces, and distinguish every
  evidence class instead of implying whole-system proof.
- Every skill explicitly forbids manufacturing green tests by weakening assertions/tolerances, adding skips,
  deleting coverage, suppressing failures, replacing intended paths with mocks, or hardcoding fixtures.
  Legitimate test changes require canonical contract or approved behavior evidence and a reported before/after
  expectation. The repository skill contract tests this invariant across the complete manifest.

## Full Blast-Through - 2026-07-28 Hard Reading Mode

- Current source/test evidence is broad and green: host strict API 25/25, contracts 118/118, secrets 911/0,
  aggregate 1,004/1,000/0/4; native build and CTest 30/30; five installed npm trees have zero `npm ls`
  problems; required-daily cache integrity is 92/92 with DCS 1.0.
- New P0 FULL-1: `SOVEREIGN_MOCK=true` bypasses PIN verification and is allowed on the execution environment
  surface. Release/live use remains blocked until wrong-PIN execution fails under every mock/test poison path.
- New P1 FULL-2: malformed Alpaca bot state silently defaults empty, and a failed broker `positions` read becomes
  an empty account that can erase tracked positions and reopen the entry cap.
- The green suite has a material adversarial blind spot. Broken inputs must produce loud product failure and
  preserved state; unexpected success or silent fallback must make the test runner red. Permanently red tests
  are not the target.
- System design is now C / safety-and-operations-gated; tests B+ / critical-negative-coverage-gated; backend CLI
  C+ pending FULL-1/FULL-2. Detailed findings, grades, dismissed candidates, C++ candidates, and gates are in
  `workspace/DEV_REVIEW.md`.
- No production code, provider, package, credential, canonical data, runtime, container, bot, order, public,
  migration, deployment, or live state changed during the audit.

## Full recovery implementation - 2026-07-28

- FULL-1 and FULL-2 are implemented and source-verified. Execution children strip `SOVEREIGN_MOCK`; PIN
  verification has no mock shortcut; corrupt Alpaca state and unavailable/incomplete broker inventory fail
  closed without state rewrite or entry scanning.
- All root Node test scripts now use the dual spec/RAG reporter. Every assertion failure appends a sanitized
  JSONL record under ignored `storage/logs/rag/test_failures.jsonl`; adversarial mutation tests prove the PIN
  and inventory guards turn red when removed. Canonical native-build, CTest, and secret-scan command failures
  use the same log through `tests/run_logged_command.js`.
- Backtest and API fallback responses report degraded/native provenance. Unsupported fallback ratios are null,
  not plausible-looking approximations.
- Compose now consumes seven service-specific 0600 environment projections. Docker source is multi-stage and
  non-root by contract. Five package roots are private/license-aligned and pass offline lockfile dry runs.
- C++ rebuilt and CTest passes 30/30. Host-capable `verify:strict` passes after the final test-runner routing.
  Hygiene, environment classification, mirror parity, focused safety tests, and diff integrity pass.
- Clean worktree-snapshot verification is **inconclusive**, not green: the attempt stopped during root
  `npm ci` and retained only `verification_in_progress` evidence. Authenticated CI, target-host startup,
  image build, restart/rollback, backup/recovery, provider connectivity, soak, paper, and live proof remain open.
- Dependency remediation remains NO-GO at 17 high / 11 moderate / 26 low because exact trusted Alpaca and
  Polymarket upgrade mappings were unavailable locally. Docker/Actions digests and the ONNX `URL_HASH` also
  remain unpinned rather than guessed.
- Refactor slice: broker reconciliation ownership moved to `strategy/automation_guard.js`. `strategy.js`
  remains 1,276 lines and `cli_executor.js` 1,235 lines; split planning remains required, but further movement
  was deferred to avoid mixing behavior change with broad restructuring.
- Overall source grade improves from C to **B- / release-gated**. This is suitable for private read-only
  research and paper-safe testing, not decision-ready, release-ready, deployed, publicly exposed, or live.

## Pending plan consolidation - 2026-07-29

- Added `workspace/plans/CURRENT_PENDING_MASTER_PLAN.md` as the canonical status index for all 27 pre-existing
  repository plan files.
- The combined dependency order is M0 exact source/evidence/continuity; M1 credentials/dependencies/supply
  chain; M2 private web-only host; M3 data/PIT; M4 strategy/replay; M5 monitoring source; M6 paper/writer/
  recovery/soak; M7 maintainability/UX; M8 distribution and optional roadmaps.
- Historical recovery plans remain preserved but are not active. FULL-1/FULL-2 are closed in the worktree;
  exact `0383d47b` remains unsafe and must not be deployed.
- M0 is the sole current action: read-only commit-boundary inventory, load-bearing untracked-edge mapping, and
  evidence/RAG durability preflight. No implementation, commit, host write, dependency change, provider/data
  action, bot, webhook, order, public exposure, or live action is authorized by this planning update.

## M0 source-evidence implementation - 2026-07-29

- Lifecycle: `proposed -> preflight -> GO WITH FIXES -> implemented -> verified -> reviewed -> deferred`.
- Added one canonical sanitized-diagnostic owner used by source evidence, Node assertion reporting, and logged
  command failures; the prior duplicate redactors are consolidated.
- Source evidence is schema v2, defaults to ignored durable
  `storage/logs/source_evidence/<mode>-latest.json`, checkpoints the active step atomically, and retains bounded
  sanitized summaries plus stdout/stderr SHA-256 fingerprints for non-pass steps.
- The Node wrapper runs each file in its own process while removing the redundant inner isolation layer.
  This preserves cross-file process isolation and makes nested assertion/spawn causes available to the RAG
  reporter.
- The 94-entry current worktree is grouped by owner in
  `workspace/plans/M0_WORKTREE_CHANGESET_INVENTORY.md`. Load-bearing untracked safety owners remain explicit.
- Green: focused evidence/RAG/runner contracts 18/18 in the host-capable context; safety, structure, hygiene,
  secrets, and diff integrity; exact host-capable broad Node discovery.
- Restricted broad/focused runs can still return child-spawn `EPERM`; those failures now retain the real leaf
  cause and the exact host-capable reruns pass.
- No commit was authorized or created. Exact archive, authenticated CI, target-host, provider, recovery, soak,
  paper, release, and live evidence remain open.

## M0 exact-source closure update - 2026-07-29

- User authorized the reviewed commit. The atomic safety/evidence/workflow batch was committed as
  `8275a9acfc60dad36a15a24f5e8cde512307b6f8`.
- The first host-capable committed-archive attempt exposed a real gitlink fingerprint defect: the tracked
  `backend/polymarket-cli` gitlink was materialized as a directory and read as a file. The focused fix records
  a deterministic gitlink-directory marker while the parent Git tree retains the referenced commit identity.
- Focused source-evidence contracts pass 10/10 after the repair.
- Schema-v2 evidence `4346d24e-a72e-4ab5-b75b-1fb9be8a6ebe` is PASS for exact commit `8275a9ac...`, tree
  `b17485e...`, 1,268 archived entries, all five lockfiles, declared builds, native 30/30, environment,
  secrets 905/0, API/contracts/structure, and aggregate Node gates.
- This is committed-source proof, not authenticated CI, deployment, host health, recovery, soak, paper, or live
  proof. Deployment remains paused until a target/profile is named and its separate gates are authorized.

## Private central host deployment - 2026-07-29

- `vgbn-servers` (`192.168.4.135`) now runs the private `central-host` profile from exact source
  `897718024b0d93fe44ee5920ef9157756499ca75`.
- Host HEAD equals the updater success marker and the checkout is clean. `web` is healthy on loopback and the
  sole `backfill` writer is running; both containers have zero restarts and run as non-root user `node`.
- Runtime inspection confirms `SOVEREIGN_RUNTIME_MODE=cloud-compute`, `LIVE_TRADING=false`, and
  `SOVEREIGN_EXECUTION_AUTHORIZED=false`. No bot, paper, monitoring, research, public, order, or live profile
  is running.
- The host's older dirty source was preserved in `stash@{0}` before fast-forwarding. Manual complete Git
  bundles were required because the host lacks GitHub deploy-key authentication.
- Two target-build defects were repaired and published: `15ef2840` removes nonexistent/ignored image copy
  inputs; `89771802` includes the tracked CLI backfill compatibility module.
- This is initial deployed-host health and one-writer startup proof. Authenticated CI, deploy-key/timer
  automation, freshness/DCS, restart/rollback/recovery, and soak remain separate open gates.

## Additional central-host monitoring - 2026-07-29

- `host-health` and `host-backup` now run under the non-live `monitoring` profile. The first health check
  passed, and a new 2,155-file host backup completed.
- `portfolio-monitor` remains stopped after failing closed on a BTC notional threshold breach and unavailable
  Alpaca authentication. `polymarket-research` remains stopped because its required scope file is absent.
- Paper, orders, public exposure, and live execution remain disabled.

## Service activation triage - 2026-07-29

- The portfolio monitor restart loop is a Compose ownership defect, not a reason to weaken risk thresholds:
  Compose invokes `--once` and exits on a valid breach even though the CLI owns a persistent monitoring loop.
- Research needs a real explicit token allowlist and matching active market records. Server feature flags
  already enable Polymarket and bot autopilot, but no provider-backed research or paper cycle ran.

## Deep local current-run audit - 2026-07-29

- This audit observed `steamlinux`, not `vgbn-servers`. Local Docker uses image `sha256:264732...`, created
  2026-07-27, while checkout/source evidence is exact `89428649`.
- The image is mixed-lineage: monitor source matches `916c2964`, embedded Compose matches
  `e78e1788/0383d47b`, and no source-revision label exists.
- `docker-portfolio-monitor-1` remained restart-looping; restart count advanced 170 to 179 while status cycles
  advanced 1930 to 1943. BTC notional remained around 32k versus the 25k limit; Gate.io was connected and
  Alpaca live returned 401. The old image also persisted a stale raw ETIMEDOUT error beside fresh metrics.
- The local paper bot is running and healthy under cloud-compute with live/execution false. Iteration advanced
  158 to 162; no live flag, order, or public exposure was enabled by this audit.
- Current source gates remain green: schema-v2 committed archive PASS for `89428649`, hygiene pass, structure
  16/16, and local required-daily integrity 92/92 with DCS 1.0. These do not prove the stale running image or
  remote host.
- System design is C / monitoring-and-runtime-provenance-failed. Do not mutate current containers until the
  user decides whether the local paper bot should continue and authorizes a bounded monitor/image repair.

## Runtime integrity mass implementation - 2026-07-29

- Lifecycle: `proposed -> preflight -> GO WITH FIXES -> implemented -> verified -> reviewed -> deferred`.
- Node now owns persistent portfolio-monitor, host-health, and host-backup loops. Direct one-shot behavior is
  preserved; breaches, degraded health, backup failures, and retention failures publish state without causing
  Compose restart storms. Compose host health explicitly disables cross-container PID inference.
- Backup watch mode preserves a valid `next_run_at`, falls back only to a matching completed manifest, and
  refuses to guess when schedule evidence is unreadable.
- Images now carry exact source revision/tree/build-contract labels. The central updater derives service
  profiles from the environment manifest, reconciles only the prior active set, refuses active research,
  stages paper-bot resume after ledger/projection parity, writes owner-only deployment evidence, and rolls
  back per-service images on verification/publication failure.
- Focused operational/architecture verification passed, as did environment, hygiene, structure 16/16,
  deployment, secrets 906/0, host-capable aggregate Node, native 30/30, API, and dashboard/typecheck gates.
- Pre-closeout schema-v2 worktree evidence `81b7974c-9be6-42ad-97ab-e57bb60e4236` is PASS for the dirty
  1,271-file implementation snapshot with content hash `0cedbbe3c7be...`. Append-only continuity records were
  added afterward, so this is implementation source proof rather than an exact final-worktree fingerprint.
- Exact-image rehearsal is deferred: no commit was authorized, the checkout remains dirty, required local
  service env files are absent for direct Compose rendering, and the running local containers remain on the
  old `personal_finance:latest` image. The monitor was still restarting at final read-only inspection.
- No container, remote host, provider, threshold, paper ledger, order, public binding, or live flag was
  mutated. System design moves to **B- / source-fixed, runtime-gated**; deployment/recovery/soak remain open.

## Vgbn exact-image deployment - 2026-07-30

- `vgbn-servers` is deployed from exact commit `9fef3ef79682d71ba21e9eaea66bfc1fef2d0a44`; the host HEAD,
  deployed marker, image revision label, source-tree label, deployment manifest, and five active services agree.
- `web`, `backfill`, `portfolio-monitor`, `host-health`, and `host-backup` are running on one image with zero
  restarts. Web is healthy; a confirmed-state updater rerun no-ops.
- Commit `9fef3ef7` closes the observed rollback ordering defect by snapshotting active image references before
  rebuilding a deployment tag.
- Portfolio monitoring is operational but reports a real critical BTC notional breach and unavailable Alpaca
  authentication. Do not classify this as healthy risk state or weaken the threshold.
- Runtime remains private cloud-compute with live and execution authorization false. Paper, research, orders,
  public exposure, authenticated CI, deploy-key automation, recovery, rollback drill, and soak remain open.

## Deferred Alpaca monitor edge case - 2026-07-30

- Alpaca credentials are present in the central environment and backfill projection but absent from the
  portfolio-monitor projection by current manifest policy.
- The aggregate gateway forces an Alpaca Live adapter while the host is configured for Alpaca Paper, and the
  monitor evaluates only the live portfolio bucket.
- Treat the displayed Alpaca `authentication_failed` as an account-read projection/scope defect, not proof of
  invalid API credentials. The user deferred the fix to the next session.

## Alpaca monitor account-read/scope source closure - 2026-07-30

- The deferred monitor defect is closed in source. The portfolio-monitor projection now receives only the
  Alpaca key pair/base URL plus explicit monitor scopes; trade PIN, private-wallet, central, and execution
  surfaces remain excluded, with cloud-compute/live-false/execution-false fixed.
- The gateway has one shared Alpaca account-scope owner. Central monitoring defaults to paper-only Alpaca
  acquisition while the risk monitor defaults to combined live plus live-paper assessment, preserving the
  existing BTC/Gate.io/Polymarket exposure boundary.
- Scope changes reset incompatible peak-equity state, missing paper credentials remain an explicit broker
  warning, and invalid scope fails closed. Legacy flat snapshots remain compatible.
- Fresh required-daily integrity remains 92/92 cached with 0 missing/stale/unexplained and DCS 1.0.
- Focused contracts pass 39/39 with one sandbox-only nested-child skip; the exact host-capable aggregate Node
  suite, environment classification, gateway TypeScript, hygiene, structure 16/16, and diff integrity pass.
- This is working-tree source/test proof. Commit, committed-archive evidence, host synchronization, monitor-only
  recreation, two-cycle runtime observation, and exact deployed-image proof remain pending.

## Alpaca monitor exact service deployment - 2026-07-30

- Source and continuity are committed as `b5f35e8b8c7a7e5a8ff68f4c68aabe05287e32a9`; `origin/main` is
  published and the exact committed-archive verifier passed with evidence id
  `f0fdadf7-1a5b-43e4-8c37-2ed09b26ab9f` and tree `a5ceced30ca535151d6a3fc0b1ba8839d9a6f03e`.
- `vgbn-servers` received the exact revision through a verified complete Git bundle. A provenance-labeled exact
  image was built and only `portfolio-monitor` was recreated; the other four active container IDs did not
  change.
- The monitor projection is owner-only and contains the matching Alpaca key pair/paper base but no trade PIN
  or wallet. Runtime remains cloud-compute with live and execution authorization false.
- Runtime status now truthfully selects combined risk scope and names `Alpaca (Paper)`. The unchanged BTC
  25,000 notional limit remains breached. Alpaca Paper still rejects the matching configured credentials, so
  provider credential validity remains open.
- This is a mixed-revision, service-scoped deployment by design: the monitor uses exact `b5f35e8b`; web,
  backfill, host-health, and host-backup remain on exact `9fef3ef7`. The global deployed-head marker and
  deployment manifest remain at the prior coherent five-service revision.

## Differentiated Alpaca credential contract and monitor cutover - 2026-07-30

- Alpaca credentials now have first-class `ALPACA_PAPER_*` and `ALPACA_LIVE_*` names. Legacy generic names
  remain a scope-matched compatibility fallback; examples, manifest policy, runtime resolution, deployment
  guidance, and tests agree.
- The central-host monitor receives only the Paper credential set. Live Alpaca credentials are execution-class
  and excluded from central-host and monitor projections; live and execution authorization remain false.
- Source commit `65df1d1d9e3bfd6a30fcebab0fad5eda420523ac` is published and its exact committed archive passed.
  `vgbn-servers` runs only `portfolio-monitor` on that exact image; the other four services and coherent global
  deployment marker remain on `9fef3ef7`.
- Repeated post-cutover status publications preserve the BTC 25,000 notional breach and report
  `Alpaca (Paper)` as `authentication_failed`. Correct scoped names, Paper endpoint, projection, and non-live
  runtime are proved; provider credential acceptance remains unproved and currently rejected.
- The canonical `blast-through` skill now includes an API Authentication Gate that separates configuration
  proof from provider acceptance and requires redacted, structured evidence for any provider result.

## Alpaca and monitor read-only follow-up - 2026-07-30

- Fresh server evidence shows the exact `65df1d1d` monitor remains running with zero restarts and advances at
  the one-minute cadence. Cycle 1463 still reports BTC 32,015.85 versus the unchanged 25,000 limit, Gate.io
  connected, and `Alpaca (Paper)` authentication rejected.
- Provider credential acceptance remains the only open Alpaca authentication layer. Do not rework the
  already-proved Paper names, endpoint, projection, scope, or runtime consumption without contradictory
  evidence.
- P2 observability debt: the portfolio service heartbeat advances `heartbeat_at` and `attempt_count` but
  retains a stale `last_attempt_at`. The shared heartbeat writer and portfolio publication caller do not
  currently advance that field on each attempted cycle.
- No provider request, credential, container, threshold, source behavior, paper, order, public, or live state
  changed during the inspection.

## Blast-through fault attribution hardening - 2026-07-30

- Audit findings and every reviewed grade below A now require evidence-backed fault-domain, repair-owner,
  causal-mechanism, and stub-involvement attribution.
- The audit must distinguish project source, owned host/deployment, operator configuration/credentials,
  external provider, environment/sandbox, mixed, and unresolved domains. It must identify a real adapter,
  compatibility shim, silent fallback, test-only stub, production stub, no stub, or unresolved involvement.
- Authentication failures cannot be assigned to an upstream provider from a normalized 401. Presence,
  projection, endpoint, runtime consumption, and provider acceptance remain separate proof layers.
- Canonical and discovery skill packages are synchronized; the validator and focused repository skill contract
  pass. This changes audit/reporting behavior only, not production runtime.

## Alpaca authentication and heartbeat fix plan - 2026-07-30

- The user clarified that the rejected Paper credentials are recently generated, so rotation is no longer the
  first diagnostic step.
- `workspace/plans/ALPACA_PAPER_AUTH_AND_HEARTBEAT_FIX_PLAN.md` is the canonical GO WITH DIAGNOSTIC GATES plan.
- The decisive authentication check is a structured Paper-only comparison of raw `/v2/account` access and the
  current SDK `getAccount()` path using the same projected environment. It requires separate explicit provider
  polling authorization after the diagnostic is implemented and locally tested.
- Heartbeat timestamp repair is independent and can close without Alpaca provider evidence.
- No production/runtime behavior changed in this planning turn.

## Position sizing research boundary - 2026-07-30

- Current cross-asset sizing is graded **D+**. See
  `workspace/research/POSITION_SIZING_CONTRACT_DOLLAR_LOT_RESEARCH.md`.
- P1 source defects are the strategy automation `$1` missing-price fallback and the absence of an executable
  contract/lot metadata contract. MT5 remains non-executable for sizing/order purposes.
- Dollar sizing is implemented as universal whole-unit flooring and loses intent/conversion provenance.
- Guided Polymarket orders enforce minimum shares, but direct shared order validation does not share that
  contract.
- The next safe implementation starts by failing closed on invalid strategy prices, then introduces one typed,
  step-aware sizing normalizer before any new broker/CLI integration.
- The supplied external CLIs are optional qualification tools, not required runtime dependencies. No install or
  external source review ran in this planning-only pass.

## Canonical internal paper sizing - 2026-07-30

- Mass implementation is closed at source/test scope. `shared/lib/trading/position_sizing.js` is the canonical
  broker-neutral normalizer; no second paper engine was introduced.
- Strategy automation no longer fabricates a `$1` price. Invalid reference prices fail closed.
- Internal Polymarket paper supports notional, unit, and stop-risk sizing with step/minimum enforcement,
  virtual-cash/position caps, stop-direction checks, and full append-only ledger evidence.
- Direct and persistent paper CLI surfaces share `--sizing-mode`, `--size`, `--stop-price`, and
  `--max-position-usd`; paper runner construction contains no live flag.
- Focused 29/29, gateway TypeScript, host-capable full Node, environment, hygiene, structure 17/17, and diff
  integrity pass.
- Internal paper sizing is A- at source/test scope; overall cross-asset sizing is C. Provider-paper exercise,
  provider-qualified metadata, external CLI review, MT5 execution, deployment/recovery, and soak remain open.
- No provider request, external install, credential, order, live action, container, deployment, or persistent
  production paper cycle ran.

## Exact paper deployment - 2026-07-30

- Release `7d3ec339` is published and deployed on `vgbn-servers` through a verified complete bundle; host HEAD
  and deployed marker match.
- `web`, `backfill`, `portfolio-monitor`, `host-health`, `host-backup`, and `bot` run the exact image revision
  with build contract 1 and zero restarts at observation.
- The paper bot is persistent and dry-run only. One-shot and persistent cycles scan 25 markets, preserve ledger
  sequence 6, and produce no fill because five concurrent positions already exist; sizing intent is
  `notional:1`.
- Safety is `cloud-compute`, `LIVE_TRADING=false`, `SOVEREIGN_EXECUTION_AUTHORIZED=false`, profile
  `central-host`. Monitor remains in truthful BTC breach and warns that Alpaca Paper authentication is rejected.
- A manual profile start initially selected `personal_finance:latest`; it was immediately recreated with the
  exact release tag and labels verified.

## Alpaca Paper provider execution - 2026-07-30

- Added and deployed `--paper-provider` as an explicitly non-live Alpaca route; it cannot be combined with
  `--live`, defaults to a `$25` order notional cap, persists strategy labels, and still invokes the native risk
  engine.
- One-shot qualification succeeded: AAPL buy `0.01` market, `$0.25` notional, strategy `scalp_probe`, Alpaca
  Paper order `707e8077-971e-4b20-85b3-0911e2726d31`, status `accepted`.
- This is not a recurring Alpaca strategy. The separate internal Polymarket paper bot remains on its existing
  one-minute cadence. Live flags remain false; monitor continues to report Alpaca Paper connected and the
  pre-existing BTC max-position breach.

## Recurring Alpaca Paper strategy - 2026-07-30

- Added `run bot alpaca-paper` and explicit `--paper-provider` execution to the existing strategy automation
  owner; no second signal engine was introduced.
- Deployed `c868fc3b` and started a detached 15-minute loop using 13 enabled registered strategies with a `$25`
  per-order cap. First validation pass completed with no errors or order signals.
- The detached loop is not independently Compose-managed; container recreation stops it. Do not claim restart,
  recovery, or persistent qualification until an independent service and those gates are verified.
- Live safety remains `LIVE_TRADING=false` and `SOVEREIGN_EXECUTION_AUTHORIZED=false`.

## Skill sync and repository professionalism audit - 2026-07-30

- Synchronized canonical repository skill packages in `skills/` (10 packages) to `.agents/skills/` mirrors using `sync_repo_skills.js`.
- Identified and removed an unneeded, invalid gitlink entry (`backend/polymarket-cli` mode 160000) that lacked a `.gitmodules` mapping and was causing `git submodule status` to fail. Verified `git submodule status` now exits cleanly with return code `0`.
- Ran full repository audits: `npm run hygiene` (100% pass), `npm run test:structure` (100% pass), and full `npm test` (100% pass).
- Reviewed `README.md` for clarity, installation accuracy, multi-package root structure, and professional presentation.

## Runner maintainability refactor - 2026-08-02

- `blast-through` maintainability / Hard Reading Mode confirmed one P2 readability finding in
  `backend/cli/commands/runner/run.js`: top-level `commandRun` also owned bot-specific argument parsing.
- `refactor-readability` extracted that responsibility to `commandRunBot` and isolated construction of the
  fixed Alpaca Paper strategy argv. Public CLI behavior, runtime policy, and Paper/live boundaries are unchanged.
- Focused runner/loop/Compose/preparer verification passes 5/5; syntax, hygiene, structure 17/17, and diff
  integrity pass. The broad restricted-sandbox suite remains non-green because of child-process/PTY limits and
  the retained nested-worktree environment scan; clean-archive manifest evidence passes.
- Refactor and continuity edits remain uncommitted. Runtime activation remains separately approval-gated.
- Expanded maintainability screening found four separate large-function owners requiring staged cleanup:
  `ingestMarketData` (310 lines / complexity 121 / depth 7), `commandBacktest` (245 / 89),
  `backfillPolymarketArchive` (214 / 53 / depth 8), and backfill daemon cycle/job/CLI ownership. Treat each as
  its own behavior-frozen batch; Polymarket archive is the safest next candidate because fixture coverage is green.
- Host-capable `graphify update .` succeeded after the restricted attempt failed: 8,770 nodes, 13,956 edges,
  659 communities. Optional SQL/Terraform parser coverage remains absent.

## Backend-wide non-src readability implementation - 2026-08-02 partial

- Closed and committed the runner, Polymarket replay, integrity, correlation snapshot, and API signal
  projection readability batches as `f2eaed0e`, `31d36af8`, `680056f7`, `f44bc30d`, and `469968c4`.
- Focused behavior contracts remained green. The replay coordinator fell from 368 lines to 47; focused snapshot
  from 244 to 47; `signalStatus` to 12. Integrity output retained the observed 92/92 coverage, 14 stale, one
  exception, nine cadence-plausible grain flags, and 75 vintage anomalies.
- Deep-backfill crypto/equity restructuring is implemented and passes 27/27 fixture tests plus syntax, hotspot,
  hygiene, and structure gates. It remains uncommitted because Git escalation was rejected after the approval
  usage limit was exhausted. Repository policy requires this 500+ line edit to be committed before progression.
- Batches 5 daemon through 12 and `docs/engineering/readability_refactoring_reference.md` remain unimplemented.
  No runtime/provider/data/trading/host boundary was crossed.
