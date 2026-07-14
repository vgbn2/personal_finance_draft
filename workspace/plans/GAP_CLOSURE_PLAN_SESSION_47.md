# Gap Closure Plan - Session 47 (Blast-Through Follow-Up)

This plan covers all gaps identified in the Session 47 Blast-Through Report. The fixes are broken into three sequential phases with atomic execution checks and verification checks.

## STATUS UPDATE (2026-06-20, executed in a parallel session — read before resuming this plan)

All 6 tasks below were independently re-verified against current code before execution (this
plan's audit snapshot was stale for half of them) and are now closed. **Do not redo these —
re-run `npm test` first to see the current state.**

- **1.1 (kill-switch route) — already fixed, no diff needed.** `backend/api/app.js`'s
  `PROTECTED_GET_ROUTES` already lists `/api/kill-switch`; unauthenticated GETs already 401.
- **1.2 (gateway error swallowing / FOK) — already fixed, no diff needed.**
  `ExecutionGateway.execute()` already sets `OrderStatus.FAILED` + `process.exitCode = 1` on
  error; `cycle.ts` already passes `OrderType.FOK` explicitly on both BUY/SELL paths.
- **2.1 (split ingestion monolith) — closed as redundant, not done.** `index.js` is 1,342 lines
  today (already decomposed in sessions 38-39: `candle_utils.js`, `constants.js`, `manifests.js`,
  `snapshot_fetchers.js`, `providers/prediction.js`). `snapshot_fetchers.js` already has dedicated
  per-family functions (`fetchCryptoSnapshot`, `fetchEquityOrIndexSnapshot`,
  `fetchCommoditySnapshot`, `fetchFxSnapshot`). Re-splitting those into 3 files would be cosmetic
  churn, not a real fix.
- **2.2 (gap-aware backfill + incremental flush) — done, real fix.**
  `shared/lib/data/backfill.js`'s `fetchPaginated` now takes an opt-in `options.tsDir`: when
  supplied, it reads `readCoverage` and narrows the fetch window to skip ranges already covered
  on disk (5 new tests in `tests/scripts/data/backfill/fetch_paginated_gap_aware.test.js`).
  `backend/cli/commands/data/data.js`'s `commandMassBackfill` no longer accumulates every job's
  records into one run-wide array: the ts-index now flushes per job (`writeTsIndex` is already
  symbol+timeframe-scoped and merge-protected at that grain), and the JSON cache now flushes per
  family as each family's jobs complete (`writePartitionedSnapshot`/`readSnapshot` are already
  family-partitioned on disk) instead of one `readSnapshot(DEFAULT_HISTORY)` covering every
  family at once. Invariant proven in
  `tests/scripts/data/backfill/mass_backfill_incremental_flush.test.js`: incremental flushing is
  byte-equivalent to the old one-shot-at-the-end flush.
- **3.1 (dual-root data split) — done, retargeted not where the plan guessed.**
  `shared/lib/runtime/paths.js` was already clean (`STORAGE_DATA_DIR` correctly pointed at
  `storage/data/`). The actual offenders were 3 other files hardcoding the legacy `data/` root:
  `backend/cli/commands/operational/status.js`, `backend/cli/commands/research/research.js`,
  `shared/lib/data/ingestion.js` — all 3 now use new `paths.js` constants
  (`DEFAULT_PORTFOLIO`, `DEFAULT_INDICATOR_OPTIMIZATION`) or the existing `DEFAULT_SNAPSHOT`. A
  newer real `latest_indicator_optimization.json` (255KB, same-day) was migrated from `data/` to
  `storage/data/` so the path switch didn't orphan it. `data/raw/telegram_exports/`,
  `data/skills/`, and `data/cache/api_responses/` were deliberately left alone (unrelated content
  squatting at the same root, or confirmed stale/orphaned — nothing writes there anymore).
- **3.2 (purge legacy/holygrailpoly) — done, plus the test the plan missed.** Deleted
  `legacy/holygrailpoly/` (3 files) AND its dedicated test,
  `tests/scripts/integration/polymarket/legacy_polymarket_env.test.js` (the plan's task didn't
  mention the test — leaving it would have broken `npm test` with a missing-module error).

**Bonus fix found during verification, unrelated to this plan's scope:** 7 files under
`tests/scripts/architecture/cli/core/` had an off-by-one in their `REPO_ROOT`/require relative
path depth (`'..' x4` instead of `x5`) — left over from whatever moved this repo's flat
`tests/scripts/*.test.js` files into categorized subdirectories. Fixed (one more `'..'` /
`../` segment each) since it was failing 18 of `npm test`'s 19 failures at the start of this
session's verification pass. Final state: `npm test` 530 pass / 0 fail / 2 skipped (532 total),
`npm run hygiene` clean.

Untouched and left for whoever owns it: a `renameWithRetry` helper already present in
`shared/lib/market/validation.js` (Windows rename-retry robustness, not part of this plan) and
the large in-progress `tests/scripts/*` → categorized-subdirectory file reorg itself — both look
like separate, already-in-flight work from elsewhere and weren't touched here.

## Phase 1: Security & Trading Logic Fixes
**Objective:** Secure the exposed web route and prevent the trading gateway from swallowing failures or losing Fill-or-Kill (FOK) order intent.

<task type="auto">
  <name>1.1 Secure Kill-Switch API Route</name>
  <files>
    backend/api/app.js
  </files>
  <action>
    - Open `app.js` and locate `PROTECTED_GET_ROUTES`.
    - Add `/api/kill-switch` to the list of protected routes.
    - AVOID: Breaking existing protected routes or changing the actual route implementation inside `server/routes/system/kill_switch.js`.
  </action>
  <verify>curl -X GET localhost:port/api/kill-switch?command=status without a token returns 401</verify>
  <done>Unauthenticated GET requests are blocked.</done>
</task>

<task type="auto">
  <name>1.2 Fix Gateway Error Swallowing & FOK Intent</name>
  <files>
    backend/gateway/src/index.ts
    backend/gateway/src/cycle.ts
  </files>
  <action>
    - Open `backend/gateway/src/index.ts` (lines 723-748). Modify `ExecutionGateway.execute()` so that if an order execution fails, the JSON payload correctly returns `ok: false` and the process exit code reflects the error, instead of forcing `ok: true`.
    - Open `backend/gateway/src/cycle.ts` (lines 207-227, 405-437). Modify the order submission logic so that `postOrder` utilizes the explicit `OrderType.FAK` (or explicitly cancels unmatched GTCs).
    - AVOID: Swallowing the underlying error message. It must bubble up.
  </action>
  <verify>Run the test suite (npm test) and specifically run the gateway test assertions to ensure `ok: false` is correctly thrown on failed executions.</verify>
  <done>Bridge errors correctly propagate and unmatched GTC sell loops are prevented.</done>
</task>

---

## Phase 2: Data Architecture & Memory Fixes
**Objective:** Break the `ingest_market_data` monolith to improve code isolation, and fix the `mass-backfill` logic to fetch only gaps and flush incrementally to prevent OOM errors.

<task type="auto">
  <name>2.1 Extract Ingestion Monolith into Sub-Modules</name>
  <files>
    backend/scripts/data_ops/ingest_market_data/index.js
    backend/scripts/data_ops/ingest_market_data/crypto.js
    backend/scripts/data_ops/ingest_market_data/equities.js
    backend/scripts/data_ops/ingest_market_data/fx.js
  </files>
  <action>
    - Split the 1,982-line `index.js` into targeted modules by family (`crypto.js`, `equities.js`, `fx.js`).
    - Create a thin orchestrator in `index.js` that `requires` these sub-modules based on the requested family.
    - AVOID: Changing the actual data extraction logic or derivation behavior during the move.
  </action>
  <verify>node --test tests/scripts/tests/crypto_5m_backfill.test.js && node --test tests/scripts/tests/equity_5m_backfill.test.js</verify>
  <done>All data tests pass and `index.js` acts only as an orchestrator.</done>
</task>

<task type="auto">
  <name>2.2 Refactor Paginated Backfill to use Gap Planner</name>
  <files>
    shared/lib/data/backfill.js
    backend/cli/commands/data/data.js
  </files>
  <action>
    - Open `backfill.js` and modify `fetchPaginated`. Instead of walking the full requested window blindly backwards, inspect the existing `ts-index` using `readCoverage` to emit missing windows, fetching only gaps plus a small forward-refresh window.
    - Open `data.js` (`mass-backfill`). Refactor it to flush records incrementally per symbol/timeframe rather than accumulating all records across all jobs before writing the snapshot.
  </action>
  <verify>Run `node backend/cli/sovereign_cli.js data mass-backfill --family crypto --timeframes 1d` and verify memory usage (peak RSS) does not blow up, and only gap coverage is fetched.</verify>
  <done>OOM risks eliminated; redundant fetches avoided.</done>
</task>

---

## Phase 3: Project Hygiene
**Objective:** Resolve the dual-root path split by centralizing data under `storage/data/` and safely purge the unused `legacy` CLI archive.

<task type="auto">
  <name>3.1 Consolidate Dual-Root Data Split</name>
  <files>
    shared/lib/runtime/paths.js
  </files>
  <action>
    - Analyze any existing paths hardcoded to `data/` instead of `storage/data/`.
    - If `data/skills` is required, move it to a standard `.agents/skills` or `.gsd/skills` location, and move `data/cache` into `storage/data/cache`.
    - Update all path references across the codebase (specifically in `paths.js`) to strictly point to `storage/data/`.
    - AVOID: Breaking existing data loading flows by deleting `data/` before updating references.
  </action>
  <verify>npm run hygiene</verify>
  <done>Only `storage/data` exists; the base `data/` folder is safely removed or git-ignored as a localized temp folder.</done>
</task>

<task type="auto">
  <name>3.2 Purge Legacy CLI Archive</name>
  <files>
    legacy/
  </files>
  <action>
    - Delete the `legacy/holygrailpoly` directory and any associated dead assets, as they have been fully superseded by the React Ink TUI.
    - Remove references from `.gitignore` or test configurations.
  </action>
  <verify>git status is clean, and npm test passes 100%.</verify>
  <done>Archive surface eliminated.</done>
</task>
