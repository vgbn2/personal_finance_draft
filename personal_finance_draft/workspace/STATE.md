# Project State - Sovereign Trading Platform

<!-- BLAST-THROUGH AUDIT ANCHOR (read by the Recency-Ranked Audit Queue) -->
last_audited_commit: 0903df6b
last_audit_date: 2026-06-22

## Current Phase
Phase 9: Strategic Intelligence & TUI Integration - ACTIVE

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

