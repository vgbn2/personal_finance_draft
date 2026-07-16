# Project State - Sovereign Trading Platform

<!-- BLAST-THROUGH AUDIT ANCHOR (read by the Recency-Ranked Audit Queue) -->
last_audited_commit: e0cb6aa2
last_audit_date: 2026-06-15

## Current Phase
Phase 9: Strategic Intelligence & TUI Integration - ACTIVE

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
