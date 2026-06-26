# Session Handoff — Pointer

**This file is now a short pointer, not an accumulating log.** As of 2026-06-08, session handoffs live
in dated files under `workspace/handoff/` — one file per calendar day — so this pointer (and a session
boot) never has to read tens of thousands of tokens of accumulated history.

## Convention

- Latest/current handoff: **`workspace/handoff/2026-06-23.md`** (last update: 2026-06-23 session 58)
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

- **SESSION 59 (2026-06-25) cont. — docs/ triage + workspace/BOOTSTRAP.md + docs/codebase_tour/.
  Committed `2865299f` (docs) + `264e4ee2` (gitignore cleanup).** User felt they'd lost track of the
  codebase from heavy AI-assisted work. Found the repo already has 30+ files under `docs/` that simply
  never get read at session boot (fixed: `workspace/BOOTSTRAP.md` now exists and points at
  `docs/README.md`). Triage found 2 "canonical" docs are badly stale (`architecture_overview.md` calls
  live trading "*Planned*"; `capability_manifest.md` describes an old flat file layout) and 17 broken
  links in `docs/README.md` itself (moved `docs/operational/*` files, hub never updated). Built
  `docs/codebase_tour/` — 8 modules with real file:line-grounded explanations + hands-on labs for the
  genuine gap (current-code reverse engineering; `docs/guide/` is a different, generic from-scratch
  teaching book). Also untracked 5 routine cron-generated files + extended `.gitignore` (a recurring
  noise pattern flagged across many prior sessions' notes, finally closed). Full trail:
  `workspace/STATE.md`'s "Process Note" + `workspace/BOOTSTRAP.md`. **Still open:** the stale docs
  flagged in the triage weren't rewritten, just flagged (deliberate — out of scope for this pass, a
  future session's call on whether to fix or retire them).
- **SESSION 59 (2026-06-25) — Focused blast-through + mass-implement same session. All 3 found
  findings FIXED. 0 commits yet (pending user go-ahead).** Full trail: `workspace/DEV_REVIEW.md`
  ("Focused Blast-Through" + "Mass-Implement" entries, both 2026-06-25 session 59). Audited the 2
  commits the ledger hadn't seen yet (`13bc91f0`/`5e60babb`) — clean. Found and fixed: (1) the
  session-58 oversell clamp's bookkeeping was wrong (`realizedPnl` off the pre-clamp qty, unsold
  remainder dropped from tracking) — new pure `buildExitOutcome` helper in `alpaca_bot_cycle.js`
  fixes it + 4 tests; (2) the PIN-strip fix only covered 1 of 8 `buildTradeGatewayLaunch` callers (no
  active leak found, but fragile) — centralized into the chokepoint itself + 3 tests; (3) 5 stale
  "crashes"/"TODO" dev-review comments in the dashboard manifest no longer matched reality — deleted/
  corrected. Suite **623/621/0fail/2skip** (+7), hygiene clean. `shared/lib/runtime` B→A.
  **Deliberately left alone:** `sovereign_dashboard.mjs:171` (redundancy question on `backend
  universe`) and lines 260/267 ("doesn't work" on `polymarket history`/`backtest`, plausibly also
  stale given the session-54/55 crash fixes, but not re-verified this pass) — flagged for a future
  cleanup pass that actually checks them, not touched speculatively. **Still the user's:** the same
  standing real-terminal confirmations below, plus a commit decision for this session's diff.
  **Same session, follow-up fix:** user reported the Trade section *still* defaulted to "the legacy
  version" even after the in-pane fix above — root cause was different: `alpaca`'s manifest entry had
  no flags, so it always hit `commandTrade`'s `args.length===0` branch and launched the full
  interactive trade wizard (a different code path from the literal legacy TUI, same full-screen-prompt
  feel). Fixed: real flags added (`--action/--symbol/--qty/--order-type/--price/--pin/--live`) + a new
  `buildTradeArgsFromActionFlag` helper in `trade.js` that translates them to the wizard's own
  positional args; `alpaca` removed from `INTERACTIVE_CMDS`. 7 new tests, suite 630/628/0fail/2skip,
  hygiene clean. See `workspace/STATE.md`'s "Fix Note" for the full trail.
- **SESSION 58 (2026-06-23) cont. — Trade-section dashboard UX (commits `13bc91f0`, `5e60babb`).**
  (1) "Trade section drops me into legacy" was `strategy`/`prop-firms`/`run`/`favorites` being in
  `INTERACTIVE_CMDS` (unmounted the Ink dashboard into the old prompt UI) — moved them to **in-pane**;
  `commandStrategyMenu` got a non-interactive `list` path; added a `dashboard_crash.log` global handler.
  (2) Added a **`positions`** entry to the dashboard Trade section (the session-57 "dashboard entry" claim
  was false — it only lived in the legacy `manifest.js`; the dashboard uses its own inline `M`); runs
  in-pane with `--live`, and `auto-trade status` is no longer behind the `ai_agent_trading` gate. Suite
  616/614/0fail/2skip; hygiene clean. **Still the user's:** live-terminal confirmation that activating
  the trade commands now stays in-dashboard (no conhost in CI).

- **SESSION 58 (2026-06-23) — Deep order-placement review DONE + all 4 findings FIXED in the same session
  (mass-implement). 1 commit `cf4f7026`.** Fix pass closed every OPEN finding from the review: `maxPositions`
  now enforced on entry (`canOpenPosition`), entry records broker filled qty (`resolveEntryQty`), exit sells
  clamped to available broker shares per symbol (`resolveExitQty`+counter), trade PIN stripped from the
  gateway subprocess argv (`stripFlagValue`), and the TUI "Positions" view got a `--live` toggle so its P&L
  reads the live account. Suite **616/614/0fail/2skip** (+11 tests); manifest-sensitive tests 39/39; hygiene
  clean. Grades: `shared/lib/runtime` B→**A**, `backend/cli` B→**B+**. **No remaining order-placement
  findings.** Lower-priority leftovers (not gating, in `DEV_REVIEW.md`): Gate.io spot market-order semantics
  want one empirical paper probe (unverified, not deep-audited); C++ `kronos_integration_test` needs ≥4
  seeded data points; realized-P&L uses pre-sell snapshot price (logging only). Review trail below:
- **SESSION 58 (2026-06-23) — Deep order-placement review (closes the session-57 flag).** Full trail: `workspace/handoff/2026-06-23.md`
  session 58 + `workspace/DEV_REVIEW.md` ("Blast-Through Deep Review — 2026-06-23 session 58"). Ran as a
  full blast-through (anchor `0903df6b`→`1c7227b7`, DCS 0.96→0.97), all 3 execution surfaces + new
  `shared/lib/runtime` + lightweight `backend/core` C++ pass; `workspace/REVIEW_LEDGER.md` stamped (every
  in-scope row now 2026-06-23; C++ no longer carried-forward-unreviewed). **No gating findings.**
  Verified-good: gateway propagates non-zero exit on failed orders (no phantom positions), risk-engine +
  PIN gate fail closed, Alpaca 422 fix intact, runtime tests 11/11, C++ 28/29 ctest (1 data-availability
  fail, not a regression). **OPEN (next debt-clearing move, all on this/last session's code, awaiting user
  go-ahead — nothing implemented):** (1) [Med-High] `maxPositions` never enforced on entry; (2) [Med]
  trade PIN leaks into the gateway subprocess argv (`commandTrade`→`buildTradeGatewayLaunch`); (3) [Med]
  entry records requested qty not broker filled qty → partial-fill exit oversell; (4) [Med] same-symbol
  stacking → exit oversell. Suggested: one focused commit for 1/3/4 (`alpaca_bot_cycle.js`+`strategy.js`)
  + one-line `--pin` strip in `trade.js` (#2).
- **SESSION 57 (2026-06-23) — Committed session 56; built Alpaca position tracker + auto-exit loop
  (commit `17f565fb`); flagged SESSION 58 as a deep order-placement review.** Full trail:
  `workspace/handoff/2026-06-23.md` session 57. Alpaca's `auto-trade` loop was entry-only (no stops/
  targets/age-exit, no position memory) — built the JS equivalent of Polymarket's `bot_state.ts`/
  `cycle.ts` (`shared/lib/runtime/{process_lock,alpaca_bot_state,alpaca_bot_cycle}.js`), wired into
  `strategy.js`'s `runAutomationPass` (review/exit before new entries), new gateway `positions`
  command, `auto-trade status` view. Verified live by hand (real fill-price reconciliation, a forced
  age-exit closing a position + logging P&L, a real dry-run pass) plus suite 605/603/0fail/2skip
  (+11 tests), hygiene clean, gateway tsc clean.
  **NEXT SESSION (58) IS A DEEP REVIEW SESSION per explicit user instruction — read this first:**
  check the relevant files and the API-bot connections that place real orders across **all three**
  execution surfaces (TradFi/Alpaca equities, crypto/Alpaca+Gate.io, prediction markets/Polymarket).
  Starting points are listed in the session-57 handoff entry (the three `BrokerAdapter` impls +
  `ExecutionGateway.execute()` in `index.ts`, both live bot loops — Polymarket's `cycle.ts` and the
  new Alpaca cycle this session built, the PIN/auth/feature-gate chain, and known-unreviewed items
  like `processProposedOrders` and the Alpaca 422 fix). Nothing scoped yet — this is a framing flag,
  not a plan.
- **SESSION 56 (2026-06-23) — "/" chat suggestions + cursor-robustness generalization + legacy-TUI
  engine switch (now symmetric both ways). UNCOMMITTED, 6 files.** Full trail:
  `workspace/handoff/2026-06-23.md`. Chat bar's `/` now opens a live-filtered command dropdown
  (↑↓/Tab) rendered inside the same bordered box; cursor-position math generalized from a fixed
  `H-3` to `H-3-suggestionRowCount` (shared variable, can't drift) and a separate latent multi-line
  text-wrap bug on long input was fixed alongside it (`height:1`+`overflowY:'hidden'` clip). First
  "legacy mode" attempt (hiding the chat bar inside the same dashboard) was wrong per direct user
  correction — REVERTED — and replaced with the real fix: `Settings > Layout > legacy` now exits
  the Ink dashboard and hands off to the actual older `runInteractiveMenu` engine
  (`tui/engine.js`), with the inverse wired too (picking `default`/`compact`/`research` from
  *inside* that legacy menu now exits it back to the dashboard). `sovereign_cli.js`'s boot loop
  only relaunches the other engine when the persisted layout actually changed during that run —
  caught and fixed a self-inflicted "relaunch on every exit" regression that would have trapped a
  normal `q`-quit. **STILL OPEN:** the legacy→dashboard switch direction is verified by code trace
  only (no test harness drives the legacy menu's `promptSelect` flow) — needs a live-terminal
  check, same caveat as every other interactive-TUI fix here (no real conhost in CI). Nothing
  committed yet this session — pending user go-ahead. User floated screen-sharing as a future way
  to debug interactive TUI changes together more directly; explicitly deferred, no action taken.
- **SESSION 55 (2026-06-22) — Blast-through audit + TWO mass-implement passes. Cleared all queued
  debt AND all four open carryovers. 7 commits.** Full trail: `workspace/handoff/2026-06-22.md`
  (session 55) + `workspace/DEV_REVIEW.md` (both mass-implement closeouts + corrected audit block).
  **Pass 1 (debt):** (A) `renameWithRetry` busy-wait→`Atomics.wait` + first-ever tests; (B) deleted 3
  dead root shims (`backfill/ingestion/market_validation`) — `polymarket_history.js` was wrongly flagged
  dead and KEPT (grep `.js`-extension blind spot, fixed in the blast-through skill); (C) gateway
  fetch-retry rollout finished. **Pass 2 (carryovers + last debt):** gateway `processProposedOrders`
  failure reporting (`4f65c7aa`); **chart upgrade all 3 parts** — candlesticks + SMA overlay + volume
  subplot, `--style candle`/`--sma`/`--volume` (`79d2129f`, `2d17aa26`); **typing-lag fix** — Ink 7
  full-clears every frame on `win32 && fullscreen`, capped root height to `rows-1` for the line-diff path
  (`77cd31a7`); **graphify-out** AST-only refresh (11,015→11,542 nodes, gitignored). Suite
  **594/592/0fail/2skip**, hygiene clean, gateway tsc exit 0.
  **STILL OPEN — carryover #3, the user's to do (no conhost/real-terminal in CI):** live confirmation
  of the `bt --strategy` picker and the `backend visualize` force-ingest fallback. Their dev-review
  comments remain in place pending that. **Other:** consider tightening `.graphifyignore` (doc-change
  set was mostly noise) before any full semantic graphify rebuild.
- **SESSION 55 (cont., into 2026-06-23) — TYPING-LAG/CURSOR BUG RESOLVED (carryover #2 closed,
  user-confirmed).** Long arc on `sovereign_dashboard.mjs` Windows-conhost typing: chars ghosted/
  misplaced. Root cause = forced alt-screen+fullscreen made Ink mis-position the cursor (a raw-mode
  probe proved it was positioning, not echo). Fixed by rendering in **normal flow** (no `\x1b[?1049h`,
  non-fullscreen height) + clear-on-mount + ink `<TextInput>` + (user-authored final piece, commit
  `521372b3`) `useCursor()` relocating the hardware cursor into the input box with `showCursor:false`
  + `\x1b[?25l/h`. I added an `isTTY` guard so the fake-TTY tests stay green. The `rows-1` hack was
  tried and reverted. Suite **594/592/0fail/2skip**, hygiene clean. Full recipe in memory
  `reference-ink-windows-fullscreen-lag`. graphify-out now stale again for the dashboard rewrite
  (deferred). Throwaway `scripts/dev/diag_rawmode.mjs` deleted at close.
- **SESSION 54 (2026-06-22) — Closed the full 15-item dev-review bug backlog on
  `sovereign_dashboard.mjs` (shared-root-cause crash fix for 4 commands, watch/ingest TTY-garbage
  fix, polymarket backtest null-path crash, type-to-edit, strategy picker, force-ingest fallback,
  live-chart mode) AND built a chat-style command input as the new default entry point. Full
  trail: `workspace/handoff/2026-06-22.md`.** Two commits: `95a9c547`, `a0a5cda5`. Suite
  580/578/0fail/2skip throughout; hygiene clean. Caught and fixed a real process leak (8 orphaned
  live-trading child processes from repeated test runs — killed with explicit user confirmation).
  **`graphify-out` NOT refreshed** — large diff (2 new files, big dashboard rewrite), should
  refresh next session if touching dashboard/chat code again. **Next-session candidates:** (1)
  chart upgrade — candlesticks + volume + SMA overlay for `renderPriceChart()`
  (`tui/visualizations.js:200`), researched and ranked, candlesticks alone is the cheap first step;
  (2) chat bar typing lag on the legacy PowerShell console host — needs a single-line redraw path
  isolated from the full Ink re-render, notes inline next to `chatBar` in `sovereign_dashboard.mjs`;
  (3) strategy picker + force-ingest fallback still need real-terminal confirmation (only verified
  via the fake-TTY test harness so far) — their dev-review comments are deliberately still in
  place pending that.
- **SESSION 53 (2026-06-21) — Closed both items surfaced after session 52's audit; nothing else
  started.** Full trail: `workspace/handoff/2026-06-21.md` session 53; `workspace/SESSION_MEMORY.md`
  same date. (1) Fixed the sigma-band gating bug (commit `03b3c8d5`) — dropped the unauthenticated
  `query.input` path-read oracle in `backend/api/server/routes/market/sigma_band.js`, added the
  route's first-ever test coverage (3 tests). (2) Fixed a stale `CLAUDE.md` doc note (commit
  `ecfd8bc8`) — its "Architecture Plan" section claimed the centralized asset picker (`tui/
  asset_picker.js`) was still upcoming; it had actually been done and integrated (9 real call sites)
  since 2026-06-12. Replaced the unrecoverable 5-phase outline with a pointer to `workspace/
  STATE.md`'s `## Current Phase`. Suite 558/556/0fail/2skip throughout (was 555/553 — +3 new tests,
  zero regressions); hygiene clean. **`graphify-out` refresh deliberately skipped again** — still
  stale since 2026-06-09, but this session's diff (one route fix, one new test file, one doc edit)
  is too small to justify the refresh, consistent with how prior sessions have repeatedly deferred
  it for similarly small diffs (e.g. session 32). **Next-session candidates** (none urgent, carried
  from session 52's audit, still open): `renameWithRetry` (`shared/lib/market/validation.js:601`)
  busy-waits the CPU instead of `Atomics.wait` and has zero test coverage despite sitting on every
  ts-index/JSON-cache write; 3 dead root shims (`shared/lib/{backfill,ingestion,market_validation}.js`)
  are safe to delete (4-layer-verified); a stale orphaned `data/cache/`+`data/models/*.json` left
  over from the `824d038e` path consolidation (gitignored, harmless, delete whenever); gateway's
  `processProposedOrders()` batch path silently swallows per-order failures (dormant, unreached
  today); 3 raw-`fetch` call sites in gateway still lack the retry helper already imported in the
  same files (`cycle.ts:69,123`, `market.ts:17`).
- **SESSION 52 (2026-06-21) — Deep blast-through audit only, nothing fixed yet (deliberate — user
  asked to note for next session, not fix now). Full findings + Gate Table: `workspace/DEV_REVIEW.md`
  ("Blast-Through Deep Audit — 2026-06-21 session 52" + its "continued" block). Audit anchor
  `3da6e612` in `STATE.md`.** **GATING BUG RESOLVED (session 53, commit `03b3c8d5`)** — see the
  session 53 entry in `workspace/handoff/2026-06-21.md` for the full fix trail; `backend/api/*` is
  no longer gated. Original finding kept below for history:
  `backend/api/server/routes/market/sigma_band.js:46` (`computeSigmaBand`/`readJsonSafe`) reads
  `query.input` straight into `fs.readFileSync` with no path-containment check, and the route
  (`/api/sigma-band`) is reachable with **zero authentication** (absent from both `isPublicRoute`
  and `PROTECTED_GET_ROUTES` in `backend/api/app.js`). Bounded impact (every read is `JSON.parse`'d
  first, so raw file contents never echo back — it's a file-existence + JSON-shape oracle, not full
  exfiltration) but real and unauthenticated; `backend/api/*` is graded **C/GATED** until this
  lands. Fix = mirror the `WEB_PUBLIC_ROOT` containment check already used for static files in
  `app.js:193-200`, or simplest: drop the `query.input` override entirely (no legitimate caller
  appears to use it — check `Frontend/dashboard/src` for any `input=` caller first). **Other
  non-gating items worth batching into the same pass** (all in `DEV_REVIEW.md`, none urgent): (1)
  `renameWithRetry` (`shared/lib/market/validation.js:601`) busy-waits the CPU instead of sleeping
  and has zero test coverage despite sitting on every ts-index/JSON-cache write — swap to
  `Atomics.wait` + add a forced-EPERM-failure test; (2) 3 dead root shims
  (`shared/lib/{backfill,ingestion,market_validation}.js`) are safe to delete (4-layer-verified,
  not a repeat of the session-29 false-negative trap); (3) stale orphaned `data/cache/`+
  `data/models/*.json` left over from the `824d038e` path consolidation (gitignored, harmless,
  `rm -rf` whenever); (4) gateway's `processProposedOrders()` batch path silently swallows
  per-order failures with no `ok:false`/exit code (dormant — only matters once something wires the
  `process` CLI command through the bridge); (5) 3 raw-`fetch` call sites in gateway still lack the
  retry helper that's already imported in the same files (`cycle.ts:69,123`, `market.ts:17`).

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

## Implementation Note - 2026-06-21 session 51 - Mass-Implement Gap Closures
- **Cron Concurrency Risk Fixed (Batch 1):** Addressed the structural concurrency risk in the gy-schedule workflow. Instructed the cron to enforce execution from an isolated git worktree (with symlinked storage/ and .env) so its automated self-healing commits do not accidentally scoop up uncommitted work from foreground agents.
- **Backend Bridge Bug Fixed (Batch 2):** Resolved the smart JSON extraction bug in shared/lib/runtime/backend_bridge.js where processes exiting with non-zero status codes were silently masked as ok: true if the partial payload contained ok: true. Validated with a hard process.exit(1) test.
- Both fixes deployed cleanly. Full test suite remains 100% green (553/555 passed, 2 skipped).

## Session 60 close-out (2026-06-26) — Signal pipeline + live data feed

### What shipped (5 commits)
- `f4820708` — type-to-search in all TUI pickers (no `/` prefix needed)
- `2bdbeafa` — `bt` now reads ts-index (1601 daily bars, data_end today) when family is known
- `3a2051d0` — PIN strip centralization + exit P&L bookkeeping fix
- `0e6ffd15` — Binance WebSocket live feed wired into backfill-daemon (closed 1m klines → ts-index)
- `1a47da70` — `sovereign bias <SYMBOL>` command: RSI/SMA/z-score/ATR across 4h/1d/1w, --json + coloured table

### Current BTC bias (as of session close)
SHORT across all 3 timeframes (4h RSI=27 oversold, 1d RSI=38, 1w RSI=36). Price $58,876, below all SMAs.
Signal expiry: 4h = 3 bars (~3 days), 1d = 7 bars, 1w = 4 bars.

### Open gaps (next session priorities)
1. **ML retraining** — lstm_v1/cnn_window_v0 return 0 trades; need training pipeline on real ts-index data
2. **bias + correlation** — `sovereign bias` is TA-only; wire mcp__sovereign__get_correlation into the output
3. **ponytail global** — auto-mode blocked editing ~/.claude/CLAUDE.md; user adds manually:
   ```
   # ponytail
   - **ponytail** (~/.claude/skills/ponytail/skills/ponytail/SKILL.md) - lazy senior dev mode
   When the user types /ponytail, invoke the Skill tool with skill: "ponytail" before doing anything else.
   ```
4. **graphify-out refresh** — stale, defer until next meaningful code change
5. **Gate.io market-order semantics** — empirical probe at index.ts:309-319 still pending

### Boot notes for next session
- `.mcp.json` exists at project root — mcp__sovereign__* tools should auto-load (gitignored, relative path)
- API server: `node backend/api/app.js` (port 8787) if MCP tools don't load
- Live feed: starts automatically when `backfill-daemon` runs without `--once`
- Suite baseline: 631/0fail/2skip on branch feat/ink-tui-refactor
