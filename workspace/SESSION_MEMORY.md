## Session Memory - 2026-07-16 session 83 - session boot

{
  "work": "Booted the new session, loaded HANDOFF, SESSION_MEMORY, STATE, NEXT_SESSION_GOAL, and docs/README.",
  "key_mechanisms": [
    "Session-82 merge-recovery gate remains the active carryover.",
    "graphify-out is absent, so no refresh was possible during boot."
  ],
  "remaining": [
    "Run one reviewed merge-recovery batch from DEV_REVIEW session 82 before new evidence acquisition, analysis promotion work, TUI cleanup, or live trading."
  ],
  "dcs": 0.97
}

## Session Memory - 2026-07-16 session 83 - merge-recovery triage

{
  "work": "Ran blast-through triage in Fast Reading Mode against the active session-82 merge-recovery gate.",
  "confirmed": [
    "Direct Polymarket order authorization, explicit price, broker risk context, and native risk checks pass focused local tests.",
    "LIVE_TRADING=true can make bot cycle and force-sell live without the --live-only CLI authorization gate; bot CLOB posts bypass ExecutionGateway native risk approval.",
    "Archived HEAD still has four conflict-marked canonical shared modules and the root test runner is absent."
  ],
  "verified": [
    "Polymarket preflight/auth 5/5; risk-context/backend-bridge 6/6; gateway TypeScript; current-tree eight-module load; git diff --check.",
    "Clean HEAD archive four module loads fail with syntax errors; npm test exits MODULE_NOT_FOUND before discovery."
  ],
  "remaining": [
    "Extend merge-recovery Batch 1 to fail closed for env-driven bot live mode and require equivalent native risk approval.",
    "Complete Batch 2 and verify the committed archive plus restored canonical test runner."
  ],
  "dcs": 0.59
}

## Session Memory - 2026-07-16 session 83 - mass-implement closeout

{
  "work": "Completed the seven-batch merge-recovery plan in six scoped commits and verified committed HEAD.",
  "commits": [
    "bc9ce6de",
    "713b1f98",
    "d851d7c6",
    "8e08ab6d",
    "d8d78545",
    "cb1c349f"
  ],
  "verified": [
    "Node 821 total / 817 pass / 0 fail / 4 skip; API 7/7; contracts 31/31; native 29/29.",
    "Frontend build/typecheck, gateway and MCP TypeScript, six dependency roots, hygiene, diff check, and secret scan 814/0.",
    "Clean archive loaded 15 load-bearing modules and found the canonical test runner."
  ],
  "data_truth": "92/92 cached, 0 required-window stale, 8 cadence-plausible grain suspects, 1 blocking unexplained SOYB 5m seam; no cache rewrite.",
  "remaining": [
    "Repair SOYB 5m only through a source-backed provider path with row-count/checksum preservation evidence.",
    "Require independent review and host live-soak before any real-capital execution approval.",
    "Keep the combined actionable engine D/nonexistent until the exact-asset research-only composition plan is implemented and verified."
  ],
  "promotion": "blocked",
  "graphify": "unavailable"
}

## Session Memory - 2026-07-15 session 82 - full deep blast-through after merge

- Full / Hard audit at `49560981`; DCS `0.635 -> 0.590`; promotion and live execution blocked.
- P0: merge removed Polymarket live authorization/PIN, explicit price, broker-backed risk context,
  and native pre-trade approval before order placement.
- P0: committed canonical env/ingestion/macro/model modules contain conflict markers; dirty repairs
  and four untracked shims make only the local worktree load. Clean `git archive HEAD` fails.
- P1: `npm test` runner missing; fallback 815 total / 747 pass / 59 fail / 9 skip. Analysis 19/19,
  API 5/7, contracts 30/31, TUI 32/37; frontend typecheck/build and secrets pass.
- P1: merge removed 4,896 workspace-history lines relative to parent 1; session 73-81 review detail
  is recoverable from `49560981^1` but absent from the current DEV_REVIEW.
- Data: 92/92 cached, 0 stale, 9 grain suspects; advisory flag does not reach scorecard consumers.
- Next: one reviewed merge-recovery batch before research evidence work. Full gates are in
  `workspace/DEV_REVIEW.md` session 82 and `workspace/handoff/2026-07-15.md`.

## Session Memory - 2026-07-04 - session 40 - Unix/Linux setup porting to feat/session-guard-intraday-rollup

{
  "work": "Ported Unix/Linux sv wrapper and start_local.sh from main branch to feat/session-guard-intraday-rollup.",
  "key_mechanisms": [
    "WRAPPER PORTING: Checked out 'sv' and 'start_local.sh' directly from local 'main' branch, avoiding merge conflicts on history files (PROMPT_LOG.md / SESSION_MEMORY.md).",
    "WORKSPACE HANDOFF: Created new dated handoff file '2026-07-04.md' for the feature branch and updated HANDOFF.md pointer."
  ],
  "verified": [
    "git status shows sv and start_local.sh staged as new files.",
    "Files checked out are identical to the verified versions on main branch."
  ],
  "commits": ["ae7447a9 (feat(linux): port sv wrapper and start_local.sh setup to feat/session-guard-intraday-rollup)"],
  "dcs": 0.97
}

## Session Memory - 2026-06-18/19 (session 39) FW2 monolith deconstruction FULLY COMPLETE (Batches 3+4) + vintage-audit batch reviewed/committed + first real GitHub backup (subtree-split push); suite 490/490 throughout

{
  "work": "Boot found HEAD newer than docs described (session 38's FW2 batches 1-2 already committed but undocumented) plus a much larger uncommitted working tree than any handoff entry described. Fixed a real bug found during triage, then on explicit user instruction: (1) committed a separate concurrent feature batch, (2) completed FW2 Batch 4 (paused twice before), (3) pushed the whole repo to GitHub for the first time ever.",
  "key_mechanisms": [
    "BUG FOUND+FIXED (unprompted, during triage): config/trading/strategies.yaml had an exact-duplicate `registry:` block pasted in. The hand-rolled line-based `readStrategyRegistry()` reader (backend/cli/commands/strategy/strategy.js, no real YAML parser) doesn't reset on a repeated top-level key, so it silently returned 28 entries (each of the 14 strategy files twice) -- confirmed via direct probe, not caught by any test. Fix needed no commit: turned out the dup was a local-only corruption on top of an already-clean HEAD, so removing it just restored byte-identical match to HEAD.",
    "CONCURRENT BATCH REVIEWED+COMMITTED: a separate tool/agent was actively building a 'vintage audit' / human-readable-CLI-output feature live in the working tree during this session (caught via repeated git-status + mtime checks, last touch 4 min before review -- the documented 'concurrent sessions' risk pattern, this time directly observed). Verified it was coherent (consistent renderX() template across backend/status/quotes/optimize/data-validate commands) and green (490/490) before committing in 2 logical commits. Real find inside it: shared/lib/market/validation.js validateOhlcv now branches to a new validatePoint validator for point/tick-shaped records instead of demanding open/high/low/close on data that was never OHLC.",
    "FW2 BATCH 4 ROOT CAUSE (the actual reason it was paused twice): tests for fetchCryptoSnapshot/fetchEquityOrIndexSnapshot/fetchCommoditySnapshot/fetchFxSnapshot stub shared/lib/providers via Module._load while doing `delete require.cache[ingestPath]; require(ingestPath)`. That purges ONLY index.js's own cache entry. Once those 4 functions live in a sibling file (snapshot_fetchers.js), the sibling's OWN top-level provider bindings get captured at ITS require-time -- but its cache entry was never purged, so a later test inherits a STALE sibling (cached with a different test's stub, or no stub) and gets wrong provider bindings. Confirmed empirically: naive split -> exactly 8 failures, first call in each affected test file passing (fresh cache) and every subsequent call in the same file failing (stale cache) -- the predicted shape, not noise.",
    "FW2 BATCH 4 FIX: every affected test (crypto_5m_backfill.test.js, equity_5m_backfill.test.js, five_min_fetchers.test.js) now purges the WHOLE ingest_market_data/ directory tree from require.cache wherever it previously purged just index.js's single entry -- generic fix, covers candle_utils.js/manifests.js/providers/prediction.js/snapshot_fetchers.js and any future split sibling. 8/8 fixed; verified by running affected files twice in sequence (ordering-flakiness check) plus direct runtime probes (not just load-checks) confirming the lazy-require wrappers for resolveEquityOrIndexSymbol/appendRecords/redactUrl actually reach the real index.js functions at call time.",
    "GIT ROOT SURPRISE: `git rev-parse --show-toplevel` from inside personal_finance_draft/ resolves to the whole CODEPTIT monorepo, not this subdirectory -- a plain `git push origin main` tries to push every sibling project too. Confirmed the hard way: GitHub's pre-receive hook rejected it on a 166MB _tools/automation_n8n/talkytimes/Antigravity.exe with zero relation to this project.",
    "ORIGIN DIVERGENT-HISTORY SURPRISE: origin (vgbn2/personal_finance_draft on GitHub) already had main + feat/session-guard-intraday-rollup branches at commit be96d76c, rooted at 524e787d -- a completely unrelated commit graph from local's 815c7c5d-rooted history (no common ancestor), yet content clearly overlaps (origin's log mentions the same 'session 33' work this repo's own memory describes). Two real, independently-evolved timelines from roughly the same starting point. Force-pushing would have destroyed whichever side lost -- did NOT do this.",
    "RESOLUTION: git subtree split --prefix=personal_finance_draft <branch> -b <new> (must run from the monorepo TOPLEVEL, not from inside the subdirectory -- subtree split refuses otherwise) extracted just this project's history from all 4 local branches (327 total monorepo commits / 178 on main -- fast, filter-repo wasn't even needed). Pre-flight-checked all 4 new histories for oversized blobs (git rev-list --objects | git cat-file --batch-check) before pushing -- found nothing above ~21MB. Pushed all 4 under local-* names (local-main, local-feat-session-guard-intraday-rollup, local-feat-ml-onnx-section, local-feat-resilient-crypto-fallback) so origin's existing branches stay completely untouched."
  ],
  "verified": [
    "Full suite 490/490 (2 pre-existing env-skips) maintained across every commit this session -- ran before AND after each of: strategies.yaml fix, vintage-audit batch review, candle_utils.js extraction, manifests.js+prediction.js extraction, snapshot_fetchers.js extraction, all 3 test-file fixes.",
    "Direct runtime probes (not just node --check / require() load-checks) for every lazy-require boundary introduced: manifests.js -> index.js (fetchCryptoSnapshot reaches real function, surfaces its own internal error not a stub error), prediction.js -> index.js redactUrl (correctly redacts a secret= query param), snapshot_fetchers.js -> index.js resolveEquityOrIndexSymbol (reaches real function, throws the real 'no symbol mapping' error).",
    "crypto_5m_backfill.test.js / equity_5m_backfill.test.js / five_min_fetchers.test.js run individually (17/17, 9/9, 4/4) and run TWICE in sequence together (40/40 both times) to rule out require.cache ordering flakiness from the directory-purge fix.",
    "git ls-remote origin after all 4 subtree-split pushes confirmed every local-* branch present at the expected commit hash."
  ],
  "user_decisions": [
    "'continue last session work' (free text, not a menu pick) -> resumed FW2 Batch 3/4 rather than archaeology-ing the unexplained uncommitted batch.",
    "AskUserQuestion: 'Both of the above' -> commit the concurrent vintage-audit batch AND attempt FW2 Batch 4 (previously twice-paused).",
    "'sync it all' -> AskUserQuestion clarified Ubuntu-LAN-sync (blocked, needs user's elevated PowerShell) vs GitHub push -> user picked GitHub, all 4 real branches (not the 5 disposable worktree-agent-* branches).",
    "AskUserQuestion after discovering origin's divergent history: 'Push local as new branch names' (safest option -- doesn't touch or risk origin's existing, apparently-unique commits).",
    "AskUserQuestion after discovering the monorepo-vs-subdirectory git-root mismatch: 'Only the personal_finance_draft subtree' (proper long-term shape, not a fresh-history snapshot)."
  ],
  "remaining": [
    "Origin's be96d76c-lineage main/feat-session-guard-intraday-rollup hold real, apparently-unique commits (backfill-daemon parallel provider lanes, clear-api-cache command, TUI refactors) not present in local history -- reconciliation is an open user decision, not investigated further.",
    "Decide whether local-* becomes the real tracked upstream going forward, or stays a one-off backup snapshot.",
    "4 leftover local scaffolding branches (pfd-main-subtree, pfd-feat-session-guard-subtree, pfd-ml-onnx-subtree, pfd-resilient-crypto-subtree) -- harmless byproducts of the subtree split, not cleaned up.",
    "Unchanged: Ubuntu LAN sync (sshd Stopped/Manual on Windows, needs elevated Start-Service + Ubuntu machine power-on), FW6 backward-gap fetch, feat/ml-onnx-section -> main merge (now entangled with the origin-divergence question above), graphify-out refresh (stale since 2026-05-18, repeatedly deprioritized across many sessions)."
  ],
  "dcs": 0.96
}

## Session Memory - 2026-06-15 (session 36) backfill-daemon OOM ROOT-CAUSED + fixed (streaming ts-index merge + windowed rollup + 1m-lane cap); hard-tested (byte-equiv vs git-original + child-process OOM differential); live daemon survives stock 4GB heap; suite 488/488; COMMITTED + session-35 batch

{
  "work": "User ran `backfill-daemon --once --concurrency 5` and it OOM'd (V8 heap, ~4GB) in the crypto lane. Root-caused, fixed at the root, hard-tested per user demand ('plan, test, run it yourself'), then refined the tests after user skepticism ('plan and fix those tests'). Committed the fix + the still-uncommitted session-35 batch + docs. Session end.",
  "key_mechanisms": [
    "TWO full-bin reads each materialized the whole multi-million-row 1m bin as JS objects (BTCUSDT 1m=3.08M, each with a fresh ISO timestamp string). At concurrency 3-5 across BTC/ETH/SOL this exceeded the ~4GB default V8 old-space. SINK 1 = the merge-write inside ingest (writeTsIndex called readTsIndex on the existing bin just to merge-protect). SINK 2 = rollupFromBase read the whole 1m bin again to derive coarser TFs.",
    "FIX SINK 2 (windowed rollup): new readTsIndexSince(tsDir,sym,tf,sinceMs) in validation.js binary-searches the sorted bin Buffer and materializes ONLY the tail. rollupFromBase(...,{sinceMs}) re-derives just the recent window. Daemon passes sinceMs = utcDayFloor(now-(incrementalDays+1)d) for INCREMENTAL jobs (deep jobs still full). UTC-day alignment = a multiple of every intraday interval up to 4h, so NO partial coarse bars (lossless, byte-identical to full rollup). BTCUSDT rollup: 8,625 bars not 3.08M, heap 22MB.",
    "FIX SINK 1 (streaming merge-write): writeTsIndex now calls mergeWriteBin (validation.js) which reads the existing bin as a Buffer ONLY (external memory, NOT V8 heap) and two-sorted-stream-merges it with the small incoming window — retained rows copied as raw 48-byte slices, only incoming rows are objects. Heap stays flat regardless of bin depth. Semantics byte-identical to the old object merge (merge-protect all TFs, higher-priority-provider wins on tie else incoming wins, sort+dedup). Also kills a latent push(...existing) call-spread RangeError in the gap-fill branch.",
    "CONCURRENCY CAP: LANE_MAX_CONCURRENCY={binance:3,alpaca:3} in backfill_daemon.js. `--concurrency N` clamps the 1m lanes to their safe ceiling (bins ~100x bigger than Yahoo 5m) while Yahoo honors the full N. Prints a clamp note. Docker backfill service got NODE_OPTIONS=--max-old-space-size=6144 as insurance (interactive runs are safe at stock 4GB after the fix).",
    "TEST DURABILITY TRAP (user-caught): my first merge test used `git show HEAD:validation.js` as the golden reference — which BREAKS the moment the work is committed (HEAD becomes the new code; the loader's own guard throws). Fixed: vendored a FROZEN referenceWriteTsIndex (verbatim transcription of the original object merge) in the test = durable golden, no git. A skip-safe test cross-checks the frozen ref vs the genuine git-HEAD original WHILE uncommitted (proves faithfulness), then skips cleanly forever after. Same skip-safe pattern for the OOM differential."
  ],
  "verified": [
    "Suite 488/488 (was 471 at session start; +17). 0 fail 0 skip.",
    "ts_merge_write.test.js 13 tests: 9 byte-equiv scenarios (bin+meta) vs frozen ref + 3 real deep bins + frozen-ref==git-original cross-check + NEW-survives-192MB-cap + ORIGINAL-OOMs-192MB-cap. OOM differential: original child status 134 (V8 OOM abort) on 1.3M-row bin, new child exit 0. Proven skip-safe: with git unavailable, 2 git-tests SKIP, 11 pass, 0 fail.",
    "LIVE daemon (the real test): `backfill-daemon --once --families crypto --concurrency 5` at STOCK --max-old-space-size=4096 (the config that crashed twice) -> 18/18 crypto, 17 incremental+rollup, 1 skipped (RNDRUSDT dead), 0 errors, exit 0, 170s, peak RSS 2.68GB. Per-symbol ~17-38s (was ~57-110s, ~3x faster).",
    "Post-run integrity: crypto 18/18 OK, bins GREW correctly (BTCUSDT 1m 3,078,419->3,078,472 +53 merged) with deep history preserved, no truncation/corruption."
  ],
  "user_decisions": [
    "'full fix' (lane cap + windowed rollup) via AskUserQuestion; then 'plan, test, run it yourself (hard testing)'; then skeptical -> 'plan and fix those tests' (durability refactor); then 'commit then end sessions'.",
    "Ubuntu machine turned OFF mid-session -> Ubuntu SSH/backfill carryover stays parked. Data/daemon NOT deleted (user asked 'do we need to delete it' -> no, data intact + valuable)."
  ],
  "commits": [
    "(this session) 3 commits on feat/session-guard-intraday-rollup: (1) integrity/coverage/grain/polymarket [s35 core], (2) backfill memory fix + dead-symbol marker guard [s35+s36, data.js entangled], (3) workspace docs.",
    "data.js carried BOTH s35 marker-guard AND s36 rollup-windowing (entangled in one file) -> committed together in commit 2."
  ],
  "remaining": [
    "Intraday DEPTH inconsistency (NOT corruption): Yahoo TFs differ in native depth (VCB 5m~83d vs 1h~508d) — needs a network re-fetch pass if wanted.",
    "storage/data/_quarantine_grain/ (8.3M, s35) is NOT gitignored (check-ignore confirmed) — left untracked, reversible, do not commit.",
    "Unchanged: merge feat/ml-onnx-section->main (user), Ubuntu SSH sync + remote backfill (machine off), FW2 monolith, FW6 backward-gap. graphify-out refresh pending."
  ],
  "dcs": 0.97
}

## Session Memory - 2026-06-15 (session 35) blast-through deep pass: integrity 144× + marker clobber fix + intraday mixed-grain data repair + grain guard; suite 471/471; ALL UNCOMMITTED (HEAD e0cb6aa2)

{
  "work": "Blast-through audit (anchor 483d45cc->e0cb6aa2) + deep optimization + unused-code scan + rigorous testing, then a user-reported DATA-corruption diagnosis and reversible repair. Nothing committed (commit decision deferred to user).",
  "key_mechanisms": [
    "INTEGRITY 144x: runBackendIntegrity looped readTsIndex (full bin load, ~525k objects for a 1m crypto bin) per (symbol x tf) just for count+first/last ts. Swapped to readCoverage (header + two 8-byte head/tail reads); added firstBarMs to coverage.js. Proven IDENTICAL over all 1009 real bins (0 mismatches) + adversarial edge-case test (single-bar/empty/marker/truncated). Live 57,069ms -> ~380ms.",
    "MARKER CLOBBER (Medium finding from s34 code): the dead-symbol not-found marker was written unconditionally over <sym>_<tf>.meta.json; for a symbol that ALREADY had a bin, a transient 0-bar fetch stripped coordinate_id/config_*/derived_from off real bars (OHLCV survived). Fix: extracted exported writeDeadSymbolMarker(tsDir,sym,tf,family,provider) that writes ONLY when no .bin exists. Tested both branches end-to-end.",
    "OVER-EXPORTS: 94 shared/lib exports have no importer but are alive internal helpers (over-exported); only 1 truly dead (generatePolymarketFeatures alias -> removed). DURABLE LESSON: bulk regex prune REVERTED because an exported name often also lives in a second internal object literal (e.g. bollingerBands in the IndicatorMethods registry) -> line-removal corrupts internal state. Safe trimming needs AST-scoped editing; not worth it (zero importers = harmless).",
    "MIXED-GRAIN DATA CORRUPTION (the headline, user-reported via integrity output): coarse daily data had leaked into intraday bins -- CORN_15m spanned 2002->2026 at ~1.5 bars/day (daily mislabeled as 15m), frozen by writeTsIndex merge-protection. Relic of the old daily-aggregation/synthetic-LTF era. Detector = early-window median bar-gap. 83 corrupt bins / 38 symbols: 9 commodity/metal (15m + some 4h leak) + 13 orphan crypto alts (all-synthetic, NOT in active 18-symbol config) + 4 stray 1m:5 stubs. FIX (user-authorized, REVERSIBLE): quarantined to storage/data/_quarantine_grain/ (MOVED not deleted, gitignored) + re-derived from deepest clean divisor (commodity 15m/4h<-5m, VN 4h<-1h to keep 508d native span). Re-scan 0 corrupt.",
    "GRAIN GUARD: isGrainSuspect(tf,count,firstMs,lastMs) in coverage.js. CHEAP (head/tail only): flags intraday bin spanning >2yr with barsPerDay below per-TF floor (calibrated below legit p05: 5m>=24,15m>=11,30m>=4.6,1h>=3.4,4h>=1.35). The >2yr-span gate is the key discriminator -- it avoids false-flagging honest-thin RECENT 4h (sparse Yahoo intraday legitimately yields ~1 bar/day) AND native-deep 1h. Wired into backend integrity as advisory (grain_suspect flag + total_grain_suspect JSON + yellow line; NON-gating). 0 flagged across 941 live bins."
  ],
  "verified": [
    "Full suite 471/471 (was 465; +6 tests: marker x2, integrity-equivalence x1, grain x1, coverage read-side x2).",
    "Live backend integrity --json: ~365ms, ok:false, cached 92, stale 4 (PRE-EXISTING FX 1d weekend staleness, unrelated), grain_suspect 0.",
    "Per-bin equivalence readCoverage vs readTsIndex: 1009 bins, 0 mismatches.",
    "Post-fix grain re-scan: 0 corrupt; CORN 15m=3733 real 15m bars (medianGap 15min), NG 4h medianGap 240min, all rebuilds derived_from set."
  ],
  "user_decisions": [
    "'plan and fix' x2 -> did the optimization + data repair.",
    "AskUserQuestion: 'Yes -- quarantine + rebuild' (reversible, not hard-delete) for the data fix.",
    "Bulk over-export prune reverted by me (broke a contract test); kept only the 1 genuine dead alias."
  ],
  "remaining": [
    "COMMIT DECISION (user): nothing committed this session. Suggested split A perf/integrity, B fix/marker-guard, C refactor/polymarket-alias, D feat/grain-guard.",
    "Intraday DEPTH inconsistency (NOT corruption, NOT fixed): Yahoo TFs have different native depths (VCB 5m~83d vs 1h~508d). Needs a network re-fetch pass if wanted.",
    "Quarantine storage/data/_quarantine_grain/ (8.3M, gitignored) is reversible -- move bins back to restore.",
    "graphify-out refresh still pending (code changed). Unchanged: FW2, FW6, merge feat/ml-onnx-section, Ubuntu SSH/backfill."
  ],
  "dcs": 0.97
}

## Session Memory - 2026-06-15 (session 33 continued) integrity display fix + TUI data menu cleanup + Ubuntu SSH deferred

{
  "work": "Two small fixes + session close-out. (1) backend integrity was hiding 1m data and showing timeframes in wrong order. (2) TUI: removed Backfill from Op Dashboard, added Integrity Check to Data & Backfill. Ubuntu SSH (sshd stopped on Windows, needs elevated Start-Service) deferred to next session.",
  "key_mechanisms": [
    "INTEGRITY DISPLAY BUG: backend/cli/commands/tools/backend.js TIMEFRAMES array at line 1209 was built from Set([...requiredTimeframes,'5m','15m','30m','1h','4h','1d','1w']) -- no 1m. Fix: TF_CANONICAL_ORDER=['1m','5m','15m','30m','1h','4h','1d','1w','1mo'], filter by Set union that includes 1m. Per-symbol tfDetails also needed .sort() by canonical index (Object.entries order was insertion order = TIMEFRAMES iteration = also wrong before the fix).",
    "TUI ENGINE REMINDER: engine reads MANIFEST.commands[categoryId] flat list only -- no submenu support. Adding a new category is the only way to group commands.",
    "SSHD ON WINDOWS: Claude Code shell cannot Start-Service (no admin). User must run elevated PowerShell. Once running, Ubuntu fetches normally at 192.168.4.100:22.",
    "UBUNTU DATA STATE: crypto mass-backfill routes through Yahoo (wrong) -> most crypto shows 1d:1 only. Crypto 1m needs crypto-deep-backfill (Binance). Equity 1m needs equity-deep-backfill (Alpaca SIP). FX intraday thin. After SSH sync, run these on Ubuntu."
  ],
  "verified": [
    "npm test 465/465 after both commits.",
    "node -e require('./backend/cli/commands/tools/backend.js') loads ok.",
    "node -e require('./backend/cli/tui/manifest.js') loads ok."
  ],
  "commits": ["d3a4b39a (integrity: 1m + canonical order)", "8c12ca7f (tui: backfill out of op, integrity into data)"],
  "dcs": 0.97
}

## Session Memory - 2026-06-14 (session 33) Repo-portability bundler for Ubuntu transfer (mass-implement); embedded-repo-aware git bundle; verified by test-clone

{
  "work": "User: 'plan and mass implement' + wants old Ubuntu PC to access the repo (gitzip/bundler) + asked if Ubuntu can ingest data so the 8.6GB storage need not transfer. Ran /mass-implement, AskUserQuestion -> user chose bundle(monorepo)-only + (via ingest question) no data transfer. Built scripts/dev/make_bundle.js + npm run bundle. Committed on feat/session-guard-intraday-rollup.",
  "key_mechanisms": [
    "GIT ROOT IS THE CODEPTIT MONOREPO, not personal_finance_draft (which is a subdir). `git rev-parse --show-toplevel` = .../CODEPTIT. A git bundle is whole-repo only; you cannot bundle a subdir WITH history (would need filter-repo/subtree split). So 'bundle' = whole monorepo (58,076 files, 382.6 MiB --all).",
    "22 EMBEDDED GIT REPOS (gitlinks, mode 160000, NO .gitmodules) live in the monorepo incl. personal_finance_draft/backend/polymarket-cli (51 commits). `git bundle --all` carries only their commit POINTERS, not contents -> a clone has empty dirs. make_bundle.js detects gitlinks via `git ls-files -s | mode==160000`, and for each populated one (.git exists + rev-list>0) emits a companion bundle into embedded/. Default --embedded pfd (only under personal_finance_draft/); --embedded all = all 22; none = skip.",
    "OUTPUT MUST GO OUTSIDE THE WORKING TREE: check_hygiene.js flags untracked *.bundle/*.zip in-repo AND an in-tree bundle bloats the next one. Default outDir = <gitRoot>/../portable_exports (sibling of CODEPTIT). --out overrides (e.g. USB).",
    "UBUNTU CAN RE-INGEST storage/data (8.6GB, gitignored) keyless for most providers: crypto=Binance api/v3/klines (no key header), indices/commodities/fx/equities-daily=Yahoo query1.finance + Frankfurter/ECB (no key). ONLY Alpaca equity intraday (ALPACA_API_KEY/SECRET) + macro (TwelveData/FRED/Finnhub) need keys. So no 8.6GB transfer needed; tradeoff = deep crypto backfill is multi-hour vs one-time USB copy. RESTORE_UBUNTU.md (auto-generated) documents clone->npm install->build C++->backfill-daemon."
  ],
  "verified": [
    "npm run bundle -> CODEPTIT-2026-06-14.bundle 382.6 MiB + embedded/...polymarket-cli.bundle 242.7 KiB.",
    "TEST-CLONE end-to-end (temp dir): git clone main bundle -> HEAD a4c85fe9, all 4 branches (main, feat/ml-onnx-section, feat/resilient-crypto-fallback, feat/session-guard-intraday-rollup), 58,076 files, personal_finance_draft/package.json checks out; embedded polymarket-cli restored = 49 files/51 commits. Temp cleaned.",
    "npm run hygiene all-pass; npm run test:structure 8/8; only intended files changed (make_bundle.js new, package.json +1 script); portable_exports not seen by repo (outside tree)."
  ],
  "user_decisions": [
    "bundle (monorepo) only (not project-zip).",
    "no 8.6GB data transfer -> Ubuntu re-ingests.",
    "'execute' -> commit + handoff."
  ],
  "remaining": [
    "If the other 21 sub-projects' CONTENTS are wanted on Ubuntu: run --embedded all (default pfd ships only platform deps as content; rest are gitlink pointers).",
    "Stale root personal_finance_draft.zip (15MB, May 24) can be deleted.",
    "Unchanged carryovers: FW2 monolith deconstruction, FW6 backward-gap fetch, merge feat/ml-onnx-section -> main (user), live 1m provider smoke, ~937MB untracked root artifacts."
  ],
  "dcs": 0.97
}

## Session Memory - 2026-06-14 (session 32) Blast-through audit of s31 daemon (clean) + committed caller migration + fixed ALL 7 test fails; suite 465/465 (first fully green since s12); commits 6da0232b/2567d8f4/31f1357a

{
  "work": "Booted on HEAD 483d45cc (session-31 daemon work, now COMMITTED -- STATE/HANDOFF still said 'uncommitted', corrected). Ran /blast-through Focused Audit (anchor d95b92a7->483d45cc): session-31 code verified CLEAN. Committed the long-uncommitted 22-file caller migration (6da0232b) + STATE audit note (2567d8f4). Then user said 'fix the 7 fails' -- root-caused all 7 into THREE distinct causes (not one env class as prior sessions assumed) and fixed them. Suite 458/465 -> 465/465.",
  "key_mechanisms": [
    "THE 7 FAILS WERE 3 ROOT CAUSES, not 'env-dependent cache/creds' as sessions 29-31 lumped them: (1) 3 gateway tests (polymarket auth-health, polymarket preflight, trade proposed-order) -- backend/gateway/node_modules/dotenv was a CORRUPTED PARTIAL install (had README-es.md/config.d.ts + a stray skills/ dir but MISSING config.js/package.json/lib/main.js, mtime Jun13) so `import 'dotenv/config'` threw MODULE_NOT_FOUND and every gateway spawn exited 1. Fix: npm --prefix backend/gateway install dotenv@^17.4.2 --no-save (gitignored, no repo change). (2) 3 cockpit/status tests -- storage/data/cache/last_fetch.json absent on fresh checkout -> buildStatusPayload deref'd null.mode (crash exit 1) and cockpit rendered mode 'unknown' not 'recovered_live' so /LIVE/ never matched. (3) 1 hygiene test -- stray UNTRACKED .agents/skills/rigorous-feature-testing/ (orphan SKILL.md, created today by a skill-loader) not in check_hygiene allowlist. Fix: rm -rf (no repo change).",
    "STATUS FIX (the only committed code, 31f1357a): loadStatusSnapshot() only ran partitioned-history recovery for SCOPED snapshots; a MISSING primary snapshot fell straight through as null. Extended recovery to the missing case (same recovered_live path already covered by the 'history recovery builds a representative global snapshot' test -- history has 303,598 sources -> 179 recovered -> 59 usable here), carried a non-null baseSnapshot through the unrecoverable fallbacks, null-guarded cache_mode/fetched_at in buildStatusPayload, and pointed buildCockpitModel at the recovering loader instead of safeReadJson(DEFAULT_SNAPSHOT). Genuine robustness fix (status works on a fresh clone), not test-gaming.",
    "CALLER MIGRATION (6da0232b): the 22 tracked files with 1-2 line require-path swaps off root shims onto canonical category paths (../env->../runtime/env, #shared/env->#shared/runtime/env, market/quote_router, market/validation, strategy/registry, profiles/mt5_profiles) -- the session-29 'migrate direct callers, keep the shim' work, sitting unstaged for 3 sessions. Empirically safe (12 prod modules load, 53/53 changed-test files). Shims retained (still used by #shared/* aliases + dist/)."
  ],
  "verified": [
    "Full suite 465/465 exit 0 -- FIRST fully green run since session 12 (was 458/465).",
    "cockpit + status tests pass from a FRESH state (rm last_fetch.json then run): cockpit render+model + root status freshness scope all green.",
    "3 gateway tests pass after dotenv reinstall (dotenv/config.js + package.json now present).",
    "Caller migration: 12 changed prod modules load with no MODULE_NOT_FOUND; 7 changed test files 53/53.",
    "Blast-through Tier-1 audit of 483d45cc: coverage.js + backfill_daemon.js load + 4/4 each; intraday_rollup 1m->5m/15m lossless 5/5; rollupTargetsAboveBase over INTRADAY_TF_ORDER=['1m','5m','15m','30m','1h','4h'] correct; manifest<->handler parity (sovereign_cli.js:52); no stub/security signatures; docker backfill image matches web/bot."
  ],
  "user_decisions": [
    "Commit split: two commits (refactor + docs) chosen via AskUserQuestion; full npm test gate chosen before committing.",
    "'fix the 7 fails' -> all 7 fixed."
  ],
  "remaining": [
    "graphify-out refresh pending (code changed: status.js) -- deferred (heavyweight; +17/-6 only).",
    "dotenv corruption + stray .agents dir are LOCAL-ENV fixes (gitignored/untracked) -- they won't persist in git; a fresh clone with the same corruption needs the same reinstall. The stray dir may reappear (skill-loader recreated it today).",
    "Unchanged carryovers: FW2 monolith deconstruction, FW6 backward-gap fetch, merge feat/ml-onnx-section -> main (user), live 1m provider smoke (needs network+keys), ~937MB untracked root artifacts."
  ],
  "dcs": 0.97
}

## Session Memory - 2026-06-14 (session 30) Blast-through Focused Audit + mass-implement; 2 findings closed (data-depth rollup + dead config); suite 447/453; commit 5977c84e

{
  "work": "Booted per session-orchestrator (HEAD d95b92a7). Ran /blast-through Focused Audit (anchor 51b20b6c->d95b92a7), then /mass-implement on the two surfaced findings. DCS 0.97 start/end. Committed 5977c84e on feat/session-guard-intraday-rollup.",
  "key_mechanisms": [
    "DATA-DEPTH GAP (the headline finding): the skill's 'stale coarse bin vs fresh deep source' mtime check caught that session-29's deep-intraday catch-up rollup had only refreshed 15m/1h -- 30m/4h carried pre-rollup 06-10 mtimes and tiny sizes (BTCUSDT 4h=180 bars/30d vs 5m=926k/9yr). CODE WAS CORRECT (ROLLUP_TARGET_TFS=all 4; dry-run confirmed intent) -- just un-run. Fix = run the command, not edit code.",
    "FIX: ran intraday-rollup --family crypto + --family equities (local, idempotent, no network). storage/data/ts is GITIGNORED so this is a data-only change with nothing to commit. Lossless: 30m=5m/6, 4h=5m/48.",
    "CONFIG DRIFT: config/markets/asset_mapping.json was a DEAD DIVERGENT duplicate -- zero readers across js/cpp/hpp/ts/yaml (Grep tool confirmed); production reads config/asset_mapping.json via manifest.js:31. Diverged in content AND keys (FX vs Forex; Crypto:[BTC,USDT,ETH] vs full 21-symbol). git rm'd it.",
    "STALE LEDGER LESSON: DEV_REVIEW.md is append-only, so old P0s linger. The 'runGatewayCommand throws on every call' P0 (session 11) is RESOLVED (session 12, bridge D->B); a live require() probe loads it fine. Always verify a ledger P0 with a live probe before treating it as open."
  ],
  "verified": [
    "Post-deletion full suite 447/453 exit unchanged -- the 6 fails are pre-existing env-dependent (cockpit/status cache usable_records=0, polymarket/trade creds); deletion broke nothing.",
    "readTsIndex gate: BTCUSDT 30m 1,440->154,404 / 4h 180->19,319 (span 2017-08-17->2026-06-13, matches 5m); AAPL 30m 777->81,502 / 4h 859->11,260 (span 2016-01-01->2026-06-12). 30m=5m/6, 4h=5m/48 exact.",
    "Audit confirmed session-29 prod code clean: P3 guardEquitySessionBars wired into BOTH consumers (research.js:347 backtest, dataset.js:171 ML); intraday-rollup manifest parity (manifest.js:197); no stub/security signatures in Tier-1 touched files."
  ],
  "user_decisions": [
    "Plan+mass-implement approved; 'Both batches' chosen via AskUserQuestion; commit at end approved."
  ],
  "remaining": [
    "Resume ~10 crypto alts to listing dates (multi-hour). FW2 monolith deconstruction. FW6 backward-gap fetch. merge feat/ml-onnx-section -> main (user). ~937MB untracked root artifacts pending user cleanup.",
    "Data-bin depth (incl. the 30m/4h just rebuilt) lives only in the working tree -- storage/data/ts is gitignored, so a fresh clone needs the rollup re-run (existing project convention, not new debt)."
  ],
  "dcs": 0.97
}

## Session Memory - 2026-06-13 (session 29) Blast-through refined to true audit skill; P3 guard WIRED; deep-intraday rollup + auto-derive; 8 shims wrongly-deleted-then-restored; suite 447/453 (6 pre-existing)

{
  "work": "Ran /blast-through (Focused, anchor 51b20b6c), refined the blast-through SKILL into a deterministic agent-consistent audit (recency-ranked queue + repo-wide hygiene sweep + consistency contract + audit anchor), then implemented surfaced gaps: wired the inert P3 equity session guard onto real consumer paths, built the deep-intraday rollup (5m->15m/30m/1h/4h, lossless) + auto-derive in deep-backfill, slimmed dead intraday_yahoo fns, fixed intraday silent-zero, deleted dead config dup. Hit and corrected a shim-deletion regression.",
  "key_mechanisms": [
    "P3: guardEquitySessionBars (shared/lib/market/equity_session.js) gates family in {equities,indices} AND sub-daily TF; called in loadAssetSourcesFromCache (dataset.js) + loadHistoricalSources (research.js) -- the RAW-bar boundaries (feature objects use as_of not timestamp, so NOT filterFeatureFrame). Removed misleading unused re-export from backtest.js.",
    "Rollup: intraday-rollup reads deep 5m bin -> aggregateCandles -> merge-write coarser bins. LOSSLESS (5m read-only, separate per-TF bins, coarser-from-finer so no synthetic-guard trip). rollupFiveMinForSymbol helper shared by the command AND auto-rollup in crypto/equity-deep-backfill (--no-rollup opt-out). Deep depth was 5m-ONLY before (1h~730d, 30m/4h stale).",
    "intraday_yahoo.js: Yahoo accepts interval=1h natively (live curl proof) -> the 1h->60m translation + fetch/aggregate fns were dead duplicate of the proven selectYahooBase path. Slimmed to constants-only; INTRADAY_MAX_DAYS sourced from YAHOO_MAX_DAYS (no dup).",
    "Silent-zero: data.js intraday-accumulate symbolOk = bars>0 (was || errors===0); force:true means 0 bars is a real failure.",
    "SHIM TRAP (durable): a literal require-grep falsely reported 8 shared/lib root shims as 0-importer dead. They are load-bearing via (1) sibling-relative requires, (2) #shared/* subpath aliases in package.json imports, (3) compiled dist/mcp_server/* artifacts. Deleting broke the suite at multiple layers. Restored all 8; migrated direct source callers to canonical instead. Dead-file check now requires all 4 resolution layers."
  ],
  "verified": [
    "Full suite 447/453; the 6 fails (cockpit render/model, root status, polymarket auth-health/preflight, trade process) are PRE-EXISTING + environment-dependent (cache usable_records=0, creds) -- proven by clean-HEAD stash run giving the same 6. Zero new failures.",
    "76/76 on all touched/new test files (equity_session guard mixed-family + loader-level drop; intraday_rollup lossless + OHLCV correctness; intraday silent-zero rc=1; constants contract; crypto/equity 5m backfill auto-rollup; module_loading alias migration; strategy_backtest shim migration).",
    "Yahoo interval=1h and =60m both return valid candles (live curl)."
  ],
  "user_decisions": [
    "P3 guard auto-applies at the shared loader (not opt-in).",
    "intraday_yahoo slimmed to constants-only.",
    "Deep-backfill auto-derives coarser TFs going forward (rollup command = catch-up only).",
    "Skill-first sequencing.",
    "Commit + handoff update approved (this session)."
  ],
  "remaining": [
    "6 pre-existing env-dependent test failures (live cache/creds) -- separate from this work.",
    "#shared/* alias map + MCP TS source could be repointed to canonical + dist rebuilt, THEN the 8 shims become deletable (not now).",
    "Run intraday-rollup --family crypto / equities once to backfill the deep coarser bins for already-downloaded 5m (multi-second, local).",
    "~937MB untracked root artifacts pending user cleanup."
  ],
  "dcs": 0.97
}

## Session Memory - 2026-06-13 (session 28) Committed sessions 26-27 batch; P3 equity session guard + P4 ML 5m cap; FW3 in-flight; suite 438/438

{
  "work": "Booted to 432/432 baseline. Committed 5 stale code commits from sessions 26-27 (docs reorganization with ENOENT fix, correlation preflight, mass-backfill report, hygiene/C++ purge). Implemented P3 (equity session-gap guard) and P4 (ML 5m cap). Verified P0 FX integrity already green, P1 FW1 already in validation.js. Accepted P2 Option C (MATIC/POL gap = rebrand boundary). FW3 intraday delegated to subagent. Crypto alt resume launched.",
  "key_mechanisms": [
    "P3: filterEquitySessionGaps in shared/lib/market/equity_session.js -- drops bars outside NYSE 09:30-16:00 ET using Intl API. Exported via backtest.js. 6/6 tests pass.",
    "P4: ML dump 5m cap 100k/symbol (was 50k generic) + --max-rows-5m flag + [VISIBILITY] log. Prevents OOM on 525k-row crypto bins.",
    "FW1 pre-verified: atomicTempPath in validation.js:620-623 uses process.pid+Date.now()+random -- fully process-unique, safe for concurrent backfill processes.",
    "DEPLOYMENT.md moved to docs/operational/guides/ in the docs reorg; deployment_manifest_contract.test.js was still pointing to old path (ENOENT). Fixed in commit 55b7869e.",
    "MATIC/POL gap: MATICUSDT 5m ends 2024-09-10, POLUSDT starts 2024-09-13 -- this is the token rebrand boundary, not a data error. Option C: use --drop-non-overlap for Layer1 5m correlations."
  ],
  "verified": [
    "Suite 438/438 exit 0 (was 432; +6 new: 6 equity_session tests).",
    "FX integrity: total_stale:0 (GBPUSD/USDJPY/AUDUSD 1d already fresh).",
    "P3 equity_session: 6/6 (in-session keep, pre/post-market drop, intra-day gap, cross-session ok, null/empty, constants).",
    "P4 ml.js: ml_dataset test updated 50k->100k and passes."
  ],
  "user_decisions": [
    "MATIC/POL: Option C accepted implicitly (gap = rebrand boundary, no re-ingest needed).",
    "Crypto alt resume: launched as background (multi-hour).",
    "FW3: approved for implementation this session."
  ],
  "remaining": [
    "FW3 intraday native poll result (subagent).",
    "merge feat/ml-onnx-section -> main = user decision.",
    "~937MB untracked root artifacts pending user cleanup."
  ],
  "dcs": 0.97
}
## Session Memory - 2026-06-13 (session 25) 5m Phase 3 all families + DAILY-TRUNCATION regression fixed + Polymarket bulk + mass-backfill coverage; suite 422/422

{
  "work": "Extended native 5m to indices/commodities/fx (new five-min-accumulate, Yahoo), deepened equities to 2016 (Alpaca SIP), added commodity ETF proxies, hardened+ran the Polymarket bulk archive (2045 markets/82,616 points), fixed a daily-history truncation regression and repopulated daily deep across all families, and closed a mass-backfill coverage gap. 12 commits on feat/ml-onnx-section.",
  "key_mechanisms": [
    "DAILY-TRUNCATION ROOT CAUSE + FIX (commit 7b050f3c): writeTsIndex rebuilds EVERY bin from the passed snapshot, which is sourced from the sub-daily-capped JSON partition + a shallow live fetch. Deep daily/1h/4h lived ONLY in the bins (never JSON) yet used REPLACE semantics, so every ingest (incl. the 5m deep backfills) overwrote the deep *_1d.bin of ALL symbols to the 1 live bar. FX 1d survived only because frankfurter/ecb daily also lands in JSON. Fix: merge-protection is now UNIVERSAL across timeframes (read existing bin + merge, new-wins-on-timestamp). Repopulate via `ingest --family X --timeframe 1d --history-days 7000` (freshness won't skip: the 1-bar cache doesn't cover the requested range). Proven durable: AAPL 1d held at 4822 through 3 subsequent full-index rewrites.",
    "Yahoo 5m depth: the range=Nd URL form (no startTime) counts TRADING days and returns ~84 calendar days; period1/period2 spanning >60 calendar days returns HTTP 422. So accumulate passes NO startTime. selectYahooBase picks 5m base for an all-sub-daily set; coarser TFs aggregate from it.",
    "Alpaca: IEX historical 5m starts only 2020-07, but SIP works back to 2016-01 on this account; free plan 403s when the window touches the last ~15min ('subscription does not permit querying recent SIP data'). fetchAlpacaBaseCandles now clamps the request end to now-16min when feed==='sip' (ALPACA_DATA_FEED env).",
    "Native sub-daily 5m was being STRIPPED at storage (commit dead1fce): the session-23 synthetic guard rejected ANY 5m source containing 'rollup', but the 5m->5m identity passthrough labels source 'yahoo-rollup-from-5m'. Fixed: the 5m-rollup clause fires only when derived_from_timeframe is NOT a sub-daily TF.",
    "Polymarket: Gamma /markets hard-caps a page at 100 rows regardless of `limit` (commit c7893390 paginates by offset, capped at 100) AND order=id surfaces empty hourly micro-markets while order=volumeNum surfaces data-rich markets (commit 474f6bf6 defaults to volumeNum + fixes a null --archive-root crash where optionValue's own null default defeated `root = CACHE_DIR`).",
    "mass-backfill collected only config[family].symbols (flat), MISSING universe_matrix grid-only symbols (JPM/GS/AVGO/intl). massBackfillUniverse now unions flat ∪ grid (commit d94f8e65); 92->151 symbols.",
    "DURABLE TRAP: writeTsIndex writes a FIXED <bin>.tmp then renameSync — safe WITHIN one process (synchronous fs serializes on the single-threaded event loop, so mass-backfill --concurrency N is fine) but two SEPARATE node processes racing the shared .tmp throw EPERM with no catch -> serialize backfill processes (FW1 = per-pid temp suffix)."
  ],
  "verified": [
    "Full suite 422/422 exit 0 (was 395).",
    "Live: 30-symbol Yahoo accumulate 329,396 5m bars; equity SIP 41/41 to 2016 (AAPL 456k); daily repopulated deep (equities 1998-2007, indices 1998, commodities 2003, crypto 2017); Polymarket bulk 2045 markets/82,616 price points.",
    "TUI verified via pipe harness: 3 new commands render in the Operational menu + five-min-accumulate dispatches (select/text/confirm widgets) -> dry-run plan output."
  ],
  "user_decisions": [
    "Plan approved (Ultraplan cloud failed -- repo too large to teleport; ran locally). Commits pre-authorized via ExitPlanMode allowedPrompts.",
    "Intraday 15m/30m/1h/4h: NATIVE POLL per TF, not 5m-aggregation (deeper for Yahoo 1h=730d). Deferred (FW3).",
    "Crypto 5m re-run to 2017 STOPPED mid-run ('took too long') at ~11/18 -- BTC/ETH to 926k bars; ~10 alts keep 5y depth (resumable). Flag multi-hour runtime before launching deep crypto runs."
  ],
  "remaining": [
    "Resume ~10 crypto alts (PEPE/WIF/SHIB/FET/POL/AVAX/NEAR/INJ/SUI/RNDR) to listing dates -- one crypto-deep-backfill --days 3300 run, multi-hour.",
    "FW1 per-pid writeTsIndex temp; FW3 native-poll intraday; FW2 monolith deconstruction; FW6 backward-gap fetch; equity session-gap guard; ML 5m caps; merge feat/ml-onnx-section -> main (user).",
    "~937MB untracked root artifacts (state.zip/.bundle/vgbn1@vgbn-) pending user cleanup."
  ],
  "dcs": 0.97
}
## Session Memory - 2026-06-12 (session 22) 5y backfill silent failure root-caused + fixed; suite 387/387; rerun in flight

{
  "work": "Boot verification of the session-21 carryover found the 18-symbol 5y 5m backfill mid-run but delivering nothing; let it finish (ok:true exit 0, bars_5m:0 for all 17 live symbols), root-caused the silent failure, fixed it (Fable-direct, ~40-line diff), added regression tests, re-proved with the real command at 400d, relaunched the full 1825d run in background.",
  "key_mechanism": "V8 passes call-spread arguments on the stack: snapshot.sources.push(...records) at ingest_market_data/index.js:1604 throws RangeError above ~100k elements (5y 5m = ~525k), and the provider-loop catch swallowed it as a generic provider error -> symbol resolved with ZERO records while the command reported ok:true/exit 0. Session 21 had fixed the SAME defect class one layer deeper (fetchCryptoSnapshot) and its 160k-bar test only exercised that layer -- a regression test at the wrong layer passes while the layer above fails. Array-literal spreads ([...a,...b]) are safe (iteration, not call stack); only call-spreads break. Diagnosis signature for next time: per-symbol errors:2 ('Maximum call stack size exceeded' + 'No provider resolved'), full-pace fetching (API cache files accruing) with no bin growth, shallow probes (30d/120d) green.",
  "verified": [
    "Real command end-to-end: crypto-deep-backfill --days 400 --symbol BTCUSDT -> 115,200 bars (exactly 400x288), errors 0, exit 0; readTsIndex confirms 115,200 bars spanning exactly 400.0 days (pre-fix this depth RangeError'd).",
    "Focused bundle 16/16 (2 new: appendRecords 250k no-RangeError; zero-bars-with-errors -> ok:false + error_messages).",
    "Full suite 387/387 exit 0 (new baseline; was 385).",
    "Failure visibility: stubbed silent-failure shape now produces ok:false, symbol error text, error_messages[], non-TTY per-symbol logging."
  ],
  "user_decisions": [
    "Commit approved + executed (a565f39b fix, 38077afa/1bc65204/00bb388c docs).", "Synthetic daily-aggregated 5m bars are EXPERIMENTAL-ONLY -- never ML training or backtest input; only native deep 5m qualifies (enforcement = Phase 2 work item, provenance tagging preferred).", "5m Phases 2-4 plan approved into FIVE_MIN_DATA_SCOPING.md section 8."
  ],
  "remaining": [
    "Verify the in-flight 18-symbol 1825d rerun per-symbol counts (BTCUSDT ~525k; SUI/PEPE/WIF/POL listing-bounded; RNDRUSDT delisted -- may legitimately fail loudly now).",
    "Commit decision for the 3-file fix; concurrent Codex session alive at boot -- re-check git status before staging.",
    "Unchanged carryovers: CLI lazy-requires (optional), NDJSON sign-off, 5m Phases 2-4, merge feat/ml-onnx-section -> main."
  ],
  "dcs": 0.97
}
## Session Memory - 2026-06-12 (session 21) Mass-implement: Codex slice + TUI Phase B + 5m crypto Phase 1; suite 385/385

{
  "work": "Mass-implement over carryovers. Batch 0: reviewed+integrated the uncommitted sessions-19/20 Codex slice (1f6b5e45). Batch 1: TUI Phase B via Sonnet agent, Fable-reviewed (b64cf57c). Batch 2: C++ indicators S-fix found ALREADY in HEAD (e0ad1ff7) -- DEV_REVIEW entry was stale. Batch 4: 5m crypto Phase 1 via Sonnet agent + a 5-defect Fable correction pass (c3fbc3ba); full 18-symbol 5y backfill launched in background at close.",
  "key_mechanism": "TwelveData sits BEFORE binance in data_sources.yaml crypto providers and silently caps history at exactly 5,000 bars; the provider loop breaks on first success, so deep fetches never reached Binance (probe: 30d returned 5,000 not 8,640, deterministic). Fix pattern: options.provider pinning in ingestMarketData. Two other durable traps: (a) push(...spread) overflows the call stack above ~100k elements -- the merged history is 146k records; (b) writeTsIndex REPLACES bins from JSON-derived snapshots, so capping JSON requires merge-protected sub-daily bins or later shallow ingests truncate deep backfills. ALSO: agent-run gates lie by omission -- the 5m agent's probe tested fetch+ts-index directly and missed all 5 command-path defects; the orchestrator MUST run the real command end-to-end.",
  "verified": [
    "Full suite 385/385 exit 0 (Fable-run twice; baseline was 342).",
    "Codex slice: focused polymarket bundle 35/35, gateway tsc clean.",
    "TUI: 99/99 across the TUI surface; status --json 0 real ANSI chars (NOTE: PS 5.1 has no backtick-e escape -- naive count matches letter e, false-positive 122).",
    "5m: crypto-deep-backfill --days 30 BTCUSDT -> 8,640 bars, bin spans full window, merge preserved prior bars; --days 2 -> guarded exit 1; 160k-record no-RangeError test; writeTsIndex shallow-write preserves 1000-bar deep bin (1010 after).",
    "ctest -C Debug 29/29 re-verified (C++ agent)."
  ],
  "user_decisions": [
    "Batches 1+2+4 selected; Batch 3 NDJSON skipped. Commit per verified batch. TUI Unicode rich-gated default-on. 5m depth: 5 YEARS.",
    "Sonnet subagent session limit hit mid-session (resets 20:30 Asia/Saigon) -- correction wave implemented by Fable directly per user 'continue'."
  ],
  "remaining": [
    "Background 5y backfill result to verify next session: per-symbol bars, ~430MB storage, rerun idempotent.",
    "CLI lazy-requires (RAM #5, optional) deferred; NDJSON streaming (RAM #2) needs user sign-off; merge feat/ml-onnx-section -> main = user; graphify-out deprioritized.",
    "5m Phases 2-4 (equities/Alpaca, FX paid-provider decision, ML feature-builder 5m) unstarted per scoping doc."
  ],
  "dcs": 0.96
}

## Recovered Merge History - 2026-07-16 session 83



Source: `49560981^1:workspace/SESSION_MEMORY.md`. These sections were restored additively after merge-history loss; existing entries were not rewritten.



## Session Memory - 2026-07-13 session 81 asset-analysis goal completion

```json
{
  "goal": "Complete asset-analysis implementation Batches 6-8 while preserving schema v2 until explicit retirement approval",
  "status": "complete",
  "implemented": [
    "Canonical schema-v3 shadow service with direct, CLI, API-adapter, and authenticated HTTP parity",
    "Recorded family policies and fail-closed provider factors for equity, FX, index, energy, native crypto, and DeFi",
    "Existing terminal scorecard extended into a canonical home, screener, and workbench with provenance",
    "Promotion-readiness report that rejects unsupported decision-ready claims"
  ],
  "completion_audit": [
    "Reject recorded evidence before retrieval time",
    "Prove factor domains are applicable to each family policy",
    "Prove state filters and within-family ordering",
    "Launch the canonical all-recorded schema-v3 catalog through the real Ink dashboard"
  ],
  "verification": {
    "full_node": "758 total / 756 pass / 0 fail / 2 skip",
    "focused_analysis_api_tui": "pass",
    "hygiene_diff_syntax": "pass",
    "secret_scan": "829 tracked files / 0 violations plus clean direct new-file scan",
    "graphify": "unavailable"
  },
  "safety": "Research-only; 0 eligible, 4 degraded, 3 excluded; promotion false; schema v2 remains live/default."
}
```

## Session Memory - 2026-07-13 session 81 family-aware analysis

```json
{
  "completed_batches": [5, 6, 7, 8],
  "catalog": {"rows": 7, "eligible": 0, "degraded": 4, "excluded": 3},
  "recorded_sources": ["SEC Company Facts", "ECB", "US Treasury", "EIA", "DefiLlama"],
  "unavailable_sources": ["S&P structured breadth HTTP 403", "Coin Metrics HTTP 403"],
  "interfaces": ["canonical service", "CLI JSON", "authenticated API", "terminal research screener/workbench"],
  "readiness": {"promotion_approved": false, "synthetic_parity_evidence": 10},
  "verification": {"full_node": "755 total / 753 pass / 0 fail / 2 skip", "hygiene": "pass", "secret_scan": "829 tracked / 0 plus direct new-file scan", "diff_check": "pass", "graphify": "unavailable"},
  "retirement": "Schema v2 remains live/default; deletion needs evidence and explicit approval."
}
```

## Session Memory - 2026-07-13 session 80 analysis batches 3-4 and closeout

```json
{
  "completed": [
    "Added a fail-closed technical v2-to-v3 shadow adapter with direction, strength, timing, and freshness parity.",
    "Added revision-aware point-in-time macro normalization, as-of selection, and a forward Supabase migration.",
    "Corrected the asset-analysis plan status to Batches 1-4 complete."
  ],
  "verification": {
    "focused_analysis_macro": "12/12 pass",
    "contracts": "29/29 pass",
    "full_node": "743 total / 741 pass / 0 fail / 2 skip",
    "hygiene": "pass",
    "diff_check": "pass",
    "graphify": "unavailable"
  },
  "blocked": [
    "Batch 5 requires a provenance-recorded SEC Company Facts artifact and SEC normalization contract.",
    "Batches 6-8 remain phase-gated until Batch 5 is verified.",
    "The macro Supabase migration has not been applied or verified remotely."
  ],
  "next": "Capture one recorded US common-equity SEC Company Facts artifact without fabricating data, then implement the research-only equity 3m vertical slice."
}
```

## Session Memory - 2026-07-11 session 73 remaining-section audit

```json
{
  "request": "Check remaining sections and decide between C++, Rust, and JS for minimal bloat and dynamism.",
  "additional_gates": [
    "Market orders send zero notional to C++ pre-trade risk and are approved without concentration evaluation.",
    "Canonical model comparison ranks architecture-named deterministic formulas and excludes real ONNX candidates.",
    "MCP backtests allow degraded data by default and MCP Polymarket inherits the direct execution bypass.",
    "Kubernetes, Terraform, and Heroku launch nonexistent web/app.js; Compose is the only aligned deployment."
  ],
  "architecture_decision": {
    "control_plane": "TypeScript",
    "native_compute": "narrow benchmark-justified C++ kernels only",
    "rust": "retire/archive mirrored-contract-only CLI",
    "most_dynamic": "JavaScript runtime",
    "best_tradeoff": "TypeScript because it retains JS dynamism and adds contract checking"
  },
  "verification": {
    "risk_probe_zero_notional": "approved",
    "risk_probe_40pct_concentration": "rejected",
    "mcp_build": "pass",
    "cpp_implementation_files": "53 total, 52 compiled",
    "placeholder_headers": "9, zero consumers"
  }
}
```

## Session Memory - 2026-07-11 session 73 production-readiness audit

```json
{
  "request": "Refine and execute an audit for overengineering/stubs, real-trading decision readiness, UI bloat, and user-data safety.",
  "mode": "connective-tissue / hard reading",
  "verdict": "not approved for real-money decisions or live Polymarket execution",
  "gating_findings": [
    "Polymarket buy/sell bypasses explicit live, PIN/auth, runtime-mode, and C++ risk gates.",
    "Public API routes accept caller-controlled file/report paths and some caches omit response-shaping inputs.",
    "A browser-visible VITE_API_TOKEN authorizes bot mutations without per-user server authorization.",
    "Current decision artifacts are stale/sample/empty and backend integrity is not green.",
    "Cross-process ts-index writer serialization remains absent."
  ],
  "ui_findings": [
    "Hardcoded LIVE and decorative safety/execution controls are not backend state.",
    "Signal review references undefined signalIds and frontend type-check fails.",
    "The dashboard emits one 945.88 kB JS chunk and retains an unused legacy shell.",
    "The Rust CLI is a 30-file mirrored-contract-only parallel surface."
  ],
  "verification": {
    "node_suite": "706 total / 704 pass / 0 fail / 2 skip",
    "standalone_correlation_contract": "fail: zero sample matrix from canonical snapshot",
    "frontend_build": "pass with 945.88 kB single-chunk warning",
    "frontend_typecheck": "fail: 3 errors",
    "gateway_typecheck": "pass",
    "secret_scan": "829 files / 0 violations",
    "hygiene": "pass",
    "scorecard": "0 of 36 crypto symbols eligible",
    "integrity": "92/92 cached; 15 stale; 9 grain suspects; ok=false"
  },
  "next": "Close the Polymarket execution bypass, public filesystem paths, and browser-held admin token before any real-money promotion."
}
```

## Latest Pointer - 2026-07-11 session 73

The latest work is the production-readiness audit and remaining-section/language follow-up recorded
above. Session 72's concurrency constraint predates both session 73 entries despite their placement in
this append-only file. Current decision: TypeScript control plane, narrow benchmark-backed C++ kernels,
retire the Rust mirror; real-money promotion remains blocked by the execution, auth, data, and model
truth findings in `workspace/DEV_REVIEW.md`.

## Session Memory - 2026-07-12 session 74 TUI and Polymarket review

```json
{
  "request": "Refine and review the CLI bottom input bar, TUI character bloat, Polymarket ended positions, and code readability/maintainability.",
  "mode": "focused review only",
  "confirmed_findings": [
    "Basic input append/backspace/submit/focus works, but mid-line Left/Right editing is disabled by showCursor:false in the installed ink-text-input.",
    "The fixed 20+76-column body floods an 80-column PTY and leaves no useful output pane at 100 columns.",
    "Height resize is non-reactive; a 30-row mount still rendered 28 rows after resizing to 12.",
    "Fill-derived Polymarket positions discard resolved lifecycle metadata, remain labeled active, and can feed cost-basis fallback value into aggregate equity.",
    "Polymarket getPositions mutates console.error globally without guaranteed restoration.",
    "Modern and legacy TUI manifests have command and flag drift; the modern App combines 25 state hooks and most dashboard responsibilities."
  ],
  "verification": {
    "focused_tui_tests": "19 pass / 0 fail",
    "real_pty": "80-column layout flood reproduced",
    "input_probe": "end Backspace passed; mid-line cursor edit failed",
    "resize_probe": "30 rows to 12 rows still emitted 28",
    "live_polymarket_poll": "not performed",
    "production_code_changed": false,
    "graphify": "unavailable"
  },
  "next": "Fix Polymarket lifecycle projection first, then command input and responsive viewport contracts, then canonicalize manifests and decompose the dashboard."
}
```

## Session Memory - 2026-07-13 session 75 closeout

```json
{
  "completed": [
    "Closed API dependency bloat and pinned the MCP SDK to 1.29.0.",
    "Repaired stale npm test paths and made zero-sample correlation fail closed.",
    "Created and validated the repo-local refine-suggestion skill."
  ],
  "deferred_by_user": [
    "Prove automatic Supabase login/session restoration.",
    "Evaluate wider API binding only after authentication is proven.",
    "Reduce persistent UI character bloat with measured budgets.",
    "Consolidate proven duplicate/stub ownership across trade, research, backend, and data."
  ],
  "refined_plan": "workspace/plans/FUTURE_API_AUTH_UI_DEDUP_REFINEMENT.md",
  "skill": ".agents/skills/refine-suggestion/SKILL.md",
  "first_next_action": "Invoke refine-suggestion on the saved plan and execute only the baseline inventory batch.",
  "safety": "Do not widen API binding or perform broad deletion before baseline/auth evidence and required user approval.",
  "verification": {
    "skill_validation": "pass",
    "diff_check": "pass",
    "graphify": "unavailable"
  }
}
```

## Session Memory - 2026-07-13 session 76 blast-through and mass-implement

```json
{
  "mode": "connective-tissue / fast reading",
  "completed": [
    "Removed cached authorization decisions and proved same-token revocation is denied immediately.",
    "Verified persisted dashboard candidate tokens remotely and confirmed local logout before clearing state.",
    "Restored category and command reachability across narrow and wide-short TUI viewports.",
    "Made Kalshi historical unavailability fail visibly without changing Polymarket history.",
    "Recorded corrected TUI density and duplicate/stub ownership baselines."
  ],
  "verification": {
    "contracts": "28/28 pass",
    "full_node": "730 total / 728 pass / 0 fail / 2 skip",
    "frontend": "typecheck and build pass",
    "hygiene": "pass",
    "secret_scan": "829 files / 0 violations",
    "graphify": "unavailable"
  },
  "remaining": [
    "Add a browser/component viewport harness before changing the desktop-only web layout.",
    "Consolidate the two TUI manifest owners only after adapter parity is locked.",
    "Do not delete dead UI/data candidates until the recorded consumer matrix and confirmation gates are applied.",
    "Real-capital promotion remains blocked by data/model/RLS/broker-soak gates."
  ]
}
```
