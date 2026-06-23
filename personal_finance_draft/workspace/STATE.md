# Project State - Sovereign Trading Platform

<!-- BLAST-THROUGH AUDIT ANCHOR (read by the Recency-Ranked Audit Queue) -->
last_audited_commit: 0903df6b
last_audit_date: 2026-06-22

## Current Phase
Phase 9: Strategic Intelligence & TUI Integration - ACTIVE

## NEXT SESSION FLAG (set 2026-06-23 session 57, by explicit user instruction)
**Session 58 is a deep review session, not feature work.** Scope: check the relevant files and
the API-bot connections that place real orders, across all three execution surfaces — TradFi
(Alpaca equities), crypto (Alpaca crypto + Gate.io), and prediction markets (Polymarket). See
`workspace/handoff/2026-06-23.md` session 57's closing block for suggested starting points
(the three `BrokerAdapter` implementations + `ExecutionGateway.execute()` in
`backend/gateway/src/index.ts`, both live unattended bot loops — Polymarket's `cycle.ts` and the
Alpaca tracker/cycle just built this session — and the PIN/auth/feature-gate chain). Nothing
scoped into a plan yet; this is a framing flag for next session's boot, not a completed audit.
This should be run as a real `blast-through` audit (see `skills/blast-through/SKILL.md`) against
those specific directories — check `workspace/REVIEW_LEDGER.md` first for which of them are
stalest (`backend/core` C++ hasn't been touched in ~10+ sessions; `shared/lib/runtime` is brand
new and author-reviewed only).

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

