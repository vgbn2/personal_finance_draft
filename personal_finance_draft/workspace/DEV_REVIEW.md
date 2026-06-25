### Mass-Implement — 2026-06-25 session 59 (3 batches, all findings from the audit below FIXED)

Suite **623/621/0fail/2skip** (was 616/614 — +7 new tests: 4 on `buildExitOutcome`, 3 on
`backend_bridge`), zero regressions; `npm run hygiene` clean. Nothing committed yet — pending
user go-ahead.

- **[x] Batch 1 (Medium) — exit-clamp bookkeeping fix.** `shared/lib/runtime/alpaca_bot_cycle.js`:
  new pure `buildExitOutcome(position, exitReason, currentPrice, sellQty, cycleId, isLive)` helper
  (same pattern as `decideExit`/`resolveExitQty` — "trivially unit-testable" by design). Computes
  `realizedPnl` from the actually-sold qty instead of the pre-clamp `position.qty`, and returns the
  unsold remainder as a still-open position (`{...position, qty: remainingQty}`) instead of silently
  dropping it. Also hoisted the `sellQty<=0` "drop stale tracking" check out of the `isLive`-only
  branch so dry-run gets the same correctness (a paper-account 0-balance is just as stale as a live
  one). 4 new tests in `tests/scripts/lib/alpaca_bot_cycle.test.js`: full-exit regression (P&L
  unchanged from before), the partial-clamp fix (P&L on sold qty only, remainder qty=4 stays tracked),
  `dryRun` flag mirrors `isLive`, defensive over-clamp. **verification + completeness lenses, shared/lib/runtime B→A.**
- **[x] Batch 2 (Low, defense-in-depth) — PIN strip centralized.** Moved `stripFlagValue` from
  `backend/cli/lib/utils.js` into `shared/lib/runtime/backend_bridge.js` (correct dependency
  direction — cli already depends on shared, not the reverse) and made `buildTradeGatewayLaunch`
  strip `--pin` unconditionally at its single chokepoint, covering all 8 current callers instead of
  just `commandTrade`. `utils.js` now re-exports the canonical implementation (its one existing
  caller and the existing `strip_flag_value.test.js` import path are unchanged). New
  `tests/scripts/lib/backend_bridge.test.js` (3 tests): `--pin`+value never reach the spawned argv,
  no-pin args pass through untouched, `utils.js`'s export is the same reference (not a duplicate).
  **duplication/drift lens, backend/cli stays B+.**
- **[x] Batch 3 (Low, doc alignment) — 5 stale dev-review comments deleted/corrected.**
  `sovereign_dashboard.mjs` lines 89 (`cockpit`), 259 (`polymarket markets`), 276
  (`polymarket derive-creds`) — removed stale "crashes" markers (the session-54 SIGINT fix is
  confirmed still in place). Line 177 (`backend chart`) — corrected the "STILL TODO: volume/SMA"
  claim; both shipped session 55 and are visibly wired two lines below. Line 342 (`login`) — kept
  the still-legitimate "session persistence" feature request, dropped only the stale "crashes"
  clause. Comment-only changes, no behavior change. **doc-alignment lens.**
- **Deliberately NOT touched (out of this batch's named scope):** `sovereign_dashboard.mjs:171`
  ("is this redundant? dev question" on `backend universe`) and lines 260/267 ("doesn't work, dev
  review" on `polymarket history`/`polymarket backtest`) — plausibly also stale (the backtest
  null-path crash was fixed sessions 54/55) but weren't in the audited 5-item list and weren't
  re-verified this pass; left for a future cleanup pass that actually checks them.

---

### Focused Blast-Through — 2026-06-25 session 59 (anchor `1c7227b7`→`5e60babb`, review-only)

DCS 0.97→0.96. Scope per the Recency-Ranked Audit Queue: Tier 1 = the 3 commits made since the last
audit anchor (`cf4f7026`, `13bc91f0`, `5e60babb` — the session-58 review-fix pass + trade-section UX
fix), none of which had been audited yet (the ledger's "done (session 58)" stamp predates 2 of the 3).
No section is currently gated (C or below), so no Tier-3 carryover was mandatory. Nothing fixed this
pass — review-only, per the skill's default mode.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| Medium | `shared/lib/runtime` | `alpaca_bot_cycle.js:144-184` (`runAlpacaExitCheck`, commit `cf4f7026`, 2026-06-23) | The Finding-4 oversell clamp (`resolveExitQty`) correctly stops a broker-level oversell when two tracked positions share one symbol and the broker holding is undersized, **but the bookkeeping after a clamped sell is wrong**: `realizedPnl` is computed from the full `position.qty` (line 172) instead of the actually-sold `sellQty`, and the position is unconditionally dropped from `state.positions` (never re-pushed to `remaining`) even when only part of it was sold — the unsold remainder becomes permanently untracked (no further stop/target/age protection, invisible to `auto-trade status`). `runAlpacaExitCheck` has **zero test coverage**; `alpaca_bot_cycle.test.js`'s 11 new tests only exercise the pure `resolveExitQty`/`canOpenPosition`/`resolveEntryQty` math in isolation, never this integration path. Verified empirically: traced every `--pin`-adjacent write/read in the file and confirmed the clamp branch (`sellQty < position.qty`, available > 0) is reachable and untested. | Track the unsold remainder: `if (sellQty < position.qty) remaining.push({...position, qty: position.qty - sellQty})` before/instead of dropping it, and compute `realizedPnl` from `sellQty`, not `position.qty`. Add an integration test that mocks a broker holding smaller than the combined tracked qty across two positions on one symbol. | OPEN |
| Low (informational, **no active leak found**) | `backend/cli`, `shared/lib/runtime` | `backend_bridge.js:68` (`buildTradeGatewayLaunch`) has 8 call sites; only `trade.js:329` (`commandTrade`) strips `--pin` before spawn (the `cf4f7026` fix). Exhaustively traced all 3 places `--pin` is ever written into an args array (`strategy.js:905`, `alpaca_bot_cycle.js:157`, both Alpaca bot paths) and confirmed both terminate at the now-fixed `commandTrade` call — **today, nothing leaks.** But `commandBot` (`trade.js:509`) and `commandPolymarket`'s generic passthrough (`trade_polymarket.js:741-744`) build `gatewayArgs` from raw `args.slice(1)` with no strip; either would silently reopen the exact session-58 PIN-argv-leak finding the moment any future caller forwards `--pin` to them. The fix lives at one caller instead of the shared chokepoint every caller already goes through. | Move `stripFlagValue(args, '--pin')` inside `buildTradeGatewayLaunch` itself so all 8 current (and any future) callers get it for free, instead of relying on each call site to remember. | OPEN (defense-in-depth, not gating) |
| Low | `backend/cli` (doc alignment) | `sovereign_dashboard.mjs:177` | Inline manifest comment on the `backend chart` entry claims SMA overlay + volume subplot are "STILL TODO (deferred)" — both shipped in session 55 (`79d2129f`/`2d17aa26`); the `--sma`/`--volume` flags are present and wired two lines below the comment that says they aren't. | Delete or correct the stale clause; the candlestick/SMA/volume upgrade is fully done. | trivial cleanup |
| Low | `backend/cli` (doc alignment) | `sovereign_dashboard.mjs:89,259,276,342` | Inline "crashes / dev review" comments on `cockpit`, `polymarket markets`, `polymarket derive-creds`, `login` predate the session-54 shared-root-cause SIGINT fix (verified still in place: `runExternal`'s `sigintGuard`, lines 1342-1394) — all four were fixed but the comments were never updated, so they still read as open bugs. `login`'s comment also bundles a still-legitimate, separate feature request ("session persistence") that genuinely is still open — only the "crashes" clause is stale. | Trim the stale "crashes" clauses; keep the still-open feature-request text (e.g. login session persistence). | trivial cleanup |

**Verified-good (no findings):** `canOpenPosition`'s wiring in `strategy.js:890,911` (sequential single-pass
loop, `openPositionCount++` only after a confirmed `tradeExitCode===0` buy — no race, no double-count);
`commandStrategyMenu`'s non-interactive `list` fallback (`strategy.js:1222-1229`); the dashboard's new
`positions` entry (index 5, `auto-trade` stays index 4 — nav test's pinned index holds) and its `--live`
flag wiring (`sovereign_dashboard.mjs:240-244`); `isInteractiveCmd`'s prefix match against
`INTERACTIVE_CMDS` has no accidental over-match (checked every dashboard command id sharing a prefix with
`alpaca`/`mt5`/`login`/`register`/`cockpit` — each set entry maps to exactly one menu command). Hygiene
sweep: duplicate-basename pass run; the only Tier-1-relevant duplicate (`utils.js`) resolves to
`backend/cli/lib/utils.js` (canonical, the one touched) vs `docs/archive/legacy_ui/js/utils.js` (archived,
different domain) — not a real duplication.

**Next debt-clearing move:** the `runAlpacaExitCheck` partial-clamp accounting fix (Medium finding above)
is the highest-value next move — it's a live-money bookkeeping gap on the exact function the last two
sessions were hardening for oversell safety, with no test coverage to catch a regression. The PIN
centralization and the two stale-comment cleanups are cheap (<30 min combined) and can ride along.

---

### Mass-Implement (pass 2) — 2026-06-22 session 55 (carryovers + remaining debt)

Second mass-implement pass same session — cleared the remaining debt item AND all four open
carryovers. Suite **594/592/0fail/2skip**; hygiene clean; gateway tsc exit 0. Commits `4f65c7aa`
(gateway), `79d2129f` + `2d17aa26` (chart), `77cd31a7` (typing lag).

- **[x] Gateway `processProposedOrders` failure reporting** (`backend/gateway/src/index.ts:757-801`):
  the batch loop now inspects `order.status` after each `execute()`, logs each failure, sets
  `process.exitCode = 1`, and prints a success/failure summary — mirroring the buy/sell CLI path's
  post-execute check. Closes the dormant "per-order failure silently swallowed" debt. error-handling lens.
- **[x] Chart upgrade — ALL 3 parts (carryover #1)**: new `renderCandlestickChart()`
  (`backend/cli/tui/visualizations.js`) draws OHLC body+wick (green/red by close-vs-open), an optional
  yellow **SMA(N) overlay**, and an optional **volume histogram subplot** — same width-clamp/axis/summary
  scaffold as `renderPriceChart`. Flags `--style candle`, `--sma <N>`, `--volume` wired through
  `backend_chart.js` + the dashboard manifest (`--style` default `line` = non-breaking; `--sma`/`--volume`
  default off so they don't perturb default `buildArgv`). 11 render tests + 2 contract-assertion updates +
  dashboard nav-row count bump.
- **[x] Typing-lag fix (carryover #2)**: root-caused to Ink 7's writer
  (`node_modules/ink/build/ink.js:100`) doing a **full terminal clear+redraw every frame** when
  `win32 && fullscreen` (rendered height ≥ viewport rows). The root Box forced `height:
  process.stdout.rows` (exactly fullscreen). Fixed by capping to `rows-1` so Ink uses its incremental
  line-diff `log-update` path; height stays `undefined` when rows is unknown (test harness unchanged).
  **Verified by Ink-source analysis + fake-TTY harness; real-conhost confirmation is the user's (no
  conhost in CI) — folded into the real-terminal carryover below.**
- **[x] graphify-out refresh (carryover #4)**: AST-only structural refresh (no LLM cost) merged into
  the existing graph — 11,015→11,542 nodes, 958 communities, `GRAPH_REPORT.md`+`graph.json` regenerated
  (gitignored, not committed). Did NOT run full semantic extraction: the 297 "doc" changes were dominated
  by noise (`.graphify_*` temp, `.venv_ml/`, `.antigravitycli/`, `settings.json`) — recommend tightening
  `.graphifyignore` before any full semantic rebuild.
- **[ ] Real-terminal confirmation (carryover #3) — STILL THE USER'S**: `bt --strategy` picker,
  `backend visualize` force-ingest fallback, AND now the typing-lag fix all need a live conhost/terminal
  check that can't run in CI. Their dev-review comments remain in place pending that.
- **DOC CORRECTION — two backlog rows below are STALE (already fixed in prior sessions, not by me):**
  (1) the **P1 "research/ingest C" Kalshi** row — `manifests.js:59-60` already return `{records:[]}`/`[]`
  (correct shapes, no crash); (2) the **P2 "ingest/TUI C" unconfigured families** row —
  `manifest.js:155-157` already removed pmi/breadth/onchain/flight/crypto_tx/holdings from the
  `--family` dropdown. Neither section is actually C anymore; treat those two rows as resolved.

---

### Mass-Implement — 2026-06-22 session 55 (closeout, anchor 0903df6b)

Cleared three backlog debts from the audit below. Suite **583/581/0fail/2skip** (= 580 baseline + 3
new tests); `npm run hygiene` clean; gateway `tsc --noEmit` exit 0.

- **[x] Batch A — `renameWithRetry` busy-wait → real sleep + first-ever tests** (`shared/lib/market/validation.js:611`).
  Swapped the `while (Date.now()-start < delayMs) {}` CPU spin for
  `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)` (true OS-level sleep, no
  event-loop block, no dependency). Exported the function; added `tests/scripts/lib/rename_with_retry.test.js`
  (3 tests: transient-EPERM-then-success, real-sleep lower-bound proving it's not a no-op, rethrow
  after exhausting retries). **verification lens B→A on shared/lib/market.**
- **[x] Batch B — deleted 3 of 4 dead root shims.** `shared/lib/{backfill,ingestion,market_validation}.js`
  removed (re-verified 0 consumers with a `.js`-aware grep + import/alias sweep). `polymarket_history.js`
  was **wrongly flagged dead in the audit below and is KEPT** — see the corrected P3 row. **artifact-hygiene lens.**
- **[x] Batch C — gateway raw `fetch` → `fetchWithRetry`** (`backend/gateway/src/cycle.ts:69,123`,
  `backend/gateway/src/market.ts:17` + new import). Completes the 2026-06-12 fetch-retry rollout the
  gateway was ~90% through. `tsc --noEmit -p backend/gateway/tsconfig.json` exit 0. **duplication/drift lens.**

**Process lesson (durable):** the Hygiene Sweep's dead-module grep anchor must be `<name>(\.js)?['\"]`,
not `<name>['\"]` — the bare form silently misses every `require('.../<name>.js')` with an explicit
extension and produces a false "0 consumers" (this exact class caused the session-29 false negative too).

---

### Focused Audit — 2026-06-22 session 55 (anchor 03b3c8d5 → 0903df6b, session-54 TUI/chat surface)

DCS start ≈0.95 (carried from session 54) → end ≈0.99. No crash/data-loss/security findings. The
two new files and four modified production files from session 54's two code commits all traced clean
on full-diff review; the headline risk (an LLM-assisted command resolver) is sound by construction.

**Scope:** Focused. Tier 1 = `95a9c547` + `a0a5cda5` production files (8). Tier 3 (gated carryover) =
none (`backend/api/*` ungated session 53). In-scope sections: `backend/cli/tui`, `backend/cli/commands/{data,tools}`, `shared/lib/market`.

**Security — chat LLM fallback verified safe by code-trace, not assertion.** The new
`chat_llm_fallback.js` resolves free text into a runnable command via the local Ollama client. Traced
the full execution chain: `resolveWithLLM` → manifest validation (`command_id` must exist; every flag
key must be a real flag, unknown keys dropped) → `flagValues` → `buildArgv` (`dashboard_exec.js:73`,
`argv.push(key, str)` — array elements, never a concatenated string) → `spawn(process.execPath,
[sovereign_cli.js, ...argv])` (`sovereign_dashboard.mjs:410/455/1222` — **no `shell:true` anywhere**).
A malicious LLM-produced value therefore lands as a single inert argv element; there is no shell
interpolation seam. Plus the caller enforces a mandatory confirm gate before any chat-resolved run.
**No injection. No eval/dynamic-require.** Security lens: A.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P3 | shared/lib | `shared/lib/polymarket_history.js` (1-line root shim) | ~~4-layer dead-check all return 0 consumers~~ **CORRECTED (session 55 mass-implement): NOT dead.** The dead-check grep anchor `polymarket_history['\"]` missed `require('.../shared/lib/polymarket_history.js')` — the **`.js` extension** sits between the basename and the closing quote, so the regex never matched. `tests/scripts/strategy/polymarket_backtest.test.js` requires this shim with the extension. Deleting it broke that test; restored via recovery rule. The 3 session-52 shims (`backfill/ingestion/market_validation`) re-verified with a `.js`-aware grep + import/alias sweep = genuinely 0 consumers, and were deleted. | KEEP `polymarket_history.js` (load-bearing). Lesson: dead-check grep must use `<name>(\.js)?['\"]`. | shared/lib B (unchanged) |

**Verified (live evidence, not reading alone):** `node --test chat_parser.test.js chat_ui.test.js`
→ **22/22 pass** (incl. the mid-word false-positive guard, the mandatory LLM-confirm gate, the
`--live` PIN gate from a chat-resolved command, and safe-degrade when Ollama is unavailable). Full
suite unchanged from session-54 HEAD (580/578/0fail/2skip — no code changed since). Diffs of all 4
modified files match their handoff claims exactly: `data.js` TTY-guards + chart mode, `backend_visualize.js`
bounded single-retry force-ingest, `visualizations.js` width clamp (`terminalCols - 12`), `polymarket_history.js`
`root = root || CACHE_DIR` null-guard mirroring the existing `loadArchivedMarketIndex` pattern.

**Carryover debts (unchanged, none gating):** `renameWithRetry` busy-wait + zero coverage
(`shared/lib/market/validation.js:601`, P2); 3 (now 4, incl. above) dead root shims; gateway's 3
raw-`fetch` sites lacking the imported retry helper. None block new work.

---

### Blast-Through Deep Audit — 2026-06-21 session 52 (anchor d21e25ce → 3da6e612, recent code + data pipeline)

DCS start ≈0.96 (carried from session 50/51 close) → end ≈0.96 (no crash/data-loss findings; two
contained, non-blocking debts surfaced below — neither moves the mechanical formula, which stays
clean: `backend integrity --json` reports `total_missing:0`, `total_stale:0`, `total_exceptions:0`
across all 92 configured cache entries).

**Tier 1 — commits since the last anchor (`git log d21e25ce..HEAD`), data-pipeline-relevant ones
reviewed line-by-line (diff read in full, not just the commit message):**

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| — | runtime | `3da6e612` (this session) `shared/lib/runtime/backend_bridge.js:53` | `merged.ok` now unconditionally derives from `(status===0) && (payload.ok!==false)` instead of trusting a payload that already had `ok:true` before a non-zero exit. Already committed this session after a passing 553/553 suite run. | done | runtime A |
| P2 | data/market | `0eda90fa` (2026-06-20) `shared/lib/market/validation.js:601` (`renameWithRetry`) | Retry delay is a **synchronous busy-wait spin loop** (`const start = Date.now(); while (Date.now()-start < delayMs) {}`) instead of `Atomics.wait`/an async backoff — pegs one CPU core and blocks the Node event loop for up to ~250ms (5 retries × 50ms default) per contended rename. Sits on the hot path for every `writeJson` and every `mergeWriteBin` call (i.e. every ts-index bin write and every JSON cache write in the whole pipeline) and has **zero test coverage** (`grep -rn renameWithRetry tests/` → no hits) despite replacing a bare `fs.renameSync` that 3 separate prior sessions (25/34/36) documented as a real cross-process EPERM crash risk. Not data-corrupting — it's strictly better than the prior hard crash — but the busy-wait is the wrong sync-sleep primitive in Node and the new retry path is unverified. | Swap the spin loop for `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)` (true OS-level blocking sleep, no CPU spin, no new dependency); add a unit test that forces one `EPERM`/`EBUSY` rename failure (mock `fs.renameSync` to throw once) and asserts the retry succeeds and the total wall-clock matches the backoff schedule. | data/market B — contained debt, not gating |
| P4 | data/market | `0eda90fa`/historical, `shared/lib/market/coverage.js` `isGrainSuspect` guard | Live `backend integrity --json` flags 3 `grain_suspect` entries, all `CPER` (5m/15m/4h, ~7.2 bars/day over a 2150-day span vs. the calibrated floor). Directly probed via `readTsIndex` (not assumed): bar spacing inside the bin is genuinely 5-minute where present (gap=5min runs exist), interleaved with real multi-day gaps — **not** the daily-mislabeled-as-intraday corruption shape fixed in session 35 (CORN etc.), and CPER's same 2150-day span as the healthy GLD/SLV/USO/UNG peers (37-48 bars/day) rules out "thin recent Yahoo accumulate window" too. Most likely explanation: CPER is a genuinely low-liquidity ETF among the 8 commodity-ETF proxies — Alpaca's SIP feed only emits a bar when a trade occurs, so a thin name legitimately produces far fewer 5m bars than GLD/SLV. | No fix needed — the guard is doing its job (flagging a real density anomaly); just don't mistake it for corruption. If it recurs across more symbols, recalibrate `isGrainSuspect`'s per-TF floor to account for genuinely thin-liquidity names rather than raising the floor (would mask real corruption elsewhere). | informational only |
| P4 | hygiene | `824d038e` (2026-06-20) | Path-consolidation commit is correct and complete (verified: zero live `REPO_ROOT,'data'` callers remain outside `docs/archive/sovereign_cli.og.js`), but left the pre-migration files behind: untracked, gitignored `data/cache/` and `data/models/latest_indicator_optimization.json` (stale, dated 2026-06-19, superseded by the now-active `storage/data/models/latest_indicator_optimization.json` dated 2026-06-21). Dead, harmless, zero git impact. | `rm -rf data/cache data/models/latest_indicator_optimization.json` locally whenever convenient — no urgency. | hygiene — trivial |
| — | docs | `852130f8`/`85fea62f`/`d663d838`/`5ed03ced` (agy-schedule auto-doc sweep) | All 4 are pure-insertion JSDoc comment blocks on `backend_correlation.js`/`backend_visualize.js`/`backend_integrity.js`/`backend.js` — confirmed via `git show <sha> | grep -vE comment-prefixes` that every added line is a comment token, zero executable-line changes. | none needed | clean |
| — | data | `e5e21ef1` (2026-06-20) gap-aware `fetchPaginated` + per-family incremental flush in `commandMassBackfill` | Traced the full logic by hand: `effectiveStartTs` narrowing is try/catch-guarded and falls back to the full window on any coverage-probe error; the per-family flush-on-last-job-of-family is synchronous (no `await` between the decrement and the `flushFamily` call), so it can't race against another concurrently-completing job for the same family; the end-of-run catch-all only re-flushes families whose map entries were never deleted, so a double-flush is structurally impossible. No bug found. | none needed | clean, well-tested (121+170 new test lines) |
| — | data | `5d9d2e23` (2026-06-20) `commandStopBackfillDaemon` | Liveness-probes the pid (`process.kill(pid,0)`) before sending the real `SIGTERM`, handles 4 distinct failure modes explicitly (no status file / malformed status / not running / kill failed), and writes the `stopped` marker itself with a clearly-commented rationale for the documented Windows hard-kill-vs-graceful-handler gap. No bug found. | none needed | clean |

**Tier 2 — hygiene/security/stub sweep (delegated to a sub-agent, then independently re-verified by
the lead auditor for the one claim with real consequences — see below — per the skill's
empirical-claim rule):**

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P3 | hygiene | `shared/lib/{backfill,ingestion,market_validation}.js` (1-line root shims) | All 3 confirmed **dead across all 4 resolution layers** — re-verified personally (not just trusting the sub-agent's grep) given this exact shim layer was the site of a real false-negative 2026-06-13 (session 29: "shim trap" — literal-grep wrongly called load-bearing shims dead and broke the build). Independently checked: (a) no literal `require()` hits outside the shims' own bodies and `docs/archive/`; (b) no sibling-relative requires anywhere under `shared/lib/`; (c) `package.json`'s `#shared/*` imports alias has zero call sites using `#shared/backfill`, `#shared/ingestion`, or `#shared/market_validation`; (d) the project's own `./dist/mcp_server/*` compiled output only contains the unrelated string `"backfill"` as an MCP tool/CLI-argument name, never a `require()` of these paths. Also: `shared/lib/compat/adapters.js`'s comment claims canonical backfill logic "lives in `shared/lib/backfill.js`" but its own `require` already bypasses that shim straight to `../data/backfill` — the comment is stale. | Safe to delete the 3 shim files; fix the stale comment in `adapters.js`. Re-run the full suite after deletion per the skill's recovery rule. | hygiene — verified safe, not gating |
| P3 | hygiene | `backend/cli/commands/data/backfill_daemon.js` (`makeRealExecutor`, `ALL_FAMILIES`, `INCREMENTAL_DAYS`, `LANE_CONCURRENCY`, `LANE_MAX_CONCURRENCY`, `FAMILY_LANE`), `data_rollup.js` (`removeDerivedBin`), `data.js` (`inspectMassBackfillJob`), `ingestion.js` (`runIngestBatch`), `validation.js` (`isValidTimestamp`) | 10 more exports came back 0-importer on a literal/sibling/alias/dist sweep, but **not independently re-verified by the lead auditor** (lower stakes than the root-shim claim, and the sub-agent itself flagged these as needing a second pass before action). | Do not delete without a dedicated follow-up pass; several of these read like deliberately-exported test seams or CLI-debug surfaces, not confirmed dead. | follow-up backlog, not gated |
| — | security/stubs | the 8 core data-pipeline files (`backfill.js`, `ingestion.js`, `validation.js`, `coverage.js`, `data.js`, `data_deep_backfill.js`, `data_rollup.js`, `backfill_daemon.js`) | No `eval`/`new Function`/non-literal `require`/`exec`/hardcoded-secret/token-logging hits; no `TODO`/`FIXME`/`not implemented` markers; the 4 bare `return null` hits found are all legitimate guard returns (provider-no-match fallthrough, JSON-parse-error swallow ×2, ineligible-symbol negative result), none are silent stubs on a reachable path. | none needed | clean |
| — | coverage gap, disclosed | `backend/scripts/data_ops/ingest_market_data/{index.js,manifests.js,snapshot_fetchers.js,providers/*}` | **Not re-scanned this pass** — no Tier 1 commit touched this directory, so per the Focused-Audit scope rule it carries forward its last graded status (B, session 41 FW2 audit) rather than being re-swept. Flagging explicitly rather than silently implying full coverage. | re-scan if/when a future commit touches this directory | ingest_market_data B (cached) |

**Section grades (lens-scored, trend vs. last recorded):**

| Section | Grade | Trend | Notes |
|---|---|---|---|
| `shared/lib/data/*` (backfill.js, ingestion.js, db_pruning.js, crypto_aggregates.js, macro_store.js) | A- | → (was clean) | gap-aware fetch well-tested; only debt is the dead-shim cosmetic note above |
| `shared/lib/market/{validation,coverage}.js` | B | ↓ slight (was A on this lens) | renameWithRetry busy-wait + zero test coverage is the one real contained debt this pass |
| `backend/cli/commands/data/*` (data.js, data_rollup.js, data_deep_backfill.js, backfill_daemon.js) | A- | → | incremental-flush + stop-daemon both clean; `data.js` (1,132 LOC) remains a size hotspot but not new debt |
| `backend/scripts/data_ops/ingest_market_data/*` | B (cached) | → | not re-scanned this pass (no Tier 1 commits touched it); residual 1,342-LOC `index.js` is the accepted post-FW2 baseline, not new debt |

**LOC breakdown, data pipeline (`wc -l`, 2026-06-21):** `ingest_market_data/index.js` 1,342 ·
`data.js` 1,132 · `validation.js` 995 · `backend_visualize`-adjacent n/a · `data_accumulate.js` 549 ·
`snapshot_fetchers.js` 519 · `backfill_daemon.js` 526 · `data_deep_backfill.js` 428 ·
`data_rollup.js` 326 · `constants.js` 271 · `coverage.js` 204 · `manifests.js` 200 ·
`backfill.js` 237 · `macro_store.js` 151 · `crypto_aggregates.js` 108 · `db_pruning.js` 99 ·
`candle_utils.js` 52 · `ingestion.js` 55 · `intraday_yahoo.js` 33 · `index.js` (shared/lib/data) 4 ·
**total 7,231 LOC** across the data pipeline's production files (test/docs excluded).

##### Centralization Backlog (additions)

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| Root-shim retirement is further along than the architecture map assumes | `shared/lib/{backfill,ingestion,market_validation}.js` confirmed dead this pass; ~29 other root shims under `shared/lib/*.js` were never re-checked since the original migration (session 29) | A dedicated dead-shim sweep across all ~32 flat `shared/lib/*.js` files, 4-layer-verified each, not just these 3 | M | hygiene — opportunistic, not urgent |
| Synchronous-sleep-via-busy-wait | `renameWithRetry` (1 file, but called from 4 sites on the hottest write path in the data layer) | Swap to `Atomics.wait` | S | data/market B→A |

**Verification gate to clear:** none of this pass's findings are gating — Gate Table below is
all-OPEN. The two real items (busy-wait sleep, dead-shim cleanup) are debt-clearing opportunities,
not blockers.

**Gate Table (2026-06-21 session 52):**
```
Section                                          Grade   Status
────────────────────────────────────────────────  ─────   ──────────────────────────────
shared/lib/data/*                                  A-     OPEN
shared/lib/market/{validation,coverage}.js          B     OPEN (renameWithRetry debt, contained)
backend/cli/commands/data/*                         A-     OPEN
backend/scripts/data_ops/ingest_market_data/*       B     OPEN (cached, not re-scanned)
shared/lib/runtime/backend_bridge.js                A     OPEN (this session's fix verified)
dashboard/CLI interactive surface                   A     OPEN (session 50/51 fixes verified live)
```

**Verified this session:** full suite **555 tests / 553 pass / 0 fail / 2 skip** (run before
committing session 51's batch); `backend integrity --json` live run (92/92 cached, 0 missing, 0
stale, 0 exceptions, 3 grain_suspect — all explained); direct `readTsIndex` probes on CPER across
5m/15m/4h/1d; direct 4-layer re-verification of the 3 dead-shim claims; full diff read (not just
commit messages) for `e5e21ef1`, `824d038e`, `5d9d2e23`, `0eda90fa`, plus the 4 auto-doc commits.

---

### Blast-Through Deep Audit — 2026-06-21 session 52, continued (backend/api + backend/gateway)

User asked "any more bugs in other sections?" after the data-pipeline pass above. Extended the
Recency-Ranked Audit Queue to the two sections that hadn't been touched in ~10 sessions and carry
the highest blast radius if wrong (exposed web port; real broker money movement): `backend/api/`
(last real fix `37d2d6d2`, 2026-06-12) and `backend/gateway/src/` (last real fix `6875f1fa`,
2026-06-12). Delegated both to sub-agents in parallel, then personally re-verified the one finding
with real consequences (the path-traversal claim below) by reading the route file and the auth
gate myself rather than trusting the report — confirmed accurate.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P2 | api/security | `backend/api/server/routes/market/sigma_band.js:46,48` (`computeSigmaBand`/`readJsonSafe`) | `query.input` (an HTTP query string param) flows unsanitized straight into `fs.readFileSync(filePath)` — no `path.resolve`+prefix containment check like the one `app.js:193-200` already uses for static files. **Personally verified**: `/api/sigma-band` is absent from both `isPublicRoute` (app.js:115-128) and `PROTECTED_GET_ROUTES` (app.js:54-60), and `checkSecurity`'s gate (`app.js:129`) only requires a token for non-GET requests or GETs explicitly in `PROTECTED_GET_ROUTES` — so this is reachable over the network with **zero authentication**. Actual blast radius is narrower than a typical arbitrary-file-read: the file is always `JSON.parse`'d first inside a try/catch that collapses every failure (missing file, permission denied, not valid JSON) into one identical `{ok:false,error:'snapshot_not_found'}` response — so raw file contents are never echoed back, and the only data that ever surfaces is specific numeric/string fields (`close`, `timestamp`) from records that already match a `{symbol,timeframe,close,timestamp}` shape inside a `sources`/`records`/`bars`/`data` array. Still a real, unauthenticated file-existence-and-JSON-shape oracle against the server's filesystem (distinguishes "valid JSON at this path" from "missing/unreadable/non-JSON"), and a foothold for further probing. | Mirror the existing `WEB_PUBLIC_ROOT`-prefix containment check used for static files, or simplest: drop the `query.input` override entirely and always read `DEFAULT_SNAPSHOT` (no legitimate caller appears to rely on overriding it — grep `Frontend/dashboard/src` for any caller passing `input=`). | **api — Security Surface caps at C, gated until fixed** |
| P3 | api/security | `backend/api/server/services/cli_executor.js` (`backendStatus`, `backendDataSummary`, `backendCorrelation`, `backendUniverse`) | Same unvalidated `query.input` pattern, but lower severity — it's forwarded as one `spawnSync(..., {shell:false})` argv element (no shell injection), and all 4 routes (`/api/status`, `/api/data/summary`, `/api/correlation`, `/api/universe`) are already on the public allowlist by design. | Same containment fix as above, lower urgency since these were already intentionally public. | api — contained |
| P3 | api | `backend/api/server/routes/system/kill_switch.js:6` | The (already token-gated) `query.command` is forwarded verbatim to the C++ backend as the kill-switch subcommand with no allowlist (`status`/`arm`/`disarm`/etc.). | Add an explicit subcommand allowlist. | api — low risk, token already required |
| P4 | api/hygiene | `backend/api/server/middleware/{error_handler.js,logger.js,rate_limiter.js}` | Dead code — zero `require()` of any of the 3 files anywhere in `backend/api`; `app.js` uses its own inline security/rate-limit logic instead. | Delete, or wire in if an Express migration is ever intended. | api — trivial |
| P4 | api | `shared/lib/mcp/gate.js:38-42` (`isMcpAllowed`) | Fails **open** (defaults `true`) for any pathname in neither `BLOCKED_ROUTES` nor `ALLOWED_ROUTES` — `/api/bot/cycle`, `/api/bot/sell`, `/api/bot/status`, `/api/signal/promote`, `/api/strategies`, `/api/sigma-band`, `/api/run/status` are all absent from both lists today. Not exploitable today since the real boundary is `app.js`'s API-token gate, not this MCP allowlist — but if this list is ever promoted to the primary gate, trading routes should be explicit `BLOCKED_ROUTES` entries rather than relying on fail-open. | Add the bot/trading routes to `BLOCKED_ROUTES` explicitly. | informational only |
| — | api | `37d2d6d2` kill-switch token gate | Re-verified still intact and tested (`tests/api.test.js:212-224` asserts 401 without token). No regression. | none | clean |
| — | api | command-injection / path-traversal-elsewhere / stub / secrets sweep | Exhaustive `exec(`/`execSync(` grep across `backend/api/server/**`: zero hits, both real spawn sites use `spawnSync(bin,[...argv],{shell:false})`. No hardcoded secrets, no `eval`, no token values logged, no mock-data stub handlers (`localBackendFallback` is a labeled real-fixture degraded mode, not fake data). | none | clean |
| P2 | gateway | `backend/gateway/src/index.ts:728-755` (`ExecutionGateway.execute()`) returns `void`; failure is only visible by inspecting the mutated `order` object afterward | The `buy`/`sell` CLI path (`index.ts:2037-2051`) *does* check `order.status` post-call and sets `process.exitCode=1`/`ok:false` — combined with today's `backend_bridge.js` fix, that path is fully closed (exit code and payload now agree). But `processProposedOrders()` (`index.ts:757-801`, the `process` CLI command) loops `await this.execute(order)` per order and **never inspects `order.status` afterward** — no exit code, no `ok` field, a failed order in a batch silently becomes a console-only log line. Same gap at the `--demo` call site. Confirmed via grep that nothing currently wires the `process` CLI command through `backend_bridge.js`, so this is **real but dormant** — it activates the moment any future caller bridges that command. | Have `processProposedOrders` aggregate per-order failures into a summary `{ok, failed_count}` and a non-zero exit when any order failed, mirroring the buy/sell path. | gateway — dormant debt, not gating |
| — | gateway | Centralization Backlog re-check (commit `6875f1fa`, 2026-06-12) — DEV_REVIEW's existing backlog row was stale and is corrected here | (a) raw-`fetch`-without-retry: **mostly fixed** — `index.ts`/`cycle.ts` import and use `fetchWithRetry` from `shared/lib/runtime/fetch_retry.js`, but `cycle.ts:69` (`fetchAiBets`), `cycle.ts:123` (bot-health check), and `market.ts:17` (`fetchTradingInfo`) still call raw `fetch` despite the retry helper already being imported in the same file in 2 of the 3 cases. (b) `submitPolymarketOrder`/`preflightPolymarketOrder` duplication: **fixed** — both now delegate to `_polymarketOrderCore` (`index.ts:1844`). (c) hand-rolled L2 HMAC vs. the SDK's `createL2Headers`: **still open, but by design** — the commit message explicitly records this was "aborted per spec gate" (the SDK helper needs a `ClobSigner`+WebCrypto and drops headers this gateway relies on), not a silent regression. | Close the 3 remaining raw-`fetch` call sites (S effort, same pattern already proven in the same files). Leave (c) as a documented design decision, not a bug. | gateway — centralization backlog corrected, not gating |
| — | gateway | re-verified previously-fixed findings: FOK order type (`cycle.ts:251,381,483`), plaintext-secret masking (`index.ts:2267-2291`, `--reveal`-gated) | Both confirmed still intact, no regression. | none | clean |
| P3 | gateway | `AlpacaAdapter.placeBracketOrder` (`index.ts:573`) | Still orphaned, zero callers repo-wide — unchanged from the last audit. | Implement a caller or remove; not urgent. | gateway — unchanged |
| — | gateway | security/stub sweep | No `eval`/dynamic `require`/hardcoded secrets in `backend/gateway/src/*.ts`; no silent stub returns on a reachable order-submission or balance-check path (`market.ts`'s `return null` hits are benign read-only lookup-not-found, not execution). | none | clean |

**Frontend/dashboard** (`Frontend/dashboard/src/`, 24 files): confirmed **not dead** — the API
sub-agent cross-referenced every `/api/*` call against `Frontend/dashboard/src/lib/api.ts` and all
major panels, found it actively wired to Supabase auth and the backend API (just not the *primary*
interface since the TUI/dashboard CLI took over that role — it runs standalone via `npm run dev`,
not through `infra/docker/docker-compose.yml`, which only has `web`+`bot` services). Not deep-dived
beyond the cross-reference above.

**backend/core (C++)**: not re-scanned this pass — zero commits have touched `backend/core/src`
since `e0ad1ff7` (session 18b, ctest fixture fixes, ~10 sessions ago); carries forward its last
verified state (29/29 ctest, ONNX parity proven) per the Focused-Audit scope rule rather than a
fresh full re-scan.

**Updated Gate Table (2026-06-21 session 52, full):**
```
Section                                          Grade   Status
────────────────────────────────────────────────  ─────   ──────────────────────────────
shared/lib/data/*                                  A-     OPEN
shared/lib/market/{validation,coverage}.js          B     OPEN (renameWithRetry debt, contained)
backend/cli/commands/data/*                         A-     OPEN
backend/scripts/data_ops/ingest_market_data/*       B     OPEN (cached, not re-scanned)
shared/lib/runtime/backend_bridge.js                A     OPEN (this session's fix verified)
dashboard/CLI interactive surface                   A     OPEN (session 50/51 fixes verified live)
backend/api/*                                       C     GATED — unauthenticated path-traversal
                                                            oracle on /api/sigma-band (clear before
                                                            adding new routes; debt-clearing exempt)
backend/gateway/src/*                               B+    OPEN (1 dormant debt, 1 corrected backlog
                                                            doc, otherwise clean re-verification)
Frontend/dashboard/src/*                            B     OPEN (not stale, not deep-audited)
backend/core (C++)                                  — (cached, last B/A — not re-scanned)
```

---

### Blast-Through Full Audit — 2026-06-21 (dashboard interactive surface)

User-reported crashes on login/register/Polymarket-portfolio in the Ink dashboard
(`backend/cli/sovereign_dashboard.mjs`) prompted a full sweep of every `INTERACTIVE_CMDS` entry
(`cockpit`, `polymarket markets`, `polymarket derive-creds`, `login`, `register`, `add-platform`,
`alpaca`, `mt5`, `trade favorites`, `strategy`, `prop-firms`, `run` — confirmed exact set at
`sovereign_dashboard.mjs:35-48`), since all 12 route through the same `runExternal()` →
`spawnSync(stdio:'inherit')` chokepoint (line 995) — a shared-mechanism bug hits all of them, not
just the 3 reported.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P1 | dashboard/CLI, repo-wide | `backend/cli/{engine.js,lib/auth.js,commands/data/data.js,commands/tools/backend_visualize.js}` — zero `process.stdin.on('error', ...)` handlers found anywhere under `backend/cli/` (grep-confirmed across all 6 raw `stdin.on('data', ...)` call sites) | An `EventEmitter` that emits `'error'` with no listener throws synchronously and **crashes the process** — bypassing `async`/`await` promise-rejection handling entirely, so no amount of `try`/`catch` around `await promptX(...)` call sites would catch it. Windows ConPTY + inherited `stdio:'inherit'` + repeated raw-mode toggling (every masked-password prompt flips `setRawMode` true→false) is exactly the kind of environment where a transient stdin transport error (`EIO`/`EPIPE`-class) is plausible — this is the most precise match found for a hard "crash" (vs. a clean rejection, which `sovereign_cli.js:143`'s top-level `main().catch(...)` already handles fine). | One `process.stdin.on('error', ...)` guard near the top of `sovereign_cli.js`'s `main()`, logging and falling through to the normal error/exit path instead of an uncaught crash. Covers all 12 `INTERACTIVE_CMDS` entries (and any future ones) in a single file, since they're all the same spawned child process sharing one `process.stdin`. | dashboard/CLI C — FIXED + tested this session (Phase 3) |
| P1 | dashboard/CLI | `backend/cli/lib/auth.js` — `promptLine`/`makeReadlineMasked` had no `SOVEREIGN_NONINTERACTIVE` bypass (unlike `tui/engine/engine.js:55-57`'s `isNonInteractive()`, already honored by `promptSelect`/`promptText`/`promptMultiSelect`) | This is *why* login/register had zero automated coverage — a piped, never-written, never-closed child stdin (exactly what `runExternal()` gives the spawned command) makes `promptLine`'s non-TTY branch (`readNonTtyLine()`) wait forever for a line that never arrives. Confirmed via a real repro test (see below): pre-fix, a non-mocked, unauthenticated `login` spawned with piped stdio hangs past a 20s timeout; this is a genuine, reproducible hang, not a hypothetical. | Add the same `isNonInteractive()` early-return guard to `promptLine`/`makeReadlineMasked` (mirrors `engine.js` exactly). Also: `_nonTtyRl` module-level singleton had no recreate-on-close path (`ensureNonTtyReader()`'s `if (_nonTtyRl) return;` returned even when the existing interface was already closed/dead). | dashboard/CLI C — FIXED + tested this session (Phase 1) |
| P2 | account | `backend/cli/commands/account/auth.js:32-33,78,84,97` (`commandLogin`/`commandRegister`) | `auth.promptLine`/`promptPassword`/`promptPasswordWithStrength` calls are not wrapped in try/catch (the `loginWithCredentials`/`registerWithCredentials` network calls just below them in the same functions already are — inconsistent). Once the P1 stdin-error guard lands this stops being a crash and becomes a UX-polish item: a clean rejection (e.g. Ctrl-C, which `makeReadlineMasked` already turns into `reject(new Error('interrupted'))`) would still surface as a raw stack trace instead of a friendly message. | Wrap the prompt-call sequences in try/catch, same style as the network-call try/catches just below. | account C — FIXED this session (Phase 3) |
| P2 | trade/mt5 | `backend/cli/commands/trade/trade_mt5.js` (`commandMt5`/`commandAddPlatform`/`commandMt5Profile`) | Same `lib/auth.js` `promptPassword` re-import, same missing-try/catch pattern as the row above. The P1 global stdin-error guard already covers this file's crash risk — **do not duplicate that fix here**, only the try/catch UX-polish is file-specific. Found a pre-existing developer self-flag directly above `commandAddPlatform`: `// does this actually works as intended? dev reiview` — corroborating evidence this path was already suspected, not newly discovered. | Wrap prompt-call sequences in try/catch (same pattern as account/auth.js). | trade/mt5 C — FIXED this session (Phase 3) |
| P3 | strategy/runner | `backend/cli/commands/strategy/strategy.js`, `backend/cli/commands/runner/run.js` | Both files exclusively use `tui/index.js`'s re-exported `promptSelect`/`promptText`/`promptConfirm` (`engine.js`'s implementations) — **not** `lib/auth.js`'s prompts. `engine.js` already honors `SOVEREIGN_NONINTERACTIVE`. No file-specific auth.js-class bug here; these are already covered by the P1 global stdin-error guard for the crash class, and don't need a separate try/catch pass since none of their prompt call sites are any more or less guarded than the rest of `engine.js`'s callers (a repo-wide pattern, not specific to these 2 files). | No action needed beyond the P1 global fix. | strategy/runner B |
| P3 | dashboard | Surface Parity spot-check: every `INTERACTIVE_CMDS` string vs. its manifest `id` | All 12 entries match an exact manifest `id` byte-for-byte (`cockpit`:75, `alpaca`:199, `mt5`:200, `add-platform`:201, `trade favorites`:202, `strategy`:214, `prop-firms`:215, `run`:216, `polymarket markets`:223, `polymarket derive-creds`:240, `login`:306, `register`:312) — no drift. Noted, non-blocking: `runExternal`'s match (`sovereign_dashboard.mjs:997`) is `cmdStr.startsWith(ic) || cmdStr === ic`, a prefix match rather than an id lookup — currently safe (no other manifest id starts with `"run"` followed by more characters that isn't already `"run"` itself, e.g. the unrelated `bot run` subcmd's `cmdStr` starts with `"bot"`, not `"run"`), but a future manifest id like `"run-once"` would silently and incorrectly match the `'run'` entry. | No fix needed now; flag for whoever next adds a manifest id starting with an existing `INTERACTIVE_CMDS` string. | dashboard B — clean, fragile-by-convention only |
| P3 | operational/status | `backend/cli/commands/operational/status.js:110-127` (`summarizePortfolioCard`) | Expects `{equity, exposure, drawdown, readiness, generated_at}`; the only thing that ever feeds it (`safeReadJson(DEFAULT_PORTFOLIO)`, line 330) is `storage/data/portfolio.json`, whose actual on-disk shape is `{mode, cash, positions, open_orders, last_mark_at}` — already a latent shape mismatch independent of Polymarket. Documented here, not fixed here — see Phase 4 (Polymarket-cockpit integration) for the related, in-scope fix. | Out of scope for this pass; flagging so it isn't mistaken for a Polymarket-integration regression later. | operational/status C — documented, not gated |

**Verification gate to clear:** all P1/P2 rows — DONE, see `RESOLVED 2026-06-21 (session close)` below.

**RESOLVED 2026-06-21 (mid-session):** the `lib/auth.js` P1 row only. `promptLine`/
`makeReadlineMasked` now honor `SOVEREIGN_NONINTERACTIVE` and `ensureNonTtyReader()` recreates a
dead `_nonTtyRl` instead of no-op-returning. Verified via a real repro test
(`tests/scripts/tui/dashboard/dashboard_command_safety.test.js`, `'login exits cleanly when
unauthenticated and not mocked'`) that spawns `login` with piped stdio, no `SOVEREIGN_MOCK`, and a
fresh empty `HOME`/`USERPROFILE` (so the real `~/.sovereign/session.json` is never touched).

**RESOLVED 2026-06-21 (session close):** the remaining P1 row + both P2 rows.
`backend/cli/sovereign_cli.js`'s `main()` now installs `process.stdin.on('error', ...)` before any
command dispatch; `commands/account/auth.js`'s `commandLogin`/`commandRegister` and
`commands/trade/trade_mt5.js`'s `commandAddPlatform`/`commandMt5Profile` wrap their `lib/auth.js`
prompt calls in try/catch. Verified: the underlying EventEmitter-crash mechanism reproduced directly
(`process.stdin.emit('error', ...)` with no listener throws and kills the process; with the guard
installed, it logs and the process continues) — this is the strongest available proof for a failure
mode that depends on a real transient stdin transport error, which can't be forced deterministically
in CI. Manual smoke: `SOVEREIGN_MOCK=true node backend/cli/sovereign_cli.js login` exits clean.
Full suite **555 tests / 553 pass / 0 fail / 2 skip**; `npm run hygiene` clean. Not done this
session (disclosed, not silently dropped): a literal interactive-keystroke PTY verification of
`login`/`register` in a real raw-mode terminal — this sandbox has no PTY/tmux (the same documented
constraint prior sessions hit verifying the Ink TUI), so the closest available proof is the
non-interactive repro test above plus the direct EventEmitter mechanism check.

##### Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| `lib/auth.js` `promptPassword` re-import | 2 files (`commands/account/auth.js`, `commands/trade/trade_mt5.js`) | Both already share the single fixed implementation in `lib/auth.js` — no further consolidation needed, just don't duplicate the P1 stdin-error fix per-caller. | — | done (no action) |

---

### Blast-Through Full Audit — 2026-06-19 session 41 (anchor e0cb6aa2 → 76fbe991, first formal Gate Table)

DCS start ≈0.96 (carried from last audit close) → end 0.92 (2 confirmed-reachable bugs fully diagnosed below; not a halt condition, the "degraded paths" the formula flags are exactly the rows in this table).

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P1 | ingest | `backend/scripts/data_ops/ingest_market_data/manifests.js:113` (age: pre-existing — confirmed byte-identical in commit `4e8cf240~1`, the monolith before this week's split; NOT a new regression) | `fetchEcbHistory(s, opts.historyDays)` is called but never defined or imported in `manifests.js` — throws `ReferenceError` if the FX provider chain falls through to `'ecb'` (priority 5 of 5 in `config/markets/data_sources.yaml:60`) with `--history-days` set. Real implementation exists and is exported: `shared/lib/providers/ecb.js:42`, reachable via the providers barrel (`shared/lib/providers/index.js:15,29` `...ecb`). | Add `fetchEcbHistory` (and `fetchEcbFx`) to the `require('../../../../shared/lib/providers')` destructure at the top of `manifests.js`; delete the two local 1-line stubs at lines 52 and the historyDays branch's bare call. | ingest C |
| P1 | ingest/research | `manifests.js:55-56` + `research_sources.js:240,253,257` (age: pre-existing, confirmed in `4e8cf240~1` too) | `fetchKalshiHistoricalMarkets`/`fetchKalshiHistoricalCandlesticks` always `return []`. No real Kalshi historical implementation exists anywhere in the repo. `research_sources.js`'s `loadPredictionMarketHistory` destructures `{ records }` off the `[]` result (`records` → `undefined`), then `sources.push(...records)` throws `TypeError: records is not iterable` — caught per-event by a surrounding try/catch and recorded as an opaque generic error, not "not implemented." **Confirmed live-reachable**, not dormant: `config/markets/data_sources.yaml:162` configures 4 real `prediction_market.events`. Every research/backtest command touching Kalshi prediction-market history has presumably never returned real data. | Either implement the real Kalshi historical fetchers, or make the stub return `{ records: [] }` (matching the caller's contract) and have callers report a clear `not_implemented` reason instead of crashing into a generic catch. | research/ingest C |
| P2 | ingest/TUI | `manifests.js:47-54` (8 more pre-existing `return {}` stubs: OpenSky, Blockchair×2, SEC holdings, S&P PMI, Yahoo breadth, + the `fxapi`/`ecb` FX-fallback pair) + `backend/cli/tui/manifest.js` ingest `--family` dropdown | `pmi`/`flight`/`crypto_tx`/`holdings`/`breadth` have **no config section at all** (dormant — the family loop never iterates real items); `onchain` is `enabled: false` in `config/markets/options_data.yaml` AND configured for different providers (`glassnode`/`cryptoquant`) than the Blockchair-named stub anyway. But the TUI's `ingest` command exposes all 6 directly in the user-facing `--family` select list — a user can pick "PMI" or "Onchain" expecting real data and get a silent no-op with no indication it was never implemented. `fxapi`/`ecb` are live (low-frequency) FX fallback-chain entries, see P1 row above for `ecb`. | Either remove the 6 unconfigured family ids from the TUI dropdown or label them clearly as not-yet-implemented; wire `fxapi`/`ecb` to real implementations. | ingest/TUI C |
| P3 | ingest | `index.js:1320` (`redactUrl`), `index.js:1324` (`loadExternalQuoteInputs`) | Each listed twice in the same `module.exports` literal — harmless (later key wins, no functional bug) but dead clutter from the FW2 extraction. | Remove the duplicate export lines. | ingest — trivial |
| P3 | data | `data.js:28`, `data_deep_backfill.js:9`, `data_rollup.js:8` | `DEFAULT_TS_DIR` independently defined 3× (identical expression) across the `data.js` decomposition instead of one export+import. No current behavioral risk — all 3 compute the same value — but a future edit to one copy could silently drift from the other two. | Define once in `data_rollup.js` (already exports it elsewhere); import in the other two instead of redefining. | data — minor centralization debt |
| P2 | trade / security-policy | `trade_polymarket.js:507` `submitPolymarketBuyOrder`/`commandPolymarket` (age: pre-existing — confirmed byte-identical in commit `37d54c47~1`, before this week's trade.js split; NOT a new regression) | Polymarket's live-order path is gated by `featureGate('polymarket')` + `canLiveExecute('polymarket')` — a deployment-mode/capability check (`shared/lib/brokers/capabilities.js:17`) — **not** by the `requireAuth(...)` + `SOVEREIGN_TRADE_PIN` per-session MFA challenge that gates the generic broker path (`trade.js:288,293-319`) and bot-live path (`trade.js:456`). Real inconsistency in safety-gate strength between brokers; this is a security-policy question for a human, not a bug to silently patch. | Reviewer decision: is `canLiveExecute` sufficient for Polymarket (e.g. its own client has external confirmation), or should `requireAuth`+PIN be added to `commandPolymarket` for parity? | trade — flagged for human review, not gated |

**Reviewer decision needed:** (1) ~~Kalshi historical fetchers~~ RESOLVED below; (2) ~~the 6 TUI-exposed but unconfigured ingest families~~ RESOLVED below (removed from the picker); (3) ~~Polymarket live-order MFA/PIN parity~~ RESOLVED below (gate added).
**Verification gate to clear:** all three rows below — DONE.

**RESOLVED 2026-06-19 (same session, commit `5ca738aa`):** both P1 rows above fixed. `manifests.js` now imports `fetchEcbFx`/`fetchEcbHistory` from the real `shared/lib/providers/ecb.js` (via the providers barrel) instead of the local stub; `fetchKalshiHistoricalMarkets()` now returns `{ records: [] }` instead of a bare `[]`, matching its only caller's destructuring contract. Verified via direct probe (real `fetchEcbFx` throws on an invalid pair instead of silently returning `{}`; the `ecb`+`historyDays` branch reaches the real `fetchEcbHistory` and fails for a real network/validation reason, not `ReferenceError`; Kalshi destructure+spread no longer throws) and the full suite (486/490 — the 4 new fails are `tui_terminal_automation.test.js`, confirmed unrelated: a concurrent in-progress Ink-TUI-refactor change to `sovereign_cli.js`'s entry point, not this fix).

**RESOLVED 2026-06-19 (same session, commit `91aafeef`):** the 2 P2 reviewer-decision rows. (1) Tracing `submitPolymarketBuyOrder`'s only call site confirmed it's worse than originally scoped: `commandPolymarket`'s `markets` sub-command reaches `runPolymarketMarketActionLoop` (via `promptPolymarketMarketBrowser`) **unconditionally** — not gated by `--live` at all, only by the `featureGate('polymarket')` opt-in flag — and places a real order off one `promptConfirm` y/n with zero authentication. Added the same `requireAuth()` + `SOVEREIGN_TRADE_PIN` challenge `trade.js`'s `--live` path requires for every other broker, gated once per browse session right before `promptPolymarketMarketBrowser()` is called (the sole entry point — confirmed via grep, no other caller exists). (2) Removed `pmi`/`breadth`/`onchain`/`flight`/`crypto_tx`/`holdings` from `tui/manifest.js`'s `ingest --family` dropdown (kept `macro_alt`/`sentiment`/`prediction_market`/`weather`/`reserves` — confirmed real implementations, not stubs). Verified: both modules load, `verifyPin` round-tripped (correct/wrong/null PIN), full suite 490/490 (TUI test flakiness from the concurrent Ink refactor resolved itself in the interim, unrelated to either fix).

Only remaining open items: `index.js:1320,1324` duplicate exports (P3, trivial) and `DEFAULT_TS_DIR` 3x redefinition (P3, see Centralization Backlog) — neither gating, both small enough to fold into routine cleanup whenever those files are next touched.

**Hygiene Sweep — clean.** ~36 duplicate JS basenames repo-wide, all resolved: the documented session-10/29 root-shim architecture (every `shared/lib/<X>.js` root file verified exactly 1 line, re-exporting `shared/lib/<category>/<X>.js` — `adapters/ai_client/ansi/backend_bridge/backfill/backtest/config_loader/crypto_aggregates/db_pruning/env/execution_memory/feature_builder/indicators/ingestion/macro_store/models/mt5_profiles/paths/persistence_bridge/polymarket_history/prop_firms/quote_router/rsi_backtest/run_loop`, plus a documented 2-layer chain `adapters.js → compat/adapters.js`), genuinely different domains coincidentally sharing a name (`shared/lib/brokers/common.js` = broker .env credential helpers vs `shared/lib/providers/common.js` = HTTP rate-limit/cached-fetch helpers — read both, confirmed unrelated), or frozen `docs/archive/legacy_ui/`. No new dead files, no divergent forks.

**Security Surface Scan — clean.** No `eval`/`new Function` in production code. The only non-literal `require(variable)` calls are in test harnesses (fixture stubbing), none in production. No hardcoded secrets matched by pattern scan. The one `execSync` call (`shared/lib/runtime/paths.js:91`, inside `which(cmd)`) only ever receives hardcoded system-binary names from an internal candidate list — not reachable from user/network input.

**Surface Parity (manifest↔handler) — spot-checked, no drift.** A naive id-diff between `tui/manifest.js` and `sovereign_cli.js`'s handler map produces ~30 false positives because the TUI manifest mixes pure-navigation/sub-action ids (`timezone`, `integrity`, etc., routed via `prefix:` sub-dispatch or internal `sub === '...'` branches) with top-level CLI-dispatching ids. Spot-verified 2 samples (`integrity`→`backend` prefix-dispatch, `timezone`→`commandSettings` sub-action) — both resolve correctly. Not re-flagging the rest without a smarter check.

**FW2 decomposition quality (Tier 1, this week's commits) — extraction itself is clean.** Agent-reviewed + spot-verified the highest-stakes claims directly: no stale duplicate function bodies left in any parent file, no broken/circular requires beyond the already-documented lazy-require pattern (`manifests.js`/`snapshot_fetchers.js`/`prediction.js` lazy-`require('./index.js')` to avoid load-time cycles), no NEW silent stubs introduced by the splits — every stub/bug found above pre-dates this week, confirmed via `git show <commit>~1` diffing against the pre-extraction monolith.

##### Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| `DEFAULT_TS_DIR` redefinition | 3 files (`data.js`, `data_deep_backfill.js`, `data_rollup.js`) | export once from `data_rollup.js`, import elsewhere | S | data B→A |

---

### Blast-Through Focused Audit — 2026-06-14 session 30 (anchor 51b20b6c → d95b92a7)

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P1 | data-depth | `storage/data/ts/*_{30m,4h}.bin` (introduced by rollup commit `217d21e5`, age <1d) | 30m + 4h intraday bins stale/shallow — BTCUSDT 5m=926,357 (2017→2026) & 15m=37,898, but 30m=1,440 / 4h=180 (only 2026-05-11→06-10); AAPL 30m=777 / 4h=859 (end 06-09). The session-29 catch-up rollup refreshed 15m+1h but not 30m+4h. **Code is correct** (`ROLLUP_TARGET_TFS=['15m','30m','1h','4h']`; dry-run confirms intent). | Run `intraday-rollup --family crypto` + `--family equities` (local, idempotent, ~seconds). Verify 30m/4h counts jump to match 5m depth. | data layer B (open); gap is data-state not code |
| P2 | config | `config/markets/asset_mapping.json` (dead since reorg) | Divergent dead duplicate of `config/asset_mapping.json`. Zero readers across js/cpp/hpp/ts/yaml; production reads the root copy (`backend/cli/tui/manifest.js:31`). Diverges in content + keys (`FX` vs `Forex`; `Crypto:[BTC,USDT,ETH]` vs full 21-symbol universe) → edit-wrong-file trap. | Delete `config/markets/asset_mapping.json` (or add a byte-equality contract test if the second copy is intentional). | config C — GATED until removed |

**Reviewer decision needed:** (1) confirm OK to run the catch-up `intraday-rollup` (writes 30m/4h bins);
(2) confirm the `config/markets/asset_mapping.json` stub is dead and can be deleted.
**Verification gate to clear:** post-rollup `readTsIndex` shows 30m/4h spanning the same range as 5m; full suite still green after stub deletion.

##### Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| ~~ANSI import spelling drift~~ — RESOLVED 2026-06-08 (commit `4d3fb4d`): `auth.js` now imports `shared/lib/ansi` (matches `settings.js`, same shim target) | was 4 files, outlier fixed | — | S | done |

Noted, not flagged: `parseArgs(argv)` in `scripts/strategies/ml_smoke_alpaca.js` and `ml_smoke_polymarket.js` share a ~6-line arg-loop shape. Only 2 files, each parses different flag sets (`--qty` vs none, `--dry` shared) — below the 3-file drift threshold and a shared helper would be more code than the duplication. No action needed.

---

### P0 — `runGatewayCommand` throws on every call (`shared/lib/runtime/backend_bridge.js:72`)
- `require.resolve('../../backend/gateway/src/index.ts')` resolves relative to
  `shared/lib/runtime/` → `shared/backend/gateway/...` which does not exist. The function throws
  before reaching the correct `path.join(REPO_ROOT, ...)` two lines below. Proven live:
  `node -e "...runGatewayCommand(['balance','--json'])"` → `Cannot find module`.
- Blast radius: `trade.js` migrated 5 functions onto it — `fetchPolymarketOrderbookSnapshot`,
  `fetchPolymarketPriceHistorySnapshot`, `submitPolymarketBuyOrder` (**live order path**),
  `fetchBalance`, `fetchAggregatePortfolio`. All dead in this tree.
- Test evidence: NEW failures in `polymarket_preflight.test.js` (buy --preflight),
  `proposed_orders_cli.test.js` (trade process preview), `polymarket_auth_health.test.js`
  (CLI exits 1, expected 0).
- **Reviewer decision**: fix = delete the dead `require.resolve` line (keep the `path.join`),
  AND decide launcher parity — old `buildTradeGatewayLaunch` had a ts-node bootstrap fallback
  (`backend/cli/lib/run_trade_gateway.js`, treated as supported infra per 2026-06-05 note);
  `findNodeCli()` must cover the same matrix or machines without tsx regress.
- **Gate**: the 3 named test files green + a live `sovereign trade balance` smoke.

### P0 — 7 NEW failing test files (suite 12✖ vs 6✖ baseline)
| Test file | Failure | Caused by |
|---|---|---|
| `polymarket_preflight.test.js` | buy --preflight | runGatewayCommand bug |
| `proposed_orders_cli.test.js` | trade process preview | runGatewayCommand bug |
| `polymarket_auth_health.test.js` | exit 1 ≠ 0 | runGatewayCommand bug |
| `lib/indicators.data_flow.test.js` | "Volatility should be positive in real market" | manifest-driven `featureFromWindow` |
| `polymarket_errors.test.js` | redactHeaderMap contract | expanded redaction set not reconciled with test |
| `sovereign_cli_human_surfaces.test.js` | integrity render contract | `tools/backend.js` tf:count format change |
| `sovereign_cli_price_action.test.js` | divergence assertions | indicators/feature change (shares root with data_flow) |
- Pre-existing (unchanged): cli_ui_contract ×2, notebooks_contract, supabase_route_contract,
  crypto_aggregates, tui_search_contract (`commands/backend` shim path).
- **Gate**: suite back to ≤6✖ (baseline) before commit; each contract either fixed in code or
  deliberately updated in the test with a note.

### P0 — tracked code depends on untracked files (drift class, 4th occurrence)
- `backend/cli/lib/utils.js:482` → `shared/lib/market/symbol_resolver.js` (untracked). A
  `git clean -fd` or fresh clone kills the whole CLI at load.
- `shared/lib/providers/index.js` → `./ecb.js` (untracked) — central provider barrel; same blast.
- `shared/lib/market/indicators.js` → `config/system/indicator_manifest.yaml` (untracked dir,
  6 files incl. `feature_flags.yaml`, `app_config.yaml`, `tools.yaml`) — silent fallback if
  absent, but then features differ between machines: train/serve skew vector for ML.
- Also untracked but load-bearing-adjacent: `storage/models/*.onnx` now UN-ignored (the
  `.gitignore` edit removed the `models/*.onnx` rule — direction matches the standing "commit
  the binaries" option) but still uncommitted; `backend/cli/commands/research/{backtest,
  optimize_indicators}.js` (wiring unverified).
- **Reviewer decision**: commit these with the feature work or the branch is self-breaking.

### P1 — `executeSovereignCommand` default 30s timeout (`backend_bridge.js:19`)
- Old `runBackendCommand` had NO timeout; new default kills any spawn >30s. Known long ops:
  frame backtests via `shared/lib/strategy/backtest.js:979,1033` (bridge callers), 47×47
  correlation historically 95s (currently safe only because `tools/backend.js:433` still uses
  its own LOCAL `runBackendCommand` copy). **Decision**: make timeout opt-in (or ≥120s default)
  before migrating any more callers onto the bridge.

### P1 — smart JSON extraction forces `ok: true` (`backend_bridge.js:48`)
- `{ ok: true, ...payload, code }`: payload without an `ok` field is reported ok even when the
  process exited non-zero; and `code: result.status` clobbers any `code` field in the payload.
  **Decision**: gate `ok` on `result.status === 0 && payload.ok !== false`; rename the exit-code
  field (`exit_code`).

### P1 — indicators manifest engine swallows all errors (`indicators.js applyManifestIndicator`)
- Every indicator failure → silent `{}`; when the manifest loads, the legacy feature set is
  entirely replaced (early return), so a bad manifest silently changes the ML feature contract.
  Failing test proves a live mismatch (volatility not positive). **Decision**: surface per-
  indicator errors (warn + count), add a key-parity contract test (manifest output keys ==
  legacy keys for the default manifest). This is the serving side of the ML skew gate.

### P1 — `research.js loadHistoricalSources` filter strictened (line ~319)
- Candle filter went from `(tf || '1d' || 'point' || untagged)` to strict `=== tf`. Backtests
  requesting a timeframe with only 1d/macro('point') records now silently get zero candles
  where they previously fell back. **Decision**: confirm intended for OHLCV, and verify macro
  ('point') consumers — correlation-with-CPI paths — still resolve.

### P2 — answers to the inline `//dev review` questions left in `quote_router.js`
- "higher=worse or higher=better?" — **higher = better.** `selectPreferredQuoteRecords` sorts by
  `rank*1e9 + count*1000 + quality*10 + volume` descending; `DEFAULT_PROVIDER_PRIORITY` rank is
  the dominant term. The edit (coinbase 80→85, polygon 86→80) therefore promotes coinbase ABOVE
  binance (82) and polygon for crypto quotes — note coinbase has documented geo-fragility (451s,
  2026-06-06 sessions). Reconsider or document.
- "per symbol or per router?" — **per symbol-timeframe group** (`groupQuoteRecords` →
  selection per key), so per-symbol fallback exists; "mostly YF in cache" just means Yahoo won
  rank for those symbols/timeframes (or was the only fetcher that succeeded).
- Hardcoded crypto list in `inferFamily` — real but pre-existing; candidate to derive from
  `data_sources.yaml` universe. Backlog, not a regression.

### P2 — smaller flags
- `polymarket_history.js:95` — `'1wk': 86400*30` is a WEEKLY key with a MONTHLY (30-day)
  fidelity, and the key style (`1wk`) mismatches the `1w` used elsewhere. Likely typo.
- `.gitignore` — blanket `*.jsonl` would prevent ever tracking paper-trading ledgers
  (`fills.jsonl`, `resolved_positions.jsonl`); duplicate lines (`repo_tree.txt`,
  `strucure_report.txt` twice); root `.graphify_*.json` artifacts remain unignored.
  `backend/cli/target/` ignore (old carryover) IS now added — good.
- `validation.js` — comment placeholder only; `FRESHNESS_RULES_MS` has no `1w`/`1mo` entries,
  so new-timeframe staleness uses fallback behavior. Add rules.
- Ingest derive-before-fetch ordering: 1w/1mo are aggregated from the PRE-refresh 1d cache in
  the same run that then refreshes 1d — derived bars lag one cycle.
- `data.js` mass-backfill defaults: 365→7300 days, concurrency 5→10 (user-annotated "dev
  suggest"). Rate-limit exposure on free tiers (Yahoo/CoinGecko); deliberate choice to confirm.
- `trade.js:400` mid-file `require` + unused `executeSovereignCommand` import.

### Verified-good in the same tree (credit where due)
- `binance.js` pagination (1000-bar cap bypass, MAX_CALLS 20, no-overlap paging) — clean logic;
  live evidence: BTCUSDT ts index now 1w=464 bars (2017-07-20→2026-06-04), 1mo=109 bars — the
  DEV_COMMENTS "4 → 464 bars" claim is REAL.
- `deriveHighTfFromLocalDaily` local aggregation — `TS_INDEX_PATH`/`aggregateCandles` both
  defined in-module; syntax-clean; works per ts-index evidence above.
- `polymarket_errors.js` expanded redaction — right direction, just reconcile its contract test.
- All 19 modified JS files pass `node --check`.

## Centralization Backlog (2026-06-11 additions)

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| Gateway launch path (2 impls, 1 broken) | trade.js `buildTradeGatewayLaunch` (5 call sites) + bridge `runGatewayCommand` (5 migrated fns) | fix bridge, then migrate remaining 5 sites, delete local launcher | M | trade D→B |
| `runBackendCommand` duplicate | `tools/backend.js:433` local copy (8 call sites) + `backend_bridge.js:59` | migrate onto bridge AFTER timeout default fixed | M | tools C→B |
| JSON-from-stdout extraction | bridge smart-extract + `trade.js parseGatewayJsonOutput` | one `parseJsonPayload` util in bridge | S | — |

### Deep Blast-Through - 2026-06-11 live dirty-tree audit

Scope: hard-reading audit of the current `feat/ml-onnx-section` worktree after graph refresh.
The graph was rebuilt from `6eea7b77` to 9205 nodes / 14200 edges / 730 communities. Runtime
verification is strong locally, but repository reproducibility is not clean because several
tracked files depend on local-only or ignored files.

### P0 - tracked C++ build depends on untracked `frame_backtester` sources
- `backend/core/CMakeLists.txt:94` includes `src/backtest/frame_backtester.cpp`.
- `backend/core/src/main.cpp:7` includes `backtest/frame_backtester.hpp` and calls
  `FrameBacktester` at `main.cpp:700`, `main.cpp:715`, and `main.cpp:797`.
- `git ls-files backend/core/src/backtest/frame_backtester.cpp backend/core/src/backtest/frame_backtester.hpp`
  returns no tracked files. A clean clone has tracked references to files that are absent.
- Local verification is green only because the untracked files exist in this checkout.
  `cmake --build backend/core/build --config Release --target sovereign_wealth` builds after
  cleaning this shell's duplicate `Path`/`PATH` environment key. The first build attempt failed
  before compilation with MSBuild `Item has already been added. Key in dictionary: 'Path'`.
- Required fix: either track `frame_backtester.{cpp,hpp}` with the C++ work or remove the tracked
  references. Do not treat the current native build as clone-safe until this is closed.

### P0 - full test suite is green locally but relies on untracked/ignored test assets
- `tests/scripts/strategy_asset_classification.test.js:7` executes
  `scripts/classify_strategy_assets.js`, but that script is untracked.
- `workspace/FEATURE_TEST_MATRIX.md:9` and `workspace/FEATURE_REPAIR_PLAN.md:37` use
  `scripts/mcp_stdio_probe.js` as the MCP proof command, but that script is untracked.
- `workspace/FEATURE_TEST_MATRIX.md:16` and `workspace/FEATURE_REPAIR_PLAN.md:44` list
  `backend/api/tests/correlation_contract.test.js`, but that test file is untracked.
- `tests/scripts/notebooks_contract.test.js:7-27` asserts notebooks exist and are parseable.
  `.gitignore:125` ignores `notebooks/*.ipynb`, and `git ls-files notebooks/*.ipynb` returns
  nothing. The local notebooks make the suite pass; a clean clone would not have them.
- Required fix: decide which of these are source/test fixtures and track them, or rewrite the
  contracts so local-only artifacts are skipped or generated before test execution.

### P1 - repo-local skill inventory should stay trimmed to the three umbrella skills
- `GEMINI.md:11` now points at `skills/gemini/SKILL.md`, which matches the live repo-local bootstrap path.
- The repo-local skill tree has been reduced to `codex`, `claude`, and `gemini` only; the older secondary skill directories were removed from both `skills/` and `.agents/skills/`.
- Impact: bootstrap and blast-through behavior should rely on the three umbrella skills plus handoff files, not a fragmented skill set.
- Required fix: keep the docs and bootstrap paths pinned to the three umbrella skills only.

### P1 - Docker context hygiene is untracked while Dockerfile remains a blocked carryover
- `.dockerignore` is untracked. It excludes `.env*`, cache, build outputs, notebooks, workspace
  state, and generated data from Docker build context, but a clean clone would not have that
  protection.
- `infra/docker/Dockerfile` still has the deliberate uncommitted ONNX flag edit:
  `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON`. This remains blocked on Docker Desktop verification per
  the existing handoff.
- Required fix: track `.dockerignore` if Docker build hygiene is considered part of the repo, and
  keep the Dockerfile edit uncommitted until the container rebuild plus in-container `ml compare`
  proves `onnx_runtime`.

### P2 - real provider/data gaps remain behind green no-spend tests
- `backend/scripts/data_ops/ingest_market_data/index.js:1162-1167` still returns empty objects for
  OpenSky, Blockchair, SEC holdings, SP Global PMI, and ECB FX fetchers. Their registry entries
  are wired at `index.js:1269-1299`, so the seam is active but provider extraction is incomplete.
- `shared/lib/providers/tradingview.js:78` still explicitly says the screener search is stubbed.
- These are not breaking current tests because the no-spend verification suite focuses configured
  cache health and mocked provider contracts. They are product-scope gaps, not runtime regressions.

### P2 - stale developer-review comments remain in active C++ ML code
- `backend/core/src/ml/cnn_inference.cpp:61`, `backend/core/src/ml/model_registry.cpp:52`, and
  `backend/core/src/ml/onnx_model.cpp:18` still contain `dev review` comments in active source.
- These do not break compile or tests, but they keep the ML section below an A cleanliness grade
  because the comments are unresolved design questions in production code.

### Verified good in this audit
- `graphify update .` succeeded: 9205 nodes, 14200 edges, 730 communities.
- Modified JS syntax checks passed for API executor, status, trade, asset picker, ingestion, and
  user settings.
- Focused no-spend gates passed:
  - CLI/settings/TUI/status bundle: 25/25.
  - API/correlation/dashboard bundle: 4/4.
  - Macro/reserves ingest contract: 2/2.
  - Gateway no-spend contract bundle: 30/30.
  - Strategy/prop-firm/backtest bundle: 22/22.
  - MCP stdio probe: 17 tools listed.
  - CLI/module-loading bundle: 16/16.
- Full `npm.cmd test` passed: 269/269.
- Native C++ target built locally after the duplicate environment key workaround:
  `sovereign_core.lib` and `sovereign_wealth.exe`.
- `status --json` reports `cache_mode:"recovered_live"`, 293 usable records, 0 stale records.
- `backend integrity --json` remains policy-green: 84/84 cached, 0 missing, 0 stale, only
  `RNDRUSDT` as the active exception.

### Section grades from this pass
| Section | Grade | Reason |
|---|---:|---|
| CLI/TUI/status/settings | B+ | Runtime tests green; current feature work is covered, but dirty-tree docs/tests depend on untracked artifacts. |
| API/Web contracts | B+ | API correlation fallback tests pass; new correlation contract is untracked. |
| C++ core | C | Local build passes; tracked source graph depends on untracked frame backtester files. |
| Data/ingestion | B- | Status/integrity green; scoped snapshot handling works; provider stubs remain. |
| Gateway/Polymarket | B | No-spend tests green; live spend still intentionally unverified. |
| Infra/Docker | C | ONNX flag edit still unverified; `.dockerignore` is untracked. |
| Repo workflow/skills | C- | Instructions advertise skill files that are empty or absent in the live repo. |
| Docs/workspace truth | B- | Current ledgers are useful, but some proof commands name untracked files. |

### Next cleanup move
Close clean-clone reproducibility before any broad commit: track or deliberately demote
`frame_backtester.{cpp,hpp}`, `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`,
`backend/api/tests/correlation_contract.test.js`, and the notebook fixtures/contracts. Then rerun
`npm.cmd test` and the native C++ build from a clean clone or temporary export.

### Gap Closure Plan - 2026-06-11
- Durable plan: `workspace/DEEP_BLAST_GAP_CLOSURE_PLAN.md`.
- Recommended order: clean-clone reproducibility first, notebook/research contract second, repo
  protocol/skill truth third, then Docker ONNX verification, provider extraction, and C++ ML review
  cleanup.
- Key planning decision: do not bulk commit local research/data state. Track load-bearing source and
  proof assets, keep heavyweight `.ipynb` and generated `storage/data/*` outputs local, and replace
  tests that require ignored artifacts with tracked fixtures or manifests.

### Update - 2026-06-11 mass-implement clean-clone repair batch
- Implemented the Phase 1 and minimal Phase 2 reproducibility slice:
  - staged `.dockerignore`
  - staged `backend/core/src/backtest/frame_backtester.{cpp,hpp}`
  - staged `scripts/classify_strategy_assets.js`
  - staged `scripts/mcp_stdio_probe.js`
  - staged `backend/api/tests/correlation_contract.test.js`
  - staged `notebooks/signal_library.json`
  - added tracked notebook fixtures under `tests/fixtures/notebooks/`
  - rewired `test:api`, expanded `structure_contract.test.js`, and rewrote
    `notebooks_contract.test.js` to validate tracked fixtures instead of ignored live notebooks
- Verification:
  - `npm.cmd run test:structure` pass
  - `npm.cmd run test:api` pass
  - `node --test tests/scripts/notebooks_contract.test.js` pass
  - `node -e` RSI library probe: `35` actionable signals from tracked `notebooks/signal_library.json`
  - `cmake --build backend/core/build --config Release --target sovereign_wealth` pass
  - `npm.cmd test` pass `272/272`
- Additional blocker found during verification and fixed inline:
  - TUI boot was refreshing Supabase auth on menu startup, which made
    `tests/scripts/tui_terminal_automation.test.js` fail under network-restricted conditions.
  - Fix: `backend/cli/sovereign_cli.js` now reads auth locally only during TUI boot via
    `getAuthenticatedUser({ refreshExpired: false })`; explicit auth flows still refresh normally.
- Remaining nuance: this closes the reproducibility gap in the current staged index, but a true
  clean-clone proof still needs commit or clean-worktree/export verification.

### Findings (reviewer decisions required)

| # | Severity | File:Line | Finding | Required decision / gate |
|---|---|---|---|---|
| 1 | High | backend/api/app.js:128 + server/routes/system/kill_switch.js:6 | Unauthenticated GET /api/kill-switch?command=<engage|release|status> reaches the C++ kill switch -- state-changing safety control on the exposed web port. Route is in neither the public list nor PROTECTED_GET_ROUTES. | Add /api/kill-switch to PROTECTED_GET_ROUTES (one line) or make engage/release POST-only. Fold into roadmap item 5 (login barrier). Gate: app.js stays GATED until landed. |
| 2 | High | backend/gateway/src/index.ts:723-748 | ExecutionGateway.execute() swallows live order failures: logs to stderr, sets status FAILED, exits 0. Bridge then reports ok:true (proven live: 422 probes returned ok:true + status failed). Callers cannot distinguish success from failure. | Decide envelope: non-zero exit on failed execution vs ok:false JSON. Then update bridge consumers. |
| 3 | High (live path) | backend/gateway/src/cycle.ts:207-227, 405-437 | FOK intent silently lost: timeInForce:'FOK' is not a UserOrder field; postOrder(signed) defaults GTC. Unmatched GTC sells REST on the book while code treats them as failed and keeps the position -> dangling live orders + duplicate-sell stacking on retry. Pre-existing; relevant before any liveTrading enable. | Use postOrder(signed, OrderType.FAK) or createAndPostMarketOrder(FOK), cancel on unmatched. BLOCKS liveTrading enablement. |
| 4 | Medium | backend/gateway/src (classifyPolymarketGatewayError) | CLOB business rejections (e.g. the V2 "invalid order version") classified as invalid_token with misleading suggestion. | Add explicit categories for CLOB 400-with-error-body rejections. |
| 5 | Medium | backend/gateway/src/index.ts:2267-2269 | polymarket derive-creds prints L2 API secret/passphrase plaintext to stdout (by design for setup; lands in any captured log). | Confirm by-design or add --reveal flag + masked default. |
| 6 | Low | backend/gateway/src (bot health) | pUSD balance printed in micro-units ("9305985.00 pUSD"). | Divide by 1e6 in display. |
| 7 | Note | bot cycle engine | Top dry-run pick was a past-deadline market at 78.9% claimed edge (resolution-lag trap). | Candidate filter needs endDate/liquidity guards before liveTrading. |

### Centralization Backlog (additions)

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| ~~Raw fetch without transport retry~~ — MOSTLY RESOLVED 2026-06-12 (`6875f1fa`), re-verified 2026-06-21 session 52: `shared/lib/runtime/fetch_retry.js` exists and is used in `index.ts`/`cycle.ts`. 3 call sites still raw: `cycle.ts:69` (`fetchAiBets`), `cycle.ts:123` (bot-health check), `market.ts:17` (`fetchTradingInfo`) | 3 remaining sites (was "3+ files", now narrowed to exactly 3 named lines) | wire the already-imported `fetchWithRetry` into the 3 named call sites | S | gateway error-handling B+ (was B, not yet A) |
| ~~submitPolymarketOrder / preflightPolymarketOrder ~80% duplicated~~ — RESOLVED 2026-06-12 (`6875f1fa`), re-verified 2026-06-21 session 52: both delegate to `_polymarketOrderCore` (`index.ts:1844`) | — | — | — | done |
| Hand-rolled L2 HMAC headers in clob_factory authedGet — re-verified 2026-06-21 session 52: still hand-rolled, but `6875f1fa`'s commit message records this was a deliberate, considered decision ("aborted per spec gate" — the SDK helper needs a `ClobSigner`+WebCrypto and drops headers this gateway relies on), not an oversight | clob_factory.ts vs clob-client-v2 createL2Headers/updateBalanceAllowance exports | keep as-is; revisit only if the SDK helper gains the missing header support | S | drift containment — accepted, not actionable |
| (carryover, user-deprioritized) trade.js 5 launcher call sites + tools/backend.js local runBackendCommand | 2 files | bridge | M | unchanged |

### Orphans / parity
- Orphan: AlpacaAdapter.placeBracketOrder (index.ts:568) -- no caller anywhere (below >3 threshold; note only).
- Parity nit: bot unknown-subcommand error lists "cycle, status, run, sell, config" but omits implemented "health".

### Resolved this pass
- app.js GET-auth question (carried since 2026-06-06): design is public-read + token-write + PROTECTED_GET_ROUTES; verified sound EXCEPT finding #1. /api/supabase/config exposes URL only (no keys) -- acceptable.
- Stub scan: no new stubs on reachable paths. Dev-marker scan: gateway src clean (0 markers).

#### C++ backend verification (roadmap item 6) - findings

Verdict: core engines REAL and healthy; test harness has fixture-path debt.

| # | Severity | Finding | Decision needed |
|---|---|---|---|
| 1 | Evidence | ml compare reproduces the Phase-3 parity numbers EXACTLY (xgboost 0.666376 {7061,1275,11144}, logistic 0.468378, regime 0.456982; backend onnx_runtime, 19,480 rows). Correlation + risk engines respond correctly. | none -- strongest possible health proof |
| 2 | Low | C++ `indicators` default --input is the pre-partition monolith path (main.cpp:522, storage/data/cache/backtest_history.json -- gone). Works with explicit --input; API route serves indicators via Node CLI anyway. | S fix: default to equities partition or require --input |
| 3 | Medium | ctest 27/29: ingestion_adapter_test fails (looks for config/data_sources.yaml relative to build dir; real file = repo-root config/markets/data_sources.yaml) and kronos_integration_test fails (needs >=4 empirical data points, fixture absent). Fixture/CWD debt, NOT logic failures. | S fix: resolve config path from repo root / ship fixture; then STATE.md 29/29 claim true again |
| 4 | Note | STATE.md "All 29/29 C++ core tests passing" is STALE (currently 27/29). Also carryover: core test mains are assert-only -> no-ops under Release NDEBUG; green Release ctest is weak evidence. Behavioral anchors (finding #1) are the real gate. | run ctest in Debug config when fixing #3 |

### Resolved in this pass

| Severity | Classification | File:Line | Finding | Resolution / evidence |
|---|---|---|---|---|
| High | production | `shared/lib/market/validation.js:620`, `shared/lib/market/validation.js:718` | `writeTsIndex` still used a fixed `<bin>.tmp` path for every process. Session 25 already proved two separate deep-backfill processes can race the shared temp name and crash with EPERM. | Replaced fixed temp paths with process-unique atomic temp paths for bin and meta writes. Added `tests/scripts/tests/backfill_regression.test.js:128` to prove an existing `BTCUSDT_1d.bin.tmp` from another writer is not overwritten. Gates: `node --check shared/lib/market/validation.js`, focused backfill test, `npm.cmd run test:data`, `npm.cmd run test:structure`, and full `npm.cmd test` all passed. |
| High | production | `backend/scripts/data_ops/ingest_market_data/index.js:2009` | Crypto native subdaily provider routing bug where Coinbase still called Binance base fetcher. | Fixed to route to `fetchCoinbaseBaseCandles` if provider is `coinbase`. Added unit test in `tests/scripts/tests/crypto_5m_backfill.test.js`. All tests passed. |
| Medium | runtime-artifact | `storage/data/backtests/latest_backtest.json`, `storage/data/strategy_grade_index.json` | Runtime report JSON was tracked in Git and caused constant git status noise. | Untracked both files via `git rm --cached` and added them to `.gitignore`. |
| Low | production | `backend/core/src/ml/cnn_inference.cpp:61`, `backend/core/src/ml/model_registry.cpp:52`, `backend/core/src/ml/onnx_model.cpp:18` | Active C++ ML source files contained legacy inline `dev review`/IDE comments. | Purged the comments from all three C++ source files and verified the release build compiles. |
| P1 | production | `backend/cli/commands/research/ml.js:66`, `shared/lib/ml/dataset.js:169` | ML dataset builder lacked caps for intraday (5m) timeframes, risking O(n^2) memory/time blowup. | Implemented `--max-bars-per-symbol` and added a default 50,000 bar cap for intraday timeframes. Verified via new unit test in `ml_dataset.test.js`. |
| P1 | production | `shared/lib/strategy/backtest.js:286`, `772`, `778` | Backtest annualization assumed 24/7 for equities and lacked session-gap checks (overnight/weekends). | Implemented active session periodsPerYear for equities (252 days * 6.5 hours) and calendar date session-gap guards. All tests passed. |
| P2 | git-config | `data/skills/` | Stale broken symbolic directory junctions caused `warning: could not open directory` in git status. | Cleaned up all broken symlinks under `data/skills/` using PowerShell, resolving the warnings completely. |

### Active findings

| Severity | Classification | File / surface | Finding | Required next move |
|---|---|---|---|---|
| High | production/runtime-data | `backend integrity --json`, `storage/data/ts` | Current configured-cache integrity is red despite `status --json` being green. Fresh run: `ok:false`, `92/92 cached`, `0 missing`, `total_stale:3`, `total_exceptions:1`; stale symbols are `GBPUSD`, `USDJPY`, and `AUDUSD` on `1d`. `status --json` still reports last-fetch snapshot quality `ok`, so the health split is working, but the Phase-9 data posture is not fully green. | Refresh or repair FX daily cache, then rerun `backend integrity --json`. If provider data remains stale, record explicit exceptions with rationale instead of leaving integrity red. |
| Medium | production | `shared/lib/providers/tradingview.js:78` | TradingView screener search remains explicitly stubbed. Tests can stay green because this is outside the mocked no-network suite, but the provider surface is not a complete live implementation. | Either implement metadata discovery or mark the command/provider as research-only/partial in the user-facing surface. |

### Verified good

- Clean-clone gap from 2026-06-11 is closed under the current structure contract: tracked `frame_backtester.{cpp,hpp}`, `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`, `backend/api/tests/correlation_contract.test.js`, `.dockerignore`, notebook fixture set, and `notebooks/signal_library.json`.
- `graphify update .` refreshed graph context to `9635` nodes / `14796` edges / `747` communities, built from `973656a9`.
- Verification after the FW1 fix: `npm.cmd test` passed `431/431`.

### Remaining findings and fix plan

| Priority | Area | File / surface | Finding | Fix plan |
|---|---|---|---|---|
| P1 | Logic correctness | `backend/cli/commands/data/data.js:923`, `backend/cli/commands/data/data.js:1068`, `backend/cli/commands/data/data.js:1317` | Deep 5m commands mark a symbol OK when `fiveMBars.length > 0 || snapErrors.length === 0`. A silent empty provider response can report success with zero bars. Existing tests only cover zero bars with explicit errors. | Treat explicit backfill jobs as failed on zero target-timeframe bars unless the symbol is intentionally skipped/unsupported. Add crypto, equity, and five-min accumulate tests for zero bars with no errors. |
| P1 | Runtime algorithm | `shared/lib/data/backfill.js:61`, `shared/lib/data/backfill.js:71`, `shared/lib/data/backfill.js:77` | `fetchPaginated` always walks the full requested window backward from the requested end. It does not inspect existing ts-index coverage, so resume/backfill work refetches already-covered history instead of fetching only missing windows. | Add a gap planner that reads existing symbol/timeframe coverage, emits missing windows, and fetches only gaps plus a small forward-refresh window. Keep full-window mode available for forced rebuilds. |
| P1 | Runtime algorithm | `backend/cli/commands/data/data.js:453`, `backend/cli/commands/data/data.js:567` | `mass-backfill` accumulates all records across all jobs, then writes one large merged ts-index snapshot. This is memory-heavy and O(all history) at the end of every large run. | Persist per job or per symbol/timeframe incrementally, retain only counters/errors in memory, and make resumability explicit. |
| P2 | UI | `backend/cli/tui/manifest.js:164`, `backend/cli/tui/manifest.js:170`, `backend/cli/tui/manifest.js:176`, `backend/cli/tui/manifest.js:182` | TUI exposes dry-run defaults, but not estimated runtime, provider entitlement/cap warnings, current integrity state, or "serialize large backfills" guidance. FW3 15m/30m/1h/4h native-poll is not exposed because it is not implemented yet. | Add preflight summary metadata for long-running data commands, including estimated calls/windows, provider, dry-run/execute distinction, and integrity warnings. Add FW3 command once implemented. |
| P2 | Structure | `backend/scripts/data_ops/ingest_market_data/index.js` | Data ingestion remains a 1,982-line monolith spanning provider routing, derivation, quality filtering, persistence, and CLI orchestration. | Split by provider family and persistence boundary: crypto/equity-index/commodity/fx snapshot modules, `persist_snapshot`, and a thin orchestrator. Preserve current tests during extraction. |

### Verification from this pass

- `node --test tests/scripts/tests/crypto_5m_backfill.test.js tests/scripts/tests/equity_5m_backfill.test.js tests/scripts/tests/five_min_accumulate.test.js tests/scripts/tests/ml_dataset.test.js tests/scripts/strategy_backtest_contract.test.js` passed `56/56`.
- `node --test tests/scripts/tui_terminal_automation.test.js` passed `6/6`.
- The green tests cover current happy paths and explicit-error paths, but not the new silent-zero, Coinbase-routing, session-gap, intraday-cap, or gap-resume cases listed above.

---

## Blast-Through Audit — 2026-06-13 session 29 (Claude orchestrator)

Focused audit of the sessions 26-28 merge to `main` (commits `e232c4b5..51b20b6c`): FW3 intraday,
P3 equity session guard, P4 ML 5m cap, config alias. DCS 0.97. Suite baseline 438/438 (carried).

### P1 — P3 equity session guard is implemented but INERT (never called on any consumer path)
- `shared/lib/market/equity_session.js` `filterEquitySessionGaps` is correct and unit-tested (6/6),
  but `shared/lib/strategy/backtest.js` only **imports it (line 14) and re-exports it (line 1073)** —
  `runBacktest` / `filterFeatureFrame` never invoke it, and the ML dataset builder
  (`shared/lib/ml/dataset.js`) does not call it either. Grep proof: the only non-test references are
  the import + the re-export.
- **Impact:** the standing carryover "equity 5m session-gap guard BEFORE indicator/backtest
  consumption" is **NOT closed**. STATE.md / SESSION_MEMORY / handoff say "guard implemented (6 tests)"
  which overstates — the helper exists, the guard does not run. Equity intraday bars still reach
  indicators/backtests un-filtered.
- **Reviewer decision:** wire `filterEquitySessionGaps` into the equity branch of
  `filterFeatureFrame`/`runBacktest` (and/or the ml dump loader) gated on family=equities/indices +
  sub-daily timeframe, OR explicitly downgrade the docs to "helper available, integration pending."
- **Gate:** a backtest/feature-frame test that feeds pre/post-market equity bars and asserts they are
  dropped by the real consumer path (not the helper in isolation).

### P2 — `intraday_yahoo.js` fetch/records/aggregate functions are dead exports (test-only)
- `fetchYahooIntradayBars`, `candlesToRecords`, `aggregate1hTo4h` are referenced ONLY by
  `tests/scripts/tests/intraday_native_poll.test.js`. The production command `commandIntradayAccumulate`
  routes through `ingestMarketData({provider:'yahoo'})` → the pre-existing
  `selectYahooBase`→`fetchYahooBaseCandles`→`aggregateCandles` path, which already handled 15m/30m/1h/4h.
- The module's headline rationale — "Yahoo uses '60m' not '1h'" — is **empirically false**: a live probe
  of `^GSPC?interval=1h` and `?interval=60m` both return valid candles. The production path sends `1h`
  un-translated and works. So the `1h→60m` translation + the parallel fetch/aggregate logic are
  unnecessary duplication of `selectYahooBase` (4h→1h base) and `aggregateCandles`.
- The only production-consumed exports are the constants `SUPPORTED_INTRADAY_TFS` and
  `INTRADAY_MAX_DAYS` — and `INTRADAY_MAX_DAYS` **duplicates** `YAHOO_MAX_DAYS` in `constants.js`
  (both `{15m:60,30m:60,1h:730,4h:730}`; they will drift if one is edited).
- **Reviewer decision:** keep `intraday_yahoo.js` as the constants-only home (re-export
  `YAHOO_MAX_DAYS` instead of redefining) and delete the dead fetch/records/aggregate trio + their
  shape tests, OR actually route the command through this module and retire the duplicate index.js
  branch. Pick one owner for the Yahoo-intraday interval knowledge.

### P2 — `commandIntradayAccumulate` replicates the known silent-zero success pattern
- `backend/cli/commands/data/data.js:1725`: `const symbolOk = intradayBars.length > 0 || snapErrors.length === 0;`
  — identical to the P1 "silent empty provider → reported OK with zero bars" finding already filed
  above for `crypto/equity/five-min` deep commands. A symbol that returns no bars and no explicit
  error is counted as success.
- **Fix plan:** same as the existing silent-zero entry — an explicitly-requested job with zero
  target-timeframe bars and no skip reason should be a failure. Add a zero-bars-no-errors test for
  `intraday-accumulate`.

### P3 — `config/data_sources.yaml` root alias is a dead 208-line duplicate
- Commit `51b20b6c` added `config/data_sources.yaml` as a "backward-compat safety net" after a
  `crypto-deep-backfill` ENOENT. The commit message itself concludes the backend "already uses
  `config/markets/data_sources.yaml` correctly" and the ENOENT was "a stale process that had cached
  the pre-reorg path." Grep confirms **zero code reads the root path**.
- **Impact:** two full copies of `data_sources.yaml` now exist with nothing keeping them in sync —
  a future edit to canonical `config/markets/data_sources.yaml` silently leaves the root copy stale,
  and any code that later (re)acquires the root path would read drift.
- **Reviewer decision:** delete `config/data_sources.yaml` (the stale process was the real cause, and
  it is gone), OR if a safety net is genuinely wanted, replace the copy with a generated/symlinked
  artifact + a structure-contract test asserting byte-equality with canonical.

### P1 — Deep 5m depth was never generalized to coarser intraday timeframes (data-depth gap)
- The "all-the-way to inception" deep backfill is **5m-only**: `commandCryptoDeepBackfill` /
  `commandEquityDeepBackfill` hard-code `timeframe:'5m'`. Live bin evidence (`storage/data/ts/`):
  `BTCUSDT_5m.bin`=44.5MB (to 2017) but `_1h.bin`=420KB (~730d Yahoo native), `_15m.bin`=1.8MB (~1yr),
  and `_30m.bin`/`_4h.bin` are **stale from Jun 10** (untouched by sessions 25/28). Same shape for AAPL.
- The deep 5m is **not rolled up** into coarser bins, even though `aggregateCandles`
  (`ingest_market_data/index.js:394`) already does `5m→15m/30m/1h/4h`. Rollup is **lossless** (separate
  per-TF bins; 5m preserved; merge-protected write; coarser-from-finer so the synthetic-5m guard doesn't
  fire). No `intraday-rollup` command exists; `intraday-accumulate` even tells the user to "aggregate
  from 1h bars" for 4h but provides no way to do it.
- **Reviewer decision (approved):** add `intraday-rollup` to derive deep 15m/30m/1h/4h from the existing
  deep 5m for crypto + US equities; refresh the stale 30m/4h bins.

### P2 — shared/lib reorg shims are LOAD-BEARING, not dead (corrected 2026-06-13 s29)
- Initial hygiene sweep using only `require('.../shared/lib/<name>')` literal-grep reported the 8 root
  shims (`paths/ansi/indicators/backtest/backend_bridge/backfill/feature_builder/ai_client`) as dead
  or near-dead. **That was wrong.** Deleting them broke the suite via THREE resolution layers the
  literal grep missed:
  1. **Sibling-relative requires** inside `shared/lib/<subdir>/` — e.g. `shared/lib/ml/feature_builder.js`
     → `require('../indicators')`, `shared/lib/settings/user_settings.js` → `require('../paths')`,
     `shared/lib/compat/adapters.js` → `require('../backfill')`.
  2. **Subpath-import aliases** — `package.json` maps `#shared/*` → `./shared/lib/*.js`, so
     `#shared/ansi`/`#shared/ai_client`/`#shared/indicators`/`#shared/backtest` all resolve to the root
     shims (used by `trade.js`, `setup.js`, `module_loading.test.js`).
  3. **Compiled build artifacts** — gitignored `dist/mcp_server/lib/{bridge,agent_gate}.js`
     `require("../../../shared/lib/paths")` (compiled from the MCP TypeScript source).
- **Resolution:** shims restored; they are intentional compatibility re-exports, NOT dead code. Direct
  source callers WERE migrated to canonical category paths (14 literal sites + the relative + alias
  sites), so the shims now have fewer consumers, but they must stay until the `#shared/*` alias map and
  the MCP TS source are repointed and `dist/` rebuilt. **Durable lesson for the Hygiene Sweep:** a
  module is only "dead" if it has no consumer across literal requires, sibling-relative requires,
  `#shared/*`/subpath aliases, AND compiled `dist/` artifacts — grep all four before deleting.
- `config/data_sources.yaml` (the root yaml dup) WAS genuinely dead (0 readers across code + dist) and
  was deleted.

### Verified good this pass
- P4 ML 5m cap (`backend/cli/commands/research/ml.js`): clean — 100k default, `--max-rows-5m`
  override, `[VISIBILITY]` log; `ml_dataset` test updated 50k→100k. 27/27 on the touched test trio.
- `commandIntradayAccumulate` core: provider-pinned (`provider:'yahoo'`), real dry-run, `--days`
  validated against the TF cap, loud per-symbol `[VISIBILITY]` logging, dedupe via ts-index merge.
- No security findings in scope (no eval / dynamic require / secrets / exec in the changed files).
- Yahoo accepts `interval=1h` (live-verified) — production FW3 path is functionally correct.

#

## Focused Audit - 2026-06-15 session 35 (blast-through, anchor 483d45cc -> e0cb6aa2)

Tier 1 = the session-34 daemon/gate work. DCS 0.96. Hygiene sweep clean (no dup basenames, no dup
configs). Manifest↔handler parity OK (`backfill-daemon`, `clear-api-cache` both registered,
sovereign_cli.js:52/54). Priority guard verified correct; ingest freshness gate verified net-safe.

### FINDING (Medium, data integrity) — dead-symbol marker clobbers an existing bin's enriched meta
- **File:** `backend/cli/commands/data/data.js:1080-1089` (`commandCryptoDeepBackfill`, introduced
  `e0cb6aa2`, age <1d).
- **Finding:** the 0-bar "not found" marker is written with `fs.writeFileSync(<sym>_<tf>.meta.json, ...)`
  **unconditionally**, with no check for an existing `.bin`. If a crypto symbol that ALREADY has a real
  bin returns 0 bars from a deep backfill (transient Binance outage / 429 storm / temporary empty
  response, not a true delisting), the marker overwrites the real meta sidecar and strips
  `coordinate_id`, `config_market`, `config_sector`, and `derived_from`. The `.bin` (OHLCV) survives,
  but every subsequent `readTsIndex` of that symbol returns those enrichment fields as `undefined`
  until the next *successful* backfill rewrites full meta. If the symbol stays 0-bar, the loss is
  permanent for the retained historical bars.
- **Empirical proof (temp-dir probe, real writeTsIndex/readTsIndex):**
  `BEFORE -> coordinate_id: crypto:TESTUSDT | config_sector: Layer1 | count: 1`
  `AFTER  -> coordinate_id: undefined | config_sector: undefined | bin count: 1 | ohlcv intact: true`
- **Reviewer decision:** confirm the intended invariant — the not-found marker should only exist when
  there is genuinely NO bin (that is the case `readCoverage` keys on: `!existsSync(bin) && existsSync(meta)`).
- **Fix (S):** guard the marker write with the bin path — only write when the `.bin` is absent:
  `if (!fsSync.existsSync(path.join(DEFAULT_TS_DIR, \`${safe}_${baseTf}.bin\`))) { ...writeFileSync... }`.
  Semantically correct (a symbol with real bars is not "dead") and removes the clobber entirely.
- **Gate to clear:** add a regression test (existing enriched bin + 0-bar result → meta retains
  coordinate_id/config_sector; bin-absent + 0-bar → marker written) and re-run the data suite.

### Verified good this pass
- `shared/lib/market/coverage.js` (new): read-only, cheap header+tail probe, no security surface,
  8/8 tests. Minor cosmetic: the `count===0` *bin-present* return path omits the `notFoundCheckedMs`
  field that the empty/`exists:false` path includes — harmless (`isFresh` treats `undefined` as falsy).
- `writeTsIndex` PROVIDER_PRIORITY guard (`validation.js`, `74b0ec67`): correct. `rollupFromBase`
  (data.js:1914) stamps the base bin's provider, so crypto-derived coarser bins carry `provider:'binance'`
  (priority 3) and a yahoo poll (priority 1) cannot overwrite them. Equal-priority yahoo→yahoo falls to
  the new-wins-on-conflict merge (gaps still filled). `derived_from` round-trips through the meta sidecar.
- Ingest ts/bin freshness gate (`index.js`, `f405263c`): net-safe. It only fires when the snapshot check
  already set `skipItem=true`; a fresh bin `continue`s (same outcome as before), a stale bin flips
  `skipItem=false` to force a fetch — so the change can only *add* fetches or confirm an existing skip,
  never newly suppress one. On `isFresh` error it falls through to the provider (fail-open).
- `global.suppressLogs = true` in the daemon: established repo pattern (setup.js/run.js/strategy.js);
  the daemon owns its whole process, so never resetting it is correct, not a leak.

## Deep blast follow-up - 2026-06-15 session 35 (optimization + dead-code scan)

### RESOLVED — dead-symbol marker clobber (was Medium finding above)
- Fix applied at `data.js` (`commandCryptoDeepBackfill`): the not-found marker is now written
  **only when no `.bin` exists** (`if (!fsSync.existsSync(binPath))`). A 0-bar result for a symbol
  that already has bars is a transient provider failure, not a delisting — the guard stops it from
  stripping `coordinate_id`/`config_*`/`derived_from` off a real sidecar.
- Regression tests added to `coverage.test.js` (2): the not_found marker is honored for 7d then
  re-probed; a real bin always wins over a marker (count from header, marker ignored). 6/6 green.

### OPTIMIZATION — `backend integrity` 57s → 0.4s (144×), behavior-identical
- `runBackendIntegrity` (`backend/cli/commands/tools/backend.js`) looped `readTsIndex(sym, tf)` over
  every (symbol × timeframe), materializing the ENTIRE bin into record objects (a deep 1m crypto bin
  is ~525k objects + ISO-string conversions) only to read count + first/last timestamp.
- Swapped to `readCoverage` (header + two 8-byte head/tail reads, bin never loaded). Extended
  `coverage.js` with `firstBarMs` (one head read) so the coverage span (`from`/`to`) is available.
- **Verified:** live `backend integrity --json` 57,069 ms → 396 ms, same `ok:false` / 92 cached /
  4 stale. Per-bin equivalence probe over ALL 1009 real bins: `{bars, from, to}` from readCoverage ==
  readTsIndex, **0 mismatches**. Full suite 467/467. Also removed a pre-existing unused `firstTs` var.

### BACKLOG (low) — shared/lib over-exports (public-surface bloat, NOT dead logic)
- A scan of every `shared/lib/**/*.js` export vs all tracked `.js`/`.ts` found **94 exported names
  with zero external importer**. Spot-checks (isValidTimestamp, bollingerBands, executeTool,
  readTsSources, buyHoldBenchmark) all show the function is alive — called 3-4× *within its own
  module* — but the `module.exports` entry has no consumer. These are unnecessary exports, not dead
  code; the functions must NOT be deleted.
- Caveat (four-layer rule): the raw list mixes in known false-positive classes — MCP exports
  (`mcp/agent.js`, `mcp/gate.js`) can be consumed via compiled `dist/` (gitignored, not in the scan),
  and root shims re-export whole objects without naming members. Any prune must verify per-item across
  literal/sibling/alias/dist layers and re-run the suite. Recommend a dedicated debt-clearing pass
  (trim export lists only, keep all function bodies); not done this session.

#### UPDATE (same session) — bulk prune attempted, REVERTED; only the 1 genuine dead export removed
- **Removed (kept):** `market/polymarket_features.js` redundant alias `generatePolymarketFeatures:
  buildPolymarketFeatureRows` — the real fn `buildPolymarketFeatureRows` stays exported and is what
  `polymarket_history.js` + the test actually import. Safe, suite green.
- **Attempted + REVERTED:** a regex-driven prune of the 87 non-MCP over-exports broke
  `indicators.manifest_parity.test.js`. **DURABLE LESSON:** an exported name frequently ALSO appears
  in a *second internal object literal* in the same file (here `bollingerBands` is a member of the
  `IndicatorMethods` registry that drives manifest-mode feature computation, not just `module.exports`).
  A line-oriented "remove the line matching NAME" removed the FIRST match (the `IndicatorMethods`
  member), silently corrupting the internal registry while leaving the export intact → `bollinger_*`
  feature keys vanished. **Conclusion:** trimming `module.exports` members safely requires AST-scoped
  editing (only the `module.exports` object node), not text/line matching. Given these exports are
  provably harmless (zero importers) the cost/risk isn't worth a hand pass — left as backlog. All 30
  bulk-touched files reverted to HEAD; suite restored to 467/467.

#### Rigorous testing pass (same session)
- Refactored the marker write into an exported, tsDir-injectable helper `writeDeadSymbolMarker(tsDir,
  symbol, tf, family, provider)` (data.js) so the clobber guard is tested through the REAL function,
  not a copy. `commandCryptoDeepBackfill` now records `entry.marker_written`.
- New `tests/scripts/tests/dead_symbol_marker.test.js` (2): (a) no-bin → marker written, readCoverage
  sees not_found, isFresh skips 7d then re-probes; (b) bin-present → write REFUSED (returns false),
  readTsIndex still returns coordinate_id/config_sector for all bars (clobber fix proven end-to-end).
- New `tests/scripts/tests/integrity_coverage_equivalence.test.js` (1): adversarial bins the 1009 real
  bins don't cover — single-bar (firstBarMs===lastBarMs), empty-header (count 0), meta-only marker,
  truncated (header says 10, file holds 2), and absent symbol — proving the integrity readCoverage path
  derives `{bars,from,to}` byte-identical to the old readTsIndex path (or skips identically) on every branch.
- Gate: **suite 470/470** (was 467; +3). Live `backend integrity --json` re-run post-refactor: 383 ms,
  ok:false / 92 cached / 4 stale (unchanged). All shared/lib + data/daemon modules load.

## Blast-Through Deep Review — 2026-06-23 session 58 (order-placement surfaces, all 3 brokers + C++ core)

Scope: "Full ledger sweep" driven inline (user choice). Anchor `0903df6b` → HEAD `1c7227b7`. Deep-traced
every live-order path across TradFi/Alpaca, crypto/Gate.io, prediction-markets/Polymarket, plus the new
`shared/lib/runtime` Alpaca bot code (author-only reviewed until now) and a lightweight `backend/core`
(C++) build/ctest/stub pass. DCS 0.96 start → 0.97 end. **No gating findings** (no unauthenticated
exploit, no crash-on-first-use). Findings are risk-control gaps + one PIN exposure on the new live path.

### Findings (recency order, severity-ranked)

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| **Medium-High** | Alpaca bot | `backend/cli/commands/strategy/strategy.js:880-898` + `shared/lib/runtime/alpaca_bot_cycle.js:33-60` (commit `17f565fb`, <1 day) | **`maxPositions` is never enforced.** `state.config.maxPositions` (default 10) is displayed by `auto-trade status` as `positions.length/maxPositions`, implying a cap, but neither `runAutomationPass` nor `recordAlpacaEntry` ever checks `state.positions.length` before opening a new LIVE position. An unattended loop can open unlimited concurrent live positions, exceeding its own configured concurrency limit. | Gate entry in `runAutomationPass` before the `commandTrade` buy (or have `recordAlpacaEntry` refuse + signal) when `state.positions.length >= config.maxPositions`. | Decision: implement cap |
| **Medium** | PIN exposure | `backend/cli/commands/trade/trade.js:325` → `shared/lib/runtime/backend_bridge.js:68-101` | **Trade PIN leaks into the gateway subprocess command line.** `commandTrade` appends `--pin <SECRET>` to `args` (so the in-process gate at :293-310 can read it), then passes the *same* `args` to `buildTradeGatewayLaunch(args)`, which spawns the gateway (on win32 as a `powershell.exe -Command "& 'tsx' 'index.ts' … '--pin' 'SECRET'"` string) including the PIN. The PIN is then visible in OS process listings (`tasklist`/`Get-CimInstance Win32_Process`/`ps`). The gateway never even consumes `--pin` (the gate is JS-side), so it is a pure leak. Applies to both the auto-bot entry and exit sells. | Strip `--pin` and its value from `args` before `buildTradeGatewayLaunch(args)`. One fix point covers entry + exit + manual trades. | Decision: strip before spawn |
| **Medium** | Alpaca bot | `shared/lib/runtime/alpaca_bot_cycle.js:33-59` (commit `17f565fb`) | **Entry records requested qty, not the broker's filled qty.** `recordAlpacaEntry` deliberately re-queries the broker for `fillPrice` (`brokerPos.averagePrice`) — correct — but still records `qty: Number(qty)` from the *request*. On a partial fill the tracked qty exceeds the real holding; the later exit sells `position.qty`, which can exceed the holding → broker oversell rejection, and the position never cleanly clears via this path. `brokerPos` is already in scope. | `qty: brokerPos ? Number(brokerPos.quantity) : Number(qty)`. | Decision: reconcile qty |
| **Medium** | Alpaca bot | `shared/lib/runtime/alpaca_bot_cycle.js:85-117` + `strategy.js:826-905` (commit `17f565fb`) | **Same-symbol stacking → exit oversell.** No check against an already-tracked/already-held position before a new entry (each new bar yields a new `signalId`, so repeated buys of the same symbol create multiple tracked positions). The exit loop then sells each tracked position's `position.qty` independently against the *same* cycle-start broker snapshot, so two AAPL positions can try to sell more than the broker actually holds. Compounds the qty finding above. | Reconcile exit sell to `min(position.qty, brokerPos.quantity)` and/or dedup entries per symbol (skip entry if symbol already tracked/held). | Decision: cap exit qty |
| **Low** | Alpaca bot | `alpaca_bot_cycle.js:92,119` | Realized P&L uses the pre-sell snapshot price (`marketValue/quantity` from the start of the cycle), not the actual exit fill. Logging-only, no capital impact. | Optional: re-query fill after the sell for accurate `realizedPnl`. | Informational |
| **Low/Info** | C++ core | `backend/core` ctest | `kronos_integration_test` fails: "Not enough empirical data points for Kronos test (need at least 4)" — a data-availability failure in an integration test, not a code regression. 28/29 ctest green, including all order-relevant tests (`kill_switch`, `execution`, `portfolio_risk`). Build is current and compiles. | Seed ≥4 Kronos data points for the integration fixture, or mark it as requiring data. | Informational |

### Verified-good (no action)
- **Gateway single-order failure propagates a non-zero exit code** (`index.ts:2054-2057` sets
  `process.exitCode = 1` on `FAILED`/`RISK_REJECTED`). This is what makes the bot's reliance on
  `commandTrade`'s return code safe: a failed live buy is NOT recorded as a phantom tracked position,
  and a failed live exit sell keeps the position tracked (`alpaca_bot_cycle.js:107-116`). Good.
- **Risk-engine fails closed** (`RiskEngineBridge.checkRisk`, `index.ts:610-690`): missing/non-exec
  binary or an engaged global kill-switch rejects the order in LIVE mode; the dry-run bypass is explicit
  and guarded by `LIVE_TRADING!=='true' && !--live`. Good.
- **PIN gate fails closed** (`trade.js:292-323`): unattended LIVE without `SOVEREIGN_TRADE_PIN` returns 1.
  The gate runs on BOTH entry and exit because both call `commandTrade` in-process (not via a CLI spawn
  that would bypass it). Good.
- **Alpaca 422 fix intact** (`index.ts:497-504`): fractional equity orders forced to `time_in_force:'day'`.
- **New runtime tests green**: `alpaca_bot_cycle.test.js` + `alpaca_bot_state.test.js` = 11/11 (`node --test`).
  (Note: `npx jest` falsely "fails" these — jest mis-parses node:test files; always use `node --test`.)

### Section 3 stub/duplicate sweep
- Duplicate basenames resolved for all order-relevant modules. The `shared/lib/<name>.js` 1-line entries
  (`backend_bridge`, `paths`, `env`, `execution_memory`, `config_loader`, `persistence_bridge`,
  `run_loop`, `polymarket_history`) are **thin re-export shims** over the real impls in
  `shared/lib/runtime/` (or `market/`) — migration layer, NOT dead (same class as the `polymarket_history`
  false-positive from session 55; left intact). `docs/guide/examples/minimal_sovereign/.../config_loader.js`
  is an isolated doc-example copy. No new dead shims, no divergent forks, no reachable stubs found on the
  order-placement paths.

### Grades (this pass)
- `shared/lib/runtime` (Alpaca bot): **B** — clean, well-structured, mirrors the Polymarket `bot_state`/
  `cycle` shape, fully tested (11/11); held below A by the unenforced `maxPositions` cap + the
  requested-vs-filled qty reconciliation gaps (both real on a live-capital path).
- `backend/gateway`: **B+** — robust exit-code propagation, fail-closed risk engine, validated proposed
  orders; the PIN leak lives in the CLI wrapper, not the gateway.
- `backend/cli` (trade/strategy live paths): **B** — PIN-in-argv leak + the bot entry/exit reconciliation.
- `backend/core` (C++): **B** — lightweight pass: builds, 28/29 ctest green, 1 data-dependent test fail,
  no obvious stub/dead code on the order path. First real stamp in the ledger.

### Next debt-clearing move (not a feature)
Implement the `maxPositions` cap + the two qty-reconciliation fixes in `alpaca_bot_cycle.js`/`strategy.js`
(one focused commit, all on the brand-new code), and strip `--pin` from the gateway launch args in
`commandTrade` (one-line, covers all three live paths). These four are the highest-value, lowest-risk
fixes and all sit on code touched this/last session.

### ✅ FIX-PASS CLOSEOUT — 2026-06-23 session 58 (commit `cf4f7026`)
All four findings above are **RESOLVED**, plus the 5th TUI item found mid-pass:
- **#1 maxPositions** → pure `canOpenPosition()`; `runAutomationPass` gates live entries against the
  post-exit count + `config.maxPositions`, increments per recorded entry.
- **#2 PIN leak** → exported `stripFlagValue(args,name)` (`utils.js`); `commandTrade` sanitizes args before
  `buildTradeGatewayLaunch`. PIN no longer reaches the gateway argv.
- **#3 entry qty** → pure `resolveEntryQty(brokerPos, requestedQty)` records the broker's filled qty.
- **#4 exit oversell** → pure `resolveExitQty(positionQty, availableQty)` + per-symbol `availableBySymbol`
  counter; skips firing when ≤0.
- **#5 (TUI)** → "Positions" manifest entry gained a `--live` toggle so its P&L reads the live account.
Verified: suite **616/614/0fail/2skip** (+11 tests), manifest-sensitive tests 39/39, hygiene clean.
Grades: `shared/lib/runtime` B→**A**, `backend/cli` B→**B+**.
**Remaining (non-gating, not yet done):** Gate.io spot market-order semantics (`index.ts:309-319`) want one
empirical paper probe — covered at the gateway-execute level but not line-audited; realized-P&L pre-sell
snapshot price (logging only); C++ `kronos_integration_test` needs ≥4 seeded data points.
