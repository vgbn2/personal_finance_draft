# Project State - Sovereign Trading Platform

<!-- BLAST-THROUGH AUDIT ANCHOR (read by the Recency-Ranked Audit Queue) -->
last_audited_commit: 5e60babb
last_audit_date: 2026-06-25

## Current Phase
Phase 9: Strategic Intelligence & TUI Integration - ACTIVE

## Process Note - 2026-06-25 session 59 - docs/ triage + workspace/BOOTSTRAP.md + docs/codebase_tour/ (committed `2865299f`, plus `264e4ee2` gitignore cleanup)
- User: "I'm starting to feel like I'm forgetting a lot of things in this repo due to vibecoding without
  documentation" — asked for a reverse-engineered, hands-on course covering the whole codebase.
- **Discovery before building anything**: this repo already has 30+ files under `docs/` (a canonical
  folder map, a 24-chapter ~5,000-line "build from scratch" book, architecture/product/technical specs,
  operational guides) — none of it is read during normal session boot (`session-orchestrator` only reads
  `workspace/*.md`; `CLAUDE.md` never mentions `docs/`). That's the more precise diagnosis than "no docs
  exist": the docs exist and silently fall out of session memory every time.
- **Triage findings** (full detail in `workspace/BOOTSTRAP.md`): `docs/engineering/codebase_org.md`
  (2026-06-08) is accurate. `docs/engineering/architecture_overview.md` (header dated 2026-05-14) is
  badly stale — it lists live broker execution as `*Planned*` and claims the C++ build doesn't compile
  the trading modules; both are false today. `docs/engineering/capability_manifest.md` describes a flat
  `backend/cli/commands/*.js` layout and SQLite/`data/` artifacts that don't match the real
  domain-subfoldered layout and `storage/data/ts/` binary format. `docs/operational/guides/testing_surface.md`
  describes a since-reorganized test layout. **17 of `docs/README.md`'s own links are broken** — every
  `docs/operational/*.md` reference points at files that moved into `guides/`/`roadmap/`/`local_first/`
  subfolders without the hub being updated.
- **Fixes**:
  1. `workspace/BOOTSTRAP.md` (new) — `session-orchestrator` already tries to read this file first every
     boot; it just never existed. Points at `docs/README.md`, carries the 3 stale-doc corrections above
     and the broken-link map, so this stops silently recurring.
  2. `docs/codebase_tour/` (new, 8 files, ~750 lines) — the genuinely-missing layer: real `file:line`-grounded
     module docs + hands-on labs (read this real file, trace this real order through N real files, run
     this real command) for the C++ core, data ingestion, strategy/backtest/ML, the live trading gateway
     (highest-stakes module — every claim spot-verified against current line numbers, not just trusted
     from research-agent output), the TUI/CLI dispatch model, the web dashboard/API, and the real test
     setup. Cross-links to existing `docs/engineering/*` instead of duplicating what's already accurate.
- **Verified**: `npm run hygiene` clean after adding all 9 files. Every command cited in a lab was
  cross-checked against this session's own direct file reads (not assumed from the research-agent
  summaries alone) — e.g. `auto-trade --passes 1`'s `ai_agent_trading` feature-gate requirement was
  confirmed by grep before being added as a lab caveat.
- Nothing else changed; this is docs-only, additive, no code touched.

## Fix Note - 2026-06-25 session 59 - Trade still defaulted to the interactive wizard ("legacy") from the dashboard (UNCOMMITTED)
- User report: picking `alpaca` from the dashboard's Trade section still felt like "defaulting to the
  legacy version" even after session 58's INTERACTIVE_CMDS fix. Root cause: the manifest's `alpaca`
  entry had `flags: {}`, so it always launched with `args=[]`, which `commandTrade` treats as
  "no args at all" -> the full multi-step interactive wizard (`promptTradeDeskArgs`: action -> symbol
  -> qty -> order type -> live confirm), a different code path from the literal legacy TUI but the
  same full-screen prompt-sequence experience.
- Fix: the `alpaca` manifest entry now carries real `--action/--symbol/--qty/--order-type/--price/
  --pin/--live` flags; a new pure `buildTradeArgsFromActionFlag` in `trade.js` translates them back
  into the wizard's own positional shape (e.g. `['buy','AAPL','10','market']`) before `commandTrade`'s
  dispatch, so the `args.length===0` branch is never reached from the dashboard. Removed `alpaca` from
  `INTERACTIVE_CMDS` — it now runs in-pane like the rest of Trade. Bare CLI usage (`alpaca`/`trade`
  with no args, typed directly in a terminal) is unchanged — still gets the guided wizard.
- Verified: `defaultFlagValues`+`buildArgv` traced end-to-end confirming pressing Run with untouched
  defaults yields `args=['balance']` after translation (never empty); a buy+live case traced to
  `['buy','AAPL','5','market','--live']`. 7 new unit tests
  (`tests/scripts/lib/trade_args_from_action_flag.test.js`). Full suite **630/628/0fail/2skip** (+7
  over the post-mass-implement 623/621 baseline), hygiene clean — including the dashboard's own
  snapshot/PIN-gate tests (unaffected).

## Implementation Note - 2026-06-25 session 59 - Mass-implement: all 3 audit findings FIXED (UNCOMMITTED)
- Closed all 3 findings from this session's own blast-through pass (below). Suite **623/621/0fail/2skip**
  (+7 tests over the 616/614 baseline), hygiene clean. Nothing committed yet — pending user go-ahead.
- **Exit-clamp bookkeeping (Medium, the real bug):** new pure `buildExitOutcome` helper in
  `alpaca_bot_cycle.js` fixes `runAlpacaExitCheck` to record P&L on the actually-sold qty (not the
  pre-clamp tracked qty) and keep the unsold remainder tracked instead of dropping it when a sell is
  clamped (e.g. two positions stacked on one symbol sharing a broker balance). `shared/lib/runtime`
  re-graded B→A. 4 new tests.
- **PIN-strip centralization (Low, no active leak was found):** `stripFlagValue` moved into
  `shared/lib/runtime/backend_bridge.js`; `buildTradeGatewayLaunch` now strips `--pin` unconditionally
  for all 8 callers, not just `commandTrade`. `backend/cli/lib/utils.js` re-exports the canonical
  version. 3 new tests.
- **5 stale dev-review comments cleaned** in `sovereign_dashboard.mjs`'s manifest (doc-alignment only,
  no behavior change) — see `DEV_REVIEW.md` for exactly which lines and why each was confirmed stale.
- Files touched: `shared/lib/runtime/alpaca_bot_cycle.js`, `shared/lib/runtime/backend_bridge.js`,
  `backend/cli/lib/utils.js`, `backend/cli/sovereign_dashboard.mjs`,
  `tests/scripts/lib/alpaca_bot_cycle.test.js`, new `tests/scripts/lib/backend_bridge.test.js`.

## Audit Note - 2026-06-25 session 59 - Focused blast-through (anchor 1c7227b7→5e60babb), review-only
- Tier 1 = the 3 commits since the last anchor (`cf4f7026`,`13bc91f0`,`5e60babb`); 2 of the 3 had never
  been audited. No section was gated, so no Tier-3 carryover was mandatory. Full findings + Gate Table:
  `workspace/DEV_REVIEW.md` ("Focused Blast-Through — 2026-06-25 session 59"); `REVIEW_LEDGER.md` stamped.
  DCS 0.97→0.96. **No gating findings; nothing fixed (review-only).**
- **Real finding:** the session-58 oversell clamp (`resolveExitQty` in `alpaca_bot_cycle.js`) stops a
  broker-level oversell when two tracked positions share one symbol, but `runAlpacaExitCheck`'s
  bookkeeping afterward is wrong — `realizedPnl` uses the pre-clamp `position.qty` instead of the
  actually-sold amount, and the unsold remainder is dropped from tracking entirely instead of staying
  open. Zero test coverage on this integration function (only the pure helpers are tested). Medium,
  not gating (the broker-safety property itself holds) — next debt-clearing move.
- **Verified empirically (no active leak):** traced every `--pin` write site repo-wide and confirmed the
  `cf4f7026` PIN-strip fix covers the only 2 paths that ever populate it; flagged (informational only)
  that the strip lives at one caller instead of inside `buildTradeGatewayLaunch` itself, so it isn't
  defense-in-depth against a future caller.
- 5 stale "crashes"/"TODO" dev-review comments found in `sovereign_dashboard.mjs`'s manifest (chart
  SMA/volume already shipped session 55; cockpit/polymarket-markets/derive-creds/login crash fix
  confirmed still in place since session 54) — cosmetic, flagged for cleanup.
- `shared/lib/runtime` re-graded A→B pending the fix above; `backend/cli` stays B+ (re-verified clean
  on the 2 previously-unaudited commits).

## Implementation Note - 2026-06-23 session 58 - Trade-section UX fixes (commits 13bc91f0, 5e60babb)
- **Trade section "dropped me into legacy" (commit `13bc91f0`):** root-caused NOT a crash — `strategy`/
  `prop-firms`/`run`/`trade favorites` were in `sovereign_dashboard.mjs`'s `INTERACTIVE_CMDS`, so
  activating them unmounted the Ink dashboard into the old prompt-menu CLI (reads as the legacy UI).
  They each render a safe read-only summary non-interactively, so they now run **in-pane**. Only truly
  input-driven entries (alpaca/mt5/add-platform/login/register/polymarket wizards/cockpit) still take over.
  `commandStrategyMenu` got a non-interactive `list` path (was auto-resolving to `new` → "requires a name").
  Added a launch-guarded global crash handler writing to `workspace/dashboard_crash.log` (these `//crashes`
  reports never left a stack before).
- **CORRECTION to the session-57 claim** below ("CLI + one dashboard manifest entry"): that dashboard
  entry only ever existed in the **legacy** `tui/manifest.js`, NOT the Ink dashboard's own inline `M` — so
  the position tracker was invisible in the dashboard. **Fixed (commit `5e60babb`):** added a `positions`
  entry (`auto-trade status`) to the dashboard Trade section (after `auto-trade`, index 5; index 4 stays
  `auto-trade` so the nav test's pinned index holds), runs in-pane with a `--live` toggle. Also moved the
  read-only `status` branch ahead of the `ai_agent_trading` feature gate so viewing positions never needs
  the live-trading flag enabled. The dashboard uses its own `M`, not `manifest.js` — a structural gotcha
  worth remembering.
- **Verified:** suite 616/614/0fail/2skip across both commits; dashboard + in-pane hang-safety sweep 19/19;
  hygiene clean. **Real-terminal confirmation still the user's** (in-pane feel, no conhost in CI).

## Implementation Note - 2026-06-23 session 58 - All 4 review findings FIXED + TUI live toggle (commit cf4f7026)
- Mass-implement pass closing the session-58 review's 4 OPEN findings (below), all on this/last session's
  code. One commit `cf4f7026` (7 files, +183/−9), scoped to code+tests only (cron data artifacts + workspace
  docs excluded per practice).
- **Finding 1 (maxPositions):** `runAutomationPass` loads the post-exit position count + cap and gates new
  live buys via pure `canOpenPosition(openCount, maxPositions)` in `alpaca_bot_cycle.js`; increments locally
  per recorded entry. Dry-run path untouched (cap only gates `isLive`).
- **Finding 3 (entry qty):** pure `resolveEntryQty(brokerPos, requestedQty)` — records the broker's filled
  qty (partial-fill safe), falling back to requested only when the broker reports nothing usable.
- **Finding 4 (exit oversell):** pure `resolveExitQty(positionQty, availableQty)` + a per-symbol
  `availableBySymbol` counter decremented after each sell; skips firing (drops stale tracking) when ≤0, so
  two stacked positions on one symbol can't oversell the real holding.
- **Finding 2 (PIN leak):** new exported `stripFlagValue(args, name)` in `backend/cli/lib/utils.js`;
  `commandTrade` now calls `buildTradeGatewayLaunch(stripFlagValue(args, '--pin'))` so the PIN (consumed by
  the in-process gate) never reaches the spawned gateway's argv. One fix point covers manual + bot entry +
  bot exit paths.
- **TUI (the 5th item found mid-pass):** the dashboard "Positions" entry (`manifest.js`) got a `--live`
  confirm toggle (default false) so `auto-trade status`'s P&L reads the live account instead of silently
  showing paper positions while the bot trades live.
- **Verified:** full suite **616/614/0fail/2skip** (was 605/603; +11 new pure-helper/strip tests, zero
  regressions); manifest-sensitive tests (dashboard nav + `cli_ui_contract`) 39/39; `npm run hygiene` clean.
  Grades moved: `shared/lib/runtime` B→**A**, `backend/cli` B→**B+** (ledger stamped at `cf4f7026`).
- Session note: a sustained Anthropic-side safety-classifier outage repeatedly refused write/exec tool calls
  this session; the full suite was run by the user in their shell, the rest verified once the classifier
  recovered. No behavior impact.

## Audit Note - 2026-06-23 session 58 - Deep order-placement review DONE (the session-57 flag, now closed)
**The session-58 deep review ran as a full blast-through (anchor `0903df6b`→`1c7227b7`).** Full findings,
verified-good list, stub/dup sweep, and per-section grades: `workspace/DEV_REVIEW.md` ("Blast-Through Deep
Review — 2026-06-23 session 58"); ledger stamped in `workspace/REVIEW_LEDGER.md` (every in-scope row now
has a real 2026-06-23 timestamp — `backend/core` is no longer carried-forward-unreviewed). DCS 0.96→0.97.
**No gating findings.** All three execution surfaces traced; Polymarket `cycle.ts` and the new Alpaca
cycle reviewed under live-trading scrutiny. Verified-good: gateway single-order failure propagates a
non-zero exit code (so the bot never records a phantom position on a failed buy / never drops a position on
a failed exit sell), risk-engine + PIN gate both fail closed, Alpaca 422 fix intact, new runtime tests
11/11. **C++ core:** builds, 28/29 ctest green; the one fail (`kronos_integration_test`) is a data-
availability failure ("need ≥4 points"), not a regression.

**OPEN findings → next debt-clearing move (NOT new features; all on this/last session's code):**
1. **[Medium-High] `maxPositions` never enforced** — `runAutomationPass`/`recordAlpacaEntry` open new live
   positions without checking `state.positions.length` against `config.maxPositions` (the `auto-trade
   status` view implies a cap that doesn't exist). Unattended loop can exceed its own concurrency limit.
2. **[Medium] Trade PIN leaks into the gateway subprocess argv** — `commandTrade` passes `--pin <SECRET>`
   through to `buildTradeGatewayLaunch(args)`; the PIN shows up in OS process listings. Gateway never
   consumes it. Fix = strip `--pin`+value before spawn (one point covers all 3 live paths).
3. **[Medium] Entry records requested qty, not broker filled qty** (`recordAlpacaEntry`) — partial fills
   make the tracked qty exceed the real holding; the later exit can oversell. `brokerPos.quantity` is
   already in scope.
4. **[Medium] Same-symbol stacking → exit oversell** — no per-symbol dedup before entry; the exit loop
   sells each tracked position's qty independently against one snapshot. Reconcile exit to
   `min(position.qty, brokerPos.quantity)`.
Suggested single focused commit for 1/3/4 (`alpaca_bot_cycle.js`+`strategy.js`) + a one-line fix for 2
(`trade.js`). Nothing implemented this session — review-only per the flag.

## Process change - 2026-06-23 session 57 - permanent Review Ledger + Stub/Duplication Sweep added to blast-through
- User asked for a centralized, timestamped record of when each part of the repo was last reviewed,
  plus a permanent stub/duplicate-cleanup pass folded into every blast-through run (not an occasional
  deep-clean). Built both:
- **`workspace/REVIEW_LEDGER.md`** (new) — one row per top-level directory: last-reviewed commit/date,
  grade, and stub/dup sweep status. Centralized (one file, not per-folder) on purpose — this repo
  already manages `STATE.md`/`HANDOFF.md`/`DEV_REVIEW.md` the same way, and a per-folder version would
  be a new class of doc-rot risk the existing hygiene check doesn't scan for. Formalizes blast-through's
  existing "Standardized Section Grades" output (previously one-shot, buried in `DEV_REVIEW.md` history)
  into a cumulative, always-current record.
- **`skills/blast-through/SKILL.md`** updated: Section 1 now reads the ledger first to prioritize the
  stalest directories; new **Section 3 (permanent)** is a stub/duplicate sweep checklist that encodes
  the session-55 dead-shim grep lesson directly (`<name>(\.js)?['"]`, not `<name>['"]` — the bare version
  silently misses `require('.../name.js')` and produces false "0 consumers," which is exactly what
  wrongly flagged `polymarket_history.js` as dead that session); new **Section 6 (permanent)** makes
  updating the ledger a required last step of every run, not optional cleanup. Output Shape (now
  Section 7) gained two new required items: sweep results and ledger-update confirmation.
- Seeded the ledger's initial rows from already-known audit history (session 52-57 grades/dates) rather
  than leaving it empty on day one.

## Implementation Note - 2026-06-23 session 57 - Alpaca position tracker + auto-exit loop (commit 17f565fb)
- The Alpaca `auto-trade` automation loop (`strategy.js`'s `runAutomationPass`) was entry-only —
  backtested strategies fired live buys with no stop-loss/take-profit/max-holding-day exit and no
  position memory beyond a signal-dedup ledger. Session 50's log shows 8 orphaned `auto-trade --live`
  processes from exactly this gap. Built the JS equivalent of Polymarket's `bot_state.ts`/`cycle.ts`:
  `shared/lib/runtime/process_lock.js` (PID-staleness lock), `alpaca_bot_state.js` (persistent
  position/config state, atomic writes), `alpaca_bot_cycle.js` (pure `decideExit` target/stop/age
  logic + `runAlpacaExitCheck`/`recordAlpacaEntry`).
- Wired into `strategy.js`: `runAutomationPass` reviews/exits tracked positions before scanning for
  new entries (mirrors Polymarket's review-then-buy ordering); records every live fill using the
  broker's real average price (re-queried via a new gateway `positions` command), not the signal
  price. New gateway `positions` command added specifically because `aggregate_portfolio` dedupes
  by symbol across brokers and would contaminate a same-ticker exit check.
- `auto-trade status` (CLI + one dashboard manifest entry) shows open positions, live P&L, recent
  exits.
- Scope was narrowed via `AskUserQuestion` before building: chose "full bot loop with exits" over a
  read-only tracker, given the live-capital risk of leaving an entry-only loop running unattended.
- **Verified live, not just unit tests:** smoke-tested the full entry→exit lifecycle by hand — real
  fill-price reconciliation against simulated broker positions, a forced age-exit closing a tracked
  position and logging realized P&L with no real order fired (dry-run), and a real
  `auto-trade --passes 1` dry-run pass end-to-end. Suite **605/603/0fail/2skip** (+11 new tests, zero
  regressions), `npm run hygiene` clean, gateway `tsc --noEmit` exit 0.
- Also committed session 56's prior uncommitted work as-is (`5c5fb867`) after confirming the two
  failures on the first full-suite run that session (`macro_ingestion_contract`,
  `bt --strategy` cycling) were flakes (passed clean in isolation and on a clean rerun).

## Implementation Note - 2026-06-23 session 56 - "/" chat suggestions + cursor-robustness + legacy-TUI engine switch (UNCOMMITTED)
- Chat bar's `/` opens a live-filtered command dropdown rendered inside the same bordered box
  (`suggestCommands`/`allCommands` exported from `chat_parser.js`); ↑↓ cycles, Tab fills the
  highlighted command into the input (no double-handling -- `ink-text-input` already ignores
  up/down/Tab internally). Cursor-position math generalized from a fixed `H-3` to
  `H-3-suggestionRowCount` (one shared variable feeds both the render and the cursor effect).
  Also fixed a separate latent bug: the input row had no height cap, so Ink's default text-wrap
  could grow it on a long typed command and silently break the cursor regardless of this feature --
  `height:1`+`overflowY:'hidden'` clips instead of growing now.
- `Settings > Layout > legacy` now does what it should: exits the Ink dashboard
  (`sovereign_dashboard.mjs`'s `handleRun` calls `exit()` right after the settings command
  persists) and hands off to the real older `runInteractiveMenu` engine (`tui/engine.js`), already
  toggled today via `LEGACY_TUI=1` env var in `sovereign_cli.js`. A first attempt that just hid the
  chat bar inside the same dashboard was wrong (user: "NO DIFFERENCE, shouldn't it just log out of
  this") -- reverted in favor of this. Wired the inverse too: picking `default`/`compact`/
  `research` from inside the legacy menu (`tui/manifest.js` gained `'legacy'` as a 4th preset
  option there too) now returns from `runInteractiveMenu` instead of looping its own menu, and
  `sovereign_cli.js`'s `main()` is now a real loop between the two engines -- but only relaunches
  when `loadSettings().layout` actually changed during that run (caught and fixed a self-inflicted
  regression: a naive "relaunch on every exit" loop would trap a normal `q`-quit forever, since
  neither engine's exit path distinguishes "quit" from "switched layout").
- **Verified:** suite 594/592/0fail/2skip (multiple reruns); hygiene clean. Dashboard-self-exit
  direction proven end-to-end via the Ink fake-TTY harness (throwaway smoke scripts, deleted after
  each run). Legacy→dashboard direction verified by code trace + argv-shape matching only -- no
  existing test harness drives `runInteractiveMenu`'s `promptSelect` flow.
- **All UNCOMMITTED** on `feat/ink-tui-refactor`. 6 files: `sovereign_dashboard.mjs`,
  `sovereign_cli.js`, `tui/chat_parser.js`, `tui/engine/engine.js`, `tui/manifest.js`,
  `shared/lib/settings/user_settings.js`. Full trail: `workspace/handoff/2026-06-23.md`.
- **Still open:** live-terminal confirmation of the legacy→dashboard switch direction. User
  floated screen-sharing as a future way to debug interactive TUI work together; deferred.

## Fix Note - 2026-06-22/23 session 55 (cont.) - Windows-conhost typing-lag/cursor RESOLVED
- The `sovereign_dashboard.mjs` chat-input typing bug on Windows conhost (chars ghosting/misplacing)
  is **fixed, user-confirmed**. A standalone raw-mode probe proved raw mode works + no terminal echo,
  so it was Ink **mis-positioning**, not echo. Root cause: forced alternate screen buffer
  (`\x1b[?1049h`) + fullscreen height made Ink's win32 per-keystroke full-frame redraw place the cursor
  wrong on conhost.
- Fix (several commits): render in **normal flow** (no alt-screen; non-fullscreen `rows-2` height,
  `undefined` headless) `f47c0cb4`; clear-on-mount `7cf5e90d`; ink-text-input `<TextInput>` `e5976c6f`;
  boxed input `6626a298`; **final (user-authored) `521372b3`** = ink `useCursor()` relocating the real
  hardware cursor into the input cell + `showCursor:false` + `\x1b[?25l/h`, chat bar moved below footer.
  Added an `!process.stdout.isTTY` guard so the cursor-only frame doesn't clobber fake-TTY snapshot
  tests. The `rows-1` height hack `77cd31a7` was tried and **reverted** `54a664e3`.
- **Verified:** suite 594/592/0fail/2skip, hygiene clean. Durable recipe in memory
  `reference-ink-windows-fullscreen-lag`. graphify-out stale again for this dashboard rewrite (deferred).

## Implementation Note - 2026-06-22 session 55 (pass 2) - all 4 carryovers + last debt item
- Second mass-implement pass: cleared the remaining debt + **all four open carryovers**. Suite
  **594/592/0fail/2skip**; hygiene clean; gateway tsc exit 0.
- **Gateway `processProposedOrders`** (`index.ts:757-801`): inspects `order.status` per order, sets
  `process.exitCode=1` + summary on any failure (was silently swallowed). Commit `4f65c7aa`.
- **Chart upgrade — all 3 parts done** (carryover #1): `renderCandlestickChart()` with candlestick
  body+wick, yellow SMA(N) overlay, volume subplot; `--style candle`/`--sma`/`--volume` flags.
  Commits `79d2129f`, `2d17aa26`.
- **Typing-lag fix** (carryover #2): root cause = Ink 7 full-clears every frame on `win32 && fullscreen`
  (`ink/build/ink.js:100`); root Box forced `height: process.stdout.rows`. Capped to `rows-1` →
  incremental line-diff path. Commit `77cd31a7`. **Real-conhost confirmation still the user's.**
- **graphify-out** (carryover #4): AST-only refresh, 11,015→11,542 nodes / 958 communities
  (gitignored, not committed). Full semantic skipped — doc-change set was mostly noise; tighten
  `.graphifyignore` first.
- **Carryover #3 (real-terminal confirmation)** remains the user's: `bt --strategy`, `backend visualize`
  force-ingest, and now the typing-lag fix all need a live terminal check (no conhost in CI).
- An external label-shortener (cron) trimmed the `--sma`/`--volume` manifest labels mid-session;
  harmless, tests green, folded into the typing-lag commit and disclosed there.

## Implementation Note - 2026-06-22 session 55 - blast-through audit + mass-implement (3 backlog debts cleared)
- **Focused audit** (anchor `03b3c8d5`→`0903df6b`): session-54 TUI/chat surface traced clean. The new
  LLM command resolver (`chat_llm_fallback.js`) verified **shell-safe by code-trace** — full chain
  `text → manifest-validated flagValues → buildArgv (argv array) → spawn(execPath, [...argv])`, no
  `shell:true` anywhere, plus a mandatory confirm gate. No security/crash/data-loss findings. DCS 0.95→0.99.
- **Mass-implement, 3 batches, all verified** (suite 583/581/0fail/2skip; hygiene clean; gateway tsc exit 0):
  - **A:** `renameWithRetry` (`shared/lib/market/validation.js:611`) CPU busy-wait → `Atomics.wait` real
    sleep; exported + added `tests/scripts/lib/rename_with_retry.test.js` (3 tests, first-ever coverage).
    verification lens **B→A** on shared/lib/market.
  - **B:** deleted 3 dead root shims `shared/lib/{backfill,ingestion,market_validation}.js`.
  - **C:** gateway 3 raw `fetch` → `fetchWithRetry` (`cycle.ts:69,123`, `market.ts:17`+import); finishes
    the 2026-06-12 fetch-retry rollout.
- **Caught my own audit error:** flagged `shared/lib/polymarket_history.js` as a 4th dead shim, but the
  dead-check grep anchor missed the `.js`-extension require form; `polymarket_backtest.test.js` requires
  it → deletion broke the test → **restored** (recovery rule). Lesson recorded: dead-check grep must use
  `<name>(\.js)?['\"]`. Anchor stays `0903df6b` (audit pre-existed these fixes; new code uncommitted).
- Closed all 15 dev-review annotations the user had left inline in `sovereign_dashboard.mjs`'s
  manifest: shared-root-cause crash fix for cockpit/polymarket markets/polymarket derive-creds/
  login (Windows console-group SIGINT broadcast killing the parent, not 4 separate bugs), a real
  `null`-vs-`undefined` default-param crash in `polymarket backtest` (`archivePaths()`), watch/
  ingest piping raw ANSI control codes into the dashboard's captured output, type-to-edit for flag
  fields, a strategy picker for `bt --strategy`, a bounded force-ingest fallback for `backend
  visualize`, and a `watch --symbol` live-chart mode.
- Built a chat-style command input (`backend/cli/tui/chat_parser.js` deterministic resolver +
  `chat_llm_fallback.js` local-Ollama fallback) as the dashboard's new default entry point. Both
  paths route through one shared `runOrGatePin()` so the `--live` PIN gate applies identically
  regardless of how a command was produced — caught a real bug where the PIN view's render was
  silently broken for a chat-resolved command (gated on the grid's own `cmd` selection, always
  `null` from chat). Rebuilt the chat UI mid-session from a full alternate page into a thin
  single-line bar underneath the always-visible grid, per user feedback.
- Fixed a real `--width` overflow bug in `renderPriceChart()` (didn't account for its own ~12-char
  label/border overhead) by clamping to `process.stdout.columns`. Diagnosed (deferred,
  user-approved) a PowerShell-conhost typing-lag issue (full-tree Ink re-render on every keystroke
  needs multi-line cursor movement that console host mishandles) and researched a candlestick/
  volume/SMA chart upgrade (terminus + lightweight-charts for reference) — both documented inline
  next to the relevant code for next session.
- **Caught and fixed a real process leak**, not just a test artifact: repeated PIN-gate test runs
  left 8 orphaned `sovereign_cli.js auto-trade --interval 15 --live` child processes running
  (discovered via `tasklist`, not by the suite itself). Killed all 8 with explicit user
  confirmation first (live-trading platform); hardened both PIN-gate tests to unconditionally
  abort via Escape rather than conditionally on a timeout.
- 2 commits: `95a9c547`, `a0a5cda5`. **Verified:** suite 580/578/0fail/2skip throughout; `npm run
  hygiene` clean. Full trail: `workspace/handoff/2026-06-22.md`.
- `graphify-out` **not refreshed** — large diff (2 new files, substantial dashboard rewrite);
  flag for next session if touching dashboard/chat code again.

## Fix Note - 2026-06-21 session 53 - sigma-band gating finding closed (commit 03b3c8d5)
- Closed the one gating finding from session 52's audit below: `backend/api/server/routes/market/
  sigma_band.js` no longer reads `query.input` at all — `computeSigmaBand` always resolves against
  the fixed `DEFAULT_SNAPSHOT`. Verified no legitimate caller anywhere in the repo (dashboard panel,
  MCP tool schema) ever sent `input`; the MCP `get_sigma_bands` tool doesn't even call this route.
- Added a code-only `{ snapshotPath }` second argument (never reachable from `query`/HTTP — `handle`
  still calls `computeSigmaBand(query)` with one argument) so the route's previously-zero test
  coverage could exercise the real band-math without depending on the real, possibly-absent
  `backtest_history.json`. New `tests/web/server/sigma_band_route.test.js` (3 tests): handle()
  with/without a malicious `input` produce byte-identical output; real band stats computed
  correctly against an injected fixture; `query.input` ignored even when both args are supplied.
- **Verified:** suite 558/556/0fail/2skip (was 555/553, exactly +3 new tests, zero regressions);
  `npm run hygiene` clean; manual before/after smoke check against the original exploit shape
  (`input:'C:/Windows/win.ini'`) confirmed identical output with/without.
- `backend/api/*` is no longer gated. Audit anchor bumped to this commit (post-fix HEAD).

## Audit Note - 2026-06-21 session 52 - Deep blast-through (recent code + data pipeline)
- Anchor `d21e25ce` → `3da6e612`. DCS ≈0.96 start/end — no crash/data-loss findings. Full Gate
  Table + LOC breakdown in `workspace/DEV_REVIEW.md` ("Blast-Through Deep Audit — 2026-06-21
  session 52"). Headlines: (1) `renameWithRetry` (`shared/lib/market/validation.js:601`, added
  2026-06-20) implements its retry delay via a busy-wait CPU spin instead of `Atomics.wait`, and
  has zero test coverage despite sitting on every `writeJson`/`mergeWriteBin` call in the pipeline
  — contained debt, not gating, suggested fix is a one-line swap + a forced-failure unit test.
  (2) 3 root shims (`shared/lib/{backfill,ingestion,market_validation}.js`) independently
  4-layer-verified dead (re-checked myself, not just the sub-agent, given this exact shim layer
  caused a real false-negative in session 29) — safe to delete. (3) Live `backend integrity --json`
  flagged 3 `CPER` grain_suspect entries; direct `readTsIndex` probe confirmed genuine thin-liquidity
  ETF behavior (real 5-min-spaced bars interleaved with real multi-day gaps), not the
  daily-mislabeled-as-intraday corruption shape from session 35 — informational only. (4) The
  recent gap-aware-fetch/incremental-flush (`e5e21ef1`), path-consolidation (`824d038e`), and
  stop-daemon (`5d9d2e23`) commits all traced clean on full-diff review. Gate Table is all-OPEN;
  no section gated.
- **Extended same session ("any more bugs in other sections?"):** audited `backend/api/` and
  `backend/gateway/src/` (both untouched ~10 sessions, highest blast-radius surfaces). **Real
  finding, GATING:** `backend/api/server/routes/market/sigma_band.js:46` — `query.input` flows
  unsanitized into `fs.readFileSync`, reachable with zero auth (`/api/sigma-band` is in neither
  `isPublicRoute` nor `PROTECTED_GET_ROUTES`); personally re-verified the route registration and
  auth gate before grading `backend/api/*` C/GATED. Bounded impact (JSON-shape+existence oracle,
  not raw file exfiltration) but real and unauthenticated. Also corrected a stale Centralization
  Backlog entry: gateway's 2026-06-12 fetch-retry rollout was reported unfixed but is ~90% done
  (3 raw-fetch call sites remain). Gateway graded B+ (1 dormant, currently-unreached batch-order-
  failure-swallowing gap). `Frontend/dashboard` confirmed not dead. `backend/core` (C++) not
  re-scanned — zero commits touched it in ~10 sessions, carried forward.

## Implementation Note - 2026-06-21 session 51 - Scheduled agy-schedule workflow cron (Iteration 24)
- **Iteration 24 (Dry-Run)**: Successfully executed iteration 24 of the `/agy-schedule` cron workflow.
- **Actions taken**:
  - Cleared stale `workspace/.agy.lock` after server restart.
  - Health check ran cleanly (`status --json`).
  - Codebase Documentation Sweep: Added JSDoc comments to date coverage utility functions in `backend/cli/commands/tools/backend_correlation.js`.
  - Auto-saved portfolio state and docs changes via atomic commits.

## Implementation Note - 2026-06-21 session 50 - Dashboard crash fix + Polymarket-cockpit integration + OHLCV chart feature
- **Root-caused the login/register dashboard crash** (distinct from the already-shipped `034c5b52` unmount-timing fix): zero `process.stdin.on('error', ...)` handlers existed anywhere under `backend/cli/` — an `EventEmitter` `'error'` with no listener crashes the process synchronously, bypassing all async/await rejection handling. Added one guard in `sovereign_cli.js`'s `main()` (covers all 12 `INTERACTIVE_CMDS` entries via the shared spawned-child `process.stdin`); separately, `lib/auth.js`'s `promptLine`/`makeReadlineMasked` now honor `SOVEREIGN_NONINTERACTIVE` (mirrors `engine.js`, and is what makes login/register testable headlessly for the first time) with `_nonTtyRl` recreate-on-close; `commands/account/auth.js` and `commands/trade/trade_mt5.js` wrap their prompt calls in try/catch. Full Gate Table audit in `workspace/DEV_REVIEW.md` ("Blast-Through Full Audit — 2026-06-21 (dashboard interactive surface)").
- **Polymarket wired into the cockpit's portfolio card** (`status.js`'s `buildCockpitModel`/`summarizePortfolioCard`) — was previously reading only a static `portfolio.json` that has no `equity` field at all, so the card always showed "portfolio unavailable" regardless of Polymarket. Reuses the exact `spawnSync(buildTradeGatewayLaunch(...))` pattern already proven in `trade_polymarket.js`, opt-in via `buildCockpitModel({includePolymarket:true})` so the dashboard's existing fast, offline, periodic health-dot poller (`dashboard_exec.js`'s `loadDashboardHealth`) and every test caller stay untouched (caught empirically: making it the default added a real ~5s network round-trip to 2 previously-instant unit tests).
- **New `backend chart` command** — ANSI OHLCV/line chart (`renderPriceChart` in `tui/visualizations.js`, reuses `research_render.js`'s `sampleSeries` for downsampling and the `readTsIndex`-first/shallow-cache-fallback pattern from `backend_visualize.js`). New manifest entry deliberately appended LAST in the Backend category (not next to `backend visualize`) to avoid shifting `sovereign_dashboard.test.js`'s hardcoded `initialCmdI:4` for `backend universe`.
- **Test-harness extension**: extracted the fake-TTY Ink harness helpers from `sovereign_dashboard.test.js` into a shared `tests/scripts/tui/dashboard/_harness.js` (adds a reusable `withTimeout` hang-detector); added an additive INTERACTIVE_CMDS hang-safety sweep to `dashboard_command_safety.test.js` (the prior sweep explicitly excluded all 12 interactive commands, which is exactly why this bug class had zero coverage).
- **Concurrency incident, disclosed:** the `agy-schedule` cron (running every 15min throughout this session) auto-committed some of this session's own uncommitted work under its own commit messages mid-session (`9f1ee5b3` captured the test-harness-extraction deliverable; `55b47a7c` captured a transient, internally-inconsistent mid-edit snapshot of the `DEV_REVIEW.md` audit table, caught and corrected in a clean follow-up commit, not amended). The cron's Step 1 "self-heal and commit if green" rule does not currently distinguish its own remediation from another agent's in-progress uncommitted work sitting in the same tree — flagging as a process gap for the user to consider hardening (e.g. detecting a concurrent interactive session before auto-committing), not something fixed in this pass.
- Full suite **555 tests / 553 pass / 0 fail / 2 skip**; `npm run hygiene` clean.

## Implementation Note - 2026-06-21 session 49 - Scheduled agy-schedule workflow cron
- **Scheduled agy-schedule workflow**: Configured a recurring cron job `*/15 * * * *` to run `/agy-schedule` every 15 minutes via the `schedule` tool (Task ID: `task-54`), ensuring continuous sweeps. Executed and verified iterations 1, 21, and 22 successfully in dry-run (mock) mode, confirming dynamic market data sync, broker connection health, auto-trade scanning, and codebase documentation sweeps.


## State update — 2026-06-26 session 60

Signal pipeline now functional end-to-end:
- `bt` reads ts-index (not sparse last_fetch.json) — 1601 bars, data_end today
- `sovereign bias <SYMBOL>` — TA-based long/short/neutral across 4h/1d/1w, auto-backfills first
- Binance WebSocket feed live in backfill-daemon — 1m klines → ts-index in real time
- .mcp.json at project root — MCP tools auto-load next session

ML strategies still return 0 trades (lstm_v1/cnn_window_v0 untrained on real data) — separate gap.
Suite: 631/0fail/2skip. Branch: feat/ink-tui-refactor.
