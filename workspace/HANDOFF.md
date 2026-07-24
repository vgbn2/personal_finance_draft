# Session Handoff — Pointer

**This file is now a short pointer, not an accumulating log.** As of 2026-06-08, session handoffs live
in dated files under `workspace/handoff/` — one file per calendar day — so this pointer (and a session
boot) never has to read tens of thousands of tokens of accumulated history.

## Convention

- Latest/current handoff: **`workspace/handoff/2026-07-24.md`** (last update: 2026-07-24 session 101 implementation)
- At session close: append a new `## Update - <date> session N — <title>` block to
  **today's** `workspace/handoff/<YYYY-MM-DD>.md` (create it if it doesn't exist yet for today).
  Do NOT append to this pointer file or recreate a single growing log.
- Update the "Latest/current handoff" line above whenever a new dated file is created.
- Prior day's detail: `workspace/handoff/2026-06-15.md` (sessions 34-39, through FW2 completion).
- Deep history (everything accumulated before this convention started) lives in
  `workspace/handoff/_archive_through_2026-06-08.md` — read it only when you need pre-2026-06-08 detail.
- `workspace/STATE.md` was similarly trimmed; older Correction Log/Update entries (sessions ~20-79,
  2026-05-31 to 2026-06-07) are archived in `workspace/STATE_ARCHIVE.md`.

## Open carryovers (keep this list current)

- **SESSION 39 (2026-06-19) — first real GitHub backup of this repo (subtree-split push), FW2 fully
  done.** Full trail: `workspace/handoff/2026-06-19.md`. Discovered this directory's actual git root is
  the whole CODEPTIT monorepo (not personal_finance_draft alone) and that `origin` already holds its own
  divergent `main`/`feat/session-guard-intraday-rollup` history (commit `be96d76c`, real distinct work:
  backfill-daemon parallel lanes, clear-api-cache command, TUI refactors — not in local history). Used
  `git subtree split --prefix=personal_finance_draft <branch> -b <new>` (run from the monorepo
  toplevel) to extract just this project's history, then pushed all 4 local branches under `local-*`
  names so origin's existing branches stay untouched: `local-main`, `local-feat-session-guard-intraday-rollup`,
  `local-feat-ml-onnx-section`, `local-feat-resilient-crypto-fallback`. **Next-session first step (user
  decision, not started):** decide whether/how to reconcile origin's unique `be96d76c`-lineage commits
  into local history, and whether `local-*` becomes the real tracked upstream going forward. 4 leftover
  local scaffolding branches (`pfd-*-subtree`) are harmless byproducts, not cleaned up.
- **SESSION 39 (2026-06-18/19) — FW2 monolith deconstruction FULLY COMPLETE** (all 4 batches landed:
  backend/research/trade/data session 38 + candle_utils/manifests/providers-prediction/snapshot_fetchers
  this session). Root-caused and fixed the exact reason Batch 4 was paused twice (stale sibling-module
  cache during `Module._load` provider-stubbing tests — fix: purge the whole `ingest_market_data/`
  directory tree from `require.cache`, not just `index.js`'s own entry). `ingest_market_data/index.js`
  2227→1342 lines. Also: fixed a real duplicate-`registry:`-block bug in `config/trading/strategies.yaml`
  (silently double-listed all 14 strategies), and reviewed+committed a separate concurrent "vintage
  audit"/human-readable-CLI-output batch that was actively being built mid-session by another tool/agent
  (not mine — verified coherent and green before committing). Suite 490/490 throughout. Full trail:
  `workspace/handoff/2026-06-15.md` session 39.
- **SESSION 36 (2026-06-15) — backfill-daemon OOM fixed at the root + hard-tested + COMMITTED. Suite
  488/488.** Full trail: `workspace/handoff/2026-06-15.md` session 36. `backfill-daemon --concurrency 5`
  was OOMing (V8 heap ~4GB) in the crypto lane because each incremental job deserialized the whole
  multi-million-row 1m bin as JS objects **twice** (the `writeTsIndex` merge + `rollupFromBase`). Fix:
  (1) `mergeWriteBin` — buffer-level two-sorted-stream merge in `writeTsIndex` (off-heap, byte-identical
  to the old merge); (2) `readTsIndexSince` + windowed incremental rollup; (3) `LANE_MAX_CONCURRENCY`
  clamp on the 1m lanes + Docker heap headroom. Hard-tested: byte-equiv vs a frozen reference + a
  child-process OOM differential (original child status 134, new exit 0); live daemon survives the stock
  4GB heap (18/18 crypto, 0 errors, ~3× faster). **This commit also landed the still-uncommitted
  session-35 batch** (3 commits total; `data.js` carried both s35 marker-guard and s36 rollup-windowing
  so they committed together). NOT committed (deliberate): `storage/data/_quarantine_grain/` (8.3M,
  reversible, **not** gitignored), plus the usual untracked carryovers (`.antigravitycli/`, repo-local
  `skills/`, `scripts/dev/check_hygiene.js`, `backend_correlation_preflight.test.js`). **Open (not
  blocking):** intraday DEPTH inconsistency (Yahoo TFs differ in native depth — network re-fetch pass);
  graphify-out refresh; merge `feat/ml-onnx-section`→main (user); Ubuntu SSH sync (machine off).

- **SESSION 35 (2026-06-15) — blast-through deep pass: integrity 144× + marker clobber fix + intraday
  mixed-grain DATA REPAIR + grain guard. ALL UNCOMMITTED on `feat/session-guard-intraday-rollup`
  (HEAD still `e0cb6aa2`). Suite 471/471.** Full trail: `workspace/handoff/2026-06-15.md` session 35.
  Headlines: (1) `backend integrity` 57s→0.4s via `readCoverage` (proven equivalent over 1009 bins);
  (2) `writeDeadSymbolMarker` guard (no clobber of real bins); (3) redundant `generatePolymarketFeatures`
  alias removed — bulk over-export prune reverted (needs AST, backlog); (4) **fixed coarse-data-leaked
  intraday bins** (CORN_15m spanned 2002→2026): 83 corrupt bins quarantined to
  `storage/data/_quarantine_grain/` (reversible, gitignored) + re-derived clean; `isGrainSuspect` guard
  wired into integrity (0 flagged post-fix). **Next-session first step:** commit decision (split A perf,
  B marker-guard, C polymarket-alias, D grain-guard). NOT a code change: the **intraday depth
  inconsistency** (Yahoo TFs differ in native depth, e.g. VCB 5m≈83d vs 1h≈508d) remains — needs a
  network re-fetch pass if wanted.

- **SESSION 34 (2026-06-15) — daemon polish (TUI, concurrency, output, ingest gate) + dead-symbol gate.**
  Full trail: `workspace/handoff/2026-06-15.md`. 5 commits on `feat/session-guard-intraday-rollup`:
  `74b0ec67` (backfill-daemon→TUI + rollup-priority guard), `9b2fd784` (--concurrency flag),
  `a57e392b` (daemon output compacted), `f405263c` (ts/bin freshness gate in ingest),
  `e0cb6aa2` (dead-symbol gate: 7d skip after 0-bar deep backfill). Suite **465/465**.
  Ubuntu `sshd` stopped on Windows — still deferred. **Next-session first step:** elevated PowerShell →
  `Start-Service sshd`; then on Ubuntu `git fetch windows && git merge windows/feat/session-guard-intraday-rollup`,
  then run `crypto-deep-backfill --days 1825` for 1m crypto data.

- **SESSION 32 (2026-06-14) — blast-through audit (s31 clean) + caller migration committed + ALL 7 test
  fails fixed; suite 465/465 (first fully green since s12).** Full trail: `workspace/handoff/2026-06-14.md`
  session 32. Commits `6da0232b` (22-file shim→canonical caller migration), `2567d8f4` (STATE audit note),
  `31f1357a` (status recover-on-missing fix) on `feat/session-guard-intraday-rollup`. The 7 fails were
  **3 distinct causes**, not the single "env cache/creds" class prior sessions assumed: (1) corrupted
  `backend/gateway/node_modules/dotenv` → reinstalled (local-env, no repo change); (2) missing
  `last_fetch.json` → real status null-crash + cockpit no-LIVE, fixed in code (`31f1357a`); (3) stray
  untracked `.agents/skills/rigorous-feature-testing` → removed (local-env). **Note for next session:**
  causes (1) and (3) are local-env and won't persist in git — if those tests fail again, reinstall dotenv /
  re-remove the stray dir. `graphify-out` refresh still pending (status.js changed).

- **SESSION 30 (2026-06-14) — blast-through Focused Audit + mass-implement; 2 findings closed.**
  Full trail: `workspace/handoff/2026-06-14.md`. (1) **Data-depth gap closed:** the session-29 30m/4h
  catch-up rollup was only half-run; ran `intraday-rollup --family crypto`+`--family equities` →
  BTCUSDT 30m 1,440→154,404 / 4h 180→19,319, AAPL 30m 777→81,502 / 4h 859→11,260 (lossless, full 5m
  span; data only, `storage/data/ts` gitignored). (2) **Deleted dead divergent
  `config/markets/asset_mapping.json`** (zero readers; production reads `config/asset_mapping.json`);
  suite still 447/453. Audit confirmed session-29 prod code clean (P3 guard wired both consumers,
  rollup manifest parity); the `runGatewayCommand` P0 in DEV_REVIEW is a stale entry (fixed session 12).

- **SESSION 29 (2026-06-13) — blast-through refine + P3 guard WIRED + deep-intraday rollup + shim correction.**
  Committed `217d21e5` on branch **`feat/session-guard-intraday-rollup`** (NOT merged to main = user
  decision). Suite **447/453** (the 6 fails are pre-existing env-dependent: cockpit/status cache state +
  polymarket/trade creds — proven identical to clean HEAD; zero new failures). Full trail:
  `workspace/handoff/2026-06-13.md` session 29. Headlines:
  - **P3 equity session guard now actually applied** (was inert) — `guardEquitySessionBars` runs in
    `loadAssetSourcesFromCache` (ML) + `loadHistoricalSources` (backtest), gated to equity/index sub-daily.
  - **Deep-intraday rollup** — deep depth was 5m-ONLY; new `intraday-rollup` derives 15m/30m/1h/4h from
    deep 5m **losslessly**; deep-backfill now auto-derives coarser TFs (`--no-rollup` opt-out).
    **NEXT STEP (user): run `intraday-rollup --family crypto` / `--family equities` once** to backfill
    coarser bins for the 5m already on disk (local, seconds).
  - **Cleanups:** intraday_yahoo slimmed to constants-only (Yahoo accepts `1h` natively); intraday
    silent-zero fixed; dead `config/data_sources.yaml` dup deleted.
  - **DURABLE TRAP:** the 8 `shared/lib` root shims (`paths/ansi/indicators/backtest/backend_bridge/
    backfill/feature_builder/ai_client`) are LOAD-BEARING via sibling-relative requires, `#shared/*`
    aliases, AND compiled `dist/` artifacts — a literal-grep deletion broke the build. Restored all 8;
    direct source callers migrated to canonical. A module is "dead" only if it has no consumer across all
    four layers. Blast-through SKILL refined (global) with this rule + recency-ranked queue + hygiene sweep.
  - **Untracked, deliberately NOT staged (not session-29 work):** `.antigravitycli/`,
    `scripts/dev/check_hygiene.js`, repo-local `skills/`, `tests/.../backend_correlation_preflight.test.js`.

- **SESSION 25 (2026-06-13) — 5m Phase 3 + daily fix + Polymarket bulk DONE (suite 422/422, 12 commits).**
  Full trail: `workspace/handoff/2026-06-13.md` session 25. Headlines:
  - **5m now covers ALL families:** indices/commodities/fx via new `five-min-accumulate` (Yahoo
    `range=Nd` form, ~84 cal-days, no startTime); equities deepened to 2016 via Alpaca **SIP** feed
    (set `ALPACA_DATA_FEED=sip`; free plan 403s only the last ~15min, now clamped); 8 commodity ETF
    proxies (GLD/SLV/CPER/USO/BNO/UNG/WEAT/SOYB; **CORN excluded** — `{symbol}_{tf}.bin` collision).
  - **DAILY-TRUNCATION REGRESSION FIXED (`7b050f3c`):** `writeTsIndex` now merge-protects ALL
    timeframes (was REPLACE for daily/1h/4h → every ingest truncated deep daily bins to 1 bar; FX
    survived via JSON). Daily repopulated deep everywhere (`ingest --family X --timeframe 1d
    --history-days 7000`): equities 1998-2007, indices 1998, commodities 2003, crypto 2017.
  - **Polymarket historical archive BUILT:** volume-ordered bulk (Gamma id-order = empty hourly
    shells; `volumeNum` = data-rich) past the **Gamma 100-row page cap** → 2,045 markets / 82,616
    price points. Archive hardened: skip-existing resume, index/manifest-v2 merge, 429 retry,
    `--delay-ms`/`--refresh`. CLI null-`--archive-root` crash fixed.
  - **mass-backfill coverage fixed (`d94f8e65`, FW5):** now unions flat symbols ∪ universe_matrix
    grid (`massBackfillUniverse`) → 92→151 symbols; JPM/GS/AVGO/intl were being skipped.
  - **Crypto 5m re-run to 2017 STOPPED mid-run by user ("took too long")** at ~11/18 symbols —
    BTC/ETH at 926k bars (2017-08), BNB/XRP/ADA/LINK/DOGE/SOL extended; ~10 alts keep 5y depth
    (idempotent — resume with one `crypto-deep-backfill --days 3300`, but flag the multi-hour runtime).
  - **Open follow-ups (plan file `~/.claude/plans/hidden-exploring-river.md`, none blocking):**
    FW1 per-pid `writeTsIndex` temp filename (concurrent backfills); FW3 native-poll intraday
    15m/30m/1h/4h (user chose native poll — Yahoo 1h=730d > 5m-aggregation); FW2 monolith
    deconstruction; FW6 backward-gap fetch. Plus the unchanged equity session-gap guard + ML 5m caps.
  - **Durable trap:** `writeTsIndex` uses a fixed `<bin>.tmp` → two SEPARATE node processes racing it
    EPERM-crash (one process is fine — sync fs serializes on the event loop). Serialize backfills.

- **Sessions 23/23b batch COMMITTED (session 24, 2026-06-13):** the synthetic-5m guard + equity 5m
  Phase 2 work below was found entirely uncommitted at boot; independently re-verified (readTsIndex
  probe matched 23b's claims exactly; full suite 395/395 re-run) and landed in `a19d6323` (guard),
  `60458a7a` (equity 5m), `58130cb9` (docs). **Suite baseline is now 395/395.** Untracked ~937MB of
  user transfer artifacts remain at repo root (state.zip / .bundle / `vgbn1@vgbn-` botched-scp file)
  — do not commit; user cleanup pending.
- **5m deep-data status (session 23): crypto + US equities are now populated with native 5m.**
  Crypto 1825d rerun finished; 13 configured symbols have full 525,506-bar bins and listing/provider
  limited symbols are shorter (SUI/PEPE/WIF/POL/RNDR). US equity Phase 2 also finished:
  `equity-deep-backfill --days 1825 --chunk-delay-ms 500 --json` succeeded for 33/33 Alpaca-eligible
  US symbols, skipped 44 non-US symbols loudly, and ts-index verification found 3,101,322 merged
  `provider=alpaca` 5m rows across those 33 symbols.
- **Synthetic 5m guard is implemented.** Daily-aggregated lower-timeframe records now carry
  `derived_from_timeframe` / `experimental_only`; validation rejects them as `synthetic_lower_timeframe`;
  `ml dump` excludes experimental 5m by default and exposes `--include-experimental-5m`. US equity
  Alpaca 5m is now the promoted native non-crypto path.
- **Remaining 5m gaps:** Phase 3 indices/commodities/FX still need a provider/budget decision (or
  a Yahoo 60-day accumulate-forward stop-gap). Equity 5m still needs a session-gap guard before it
  feeds indicator/backtest consumers, and ML needs explicit 5m caps/perf gates.

- **SUPERSEDED by session 23 5m status above:** session 22 crypto failure/root-cause trail retained below for history.
  Session 21's background run finished `ok:true exit 0` with **0 deep bars for all 17 live
  symbols**: `snapshot.sources.push(...records)` in the ingest provider loop RangeError'd at
  ~525k records and the loop's catch swallowed it. Fixed via `appendRecords()` plain-loop helper
  (+8 sibling sites incl. the equity/commodity aggregation paths that 5m Phases 2-3 would hit);
  command now fails loudly on zero-bars-with-errors. Proven: real command at 400d → 115,200 bars
  persisted exactly; suite **387/387** (new baseline). Fix UNCOMMITTED pending user. Fresh
  18-symbol 1825d rerun launched in background — **verify per-symbol counts** (BTCUSDT ≈ 525k)
  when it completes / next session; at session close it was 5/18 done with every symbol landing
  the full 525,506 bars. Trail: `workspace/handoff/2026-06-12.md` session 22.
- **SUPERSEDED by synthetic guard status above:** Daily-aggregated "5m" bars for
  non-crypto families must NOT feed ML training or backtests; only native deep 5m qualifies.
  Enforcement is a Phase 2 work item (provenance-tag aggregated records + filter in ml dump /
  backtest loaders — tagging beats config removal). Plan: FIVE_MIN_DATA_SCOPING.md §8/§8e.
- **TwelveData 5,000-bar provider-chain trap (NEW, durable):** twelve sits before/early in EVERY
  family's provider chain in `config/markets/data_sources.yaml` and silently caps history at
  exactly 5,000 bars; the ingest provider loop breaks on first success. Crypto deep path now pins
  `options.provider='binance'`. Equities/indices/commodities deep backfills (5m Phases 2-3) will
  hit the same wall — pin their providers too.
- **Deferred from session 21:** CLI lazy-requires (RAM #5, optional — agent session limit + file
  overlap); NDJSON streaming (RAM #2) still needs user format sign-off; 5m Phases 2-4 per
  FIVE_MIN_DATA_SCOPING.md.
- **Suite baseline is now 385/385** (session 21; was 342). Branch `feat/ml-onnx-section` remains
  ready for the user's merge decision.
- **Parked 2026-06-11 batch — RESOLVED (2026-06-12 session 18b):** the user's own checkpoint
  commit `76ef48fb` (10:38) committed the entire ~770-line parked working-tree batch (status.js
  recovered_live, trade.js, asset_picker.js, manifest.js, cli_executor.js, configs + many
  previously-untracked files). TUI Phase B (workspace/TUI_REVAMP_SPEC.md) is therefore unblocked.
- **Concurrent-session caution (NEW, durable):** Codex sessions write to this tree while Claude
  sessions run (proven 2026-06-12: polymarket slice landed 13:30-15:43 mid-wave). Before staging
  ANYTHING, re-check `git status` + file mtimes; integrate via review, don't assume agent scope
  violations.
- **`feat/ml-onnx-section` — AUDITED + FIXED + COMMITTED (sessions 11-12, 2026-06-11).**
  The unrecorded 2026-06-10 work was audited (7 new failing test files, broken
  `runGatewayCommand`, tracked→untracked deps), then fixed via Sonnet-delegated waves and
  landed in 6 commits (`358476f6`..`8e8b4adf`). **Full suite now 263/263 — first fully green
  run on record** (all 6 pre-existing baseline failures cleared too). Trail:
  `workspace/handoff/2026-06-11.md`, DEV_REVIEW.md "Focused Audit - 2026-06-11" + RESOLUTION.
  Branch is ready for the user's merge decision (feat/ml-onnx-section → main).
- **`backend/cli/target/` hygiene — CLOSED** (committed in `8e8b4adf`).
- **`.onnx` models latent gap — CLOSED** (binaries + serving manifest committed in `8e8b4adf`).
- **DEPRIORITIZED by user (2026-06-11, "not important, skip"):** Docker/ONNX container
  verification (Dockerfile:46 edit stays uncommitted in the working tree — don't lose it, but
  don't push it either), centralization backlog (trade.js launcher call sites,
  tools/backend.js local runBackendCommand), untracked `notebooks/`, graphify-out refresh.
  Do NOT proactively resume these; wait for the user to re-raise.

- **shared/lib reorg + workspace doc archival — DONE (session 10, 2026-06-09), but READ THIS:**
  the reorg STATE.md had been claiming as "done" since 2026-06-08 was actually sitting **entirely
  uncommitted** (new canonical `shared/lib/{runtime,market,strategy,...}` dirs untracked, old
  files gutted to shims only in the working tree — one `git clean -fd` from total loss). Same for
  the doc archival (`STATE_ARCHIVE.md`/`workspace/handoff/`/`workspace/archive/`). Landed in
  `f4a97e94` (191 files) + a follow-up commit (21 files). **Lesson for future sessions: when
  STATE.md says a restructure is "done," verify with `git status`, not just by reading the
  doc** — this is the third time this drift class has bitten the project (`648ab69e`, `4d3fb4d`,
  now this). Full trace: `workspace/handoff/2026-06-09.md` session 10.
- **New hygiene flag (not fixed)**: `backend/cli/target/` — 2,151 untracked Rust build-artifact
  files. Should probably go in `.gitignore`; currently a `git add backend/` trap (caught and
  walked back during session 10's commit, see above). Small, easy follow-up.
- **Scalping-bot pivot scoping — DONE.** Scoping doc written at `workspace/SCALPING_BOT_SCOPING.md`
  (5 sections: strategy module shape, sub-minute cycle reqs, order-book data needs, latency/fee
  modeling, open risks/decisions — all with file:line refs). Verdict: this is a second execution
  architecture, not a config change; weeks not days. The pivot decision (whether/how to proceed)
  is still the **user's** to make — doc ends with 4 open questions (venue, thesis, validation
  window, resourcing) that need answers before any planning/implementation pass starts.
- `.mcp.json` test-gate / git-hygiene drift — **DONE (session 8)**. Turned out bigger than scoped
  (4,533 files: `node_modules/` + `backend/gateway/node_modules/` + `storage/data/cache/` +
  `.mcp.json` had drifted back into tracking via the broad `4d3fb4d "changes"` commit). Fixed with
  index-only `git rm -r --cached`; `structure_contract.test.js` → 4/4; committed.
- `infra/docker/DEPLOY.md` — **DONE (session 8)**. Was untracked but accurate; committed as-is
  (gateway-service removal + `macro_features.cpp` fix were already in `4d3fb4d`).
- **Container ML ONNX enablement — BLOCKED on Docker Desktop (session 8).** Edited
  `infra/docker/Dockerfile:46` to add `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON` (uncommitted —
  deliberately left unverified-and-uncommitted). Rebuild couldn't be verified: Docker Desktop's
  daemon was wedged by a **stale zombie `com.docker.build` process (PID 166360, idle ~22h, started
  2026-06-07 17:25 — predates this session)**; every `docker` CLI call (`images`, `ps`, `compose ps`)
  hung indefinitely. Killing the PID directly was blocked by the harness's destructive-action
  classifier. User chose to **defer the Docker Desktop restart to later** rather than do it now.
  **Next session**: user restarts Docker Desktop first (clears the wedge), then re-run
  `docker compose -f infra/docker/docker-compose.yml build && ... up -d`, verify
  `docker exec docker-web-1 ... ml compare --json` reports `"backend":"onnx_runtime"` (not
  `deterministic_baseline`, cross-check against Phase-3 parity: xgboost 0.666376 / logistic
  0.468378 / regime 0.456982), THEN commit the Dockerfile edit. Don't commit the edit before
  verifying — an unverified build-config change in `Dockerfile` could silently break the image.
- **Latent gap (flagged, not fixed)**: trained `.onnx` model files are gitignored
  (`.gitignore:64` → `models/*.onnx`). Local `docker compose build` picks them up fine (build
  context = local working tree), but a genuine "clone to fresh remote Linux node" deploy would be
  missing the trained models and silently fall back to `deterministic_baseline`. Needs a future
  user decision: commit the small (~1MB) `.onnx` binaries, or add a model-sync/retrain step to
  the documented deploy flow in `DEPLOY.md`.
- `run bot live` "stub" was investigated this session and **reclassified as resolved** (intentional
  safety redirect, not a gap) — see `workspace/DEV_REVIEW.md` and
  `workspace/handoff/2026-06-08.md` session 7 for the full trace.

## Boot reading order (for session-orchestrator)

1. This file (`HANDOFF.md`) — short pointer + carryover list.
2. The latest dated file in `workspace/handoff/` (see "Latest/current handoff" above).
3. `workspace/SESSION_MEMORY.md` and `workspace/STATE.md` as before.
4. Archives (`_archive_through_*.md`, `STATE_ARCHIVE.md`) only on demand for deep history.

## Session 31 close-out (2026-06-14) — Background backfill daemon + mixed base grain (UNCOMMITTED)

- Implemented the plan at `~/.claude/plans/resilient-riding-liskov.md` (ExitPlanMode-approved):
  a passive background poller + a **mixed base grain** (1m for crypto/equities, 5m for Yahoo).
- **All changes are UNCOMMITTED** on `feat/session-guard-intraday-rollup`. Next session: review the
  diff and commit (suggested split: A) 1m grain core, B) coverage.js + daemon, C) docker + docs).
- New files: `shared/lib/market/coverage.js`, `backend/cli/commands/data/backfill_daemon.js`,
  `tests/scripts/tests/coverage.test.js`, `tests/scripts/tests/backfill_daemon.test.js`.
- Edited: `constants.js` (+1m), `ingest_market_data/index.js` (crypto ORDER +1m),
  `data.js` (rollupFromBase/listDeepSymbols/FAMILY_BASE_TF + deep-backfill base grain),
  `validation.js` (export familyFreshnessThresholdMs + crypto/equities 1m thresholds),
  `sovereign_cli.js` (register `backfill-daemon`), `infra/docker/docker-compose.yml` (backfill service),
  `tests/.../equity_5m_backfill.test.js` (1m contract + legacy `--base-tf 5m`), `workspace/STATE.md`.
- Command: `node backend/cli/sovereign_cli.js backfill-daemon [--once] [--families ...] [--interval-secs N]`
  (top-level, NOT `data backfill-daemon` — dispatch is flat). Docker: `docker compose ... up -d backfill`.
- Verification: new/affected suites green (57/57 across intraday_rollup, coverage, backfill_daemon,
  equity_5m_backfill, equity_session, crypto_5m_backfill, ml_dataset). Full suite 458/465 — the 7 fails
  are PRE-EXISTING (proven: safe-stash of my data edits left the same 6 trade/status fails; +1 hygiene
  flagging a stale `.agents/skills/rigorous-feature-testing` folder). **Live 1m provider smoke NOT run
  (needs network + Binance/Alpaca keys)** — run `crypto-deep-backfill --symbol BTCUSDT --days 7` next.
