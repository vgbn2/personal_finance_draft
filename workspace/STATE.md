# Project State - Sovereign Trading Platform

<!-- BLAST-THROUGH AUDIT ANCHOR (read by the Recency-Ranked Audit Queue) -->
last_audited_commit: b67fb5ca
last_audit_date: 2026-06-26

## Current Phase
Phase 9: Strategic Intelligence & TUI Integration - ACTIVE

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

## Fix Note - 2026-07-05 session 66 - Windows env sync
- Synced the active workspace `.env` from the Windows draft copy at
  `/mnt/windows/Users/Lenovo/Desktop/VGBN/.vscode/CODEPTIT/personal_finance_draft/.env`.
- Verified the Polymarket credential gate now sees the full set again:
  `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`,
  and `POLYMARKET_API_PASSPHRASE` are all present in the active env.
- `buildPolymarketReport(process.env)` now returns `ok: true`, and
  `commandPolymarket(['portfolio'])` now gets past the config check and reaches the
  live-network path (`getaddrinfo EAI_AGAIN` here, which is environment/network, not config).

## Fix Note - 2026-07-05 session 65 - migration/API repair
- Closed the API env-loader mismatch found in the session-65 audit: `backend/api/server/services/supabase_client.js`
  now uses the shared env loader, so `SOVEREIGN_ENV_FILE` works again for the API stack instead of
  forcing a local-checkout `.env`.
- Repaired the Polymarket helper scripts under `scripts/polymarket/`: repo-root anchoring now points at
  the real project root, the helpers use the shared env loader and `@polymarket/clob-client-v2`, and the missing
  `POLYMARKET_PRIVATE_KEY` path now exits cleanly instead of throwing a `TypeError`.
- Added a regression for the migrated env-file path in
  `tests/scripts/architecture/data_storage/supabase_route_contract.test.js`.
- Verified: `node --test tests/scripts/architecture/data_storage/supabase_route_contract.test.js`;
  `SOVEREIGN_ENV_FILE=/home/vgbn1/Documents/codeptit/personal_finance/.env node -e "const s=require('./backend/api/server/services/supabase_client'); console.log(JSON.stringify({configured:s.isConfigured()}));"` returned `{"configured":true}`;
  Polymarket helper probes now fail on missing inputs rather than module resolution.

## Fix Note - 2026-07-05 session 64 - Ubuntu dependency repair
- Closed the migration dependency gap found in the same-session blast-through: `start_local.sh` no
  longer relies on undeclared `npx tsx`; it uses the repo's existing `backend/cli/lib/run_trade_gateway.js`
  wrapper.
- Root dependencies now include `@alpacahq/alpaca-trade-api` and `ethers`, matching live gateway runtime
  imports.
- Nested installs for `backend/gateway`, `backend/mcp_server`, and `Frontend/dashboard` were restored so
  `npm ls --prefix ... --depth=0` no longer reports `UNMET DEPENDENCY`.
- `README.md` now documents the required multi-root install commands and Ubuntu native packages for the
  optional C++ path.
- Verified: root/gateway/MCP/frontend `npm ls`, gateway TypeScript, MCP build, gateway demo, and
  `timeout 8s ./start_local.sh`.

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

## Audit Note - 2026-07-05 session 64 - Connective tissue blast-through
- Ran the upgraded blast-through connective-tissue sweep after the Ubuntu dependency repair. No
  `graphify-out/` artifact exists, so the pass used live `rg`, import/package/env scans, direct file
  reads, and focused probes. DCS 0.96->0.95.
- Findings recorded in `workspace/DEV_REVIEW.md`: enabled ingest provider stubs (`pmi`, `flight`,
  `crypto_tx`, `holdings`, `onchain`, `breadth`) are incomplete live lanes; Alpaca data provider
  ignores the documented `ALPACA_SECRET_KEY` alias; gateway directly imports transitive `axios`
  without declaring it; API has low-priority stale Express-style scaffold.
- Verified-good: package roots are installed cleanly; TUI command ids with spaces intentionally split
  into argv; Settings & Preferences is now wired; `npm run hygiene` passed.

## Implementation Note - 2026-07-05 session 64 - Connective tissue mass-implement
- Closed the high/medium connective findings from the new blast-through matrix. DCS 0.95->0.97.
- `shared/lib/providers/alpaca.js` now uses `resolveAlpacaSettings()`, so `ALPACA_SECRET_KEY` from
  `.env.example` works for Alpaca market-data fetches as well as gateway/setup flows.
- `backend/scripts/data_ops/ingest_market_data/manifests.js` now reports unfinished placeholder
  providers as structured `not_implemented` errors instead of returning `{}`. This keeps
  `ingest --family all` honest without inventing data.
- `backend/gateway` now declares direct `axios@^1.18.1`, matching production imports in
  `clob_factory.ts` and `index.ts`.
- Verification: Alpaca provider/backfill test passed; new ingest manifest contract passed; direct
  Alpaca alias probe returned one stubbed record; direct PMI probe returned `not_implemented`;
  gateway `npm ls --depth=0`, gateway TypeScript, and repo hygiene all passed.

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

## Implementation Note - 2026-07-09 - live feature mass-implement
- Closed the highest-impact live-test findings from the 2026-07-08 review. DCS 0.86->0.91.
- API indicators route now treats the existing exit-0 indicators CLI JSON as a successful API payload.
  Live probe: `GET /api/indicators?symbol=BTCUSDT&timeframe=1d` returned HTTP 200 with
  `feature_count: 120` and `ok: true`.
- `ingest --dry-run` now passes `dryRun` into `ingestMarketData()` and returns a read-only
  `dry_run_plan` before provider fetches, Supabase macro writes, local cache writes, partition writes,
  or ts-index writes. Direct probe: `ingest --family pmi --dry-run --json` returned
  `mode: dry_run`, `sources: 0`, `errors: 0`, `planned_fetches: 4`.
- Dashboard Market Intel now reads global `/api/status` for quality cards instead of the default
  `AAPL 1d` data-summary slice; websocket market-data refreshes now include the same status payload.
- CLI scaling cleanup: `scorecard` suppresses carriage-return progress in non-TTY output and sizes
  separators to the actual header width; candlestick `backend chart --width 40` now stays within
  40 visible columns in total-width mode.
- Data-write race cleanup: `shared/lib/market/validation.writeJson()` now uses unique atomic temp
  paths instead of a shared `<target>.tmp`, matching the safer ts-index write pattern and removing the
  observed sibling-process rename race.
- Polymarket helper scripts now instantiate `@polymarket/clob-client-v2` with the object-shaped
  constructor used by `backend/gateway/src/clob_factory.ts`; local SDK instantiation probe passed
  without touching the external CLOB API.
- Verification: focused Node tests passed for API indicators, ingest dry-run/stubs, candlestick
  rendering, and writeJson temp paths; `backend/api/tests/api.test.js` passed with localhost bind
  approval; frontend build passed with the pre-existing Supabase dynamic/static import and chunk-size
  warnings; `npm run hygiene` passed. `git diff --check` still fails on the pre-existing
  `storage/models/*` CRLF/trailing-whitespace churn, not on this pass's touched files.

## Implementation Note - 2026-07-10 - always-on backfill and scorecard preparation
- Added token-protected `GET /api/scorecard`, using the same research calculation as the CLI in a worker
  with structured metadata, bounded query parameters, concurrent-request deduplication, and a 30-second
  result cache. The worker keeps API health/status responsive during full-universe scoring. CLI JSON
  compatibility remains unchanged.
- Added automatic provider-response cache pruning to every backfill cycle: responses older than two
  hours are removed and fresh entries are capped at 25,000. Canonical ts-index data is excluded.
- Deployment target is `infra/docker/docker-compose.yml` services `web` plus `backfill`. Scorecard runs
  CPU-only on the host against its mounted `storage/data/ts/`; the browser receives only JSON results.
- Measured full scorecard: 7.08s, 167 MB max RSS, about one CPU core. Current storage: ~30 GB total,
  ~4.1 GB ts-index, ~28 GB disposable API cache. Full current universe host floor: 2 vCPU/8 GB/80 GB
  SSD; recommended low-cost tier: 4 vCPU/12-16 GB/120-160 GB SSD. No GPU required.
- Production dashboard API calls now default to same-origin, and protected CORS preflights are handled
  before token authentication so private-VPN and development origins can connect correctly.
- Focused API/backfill/cache tests, frontend build, scoped diff check, and hygiene passed. Docker Compose
  could not be validated locally because Docker is not installed; graphify refresh remains unavailable.

## Implementation Note - 2026-07-10 - opt-in monitoring and research profiles
- Added a read-only `portfolio-monitor` CLI surface and exposed it in help text.
- Added opt-in Docker Compose profiles for `portfolio-monitor`, `host-health`, `host-backup`, and
  `polymarket-research`.
- Wired new env defaults and deployment documentation so the long-running jobs stay explicit and
  bounded.
- Verification passed for the new batch: focused host-maintenance, portfolio-monitor, Polymarket
  research scheduler, deployment manifest contract, `node --check`, and `npm run hygiene`.

## Correction Note - 2026-07-10 - mass-implement planning mode
- Updated `.agents/skills/mass-implement/SKILL.md` so broad score-improvement requests now require an
  explicit Planning Mode before edits.
- Planning Mode now forces each ranked batch to state: objective, why now, exact source, expected
  grade factor movement, and the verification gate that will prove completion.
- Removed the stale `repo-global-protocol` reference and replaced it with current repo truth sources:
  `PROJECT_RULES.md`, `workspace/STATE.md`, `workspace/DEV_REVIEW.md`, and `README.md` or the nearest
  task-specific doc.

## Implementation Note - 2026-07-11 - mass-implement closeout
- `portfolio-monitor` now consumes the real gateway aggregate shape and fails closed on malformed
  payloads.
- `host-backup` now uses provenance-scoped retention, preserves successful publishes when pruning
  fails, and returns a distinct retention-only exit code for Compose restart logic.
- The cross-container PID liveness check was removed in favor of container-local freshness checks.
- `polymarket-research` now fails visibly when it has nothing to capture instead of idling silently.
- Compose env ownership and deployment contract checks were tightened, including the quoted backup
  destination in the host-backup loop.
- Verification for this batch: focused Node tests, `npm run hygiene`, `node --check` on touched JS,
  and the gateway TypeScript no-emit check all passed.
- Residuals: Docker and graphify are unavailable locally, and the full suite still has one unrelated
  dashboard TUI failure outside this batch.
## Implementation Note - 2026-07-11 - native backend discovery and launch

- The C++ core is available at runtime after adding the actual standalone CMake output
  `backend/core/build/sovereign_wealth` to the shared resolver.
- `npm run native:build` is now the canonical configure/build entrypoint and disables optional ONNX
  linkage for a deterministic local build; README and `test:core` use the same build tree.
- Native subprocess handling no longer discards valid output when the runtime reports a post-run
  spawn error together with a numeric child exit status.
- Verified `backend status` as `available: true`, `ok: true`; focused Node tests and hygiene pass.
  CTest remains at the documented 28/29 baseline due only to the Kronos data-availability fixture.

## Implementation Note - 2026-07-11 - test trust and ingest availability closeout

- Restored the full Node test gate by aligning the Polymarket cockpit fixture with the production
  cash-plus-marked-position equity contract and making the macro/reserves harness reload the cached
  ingest manifest when swapping provider stubs.
- The reserves integration contract is offline and deterministic again: 9 rows from 3 countries x
  3 metrics, zero provider errors, and no 171-second real World Bank fallback.
- Added canonical `not_implemented` availability metadata for `pmi`, `flight`, `crypto_tx`,
  `holdings`, `onchain`, and `breadth`. Direct live CLI/library requests now fail before provider or
  persistence work, `all` skips the lanes explicitly, dry-run reports zero planned fetches, and both
  TUI selectors omit them. Existing feature-gate precedence remains intact.
- Verification: focused contracts passed; direct PMI live probe returned exit 1 with structured
  `not_implemented`; direct dry-run returned exit 0 with `planned_fetches: 0`; `npm run hygiene` and
  scoped diff checks passed; full suite passed 701/699/0fail/2skip in 27 seconds.
- Ingest surface grade moved B- -> B. Real provider implementations for the six unavailable families
  remain a roadmap gap rather than being presented as working runtime paths.

## Mass-Implement Closeout - 2026-07-11 session 72 - laptop runtime and signal trust

- Removed the live-candle write-amplification failure: strictly newer ts-index records now use a
  flush-before-count append path instead of reading and rewriting the full historical binary. Overlap,
  correction, gap-fill, and provider-precedence writes retain the existing streaming merge behavior.
  The equivalence suite remained byte-identical, and the 1.3-million-row / 192 MB heap child stress
  completed successfully in the full suite.
- Fresh base bins no longer suppress local coarse rollups. Warm daemon cycles still skip provider I/O,
  but refresh bounded-tail rollups; failed rollups now increment cycle errors and produce structured
  `stage: rollup` failures instead of looking healthy.
- Scorecard schema v2 requires every requested timeframe to have at least 20 bars and remain fresh
  within both family policy and the timeframe's declared signal horizon. Rows expose `data_as_of`,
  `latest_bar_at`, `valid_until`, per-timeframe age, and identify confidence as heuristic vote strength.
  The current stale crypto cache now returns an empty CLI scorecard instead of ranking partial/stale rows.
- Signal schema v2 expires model-comparison reports after 24 hours by default, configurable through
  `SOVEREIGN_SIGNAL_REPORT_MAX_AGE_MS`. The current 2026-06-21 report now exposes 17 expired candidates
  and zero active signals. Dashboard review rejects stale/inactive IDs, requires a Supabase user context,
  writes the user-owned audit event, and states `execution_started: false`; no order-execution claim remains.
- Grade-factor movement: runtime safety improved for always-on storage, scorecard/signal contract truth
  moved from permissive to fail-closed, false-active monitoring was removed, and deployment/UI docs now
  match the implemented research-versus-execution boundary. No numeric DCS was recalculated.
- Verification: focused data/research/API contracts passed; web API integration passed 2/2; dashboard Vite
  production build passed; `npm run hygiene`, syntax checks, and `git diff --check` passed; full Node suite
  passed 706 tests / 704 pass / 0 fail / 2 skip in 26.7 seconds.
- Remaining highest-impact gap: the dashboard package omits `@types/react` and `@types/react-dom`, so its
  standalone `tsc --noEmit` gate cannot run cleanly even though Vite builds. Environment least-privilege
  separation also remains incomplete because Compose services still receive the shared runtime env files.

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
