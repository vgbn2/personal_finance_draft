# AI System Review Queue

Updated: 2026-06-06 (Blast-through: stale-gate audit — both C-gates cleared, DCS 0.95)

---

## NEW — 2026-06-06 (Blast-through: stale-gate clearance pass)

Focused audit. No code changed this session (boot only); minimum coverage = the two C-gated sections carried in SESSION_MEMORY's gate table. **Both gate reasons are stale — the underlying issues were fixed in later sessions but the grades were never updated.**

### [RESOLVED — 2026-06-06] TUI engine C-gate (4 dev-review markers) — markers no longer exist
- **File**: `backend/cli/tui/engine/engine.js` (note: path is now `tui/engine/engine.js`, not `tui/engine.js`)
- **Gate reason carried in HANDOFF/SESSION_MEMORY**: "4 dev-review markers at lines 37/294/473/600 block engine gate."
- **Evidence**: `grep -nE "dev review|dev-review|TODO|FIXME|HACK|XXX"` over the file → **0 matches**. The markers were deleted in a prior session (Session 75 correction log) but the gate was never lifted.
- **Re-grade**: engine **C → B**. Gate cleared.

### [RESOLVED — 2026-06-06] backend/api/app.js C-gate (RATE_LIMITS leak + GET auth bypass) — both addressed
- **File**: `backend/api/app.js`
- **RATE_LIMITS leak**: `setInterval` purge of stale entries every 5 min with `.unref()` exists at lines 44–51. Map growth is bounded.
- **GET auth bypass**: `PROTECTED_GET_ROUTES` set (lines 54–59) covers `/api/backend/portfolio`, `/api/cache/list`, `/api/config`, `/api/bot/status`. Line 128 requires a token for any non-public route that is either non-GET or in the protected-GET set. Public GET routes are read-only status/signal/summary data — intentional posture.
- **Re-grade**: api/app.js **C → B**. Gate cleared. (Security lens is strong: CSP, nosniff, frame-deny, MCP gate, scoped CORS, token check.)

### [RESOLVED — 2026-06-06] P2 coverage gaps from prior HANDOFF were already closed
- `checkAndCloseResolvedPositions` unit tests → present in `tests/scripts/tests/polymarket_paper.test.js`.
- `normalizePolymarketGammaEvent` round-trip / events-browse contract → present in `tests/scripts/tests/polymarket_markets.test.js`. The "[COVERAGE GAP — P2]" entry below (2026-06-06 browse redesign) is **superseded**; the test exists.

### Reviewed-benign (no action)
- `backend/gateway/src/index.ts:1873` prints `POLYMARKET_API_SECRET=...` — this is the `derive-creds` command whose explicit purpose is "Paste these into your .env"; a user-invoked local credential export, not a leak.
- `backend/cli/lib/run_trade_gateway.js:16` `require(path.join(...,'index.ts'))` — fixed-path tsx-fallback bootstrap, not a dynamic-require-of-variable.

### Standing freshness debt (network-bound, not a code gate)
- `backend integrity` ok:false — 14 stale 1d rows: VRE (275h), 9 FX pairs (~155h), and SUI/PEPE/POL/RNDR USDT (16k–30k h, likely delisted/renamed tickers; RNDRUSDT already an exception). FX/VRE staleness needs a network-reachable backfill; the 4 dead crypto tickers should be reviewed for exception-listing or removal.

---

## NEW — 2026-06-06 (Blast-through: events browse default flow)

### [RESOLVED — 2026-06-06] `fetchPolymarketMarketsSnapshot` + `buildPolymarketSectionChoices` dead after browse redesign
- **File**: `backend/cli/commands/trade/trade.js`
- **Evidence**: `promptPolymarketMarketBrowser` now uses the events flow for all categories. The flat-market browser (the only internal caller) was removed. No external caller found.
- **Fix**: Deleted `fetchPolymarketMarketsSnapshot` (was lines 445–461), `buildPolymarketSectionChoices` (was lines 251–256), and their export entries. Both were exclusively serving the removed flat browser.
- **Verify gate**: `node --check` → SYNTAX OK; `npm test` → 202/202 pass.

### [COVERAGE GAP — P2] Events-first browse flow has no contract test
- **File**: `tests/scripts/tests/polymarket_markets.test.js`
- **Gap**: `promptPolymarketMarketBrowser` now routes all categories through `fetchPolymarketEventsSnapshot`. The category→topic→market hierarchy is the primary trade entry path but has zero unit/contract test coverage. The existing `polymarket_markets.test.js` only covers the normalizer and `fetchPolymarketGammaEvents`.
- **Fix**: Add 1 contract test to `tests/scripts/tests/polymarket_markets.test.js`: mock `fetchPolymarketGammaEvents` via gateway stub, assert `normalizePolymarketGammaEvent` returns `{ id, title, markets[] }` for a synthetic events payload with 2 sub-markets.
- **Effort**: S
- **Verify gate**: `npm test` → ≥203/203 pass.

### [RESOLVED — 2026-06-06] `__events__` browse tab removed; events flow is now default
- **File**: `backend/cli/commands/trade/trade.js:239–249` (category choices), `:594–703` (browser function)
- **Fix**: Removed `{ label: 'Browse by event group', value: '__events__' }` from `buildPolymarketCategoryChoices`. Collapsed `promptPolymarketMarketBrowser` into a single events-first path: Category → Topics (Gamma `/events`) → Markets within topic → Action loop. `fetchPolymarketEventsSnapshot` now receives the actual `category` variable (was hardcoded `'crypto'`).
- **Verify gate**: `node --check backend/cli/commands/trade/trade.js` → SYNTAX OK; `npm test` → 202/202 pass.

### [RESOLVED — 2026-06-06] C++ / Monte Carlo tests were cache-dependent (flaky)
- **Files**: `tests/scripts/strategy_backtest_contract.test.js:481, 510`
- **Root cause**: Both tests called `runBacktest(frame, {engine:'auto'})` with synthetic bars. C++ native mode (the 'auto' path) reads from `storage/data/cache`, ignoring the synthetic frame. When SPY 1d cache had no trades at threshold=0.5, `mc.runs=0` → `monte_carlo=null` → `TypeError`.
- **Fix**: Added `engine: 'js_model'` to both test calls. C++ frame mode uses JS-annotated predictions from the synthetic data (deterministic).
- **Gate**: 17/17 strategy_backtest_contract; 202/202 `npm test`.

### [RESOLVED — 2026-06-06] Threshold calibration confirmed on live data
- Strategy `ml_multi_asset` with threshold 0.52: `sovereign bt --days 30 --allow-degraded --json` → `"trades": 1`.
- All four thresholds (ml_multi_asset, global_equity_rotation, forex_trend_breakout, commodity_macro_hedge) confirmed firing on 30-day live data.

---

---

## NEW — 2026-06-06 (Focused audit: Polymarket backtest + runner hardening)

### [FIXED THIS SESSION] TUI manifest `--category` / `--days: 90` flag desync
- **File**: `backend/cli/tui/manifest.js:314–315`
- **Bug**: Manifest declared `--category` (text, default 'crypto') and `--days: '90'` for the polymarket backtest command. Handler (`trade.js:788`) reads `--tag-id` (numeric) and defaults to `365`. TUI input was silently dropped.
- **Fix**: Updated manifest to `--tag-id` (text, default '21') and `--days: '365'`. Verified parity with handler.
- **Verify gate**: `sovereign polymarket backtest --tag-id 21 --days 365` returns `marketsScanned > 0`.

### [RESOLVED — 2026-06-06] `_inferYesResolutionPrice` duplicates `inferWinner` from shared lib
- **Files**: `backend/gateway/src/polymarket_paper.js:223`, `shared/lib/polymarket_history.js:146`
- **Evidence**: Both functions parse `bestAsk` (≥0.9 → YES, ≤0.1 → NO) and fall back to `outcomePrices` JSON string. One returns `{yesWon, resolutionPrice, confidence}`, the other returns `number`.
- **Note**: Minor behavioral difference — `_inferYesResolutionPrice` uses `'["0.5","0.5"]'` as JSON fallback (returns 0.5 for ambiguous markets); `inferWinner` uses `''` (parses as null, returns resolutionPrice: 0.0). The 0.5 fallback in paper.js gives a more neutral close price for genuinely ambiguous markets.
- **Fix**: `checkAndCloseResolvedPositions` should `require` `inferWinner` from `shared/lib/polymarket_history.js` and call `inferWinner(market).resolutionPrice`. Delete `_inferYesResolutionPrice`.
- **Verify gate**: `node --test tests/scripts/tests/polymarket_paper.test.js` still passes after refactor.

### [RESOLVED — 2026-06-06] `checkAndCloseResolvedPositions` has no unit test
- **File**: `backend/gateway/src/polymarket_paper.js:240`
- **Gap**: New function fetches Gamma by `condition_id`, infers resolution price, closes position, writes `resolved_positions.jsonl`. No test covers the inject-fetchFn path.
- **Fix**: Add 2 tests to `tests/scripts/tests/polymarket_paper.test.js`: (1) resolved market closes position + credits balance; (2) active market skips position.
- **Verify gate**: `node --test tests/scripts/tests/polymarket_paper.test.js` → new tests pass.

### [INFO] `GET /api/run/status` auth posture
- **File**: `backend/api/server/routes/run_status.js`, `backend/api/app.js:114–127`
- **Behavior**: Route is not in `isPublicRoute` or `PROTECTED_GET_ROUTES`. Under current auth logic, GET routes on non-listed paths are accessible without token. This is consistent with how `/api/analytics`, `/api/backtest`, and other GET routes work — only POST and specifically listed GETs require a token.
- **Decision**: Accept as-is (loop status is not sensitive data). If hardening is needed, add `/api/run/status` to `PROTECTED_GET_ROUTES`.

---

## NEW — 2026-06-06 (Focused audit: local-first broker/setup/CI slice)

### [RESOLVED — 2026-06-06] `.github/workflows/test.yml` entrypoint checks use legacy paths
- **File**: `.github/workflows/test.yml:36–43`
- **Evidence**: All 5 `node --check` paths reference paths that do not exist:
  - `scripts/lib/quote_router.js` → active: `shared/lib/quote_router.js`
  - `scripts/data_ops/ingest_market_data.js` → active: `backend/scripts/data_ops/ingest_market_data.js`
  - `scripts/cli/sovereign_cli.js` → active: `backend/cli/sovereign_cli.js`
  - `scripts/tui_cli/intersection.js` → active: `backend/cli/tui/intersection.js`
  - `web/app.js` → active: `backend/api/app.js`
  - TypeScript check: `execution_gateway/tsconfig.json` → active: `backend/gateway/tsconfig.json`
- **Impact**: CI would fail on the "Check active JavaScript entrypoints" step and "Type-check execution gateway" step on every PR/push. The CI is effectively non-functional.
- **Decision required**: Update CI workflow to use the active canonical paths.
- **Verify gate**: All `node --check` steps pass in a clean Ubuntu checkout; `npm run test:secrets` still runs.

### [RESOLVED — 2026-06-06] `npm test` omits 23 test files in `tests/scripts/tests/`
- **File**: `tests/run_node_tests.js:4`
- **Evidence**: `tests/run_node_tests.js` uses glob `tests/scripts/*.test.js` (18 files), which does NOT match `tests/scripts/tests/*.test.js` (23 files).
- **Missing files**: `broker_env.test.js`, `live_guard.test.js`, `setup_doctor.test.js`, `proposed_orders.test.js`, `proposed_orders_cli.test.js`, `secret_leak.test.js`, `polymarket_account.test.js`, `polymarket_paper.test.js`, `polymarket_errors.test.js`, `settings_contract.test.js`, `provider_sources.test.js`, and 12 more.
- **Impact**: Security tests, Polymarket tests, broker env tests, and live-guard tests are invisible to `npm test` and to CI. A regression in any of these files would not be caught by the standard test gate.
- **Fix**: Change glob in `tests/run_node_tests.js` line 4 from `tests/scripts/*.test.js` to `tests/scripts/**/*.test.js` to pick up subdirectory tests recursively.
- **Verify gate**: `npm test` passes with all 41+ tests (18 top-level + 23 subdirectory).

---

## NEW — 2026-06-06 (Focused audit: Polymarket paper-trading plan parity)

### [RESOLVED — 2026-06-06] `workspace/POLYMARKET_BOT_PLAN.md` names `polymarket research paper-run`, but the current CLI does not expose that surface
- **Files**: `workspace/POLYMARKET_BOT_PLAN.md`, `backend/cli/sovereign_cli.js`, `backend/cli/commands/trade/trade.js`, `backend/gateway/src/index.ts`
- **Evidence**:
  - `backend/cli/sovereign_cli.js` routes research through `bt`, `backtest`, `optimize`, `edge-decay`, `demo`, `features`, and `models`.
  - `commandPolymarket()` in `backend/cli/commands/trade/trade.js` accepts `portfolio`, `balance`, `debug`, `modes`, `investigate`, `probe`, `topology`, `trace`, `markets`, `orderbook`, `price-history`, `buy`, and `derive-creds`.
  - There is no `research` subcommand under Polymarket, and no `paper-run` handler in the current gateway surface.
- **Impact**: The new Phase 1.5 plan reads like an executable command path, but today it is only a future design note. Anyone following the doc verbatim will hit an unknown-subcommand path instead of a paper-trading flow.
- **Resolution**: Implemented `polymarket paper-run` as the executable command surface, added a paper-trading storage helper, and updated the plan to use the live route.
- **Verify gate**: `node backend\cli\sovereign_cli.js polymarket paper-run --strategy low_prob_dip --virtual-balance 100 --dry-run --limit 1 --json` returned `ok:true` with one virtual fill after network approval. `node --test tests\scripts\tests\sovereign_cli.test.js tests\scripts\tests\polymarket_markets.test.js tests\scripts\tests\polymarket_paper.test.js` passed 43/43.

---

## NEW — 2026-06-04 (Focused audit: C++ backtest engine rollout)

### [RESOLVED — 2026-06-04] Optimize + edge-decay spawn C++ binary per inner loop iteration
- **Files**: `backend/cli/commands/research/research.js:1676`, `research.js:1793`
- **Root cause**: Both `backtestOptions` blocks (optimize inner grid loop, edge-decay window loop) have no `engine` field. With C++ as the new default, every `runBacktest()` call spawns a binary. Optimize runs 2 × grid_points backtests (e.g., 81 combos = 162 spawns × ~300ms IPC = ~49s). Previous JS path: ~1-2s total. Edge-decay: 6 spawns vs near-instant JS.
- **Fix**: Add `engine: 'js'` to both `backtestOptions` blocks so their inner loops stay on JS. The final reporting backtest in each command can keep `engine: 'auto'` (C++) if needed.
- **Verify gate**: `node backend/cli/sovereign_cli.js optimize --strategy config/strategies/mean_reversion.yaml --timeframe 1d --json` completes in under 30s.

### [QUALITY — P2] C++ normalized result has `data_start: undefined`, `annualized_return: null`
- **File**: `shared/lib/backtest.js` — `normalizeCppResult()` doesn't set `data_start`/`data_end`
- **Impact**: `annualizedReturn()` gets null dates → returns null → final report shows `annualized_return: null`. Safe (no crash) but missing info.
- **Fix**: In `normalizeCppResult`, derive `data_start` from first non-"start" equity_curve entry timestamp, `data_end` from last entry. Then set `result.data_start` and `result.data_end`.
- **Verify gate**: Live backtest result with C++ engine has numeric `annualized_return` field.

### [QUALITY — P3] C++ Monte Carlo `worst_path`/`median_path` have empty `equity_curve: []`
- **File**: `shared/lib/backtest.js:934` — stub worst_path/median_path with empty equity_curve to satisfy tests
- **Impact**: Cockpit or TUI render of C++ backtest Monte Carlo paths produces empty charts (no paths plotted). JS path provides sparse sampled paths (≤50 points).
- **Fix**: Either (a) add path recording to C++ Monte Carlo (`frame_backtester.cpp`) and serialize worst/median path equity curves in the output, or (b) document that C++ mode omits path detail and add a `paths_available: false` flag.
- **Decision**: Low urgency unless path visualization is a priority.

---

## NEW — 2026-06-04 (Focused audit: gateway + engine + data gate)

### [RESOLVED — 2026-06-06] `sovereign_cli_human_surfaces.test.js:176` asserts `ok: true` but integrity is red
- **File**: `tests/scripts/tests/sovereign_cli_human_surfaces.test.js:176`
- **Evidence**: `node --test tests/scripts/tests/sovereign_cli_human_surfaces.test.js` → 8/9, 1 fail. Failure: `false !== true` at line 176.
- **Root cause**: Test asserts `payload.ok === true` and `total_stale === 0`. Current integrity returns `ok: false`, `total_stale: 12`.
- **Decision**: Two valid options — (a) refresh the 12 stale cache rows so the gate goes green again, or (b) make the test tolerate degraded state by asserting `typeof payload.ok === 'boolean'` and skipping the green-gate assertion when stale rows exist.
- **Verify gate**: `node --test tests/scripts/tests/sovereign_cli_human_surfaces.test.js` → 9/9 pass.

### [RESOLVED — 2026-06-04] `getQuote()` returns `150.0` dummy price when credentials are absent
- **Files**: `backend/gateway/src/index.ts:362` (GateIoAdapter), `backend/gateway/src/index.ts:515` (AlpacaAdapter)
- **Path**: Any portfolio valuation or quote request with no env credentials configured silently returns `150.0`.
- **Risk**: Callers (position valuation, dashboard panels, cockpit quote card) receive a plausible-looking price with no indication it is synthetic. Can produce silently misleading PnL values.
- **Decision required**: Return `0` (or `null`) with a logged warning instead of a stub price when there are no credentials, so the caller knows the price is unavailable rather than treating `150.0` as real.
- **Verify gate**: `getQuote()` with no credentials logs a warning and returns `0`.

### [PARTIALLY FIXED — Known] Gate.io positions emit `averagePrice: 0`, `unrealizedPl: 0`
- **File**: `backend/gateway/src/index.ts:353–355`
- **Root cause**: Trade history traversal not implemented. Position snapshot uses current price × quantity for market value but cannot compute cost basis.
- **Current status**: Aggregate portfolio output now excludes `cost_basis_unavailable:true` positions from `total_unrealized_pl` and reports unavailable counts. The remaining work is real Gate.io trade-history traversal (`GET /spot/my_trades?currency_pair=...`) if precise cost basis is required.
- **Verify gate**: `node --test tests/scripts/tests/polymarket_portfolio_aggregate.test.js` -> pass.

### [FIXED] Polymarket `/trades` fixed `limit: 1000`
- **File**: `backend/gateway/src/index.ts:843`
- **Current status**: Filled-position trade reads now cursor-paginate with `POLYMARKET_TRADE_PAGE_CAP`, expose `trade_pagination`, and warn when truncated. This is bounded rather than exhaustive by design.
- **Verify gate**: `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.

### [RESOLVED — 2026-06-06] 4 stale dev-review comments in live TUI keypress path
- **File**: `backend/cli/tui/engine/engine.js:37, 294, 473, 600`
- **Markers**: `// why === ?, dev review`, `//nested ifs else, dev review TODO`, `//if else nest again-dev review TODO`, `//if êlse nest, dev review`
- **Action**: Either address the nested-if structure (extract the `handleKey` branch tree into named predicates) or delete the comments if the structure is intentional and stable.
- **Verify gate**: `grep "dev review" backend/cli/tui/engine/engine.js` → 0 results.

### [DATA GATE — Degraded] Integrity `ok: false`, 11 stale FX rows, quotes 18 stale
- **Evidence (2026-06-05)**: `backend integrity --json` -> `ok:false`, `84/84 cached`, `0 missing`, `11 stale`, `1 exception`; stale rows are FX `1d` for `EURJPY`, `EURGBP`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD`, `USDCHF`, `NZDUSD`, `USDSEK` + 2 more equities.
- **Quote evidence**: `quotes status --json` -> `24` Headway records, `18` stale; Headway MT5 is stale/unconfigured, MT5/Webull not configured.
- **Next clearing move**: run targeted FX refresh in an environment where Node can reach Frankfurter/Finnhub/Twelve, or configure a fresh MT5/Headway quote export before trusting live-promotion gates.

---

---

## NEW - 2026-06-02 (Session 75 — Bot/Polymarket integration)

### [FIXED THIS SESSION] POST body not parsed in app.js
`handleApi` previously only read URL query params. `bot_sell` and `bot_cycle` POST bodies were silently dropped. Fixed by adding `readBody()` and merging into `query` for POST/PUT/PATCH methods.

### [PATTERN DEBT] `buildClobClient` duplicated — 2 files
- `backend/gateway/src/index.ts` line 716 — method on `PolymarketAdapter`
- `backend/gateway/src/cycle.ts` line 17 — module-level function
Same 6-line pattern, different environments. Extract to `backend/gateway/src/clob_factory.ts`.
**Decision required:** Extract and update both callers. S effort.

### [PATTERN DEBT] `logOrderToSupabase` duplicated — 2 locations
- `index.ts` — `PersistenceBridge` class (writes to `orders`)
- `cycle.ts` line 39 — local `logOrderToSupabase` function (writes to same `orders` table, different field mapping)
Risk: divergence in field names. Consolidate by importing `PersistenceBridge` from a shared module.
**Decision required:** Extract `PersistenceBridge` to `shared/lib/persistence_bridge.ts` or expose a factory. M effort.

### [SECURITY — MEDIUM] derive-creds prints L2 credentials to stdout
`index.ts` lines 1056-1058: `console.log(`POLYMARKET_API_KEY=${creds.key}`)` — intended for CLI use, but any monitoring tool or log capture will record these. Not a crash risk but a secrets hygiene concern.
**Mitigation:** Accept as-is (single-use CLI derive flow), document that derive-creds output must not be logged.

### [COVERAGE GAP] Bot cycle live path unverified
`runCycle(--live)` has never been executed. All L2 auth paths, `createOrder`, `postOrder`, and `logOrderToSupabase` on fill are untested against real CLOB.
**Verify gate:** Run `bot cycle --live` after deriving L2 creds + funding wallet.

### [COMPLETENESS] `market.ts` has no retry/timeout on Gamma API
`fetchTradingInfo` returns `null` silently on any network error or 5xx. Buy loop skips the market without explanation in `--json` mode.
**Fix:** Add error logging to cycle.ts buy loop: `errors.push(`slug resolve failed: ${bet.slug}`)`.

## Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact | Status |
|---|---|---|---|---|---|
| `buildClobClient` function | 2 (index.ts, cycle.ts) | `gateway/src/clob_factory.ts` | S | C→A | ✅ RESOLVED (Session 76) — `createClobClient` extracted, both callers updated |
| `logOrderToSupabase` / `PersistenceBridge` | 2 (index.ts, cycle.ts) | `shared/lib/persistence_bridge.js` | M | C→B | ✅ RESOLVED (Session 76) — both files import from shared module |
| `parseScalarFromYaml` / `parseArrayFromYaml` / `parseSectionMap` | 2 files: `shared/lib/strategy_registry.js:22,28,48` + ~~`strategy.js`~~ | `shared/lib/config_loader.parseYamlRecursive` | S | C→B | ✅ RESOLVED (2026-06-06) — `strategy_registry.js` grep confirms no hand-rolled helpers remain |
| Raw `\x1b[` escape codes | trade.js | Import from `shared/lib/ansi.js` | S | B→A | ✅ RESOLVED (2026-06-06) — Added `ERASE_LINE = '${ESC}[2K'` to `ansi.js`; replaced 4 raw `\r\x1b[2K` in `trade.js` with `'\r' + A.ERASE_LINE` |
| `_inferYesResolutionPrice` / `inferWinner` | 2 files: `gateway/src/polymarket_paper.js:223` + `shared/lib/polymarket_history.js:146` | Use `inferWinner` from shared in `checkAndCloseResolvedPositions` | S | C→B | ✅ RESOLVED (2026-06-06) — `polymarket_paper.js` imports `inferWinner` from shared lib; `_inferYesResolutionPrice` deleted |
| `GAMMA_BASE` URL constant | 2 files: `polymarket_paper.js:221` + `polymarket_history.js:8` | Export from `shared/lib/polymarket_history.js` | S | B→A | ✅ RESOLVED (2026-06-06) — `GAMMA_BASE` exported from `shared/lib/polymarket_history.js`, imported in `polymarket_paper.js` |

---

## NEW - 2026-06-02 (Session 74 blast-through findings + UX backlog)

### [COVERAGE GAP] Live / side-effect paths not yet exercised — require real credentials or broker state

These were intentionally skipped during the 2026-06-02 blast-through to avoid live account mutations. They are **not confirmed working** and must be validated before any production use.

| Path | Entry point | Risk / reason skipped |
|---|---|---|
| Successful login with real credentials | `sovereign login` | Needs real Supabase account |
| Successful registration → account created | `sovereign register` | Creates a real Supabase user record |
| Logout from a real active session | `sovereign logout` (with live session) | Needs prior successful login |
| Live trade: buy, sell, process | `trade buy`, `trade sell`, `trade process` | Real broker order submission |
| MT5 connect / bridge | `trade connect --mt5` | Requires running MT5 EA bridge |
| MT5 profile mutation | `trade profile`, bridge config flows | Mutates broker-side EA config |
| Interactive add-platform completion | `trade add-platform` | Live OAuth / credential storage |
| Long-running watch | `sovereign watch` | Sustained network + process stability |
| Any broker / remote auth side effect | any command reaching external state | Account data, orders, sessions |

**What to do before validating these**:
1. Auth floodgate (see `[AUTH ARCH P0]` below) must be in place so live-trade paths are gated.
2. Use a paper/demo account for all broker flows — never validate against a funded live account.
3. Each path needs its own narrow integration test (separate test file, tagged `--slow-integration`) that can be skipped in CI and run manually with `SOVEREIGN_TEST_LIVE=1`.
4. Register retry bug (see `[BUG P1]` below) must be fixed before testing the registration path.

**Verification gate**: A `tests/integration/live_paths.test.js` file exists, each test is guarded by `process.env.SOVEREIGN_TEST_LIVE`, and the CI matrix explicitly excludes the file unless the flag is set.

---

### [AUTH ARCH P0] Auth is not a floodgate — most features run without a session

**Current state**: Every command works without login. Auth is opt-in: only `login`, `logout`, `register`, and `auth-status` touch sessions. There is no guard in `sovereign_cli.js` or any command handler.

**Decision**: Keep guest mode fully functional for all read/local commands (backtest, data, strategy config, indicators, quotes, cockpit). Auth should become a gate only for features that touch external accounts or persist state server-side: `trade buy/sell`, `trade connect`, `add-platform`, and any future cloud-sync commands. Adding a blanket `requireAuth` guard in front of every command would destroy guest usability without real benefit.

**Planned change**: Add a lightweight `requireAuth(command)` helper in `backend/cli/lib/auth.js` that wraps just the trade execution path. Surfaced as a clear `"Sign in required for live trading"` message with an inline `login` prompt rather than a hard exit. Everything else stays open.

**Files**: `backend/cli/lib/auth.js`, `backend/cli/commands/trade/trade.js:commandBuy`, `commandSell`, `commandConnect`

**Verification gate**: `node sovereign_cli.js cockpit` works without session. `node sovereign_cli.js trade buy` without session prints the sign-in prompt and exits 1.

---

### [UX P1] Cockpit misreports quote health as green when provider is stale

**Source**: `backend/cli/commands/status.js:146`

**Current state**: `summarizeQuoteCard` calls `summarizeStatusCard(snapshot, quality)` which sets `state: ok` when `quality.ok` is truthy — but the quotes-specific `ok` field is never consulted. The `quotes status --json` path independently returns `ok: false`, `stale_records: 18`. These two paths never cross-check.

**Fix**: In `summarizeQuoteCard` (or the cockpit renderer that calls it), pull the live `quotes status` JSON result and downgrade the card state when `ok: false` or `stale_records > 0`.

**Files**: `backend/cli/commands/status.js:146`

**Verification gate**: After fix, `cockpit --json` shows `quotes.state: "warn"` when `quotes status --json` returns `ok: false`.

---

### [UX P1] Cockpit backtest card shows green for trust_grade F / sample-mode reports

**Source**: `backend/cli/commands/status.js:45`

**Current state**: `summarizeBacktestCard` only checks `report.metrics.expected_value < 0` to decide state. It ignores `trust_assessment.grade`, `trust_assessment.verdict`, and `sample_mode: true`. A grade-F sample report appears green.

**Fix**: Add trust downgrade logic:
```js
const isTrusted = report.trust_assessment?.grade >= 'C' && report.trust_assessment?.verdict !== 'do-not-trust-yet';
const isSample = report.sample_mode === true;
state = (!report || !isTrusted || isSample) ? 'warn' : labelState(true, negativeEv);
```

**Files**: `backend/cli/commands/status.js:45`

**Verification gate**: `cockpit --json` shows `backtest.state: "warn"` when last report has `trust_assessment.grade: "F"` or `sample_mode: true`.

---

### [UX P2] Trade help text is stale — says "Alpaca only", runtime supports MT5 + add-platform

**Source**: `backend/cli/lib/utils.js:51`, `backend/cli/tui/manifest.js:214`, `backend/cli/commands/trade/trade.js:451`

**Fix**: Update the three help/manifest strings to reflect the multi-platform surface. The new description should say something like "Place trades and manage broker connections (Alpaca, MT5/EA, add-platform)".

**Files**: `backend/cli/lib/utils.js:51`, `backend/cli/tui/manifest.js:214`, `backend/cli/commands/trade/trade.js:451`

**Verification gate**: `node sovereign_cli.js help` no longer mentions "Alpaca" as the sole trade platform.

---

### [BUG P1] `register` non-interactive retry path exits 0 after weak-password, no failure message

**Source**: `backend/cli/commands/auth.js:82-93`

**Current state**: The loop at line 83 runs `attempts < 3`. When `attempts === 2` (third attempt), it prints the warning, increments `attempts` to 3, checks `attempts === 3`, prints the failure message, then `return 1`. But on non-TTY (`promptPasswordWithStrength` on a closed pipe), the `while` loop may exit early without hitting the `return 1` branch — the process falls through and returns `undefined` (treated as 0 by Node).

**Fix**: Add a `return 1` after the `while` loop as a fallthrough guard. Also confirm `promptPasswordWithStrength` returns `''` (not throws) on closed stdin so the loop advances.

**Files**: `backend/cli/commands/auth.js:89-93`, `backend/cli/lib/auth.js:143`

**Verification gate**: `echo -e "weak\nweak2\nweak3" | node sovereign_cli.js register --email test@x.com` exits 1 and prints "Maximum attempts reached".

---

### [UX P1] Prop firm profile list — select + edit flow is not directly actionable from list view

**Source**: `backend/cli/commands/strategy/strategy.js:687-716`

**Current state**: The interactive list shows profiles with ACTIVE/blank markers, then drops to a flat action menu. To set-active or edit, the user must select the action first, then re-select the profile from a second picker. There is no way to press Enter on a profile row and immediately act on it.

**Planned fix — two-level interaction**:
1. First prompt: `promptSelect` over the profile list (each row is a profile, not an action). The selected value is a profile `id`.
2. Second prompt: context menu for that profile — `[Set Active] [Edit] [Inspect] [Delete] [Back]`.
3. "Add profile" becomes a top-level option added above the profile rows (e.g. `{ label: '+ Add new profile', value: '__ADD' }`).
4. The profile row labels should include current-phase indicator and rule summary inline (already available via `formatPropFirmChoiceLabel` + `formatPropFirmChoiceDescription`).

**Files**: `backend/cli/commands/strategy/strategy.js:706-716`

**Verification gate**: Running `strategy prop-firms` enters profile picker first; selecting a profile shows the context menu; Set Active / Edit both work on the selected profile without re-picking.

---

## NEW - 2026-06-02 (Session 73 blast-through)

### [FIXED] P0 regression: strategy command tests broken by subdirectory refactor
- **Root cause**: `backend/cli/commands/strategy/` has `strategy.js` but no `index.js`. Three test files importing `require('...commands/strategy')` all threw MODULE_NOT_FOUND.
- **Fix**: Created `backend/cli/commands/strategy/index.js` as a 1-line re-export.
- **Verified**: `strategy_asset_classification.test.js` 2/2, `strategy_registry_sync.test.js` 3/3, `strategy_backtest_contract.test.js` 14/15 (1 pre-existing timeout).
- **Gate**: `node --test tests/scripts/strategy_asset_classification.test.js tests/scripts/strategy_registry_sync.test.js` → 5/5 pass.

### [TEST P1] `backtest human output renders as a sectioned terminal report` — pre-existing timeout
- **File**: `tests/scripts/strategy_backtest_contract.test.js:293`
- **Why**: Test runs `bt --strategy trend_following.yaml --days 30 --allow-degraded` without `--sample`, triggering a live provider fetch that exceeds the 120s timeout on Windows. `result.status` returns `null` (process killed).
- **Required decision**: Add `--sample` flag to the test call, or raise timeout to 300s, or mark as slow-integration test requiring a live network gate.
- **Verification gate**: Test completes in < 120s and `result.status === 0`.

### [YAML P2] 3 hand-rolled YAML parsers remain — consolidation not done
- **Files**: `backend/cli/lib/research_config.js` (flat-only), `shared/lib/strategy_registry.js` (parseScalarFromYaml / parseArrayFromYaml / parseSectionMap), `shared/lib/config_loader.js` (canonical `parseYamlRecursive`)
- **Why**: Three implementations with different capabilities; none handles anchors, multi-line strings, or quoted colons. Divergence risk grows as config files become more complex.
- **Required decision**: Consolidate on `config_loader.parseYamlRecursive` or add `js-yaml` as shared dep. Check `package.json` first.
- **Verification gate**: `grep -rn "match.*key\|parseScalarFromYaml\|parseArrayFromYaml\|parseSectionMap" backend shared --include="*.js"` returns zero hits outside of `config_loader.js`.

### [CONFIRMED RESOLVED in Session 73 verification]
- `backend/cli/tui/test.js` 5/5 ✅
- `waitForEnter` dead function deleted ✅
- `utils.js` P0 directory-as-file bug fixed (readdirSync + subdirectory scan) ✅
- `strategy.js` P0 private universe read fixed (uses imported `get_Current_Universe_Symbols`) ✅
- STRATEGY_MANIFEST / DATA_MANIFEST / RESEARCH_MANIFEST dead objects: already cleaned ✅
- Status bar hardcoding in `engine.js`: already fixed ✅
- `auth.js` inline ANSI: already imports `shared/lib/ansi` ✅
- Duplicate `rules` key in `backtest.js`: single instance confirmed ✅
- `mcp_agent.js` REPO_ROOT: already uses `require('./paths')` ✅

---

## NEW - 2026-06-05 (Focused audit: Polymarket gateway + legacy bridge)

### [SECURITY - HIGH] Gateway error formatter leaks live Polymarket auth headers in JSON output
- **Files**: `backend/gateway/src/index.ts:1304-1323`
- **Evidence**: `node backend/cli/sovereign_cli.js polymarket collateral-probe --json` returned an error object whose serialized `config.headers` included `POLY_API_KEY`, `POLY_PASSPHRASE`, `POLY_SIGNATURE`, and the signed wallet address.
- **Root cause**: `describeGatewayError()` falls back to `JSON.stringify(error)`, and axios error objects carry the full request config.
- **Required reviewer decision**: Redact auth-bearing headers before serialization, or collapse network errors to a smaller safe shape (`code`, `url`, `method`, `status`, redacted message).
- **Verify gate**: rerun `polymarket collateral-probe --json` and confirm no `POLY_API_KEY`, `POLY_PASSPHRASE`, or `POLY_SIGNATURE` strings appear in stdout.

### [DIAGNOSTIC DRIFT - HIGH] Legacy env comparison mutates mode semantics instead of only aliasing env names
- **Files**: `legacy/holygrailpoly/legacy_clob.js:123-128`, `legacy/holygrailpoly/bruteforce.js:46-52`
- **Evidence**: the `legacy` variant forces `POLYMARKET_SIGNATURE_TYPE='3'` whenever a funder exists, while the current runtime infers proxy mode (`1`) when `PROXY_ADDRESS === funder`. The brute-force report therefore compares two different account modes, not just two env schemas.
- **Risk**: false differences between `current` and `legacy` runs; reviewers can misread a mode change as an env-name issue.
- **Required reviewer decision**: decide whether the legacy runner is meant to compare env aliasing only, or intentionally compare proxy-vs-deposit modes. If it is alias-only, remove the forced type `3` default.
- **Verify gate**: `legacy/holygrailpoly/bruteforce.js --schema current` and `--schema legacy` should show the same signature type unless the operator explicitly overrides it.

### [COMPLETENESS - MEDIUM] Gateway fallback now depends on a custom `ts-node` bootstrap shim
- **Files**: `backend/cli/commands/trade/trade.js:29-58`, `backend/cli/lib/run_trade_gateway.js:1-25`
- **Evidence**: the CLI no longer falls back to `npx tsx`; it now relies on a custom bootstrap that registers `ts-node` with `skipProject`, `experimentalResolver`, and ad hoc compiler options.
- **Risk**: this is a real runtime fix, but it is also a second execution path with its own semantics. Any future gateway module-resolution or ESM change can break the shim independently of the normal `tsx` path.
- **Required reviewer decision**: either keep the shim as an explicit supported runtime path and document it, or add a dedicated smoke test that runs one gateway-backed command through this bootstrap in CI/manual verification.
- **Verify gate**: one automated test exercises `node backend/cli/sovereign_cli.js polymarket collateral-probe --json` through the fallback launcher and asserts a structured JSON payload shape.

## Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact | Status |
|---|---|---|---|---|---|
| L2 header signing helpers (`buildHmacSignature`, `buildL2Headers`) | 2 (`backend/gateway/src/clob_factory.ts`, `legacy/holygrailpoly/legacy_clob.js`) | `backend/gateway/src/polymarket_l2_auth.{ts,js}` | S | C→B | OPEN |
| Private-key validation + env signature inference duplicated across current/legacy Polymarket layers | 2 (`backend/gateway/src/polymarket_account.js`, `legacy/holygrailpoly/legacy_clob.js`) | `shared/lib/polymarket_env.js` | S | C→B | OPEN |
- `indicators.js` `Math.random` in `generateSyntheticLTF`: replaced with deterministic LCG ✅
- `execution_memory.js` unbounded growth: 180-day TTL eviction implemented ✅
- Backend integrity gate: `ok: true`, 84/84 cached, 0 stale, 1 exception ✅
- No hardcoded API keys in production JS ✅
- No `eval()` in production JS ✅
- No `exec/execSync` with user input in production JS ✅

---

## NEW - 2026-06-02 (Session current blast-through)

### [HIGH] Active test failure: `Manifest Utils - Symbol Fetching` broken by manifest refactor
- **File**: `backend/cli/tui/test.js:55`
- **Why**: Commit `dfb8f47f` removed `--symbols` from the correlation command and restructured the `backend summary` flags. The test still accesses `.flags['--symbol'].options()` on `backend summary`, which no longer exists. Result: `TypeError: Cannot read properties of undefined (reading 'options')` — 4/5 TUI tests pass, 1 fails.
- **Evidence**: `node --test backend/cli/tui/test.js` → 4 pass, 1 fail. Runtime confirms `backend summary` flags are `--timeframe` and `--max-bars` only; `--symbol` is absent.
- **Required decision**: Update `test.js:55` to target a valid flag with `options()` — e.g., `backend summary`'s `--timeframe`, or `research bt`'s `--strategy`. Do not add `--symbol` back to summary.
- **Verification gate**: `node --test backend/cli/tui/test.js` → 5/5 pass.

### [LOW] Dead function: `waitForEnter` in engine.js
- **File**: `backend/cli/tui/engine.js:625`
- **Why**: Commit `dfb8f47f` describes `waitForEnter` as replacing `promptText` for the result screen, but the active code uses `waitForPostCommandAction` (lines 716, 753) instead. `waitForEnter` is defined, not exported, and not called anywhere — dormant dead code.
- **Required decision**: Either call `waitForEnter` from somewhere or delete it. No grade penalty (dormant), but dead code accumulates confusion.
- **Verification gate**: `grep -n "waitForEnter" backend/cli/tui/engine.js` shows either 0 calls or a real caller.

### [RESOLVED] Integrity freshness previously blocked at `ok: false`
- **Evidence**: `node backend/cli/sovereign_cli.js backend integrity --json` now returns `ok: true`. Policy was tightened to require `1d` only; intraday frames are intentionally stale. All 84 symbols cached, 0 missing. Upgrades `storage/data/cache` from C- to B.

---

## Centralization Backlog (current)
No new recurring patterns found in the in-scope files this pass. Existing backlog items below remain active.

---

Updated: Blast-Through Audit 2026-06-02 (Session 71)

---

## NEW - 2026-06-02 (Session 71 blast-through)

### [DATA P0] Integrity freshness regressed: 33 required `1d` symbols stale
- **File / surface**: `backend/cli/commands/backend.js`, `storage/data/ts`, `config/markets/data_sources.yaml`
- **Why**: `node backend/cli/sovereign_cli.js backend integrity --json` now returns `ok: false` with `84/84` cached, `0` missing, `33` stale, and `1` exception. The active state had recorded integrity as green, so the current cache has drifted past policy.
- **Evidence**: Required timeframe is `1d`; `RNDRUSDT` is the only configured exception. Stale sample includes equities such as `AAPL`, `MSFT`, `NVDA`, and `SPY` ending at `2026-05-29` with `age_h: 98`, just beyond the hardcoded `1d` threshold of `96h`.
- **Required decision**: Refresh stale required `1d` symbols or adjust the freshness policy to be exchange-calendar aware. Do not promote model/backtest reports as live-current until this is green again.
- **Verification gate**: `node backend/cli/sovereign_cli.js backend integrity --json` returns `ok: true`, `total_missing: 0`, and `total_stale: 0` except explicit exceptions.

### [LEDGER CORRECTION] Two active universe P0 entries below are resolved
- **Files**: `backend/cli/lib/utils.js`, `backend/cli/commands/strategy.js`
- **Why**: The older active queue claims both paths read `DEFAULT_HISTORY` as a file. Current code shows `get_Current_Universe_Symbols()` and `get_Full_Universe_Symbols()` scan family subdirectories, and `strategy.js` imports the canonical helper from `../lib/utils.js`.
- **Required decision**: Treat the old `lib/utils.js:469` and `commands/strategy.js:47-56` directory-read items as stale history, not active blockers.
- **Verification gate**: `Select-String` confirms `backend/cli/commands/strategy.js` imports `get_Current_Universe_Symbols` from `utils`, and `backend/cli/lib/utils.js` reads `path.join(DEFAULT_HISTORY, family, 'backtest_history.json')`.

### [HYGIENE P1] Generated report tracked outside the generated-path contract
- **File**: `backend/scripts/data/cache/data_quality_report.json`
- **Why**: `git ls-files backend/scripts/data/cache storage/data/cache storage/data/ts backend/gateway/node_modules .mcp.json` returns `backend/scripts/data/cache/data_quality_report.json`. Current structure tests guard several generated/cache roots, but not this backend script cache path.
- **Required decision**: Remove the generated report from version control or explicitly bless it as a checked fixture with documentation.
- **Verification gate**: Extend the structure contract for `backend/scripts/data/cache`, then `git ls-files backend/scripts/data/cache storage/data/cache storage/data/ts backend/gateway/node_modules .mcp.json` returns empty or only deliberately documented fixtures.

### [PATH DRIFT P1] Native test still includes old `cpp_core/src` root
- **File**: `tests/cpp_core/ml/kronos_flow.test.cpp`
- **Why**: The active native root is `backend/core`, but this test includes `../../cpp_core/src/...`. That can fail if compiled directly and keeps old migration paths alive in verification.
- **Required decision**: Update the include paths to `backend/core/src` or quarantine the test as legacy.
- **Verification gate**: CMake/native test discovery succeeds, and `rg "cpp_core/src|cpp_core/build" tests backend shared docs -n` only hits explicit historical/debt notes.

### [FIXTURE DRIFT P2] Golden backend outputs still encode `data/cache`
- **Files**: `tests/fixtures/test/fixtures/outputs/backend*.json`
- **Why**: Several golden outputs still include `data/cache/backtest_history.json`, while the canonical runtime map now says `storage/data` is the active data plane. These fixtures can accidentally bless compatibility paths as current behavior.
- **Required decision**: Regenerate backend command fixtures from current CLI output or mark these outputs as legacy fixtures.
- **Verification gate**: Fixture scan shows active outputs use `storage/data/cache` and `backend/core`, or legacy fixtures are explicitly labeled.

### [LEDGER CORRECTION] Two older review items are stale history
- **Files**: `shared/lib/backtest.js`, `backend/cli/sovereign_cli.og.js`
- **Why**: Current `shared/lib/backtest.js` has one `rules` key in the prop-firm suitability return object, and `backend/cli/sovereign_cli.og.js` no longer exists. Older queue entries mentioning duplicate `rules` and `.og.js` deletion should not be treated as active blockers.
- **Required decision**: Keep the historical notes below, but treat the Session 71 correction as current truth.
- **Verification gate**: `Select-String shared/lib/backtest.js -Pattern "rules,"` shows one return-object key, and `Test-Path backend/cli/sovereign_cli.og.js` returns false.

---
Updated: Blast-Through Audit 2026-06-02 (backend/cli pass)

---

## NEW â€” 2026-06-02 (backend/cli blast-through)

### [BUG P0] `lib/utils.js:469` â€” `get_Full_Universe_Symbols` calls `readFileSync` on a directory
- **File**: `backend/cli/lib/utils.js:466â€“475`
- **Why**: `DEFAULT_HISTORY = 'storage/data/cache'` is a directory. The step-2 backtest merge does `readFileSync(DEFAULT_HISTORY)` which throws and is caught silently. The merge is always a no-op â€” callers get an incomplete universe.
- **Required decision**: Scan subdirectories like `get_Current_Universe_Symbols` already does, e.g. `path.join(DEFAULT_HISTORY, family, 'backtest_history.json')`.
- **Evidence**: `DEFAULT_HISTORY` declared at `lib/utils.js:28` as `path.join(REPO_ROOT, 'storage', 'data', 'cache')` (directory). Used as file at line 469.
- **Verification gate**: `node -e "require('./lib/utils').get_Full_Universe_Symbols().then(r=>console.log(r.length))"` â€” result should increase after fix.

### [BUG P0] `commands/strategy.js:47â€“56` â€” Private `get_Current_Universe_Symbols` reads directory as file
- **File**: `backend/cli/commands/strategy.js:47â€“56`
- **Why**: Same bug â€” `readFileSync(DEFAULT_HISTORY)` on the directory always throws, always returns `['BTCUSDT','ETHUSDT']`. `buildStrategyPlan` universe is therefore always the 2-symbol fallback, not the real universe.
- **Required decision**: Delete the private copy; use `get_Current_Universe_Symbols` imported from `lib/utils.js` (canonical version scans subdirectories correctly).
- **Verification gate**: `strategy new` â†’ universe choices should list all cached symbols.

### [RISK P1] `tui/engine.js:434` â€” Status bar hardcoded as always-green
- **File**: `backend/cli/tui/engine.js:434`
- **Why**: `"Backend: OK | Cache: Valid | Network: Connected"` is a static string. It shows OK even when backend is down, cache is empty, or network is unavailable.
- **Required decision**: Wire to a lightweight health probe or remove the status bar from the select prompt header.
- **Verification gate**: Disconnect backend and open TUI select prompt â€” should NOT show "Backend: OK".

### [REVIEW P1] `[gemini-work]` blocks in financial/security-critical paths
- **Files**:
  - `commands/trade.js:271` â€” live-trade security gate (PIN verification flow)
  - `commands/strategy.js:810,870` â€” balance fetch + dynamic position sizing
  - `commands/research.js:1662` â€” OOS overfitting heuristic (`sharpe * 0.5` threshold)
  - `commands/research.js:255â€“305` â€” symbol/family filter for ingestion
- **Why**: AI-generated code tagged `[gemini-work]`, not verified against domain conventions or test coverage. Financial math and security gates require human sign-off.
- **Required decision**: Human reviewer must audit each tagged block.
- **Verification gate**: Each block has an associated test or documented approval note.

### [HISTORICAL NOTE] `sovereign_cli.og.js` â€” archive reference only
- **File**: `backend/cli/sovereign_cli.og.js`
- **Why**: The older archive artifact is no longer present in the tree. Keep its mentions as historical context only, not active debt.
  - **Required decision**: Do not reopen this as a live blocker.
  - **Verification gate**: `Test-Path backend/cli/sovereign_cli.og.js` returns false.

### [HYGIENE P2] `tui/manifest.js:227â€“295` â€” Three dead exported manifest objects
- **File**: `backend/cli/tui/manifest.js:227â€“295`
- **Why**: `STRATEGY_MANIFEST`, `DATA_MANIFEST`, `RESEARCH_MANIFEST` are defined and exported but imported nowhere. 68 lines of dead schema.
- **Required decision**: Delete the three objects and their export entries.
- **Verification gate**: `grep -r "STRATEGY_MANIFEST\|DATA_MANIFEST\|RESEARCH_MANIFEST" backend/cli/commands/` â†’ empty.

### [DRIFT P2] `lib/auth.js:11â€“18` â€” Inline ANSI, not using shared lib
- **File**: `backend/cli/lib/auth.js:11â€“18`
- **Why**: Defines 6 ANSI escape codes inline. The shared `ansi.js` provides the same constants and is used everywhere else.
- **Required decision**: Replace with `const A = require('../../../shared/lib/ansi')`.

### [FRAGILE P2] `lib/research_config.js` â€” Hand-rolled YAML parser
- **File**: `backend/cli/lib/research_config.js`
- **Why**: Regex-based, handles only flat `section.key: value`. No arrays, no nested nesting. Silent incorrect parses on anything more complex.
- **Required decision**: Confirm `config/trading/research.yaml` stays flat forever, or replace with `js-yaml` (check if already in package.json).

### [DEBT P3] `tui/engine.js:293,478,570,605` â€” 4 nested if-else chains (already dev-flagged)
- **File**: `backend/cli/tui/engine.js`
- **Why**: `handleKey` in both `promptMultiSelect` and `promptSelect` use deep if-else chains. Your own TODO comments flag these.
- **Required decision**: Refactor to key-handler dispatch map on next engine.js touch.

---

Updated: Blast-Through Audit 2026-05-30 (Session 5)

## Correction Log - 2026-06-01 (Session 58, legacy test-path cleanup)

### Fixed
1. **Backfill regression queue drift**: the top-level orphaned-test entry for `tests/scripts/tests/backfill_regression.test.js` is stale history, not active debt. The test still passes and the queue should treat the resolved section below as the source of truth.
2. **Native toolchain legacy path**: `tests/scripts/tests/native_toolchain_check.test.js` was updated to import `backend/scripts/dev/native_toolchain_check.js` directly, removing the stale `../dev/...` path.
3. **Sovereign CLI legacy contract text**: `tests/scripts/tests/sovereign_cli.test.js` now matches the current `Data-quality validation failed.` wording and the current strategy YAML `validation: strict` contract.

### Verification
- `node --test tests\\scripts\\tests\\native_toolchain_check.test.js`
- `node --test tests\\scripts\\tests\\sovereign_cli.test.js`
- `node --test tests\\scripts\\cli_ui_contract.test.js`

### Remaining
- The active queue still contains genuine repo debt, but the three legacy-test items above no longer belong in the unresolved bucket.

---

## NEW â€” 2026-06-02 (shared/lib blast-through)

### [DEFECT P1] `backtest.js:232,237` â€” Duplicate `rules` key in `assessPropFirmSuitability` return object
- **File**: `shared/lib/backtest.js:226â€“248`
- **Evidence**: `rules,` appears at both line 232 and line 237 in the same return literal. Second key silently overwrites the first (same value, so no visible breakage today, but linters flag it and future edits that change one instance won't propagate).
- **Required decision**: Remove the second `rules,` at line 237.
- **Verification gate**: `node -e "const b=require('./shared/lib/backtest'); console.log(Object.keys(b.assessPropFirmSuitability({max_drawdown:0.05},{},{})))"` â€” `rules` should appear once.

### [RISK P1] `quote_router.js:50â€“58` â€” `normalizeSymbol` can strip USDT for family=null crypto
- **File**: `shared/lib/quote_router.js:46â€“59`
- **Evidence**:
  ```js
  value = value.replace(/USDT$/, 'USD');   // unconditional: BTCUSDT â†’ BTCUSD
  if (family === 'crypto' && value.endsWith('USD')) {
    return `${value.slice(0, -3)}USDT`;    // only restores if family explicitly 'crypto'
  }
  ```
  Any caller that passes `BTCUSDT` without specifying `family: 'crypto'` gets back `BTCUSD`. Symbol lookup then fails silently.
- **Required decision**: Either guard the strip as `family !== 'crypto'`, or add a `family === null` fallback that preserves `USDT` pairs.
- **Verification gate**: Unit test: `normalizeSymbol('BTCUSDT', null) === 'BTCUSDT'`.

### [RISK P1] `execution_memory.js` â€” No TTL; memory file grows unboundedly
- **File**: `shared/lib/execution_memory.js`
- **Evidence**: `PersistentExecutionMemory.add()` appends every executed signal ID to a `Set` and writes it all to disk on every call. No expiry, no rotation. For a 24/7 auto-trader running for months, the file and in-memory Set grow without bound.
- **Required decision**: Add a TTL-based eviction (e.g., only retain entries from the last N days) or cap the Set size.
- **Verification gate**: After a simulated long run, `execution_memory.json` should not exceed a reasonable bound.

### [RISK P1] `indicators.js:259â€“295` â€” `generateSyntheticLTF` uses `Math.random()` (non-deterministic)
- **File**: `shared/lib/indicators.js:259â€“295`
- **Evidence**: `generateSyntheticLTF` uses `Math.random()` for bar synthesis while the rest of the codebase (`generateSampleBars`, `monteCarloStress`) uses a seeded deterministic RNG. If this function is ever wired into a backtest or research path, results become non-reproducible.
- **Required decision**: Replace `Math.random()` with `createSeededRandom()` (already in `backtest.js`) before wiring into any production path.
- **Verification gate**: Two calls with same seed produce identical output.

### [HYGIENE P2] Four hand-rolled YAML parsers across the codebase â€” all partial
- **Files**:
  - `backend/cli/lib/research_config.js` â€” flat key:value only
  - `shared/lib/paths.js:49â€“80` â€” basic 2-level
  - `shared/lib/strategy_registry.js:22â€“46` â€” `parseScalarFromYaml`, `parseArrayFromYaml`, `parseSectionMap`
  - `shared/lib/config_loader.js:17â€“53` â€” `parseYamlRecursive` (best, handles nesting + lists)
- **Problem**: Four different partial YAML implementations with different capabilities. None handles anchors, multi-line strings, or quoted colons in values. Inconsistent behavior when config files grow.
- **Required decision**: Consolidate on `config_loader.js:parseYamlRecursive` (it's the most capable), remove the other three, and replace call sites. Or add `js-yaml` as a shared dep (check `package.json` first).
- **Verification gate**: All config load paths use one parser; no `match(/^${key}:/` in the tree.

### [DRIFT P2] `mcp_agent.js:5` â€” Own `REPO_ROOT` instead of using `./paths`
- **File**: `shared/lib/mcp_agent.js:5`
- **Evidence**: `const REPO_ROOT = path.resolve(__dirname, '..', '..')` defined inline instead of `require('./paths').REPO_ROOT`.
- **Required decision**: Replace with `const { REPO_ROOT } = require('./paths')`.

### [DEAD CODE P2] `indicators.js:306â€“309` â€” Dead `endOffset === 0` branch in `calculateCorrelationDivergence`
- **File**: `shared/lib/indicators.js:303â€“309`
- **Evidence**: Loop is `for (let i = longPeriod; i > shortPeriod; i--)`, so `i` minimum is `shortPeriod + 1`. Therefore `endOffset = -i + shortPeriod` is always `â‰¤ -1` (never 0). The `endOffset === 0 ? undefined : endOffset` ternary always evaluates the false branch.
- **Required decision**: Simplify to `seriesA.slice(-i, endOffset)` â€” dead branch removal.

---

## [ARCHIVE SHIM] Legacy CLI shape is historical
- **Files**: `backend/cli/sovereign_cli.js`, `docs/engineering/codebase_org.md`, `docs/engineering/architectural_debt.md`
  - **Why**: The active CLI now lives in `backend/cli/sovereign_cli.js`, and the old `.og.js` file is gone. The remaining references should be read as archive history only.
  - **Required decision**: Keep active CLI docs and tests pointed at the current entrypoint.
  - **Evidence used**: Workspace state correction log Session 72, structural audit ledger update, and the current graph hub `Legacy CLI & Data Fetchers`.
- **Verification gate**: No runtime or docs path references the `.og.js` file as an active entrypoint, and the active CLI contract is covered directly by tests.

## RESOLVED (2026-06-02 Session 64)

- [x] **[DATA AVAILABILITY] Integrity gate is green with an explicit exception list**: Fixed â€” `backend integrity --json` now returns `ok: true` with `total_stale: 0` and `total_exceptions: 1`. The 34-symbol `1d` freshness gap was repaired by a targeted backfill, `backend/cli/commands/data.js` now writes the TS index alongside the cache snapshot, `backend/cli/commands/backend.js` uses a business-day-aware `1d` threshold plus an explicit `RNDRUSDT` exception, and `tests/scripts/tests/sovereign_cli.test.js` now asserts the green exception-aware payload.
- [x] **Regression coverage**: Added a live CLI contract assertion for `backend integrity` so the policy exception list and zero-stale summary stay locked in.

---

## [DOC DEFECT] stack_manifest.md + STATE.md have auto-gen duplicated sections
- **Files**: `docs/engineering/stack_manifest.md:51-65`, `workspace/STATE.md` (repeated empty `## Session Log` / `## Correction Log` headers)
- **Why**: Tables/sections contain duplicate rows and repeated empty headers â€” a doc-generation bug, not hand-authored. Only the stale legacy path row in stack_manifest was removed in S5; the structural duplication remains.
- **Required decision**: Identify and fix the doc-gen step that emits duplicates; regenerate both files.
- **Verification gate**: Each source file appears once in the stack_manifest table; STATE.md has a single Session/Correction log section.

---

## [LIVE RISK] C++ Risk Engine bridge active â€” needs production drawdown calibration
- **File**: `backend/gateway/src/index.ts:460-490`
- **Why**: The C++ Risk Engine is now wired and enforcing 25% concentration and 20% drawdown limits. However, these limits are hardcoded defaults or derived from ENV proxies (`ESTIMATED_PORTFOLIO_VOLATILITY`).
- **Required decision**: Calibrate `RiskLimits` in `main.cpp` or move to a dynamic config file that can be updated without rebuilding the binary.
- **Verification gate**: Submit an oversized order and confirm rejection reason matches "CRITICAL: Concentration limit exceeded".

## [STUB] Polymarket is a pure stub
- **File**: `backend/gateway/src/index.ts:589-608`
- **Why**: `PolymarketAdapter` remains a functional stub. It uses hardcoded balances and positions.
- **Required decision**: Implement real Polymarket API integration.
- **Verification gate**: Successfully fetch live Polymarket positions.

## [STUB] Indicator Innovations are roadmap-only
- **File**: `shared/lib/indicators.js`
- **Why**: `rollingCorrelation` and `generateSyntheticLTF` are implemented as library functions but are not yet wired into the production `IndicatorEngine.cpp` or the main strategy automation loop.
- **Required decision**: Integrate correlation divergence signals into `strategy.js` and `IndicatorEngine.cpp`.
- **Verification gate**: Strategy automation emits a signal based on correlation divergence.

## [LIVE REPORT DRIFT] latest model comparison has no per-symbol winners
- **File**: `storage/data/models/latest_model_comparison.json`
- **Why**: The report has `candidate_count: 14` and model metadata, but `per_symbol_winners` is empty. The web API now handles explicit request-input inspection, but the live latest report still cannot produce live dashboard signals by itself.
- **Required decision**: Regenerate model comparison against the now-green integrity policy, or update the model report contract to distinguish "metadata only" from "symbol-ranked".
- **Verification gate**: `/api/signal` without an `input` returns 200 with non-empty `signals`, or intentionally returns a documented degraded status with a precise reason.

## RESOLVED (2026-06-02 Session 60)

- [x] **[PERF / CONTENTION] optimize refresh path is slow and can trip cache rename errors**: Fixed Ã¢â‚¬â€ `commandOptimize()` now fails fast when the current slice has no usable features instead of auto-refreshing provider history inside the optimize loop. This removes the hidden cache-write contention path that could emit `EPERM` rename errors or stall the CLI.
- [x] **Regression coverage**: Added a fast-fail regression in `tests/scripts/tests/sovereign_cli.test.js` that proves optimize returns the new no-usable-features error without the refresh fallback.

## RESOLVED (2026-06-02 Session 61)

- [x] **[AUTH / NETWORK] Supabase auth fetch failures leaked raw stack traces**: Fixed Ã¢â‚¬â€ added a shared Supabase error classifier and wrapped the CLI auth flow plus backend auth/database status checks so `fetch failed` / `EACCES` / `AggregateError`-style failures now render as short actionable messages instead of raw Undici stacks.
- [x] **Regression coverage**: Added tests covering the friendly classification helper and the CLI login boundary so connectivity failures stay user-readable.

---

## RESOLVED (2026-06-01 Session 50 â€” blast-through pass)

- [x] **[MEMORY LEAK] RATE_LIMITS Map never purges**: Fixed â€” `setInterval` every 5 min with `.unref()` added at `backend/api/app.js:43-50`.
- [x] **[DESIGN GAP] GET requests bypass API token check**: Partially fixed â€” `PROTECTED_GET_ROUTES` set added; `/api/cache/list` now token-guarded. Remaining GET endpoints are all public-by-design; no hidden unprotected routes found.
- [x] **[MODEL CALIBRATION] cnn_window_v0 never clears 0.62 threshold on real 1d data**: Fixed â€” `confidenceScale` raised 1â†’3 at `shared/lib/models.js:77`. MODEL_ALIASES verified clean: `xgboost` â†’ `xgboost_ranker_v0` (confidenceScale=2).
- [x] **[MISSING TRUST GATE] Automation had no live-execution gate**: Fixed â€” `buildAutomationTrustDecision()` at `strategy.js:348-369` blocks live orders when verdict â‰  researchable or score < minTrustScore.
- [x] **[ARCHIVE DRIFT] HANDOFF/STATE session ordering**: Append-only correction log now standard; STATE.md tail contains newest correction blocks (Sessions 42-49).

## RESOLVED (2026-06-01 Session 50 â€” mass-implement pass)

- [x] **[BUG] `--days` did not restrict the backtest window**: Fixed â€” `from` now derived from `requestedDays` when `--from` is not set and not in sample mode (`research.js:1227`). Verified: 30-day window, realistic returns.
- [x] **[MISSING] Rolling walk-forward validation**: Implemented â€” `rollingWalkForward()` in `shared/lib/backtest.js`; wired into `commandBacktest`; trust gate upgraded; 3 folds by default; 13/13 contract tests pass.
- [x] **[ORPHANED TEST] backfill_regression.test.js MODULE_NOT_FOUND**: Already resolved in Session 47 â€” test was rewritten to stub `ingestPath` directly. 2/2 passing.

## RESOLVED (2026-05-31 Session 6)

- [x] **[DATA AVAILABILITY] Integrity command remains degraded**: Fixed â€” Implemented `backfill --family` in CLI and successfully populated FX, Indices, and Commodities. `backend integrity --json` now reflects complete cache.
- [x] **C++ Backend Crash**: Fixed â€” Replaced `std::regex` with zero-copy `std::string_view` manual scanning. Resolves stack buffer overruns on large JSON files.
- [x] **Monolithic Cache OOM**: Fixed â€” Migrated to family-partitioned storage structure. C++ core and Node.js ingestion updated to support recursive aggregation.
- [x] **Supabase Schema Sync**: Fixed â€” Added `normalized_value` column to `macro_observations`.
- [x] **Multi-Domain Asset Resolution**: Fixed â€” C++ engine now recognizes `series`, `metric`, etc., resolving the "universe:missing_symbol" errors.
- [x] **`backfill_family` MCP Tool**: Fixed â€” CLI now supports the `--family` flag, making the tool functional.
- [x] **`get_portfolio` MCP Tool**: Enhanced â€” Added `live` flag support to bridge to live broker accounts.
## RESOLVED (2026-06-02 Session 65)

- [x] **[LEGACY COMPAT] Adapter overlap collapsed into a thin compatibility shim**: Fixed Ã¢â‚¬â€ `shared/lib/adapters.js` now re-exports the canonical provider and backfill modules instead of carrying its own duplicate fetch logic. The live ingest/backfill path owns the behavior, and the historical adapter path remains only for compatibility imports.
- [x] **Docs alignment**: `docs/engineering/codebase_org.md` now describes `shared/lib/adapters.js` as a thin shim and `docs/engineering/architectural_debt.md` records the adapter boundary update.

## RESOLVED (2026-06-02 Session 66)

- [x] **[ACTIVE DATA READINESS] Stale active queue item removed**: Fixed - live `backend integrity --json` now returns `ok: true`, `total_cached: 84`, `total_missing: 0`, `total_stale: 0`, and `total_exceptions: 1`; the older data-readiness blocker is superseded by the Session 64 resolved entry.
- [x] **[ARCHIVE DRIFT] Current append-only corrections are the source of truth**: Fixed - the active queue no longer treats older handoff/state history as a current blocker when newer Session 64 and Session 65 corrections already supersede it.
- [x] **[ORPHANED TEST] Duplicate backfill-regression debt retired**: Fixed - the duplicate active stale-test item was removed so the queue does not carry both unresolved and resolved states for the same test.
- [x] **[RESOLVED API/OPTIMIZE ITEMS] Duplicate active entries retired**: Fixed - old RATE_LIMITS, protected-GET, data-readiness, and optimize-contention active entries were removed because later resolved sections already document their fixes.

## Update - 2026-06-02 Session 75

- `shared/lib/indicators.js` now carries the new price-action cluster: SMC structure/break/sweep/FVG fields, RSI/MACD divergence fields, and a session volume profile summary with POC, VAH, VAL, VWAP, and normalized position.
- `shared/lib/models.js` now consumes the new scores so the deterministic model adapters can use structure and session balance in their ranking logic.
- Blast-through on the requested areas shows the next deconstruction targets are file-level, not folder-level: `tests/scripts/tests/sovereign_cli.test.js` is the biggest contract file, and `backend/cli/commands/research/research.js`, `backend/cli/commands/tools/backend.js`, and `backend/cli/commands/strategy/strategy.js` are still monolithic inside otherwise good folders.
- Verification: `node --check shared/lib/indicators.js`, `node --check shared/lib/models.js`, `node --test tests/scripts/tests/sovereign_cli.test.js --test-name-pattern "price action indicators detect structure breaks and divergence|session volume profile captures intraday value area and poc|indicators produce rolling feature rows from sample bars"`, `node --test tests/scripts/backend_cli_human_surfaces.test.js`.

## Centralization Backlog

| Pattern | Files | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| CLI contract bundle by concern | `tests/scripts/tests/sovereign_cli.test.js` | `tests/scripts/tests/` split into `sovereign_cli_core.test.js`, `sovereign_cli_price_action.test.js`, and `sovereign_cli_human_surfaces.test.js` | M | C → B |
| Price-action feature cluster | `shared/lib/indicators.js` | `shared/lib/indicators/price_action.js` with `smc.js`, `divergence.js`, and `session_volume_profile.js` helpers | L | B- → B+ |
| Research command responsibility split | `backend/cli/commands/research/research.js` | `backend/cli/commands/research/` helpers for path parsing, backtest orchestration, and renderers | L | B- → B |
| Backend tool surface split | `backend/cli/commands/tools/backend.js` | `backend/cli/commands/tools/backend/` helpers for universe, integrity, correlation, and summary views | L | B- → B |
| Strategy command render/action split | `backend/cli/commands/strategy/strategy.js` | `backend/cli/commands/strategy/` helpers for prop-firm views, registry views, and selection prompts | M | B- → B |

### Plan Notes

- Keep the current folder layout intact; do not introduce another folder move unless the file split still leaves a single file above ~900 lines.
- Split tests first because the current `sovereign_cli.test.js` file is both the largest and the best behavior map for the new indicator work.
- Split `shared/lib/indicators.js` next, since that module now owns three distinct families: classic technicals, SMC, and intraday session profile.
- Defer `research.js`, `backend.js`, and `strategy.js` until the shared indicator split lands, because those command files should consume the smaller helpers rather than define them.

## Update - 2026-06-02 Session 77

### Resolved in this pass

- [x] **[DEFECT P0] Provider cache helper threw `path is not defined`**: `shared/lib/providers/common.js` used `path.join(...)` without importing `node:path`. This broke `cachedFetch()` callers and left the current commodity snapshot with stale `XAGUSD` provider errors. Fixed by adding the missing import.
- [x] **[SURFACE PARITY P1] TUI `ingest --family` flag was not passed to the ingest engine**: `backend/cli/commands/data/data.js` parsed no ingest flags and always called `ingestMarketData()` unscoped. Added `ingestOptionsFromArgs()` and wired `commandIngest()` to pass `family`, `symbol`, and `timeframe` options when present.

### Verification

- `node -e "global.fetch=async()=>({ok:false,status:418}); const {cachedFetch}=require('./shared/lib/providers/common'); cachedFetch('https://example.test/a').then(r=>console.log(JSON.stringify({status:r.status})))"` -> `{"status":418}`
- `node --check shared\lib\providers\common.js`
- `node --check backend\cli\commands\data\data.js`
- `node --check tests\scripts\cli_ui_contract.test.js`
- `node --test tests\scripts\tests\provider_sources.test.js tests\scripts\cli_ui_contract.test.js` -> 10/10 pass
- `node backend\cli\sovereign_cli.js backend integrity --json` -> `ok: true`, `84/84` cached, `0` missing, `0` blocking stale, `1` exception (`RNDRUSDT`)

### Still open

- **Live cache needs refresh after provider-cache fix**: `storage/data/cache/last_fetch.json` still contains the previous `XAGUSD` errors with `message: "path is not defined"`. This is stale evidence, not proof the code path still fails. Verification gate: rerun a scoped commodity ingest after provider/network availability, then `status --json` should no longer report those four provider errors.
- **Quote feed is stale**: `quotes status --json` still reports `ok: false`, `records: 24`, `stale_records: 18`, with `headway_mt5` status `stale`. Verification gate: refresh the MT5/headway quote feed and confirm `quotes status --json` returns `ok: true` or a precise provider-unavailable reason.
- **Dashboard/cockpit still exposes sample-mode research artifacts**: cockpit shows `features` from `source_mode: sample` and the latest backtest trust grade remains `F`/`do-not-trust-yet`. Verification gate: regenerate live features and model/backtest reports from the green daily cache, or label those cards as sample/degraded in the cockpit summary.

## Centralization Backlog Update - 2026-06-02 Session 77

| Pattern | Files | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| YAML scalar/array/section parsing still duplicated | `shared/lib/strategy_registry.js`, `backend/cli/commands/strategy/strategy.js`, `shared/lib/config_loader.js` | Consolidate strategy parsing on `parseYamlRecursive` plus numeric/string coercion helpers | M | C -> B |
| Prop-firm verdict rendering repeated in research output | `backend/cli/commands/research/research.js` | `shared/lib/prop_firms.js` formatter/verdict presenter | S | B- -> B |
| Status/cockpit quality cache side effect | `backend/cli/commands/status.js`, `storage/data/cache/data_quality_report.json` | Build cockpit status by validating the snapshot directly or tagging cached report provenance | S | B- -> B |

Resolved from older backlog: the giant CLI contract file was split, and the price-action indicator cluster was extracted into `shared/lib/indicators/price_action.js`.

## Update - 2026-06-02 Session 76

- `backend/cli/sovereign_cli.js status --json` reports `quality: needs attention` with `usable_records: 6`, `rejected_records: 18`, and `stale_records: 18`, so the TUI is correctly warning that the cache needs attention.
- `backend/cli/sovereign_cli.js cockpit --json` still shows `quote_provider: ok` even though `quotes status --json` reports `ok: false`, `stale_records: 18`, and `provider headway_mt5 status: stale`; the cockpit summary is therefore optimistic about quote freshness.
- `backend/cli/sovereign_cli.js auth-status` reports `Session expired`, which makes the TUI auth actions look present but locally inactive unless Supabase is configured.
- `backend/cli/sovereign_cli.js backend integrity --json` is healthy on the broad cache gate (`ok: true`, `84/84 cached`, `0 stale`, `1 exception` for `RNDRUSDT`), so the staleness problem is localized to quote freshness and status presentation rather than the entire backend layer.
- Reporting takeaway: the TUI's stale-feature signal is real, but the cockpit header should probably stop saying `quote_provider=ok` whenever freshness is stale, because that hides the user-facing problem.

## Update - 2026-06-06 Session (blast-through — post mass-implement)

- **DCS start/end**: `0.96 / 0.96` (10 stale FX 1d rows persist; network-limited, not code)
- **Scope**: Focused — all files touched this session + gated sections (`backend/gateway D`, `backend/cli/commands C`)
- **Verification**: 192/192 tests pass. `tsc --noEmit` clean. All new modules verified with fixture injection.

### Bug Found & Fixed This Pass

**Manifest parity bug** (`backend/cli/tui/manifest.js`): Runner category entry `{ id: 'bot paper', prefix: ['run'] }` would have produced `fullArgs = ['run', 'bot paper']` — a single-string arg — because `engine.js:713` does `[...prefix, id]` literally. `commandRun` checks `args[0] === 'bot'` which would never match `'bot paper'`. **Fixed to** `{ id: 'paper', prefix: ['run', 'bot'] }` → `['run', 'bot', 'paper']`. 192/192 still pass.

### Evidence Summary — New Files

| Module | Input | Key transform | Output | Invariant |
|---|---|---|---|---|
| `parseYamlRecursive` (extended) | `mean_reversion.yaml` | block-list + numeric coerce | `universe: ['BTCUSDT','SPY']`, `risk.signal_threshold: 0.65` (number) | Numeric scalars coerced; block lists gathered without touching object recursion |
| `parseStrategyYaml` (migrated) | same YAML | `parseYamlRecursive` → `sec.universe`, `sec.risk` | `{ ok:true, name:'mean_reversion', universe:[…], risk:{signal_threshold:0.65,…} }` | All 4 hand-rolled helpers removed; same output contract |
| `run_loop` | `startLoop('t', fn, 9000)` | tick fires async, writes status.json | calls=[1] after 50ms, isRunning=true, isRunning after stop=false | First tick is immediate; stop clears both map and status file |
| `polymarket_backtest` | fixture market, winner='yes', prices=[0.07,0.08,0.09] | `low_prob_dip` at 0.07 entry | `{ trades:1, wins:1, totalPnl:0.93 }` | 1.0 − 0.07 = 0.93 |

### Gate Table

| Section | Grade | Trend | Gate Status |
|---|---:|---|---|
| `backend/gateway` | **C** | D→C | **OPEN** — Alpaca positions stub fixed (`getPositions` now returns `[]` not fake AAPL/TSLA). Gate.io cost-basis open (flagged). |
| `backend/api/server` | `C` | → | GATED — public portfolio route needs auth (carried) |
| `backend/cli/commands` | **B** | C→B | **OPEN** — manifest parity bug fixed; YAML migration complete; run.js follows established pattern |
| `backend/cli/tui` | `B` | → | OPEN |
| `shared/lib` | `B` | → | OPEN — `strategy_registry.js` YAML helpers still unmigriated (S-effort, next move) |
| `tests` | `A` | → | OPEN |

### Next Clearing Move
Migrate `shared/lib/strategy_registry.js:22,28,48` (`parseScalarFromYaml`, `parseArrayFromYaml`, `parseSectionMap`) to use `parseYamlRecursive`. This finishes the YAML centralization and clears the last `shared/lib` centralization backlog item. S-effort, unblocked now that `parseYamlRecursive` handles block lists + numeric coercion.

## Update - 2026-06-02 Session 78 (blast-through audit)

- DCS start/end: `0.96 / 0.96`
- Scope: full audit across `backend/cli/commands`, `backend/cli/tui`, `backend/api/server`, `shared/lib`, `Frontend/dashboard/src`, `backend/gateway`, `config`, `storage`, and `tests`.
- Verification used: `graphify-out/GRAPH_REPORT.md`, targeted source reads, and `node --test tests\\scripts\\tests\\sovereign_cli.test.js tests\\scripts\\tui_cli\\intersection.test.js tests\\scripts\\cli_ui_contract.test.js` (`40/40` pass).

### Gate Table

| Section | Grade | Gate Status |
|---|---:|---|
| `backend/gateway` | `C` | OPEN - Alpaca stub fixed 2026-06-06; Gate.io cost-basis open |
| `backend/api/server` | `C` | GATED - public portfolio surface needs auth review |
| `backend/cli/commands` | `C` | GATED - handler/manifest alias drift still needs cleanup |
| `backend/cli/tui` | `B` | OPEN |
| `shared/lib` | `B` | OPEN |
| `Frontend/dashboard/src` | `B` | OPEN |
| `config` | `B` | OPEN |
| `storage` | `B` | OPEN |
| `tests` | `A` | OPEN |

### Stubs / Unfinished

| File | Finding | Severity | Reviewer decision | Gate |
|---|---|---|---|---|
| `backend/gateway/src/index.ts:499-505` | `AlpacaAdapter.getPositions()` returned hardcoded `[AAPL, TSLA]` when no credentials, ignoring `simulateIfMissingCredentials: false`. **FIXED 2026-06-06**: now returns `[]` or throws, matching `placeOrder` contract. | High | ✅ RESOLVED | `tsc --noEmit` clean, 192/192 pass |
| `backend/gateway/src/index.ts:381,384` | `GateIoAdapter.getPositions()` sets `averagePrice: 0` with `cost_basis_unavailable: true` flag (CLOB trade history traversal not implemented) | Low | Acknowledged — callers must check `cost_basis_unavailable` before displaying PnL | Non-blocking |
| `backend/gateway/src/index.ts:523-524` | `AlpacaAdapter.placeBracketOrder()` returns `{ id: 'sim-bracket' }` with no creds, ignoring `simulateIfMissingCredentials` | Low | Dormant — no callers found in codebase; safe to ignore until wired | No grade impact |

### Security

| File | Finding | Severity | Reviewer decision | Evidence |
|---|---|---|---|---|
| `backend/api/app.js:121-127`, `backend/api/server/services/cli_executor.js:688-706` | `/api/backend/portfolio` is treated as public and returns aggregated portfolio data from `trade aggregate_portfolio --json` | Medium | Require auth or explicitly downgrade the payload before keeping it public | `backend/api/app.js` route list and `backendPortfolio()` call path |

### Orphan / Parity Notes

- `backend/cli/sovereign_cli.js:38,42,44,46,51,69` still exposes handler-only aliases such as `clean`, `quotes`, `backtest`, `indicators`, `trade`, and `whoami` that are not represented as direct manifest entries.
- `backend/cli/tui/manifest.js:95-223` is otherwise aligned to the CLI prefix model, so the main issue is alias drift rather than a missing runtime handler.
- `backend/api/server/routes/index.js:4,9-11,15,19-24` matches the frontend endpoint set in `Frontend/dashboard/src/lib/api.ts:10-22`; no route mismatch was found in the audited endpoint list.

### Centralization Backlog

| Pattern | Files | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| Snapshot filter by `symbol` / `timeframe` with local JSON loading | `backend/api/server/services/cli_executor.js:228-231,313-314`, `backend/api/server/routes/sigma_band.js:7-18,42-53` | `shared/lib/snapshot_query.js` | `M` | `C -> B` |

### Section Notes

- `backend/cli/tui` is healthy: the manifest prefix model and the runtime dispatcher both line up, and the focused CLI/TUI contract tests passed.
- `shared/lib` remains the cleanest layer in the audit sample: the cache helper, quote router, and market validation code are centralized enough that the remaining duplication is mostly in callers.
- `Frontend/dashboard/src` is now wired to the live sigma-band endpoint and guards the app behind auth when no session is present.
- `storage` contains a lot of intentionally persisted cache/backtest material, so the main concern is hygiene and refresh discipline rather than missing functionality.

### Next Debt-Clearing Move

- Remove the live Polymarket stub or isolate it behind an explicit simulation flag, then tighten the portfolio route gate so the public API cannot expose live holdings by accident.

## Update - 2026-06-03 Polymarket follow-up

### Fixed / verified
- `backend/gateway/src/index.ts` no longer behaves like the earlier stub: `polymarket portfolio` now performs live balance, open-order, and trade reads, and the live probe returns a populated JSON payload with `prediction_markets.polymarket`.
- `backend/cli/commands/trade/trade.js` still routes `aggregate_portfolio` through the gateway and successfully surfaces the Polymarket sidecar payload in the JSON result.

### Remaining
- `backend/gateway/src/index.ts` still contains the stale comment `PolymarketAdapter is a stub — excluded until real CLOB API is wired` inside the aggregate-portfolio broker list, even though the live adapter is now wired and separately fetched. This is comment drift and should be removed.
- `backend/gateway/src/index.ts:1037-1051` computes `total_usd` / `total_equity` only from Alpaca and Gate.io broker balances. The live Polymarket `prediction_markets.polymarket.balance.pUSD` is not included in the top-line totals, so the aggregate portfolio underreports when Polymarket collateral is nonzero.

### Required decision
- Decide whether Polymarket pUSD should be folded into the top-level aggregate totals or intentionally remain a separate sidecar. If it should count toward portfolio value, the totals block needs to add `prediction_markets.polymarket.balance.pUSD`.

### Verification gate
- `node backend/cli/sovereign_cli.js trade aggregate_portfolio --json` returned a live JSON payload with `prediction_markets.polymarket.ok=true`, `balance.pUSD=0`, `openOrders=[]`, `positions=[]`.

## Update - 2026-06-03 Polymarket totals correction

### Fixed
- `backend/gateway/src/index.ts` now folds `prediction_markets.polymarket.balance.pUSD` into `total_usd` and `total_equity` through a shared aggregate helper instead of leaving Polymarket as a sidecar-only balance source.
- `backend/gateway/src/index.ts` no longer contains the stale `PolymarketAdapter is a stub` comment in the aggregate portfolio path.
- `backend/gateway/src/polymarket_portfolio.js` centralizes the aggregate portfolio math so the pUSD inclusion is testable in isolation.

### Verification
- `node --test tests/scripts/tests/polymarket_portfolio_aggregate.test.js` passed.
- `node backend/cli/sovereign_cli.js trade aggregate_portfolio --json` now returns a Polymarket broker entry alongside the live sidecar and keeps the JSON payload stable.

### Remaining
- The Polymarket filled-position reconstruction still uses a fixed `limit: 1000` trade window; older fills can be missed until real pagination is added.

## NEW - 2026-06-04 (deep blast)

### [DATA P0] Freshness gate is degraded again
- **Files / surfaces**: `backend/cli/sovereign_cli.js backend integrity --json`, `backend/cli/sovereign_cli.js quotes status --json`, `storage/data/cache/`, `storage/data/ts/`
- **Evidence**: backend integrity now reports `ok: false`, `84/84 cached`, `0 missing`, `9 stale`, `1 exception`; quote status reports `ok: false`, `records: 24`, `stale_records: 18`, `headway_mt5: stale`.
- **Impact**: the current data plane is not green, so fresh live/backtest output should not be treated as current without either refresh or policy scoping.
- **Verification gate**: `backend integrity --json` returns `ok: true` with zero blocking stale records under the active policy, and `quotes status --json` returns `ok: true` or a documented degraded reason.

### [COMPLETENESS P1] Gate.io position enrichment still has an unimplemented PnL path
- **File**: `backend/gateway/src/index.ts:349-353`
- **Evidence**: live positions are emitted with `averagePrice: 0` and `unrealizedPl: 0` plus the inline note `Requires trade history traversal; not implemented`.
- **Impact**: aggregated portfolio PnL is incomplete for Gate.io holdings, so dashboard and trade-surface reporting can understate or flatten realized/unrealized performance.
- **Verification gate**: Gate.io positions populate average cost from live or historical trade data and `unrealizedPl` is no longer hardcoded to zero.

### [COMPLETENESS P2] Polymarket fill reconstruction still has a hard cap
- **File**: `backend/gateway/src/index.ts:841`
- **Evidence**: `polymarketGet('/trades', { owner, limit: '1000' }, ...)` still uses a fixed trade window.
- **Impact**: older fills can be missed, which makes the reconstructed position list incomplete for long-lived accounts.
- **Verification gate**: the fill path paginates or otherwise proves coverage beyond the first 1000 trades.

### [LOW] TUI engine carries stale developer-review comments
- **File**: `backend/cli/tui/engine/engine.js:294,473`
- **Evidence**: comments marked `dev review TODO` remain in production code.
- **Impact**: this is not a runtime bug, but it is stale review noise inside the live TUI path.
- **Verification gate**: comments are removed or converted into a tracked issue reference.

### Open review posture
- No new security or route-parity regressions were confirmed in the audited surfaces.
- The previously recorded Polymarket stub/security findings in the ledger are now stale relative to the current code; they should be reclassified or retired in the next cleanup pass.

## NEW - 2026-06-04 (architecture/path hygiene blast-through)

### [LOW] Active docs are aligned, but legacy path debt is still carried by archival and fixture surfaces
- **Files / surfaces**: `docs/ARCHITECTURE.md`, `docs/archive/sovereign_cli.og.js`, `docs/engineering/architectural_debt.md`, `docs/memory/BLAST_THROUGH_REPORT.md`, `tests/fixtures/**`, `workspace/STRUCTURAL_AUDIT_REPORT.md`
- **Evidence**: the short architecture doc now points at `docs/engineering/codebase_org.md` as the ownership map, but the remaining docs and fixtures still embed historical `cpp_core`, `web_page`, `scripts/lib`, `scripts/cli`, and `data/cache` shapes.
- **Impact**: active runtime code is not blocked, but future feature work can still pick up stale path habits from fixtures, archival docs, or debt notes if those surfaces are treated as active truth.
- **Verification gate**: path-sensitive docs and fixtures either point at the canonical owner tree or are explicitly labeled archival/compatibility so they cannot be mistaken for runtime truth.

### [INFO] No new active-source path defect was confirmed in the main runtime surfaces
- **Files / surfaces**: `backend/`, `shared/lib`, `Frontend/dashboard/src`, `config/`, `storage/`, `workspace/`
- **Evidence**: `docs/ARCHITECTURE.md` is now a short domain overview that defers ownership to the canonical map, and the live runtime roots continue to follow the `backend/` / `Frontend/` / `shared/` / `storage/` layout.
- **Impact**: the remaining hygiene work is mostly cleanup and labeling, not a blocker in the active source tree.
- **Verification gate**: any new feature file is placed under the canonical owner tree and any compatibility path is called out as such.

## NEW - 2026-06-04 (focused blast-through after C++ engine closeout)

### [DATA P0] DCS remains below promotion threshold
- **Files / surfaces**: `backend/cli/sovereign_cli.js backend integrity --json`, `backend/cli/sovereign_cli.js quotes status --json`, `storage/data/cache/`, `storage/data/ts/`
- **Evidence**: `backend integrity --json` returned `ok:false`, `84/84` cached, `0` missing, `9` stale, and `1` explicit exception. `quotes status --json` returned `ok:false`, `records:24`, `stale_records:18`, with `headway_mt5` stale and `mt5`/`webull` not configured.
- **Impact**: no new live model/backtest output should be promoted as current until the stale rows and quote feed are refreshed or explicitly scoped as degraded.
- **Required reviewer decision**: choose whether to refresh providers now, quarantine stale quote surfaces, or label all live-derived cards as degraded until a reachable provider environment is available.
- **Verification gate**: `backend integrity --json` is green under the active policy and `quotes status --json` is either green or returns a precise provider-unavailable reason.

### [SECURITY MEDIUM] Aggregate portfolio GET route is not token-protected
- **Files / surfaces**: `backend/api/app.js:53`, `backend/api/server/routes/index.js:11`, `backend/api/server/services/cli_executor.js:691`
- **Evidence**: `PROTECTED_GET_ROUTES` includes `/api/cache/list`, `/api/config`, and `/api/bot/status`, but not `/api/backend/portfolio`; the route calls `backendPortfolio()`, which shells through `trade aggregate_portfolio --json` before mapping holdings.
- **Impact**: local dashboard use may be intentional, but this route exposes portfolio data on a GET path without the API-token branch.
- **Required reviewer decision**: either add `/api/backend/portfolio` to protected GET routes or explicitly downgrade/redact the unauthenticated payload.
- **Verification gate**: HTTP/API test proves unauthenticated `/api/backend/portfolio` is rejected or returns only a non-sensitive summary.

### [COMPLETENESS P1] Gate.io position cost basis is still unavailable
- **File**: `backend/gateway/src/index.ts:353`
- **Evidence**: Gate.io spot positions still emit `averagePrice: 0`, `unrealizedPl: 0`, and `cost_basis_unavailable: true`.
- **Impact**: portfolio PnL remains incomplete for Gate.io holdings even though the field is now honest.
- **Required reviewer decision**: implement trade-history traversal, or keep rendering cost basis as unavailable everywhere and exclude it from PnL totals.
- **Verification gate**: positions populate average cost from real trade history or the UI/API consistently labels the PnL as unavailable.

### [COMPLETENESS P2] Polymarket trade pagination is bounded, not exhaustive
- **File**: `backend/gateway/src/index.ts:851-859`
- **Evidence**: the earlier fixed `limit:1000` single request is now a cursor loop, but it stops at `PAGE_CAP = 10`.
- **Impact**: this is a real improvement, but very old or high-volume accounts can still be truncated without a warning.
- **Required reviewer decision**: make the cap configurable/reportable or continue paging until the API stops returning a cursor.
- **Verification gate**: a test or live probe proves the response reports `pages_fetched`, `truncated`, and `next_cursor` when the cap is reached.

### [SURFACE PARITY LOW] Bare strategy filename no longer resolves in backtest CLI
- **Files / surfaces**: `backend/cli/commands/research/research.js:1254-1274`, `config/trading/strategies.yaml:48`
- **Evidence**: `bt --strategy mean_reversion.yaml --days 30 --allow-degraded --json` failed with `missing_file`, while `strategy list --json` returned 14 valid registered strategies including `config/strategies/mean_reversion.yaml`.
- **Impact**: TUI registry selection is healthy because it passes full paths, but old CLI examples or agent-generated calls using bare filenames fail.
- **Required reviewer decision**: either support bare filenames by resolving against `config/strategies/`, or update docs/agents to always pass registry paths.
- **Verification gate**: contract test covers both `mean_reversion.yaml` and `config/strategies/mean_reversion.yaml`, or docs remove the bare-file form.

### [RUNTIME DEGRADED] Live C++ backtest probe blocked by provider network reachability
- **Files / surfaces**: `backend/cli/commands/research/research.js`, `shared/lib/backtest.js`, provider feed runtime
- **Evidence**: `bt --strategy config/strategies/mean_reversion.yaml --days 30 --allow-degraded --json` timed out after 120s while WebSocket connections returned `EACCES`.
- **Impact**: static dispatcher checks and contract tests pass, but this environment did not prove a full live C++ run in the current pass.
- **Required reviewer decision**: rerun from a provider-reachable environment or add a cached/replay live-path gate that avoids network fetch during audit.
- **Verification gate**: command returns JSON with `backtest_engine: sovereign_cpp_core`, non-null `annualized_return`, and a recorded data window without network timeout.

## Centralization Backlog Update - 2026-06-04 focused blast-through

| Pattern | Files | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| Strategy path resolution split between registry/TUI and CLI free-form args | `backend/cli/commands/research/research.js`, `backend/cli/commands/strategy/strategy.js`, `config/trading/strategies.yaml` | `shared/lib/strategy_registry.js` resolver for full path, bare filename, and registry id | S | `B -> A-` |
| Bounded provider pagination without truncation metadata | `backend/gateway/src/index.ts` Polymarket trades path | shared pagination helper returning `{items,pages,truncated,next_cursor}` | S | `C -> B` |

## RESOLVED - 2026-06-04 mass-implement from focused blast-through

### Fixed
- **Portfolio API protection**: `/api/backend/portfolio` is now included in `PROTECTED_GET_ROUTES` in `backend/api/app.js`, so unauthenticated GET returns `401` instead of aggregate portfolio data.
- **Bare strategy filenames**: `backend/cli/commands/research/research.js` now resolves bare filenames such as `mean_reversion.yaml` to `config/strategies/mean_reversion.yaml` when the file exists.
- **Polymarket pagination visibility**: `backend/gateway/src/index.ts` now records `trade_pagination` metadata with `pages_fetched`, `trades_fetched`, `page_cap`, `truncated`, and optional `next_cursor`; human output warns when truncation occurs. The page cap is configurable with `POLYMARKET_TRADE_PAGE_CAP`.

### Verification
- `node --check backend\api\app.js` -> pass.
- `node --check backend\cli\commands\research\research.js` -> pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node --test backend\api\tests\api.test.js` -> 1/1 pass; unauthenticated portfolio route returned `401`.
- `node --test tests\scripts\strategy_backtest_contract.test.js --test-name-pattern "bare registered strategy filenames"` -> pass, and the full file passed 16/16 in the later broad run.
- `node --test tests\scripts\tests\sovereign_cli.test.js tests\scripts\cli_ui_contract.test.js tests\scripts\tests\settings_contract.test.js tests\scripts\tests\polymarket_markets.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js` -> 49/49 pass.
- `node --test tests\scripts\strategy_backtest_contract.test.js tests\scripts\tests\sovereign_cli_human_surfaces.test.js` -> 25/25 pass.

### Remaining
- Data freshness is still degraded: `backend integrity --json` remains `ok:false`, `84/84` cached, `9` stale, `1` exception.
- Quote freshness is still degraded: `quotes status --json` remains `ok:false`, `24` records, `18` stale.
- Gate.io cost basis is still unavailable; this needs trade-history traversal or consistent PnL exclusion.

## RESOLVED - 2026-06-05 mass-implement from focused Polymarket blast-through

### Fixed
- **Polymarket error redaction**: gateway probe failures no longer leak `POLY_API_KEY`, `POLY_PASSPHRASE`, or `POLY_SIGNATURE` in JSON error output. A dedicated sanitizer now preserves endpoint context while redacting auth-bearing headers.

### Verification
- `node --check backend\gateway\src\polymarket_errors.js` -> pass.
- `node --test tests\scripts\tests\polymarket_errors.test.js tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\legacy_polymarket_env.test.js tests\scripts\tests\sovereign_cli.test.js` -> 55/55 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket collateral-probe --json` -> still fails with network `EACCES`, but the output now shows redacted header values instead of raw credentials.

### Remaining
- The highest-impact remaining blocker is endpoint reachability to `https://clob.polymarket.com/balance-allowance/update`, not env aliasing or launcher drift.

## NEW - 2026-06-06 focused blast-through after Polymarket buy-flow fixes

### [SECURITY MEDIUM / REVIEW DECISION] `derive-creds` still prints L2 API credentials by default
- **File**: `backend/gateway/src/index.ts:1872-1904`
- **Evidence**: the `polymarket derive-creds` command prints `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, and `POLYMARKET_API_PASSPHRASE` to stdout in the human path; the JSON path returns the same secret values.
- **Impact**: this is an intentional local setup command, not an accidental live-order leak. It is still risky if terminal logs, CI captures, screen sharing, or shell history wrappers record stdout.
- **Required reviewer decision**: keep explicit secret reveal as a local-only setup flow, or change default output to redacted values and require `--show-secrets` / `--write-env <path>` for raw credentials.
- **Verification gate**: default `derive-creds --json` must either redact secret fields or require an explicit reveal flag; tests should assert raw secret values are not printed by default.

### [COMPLETENESS P1] TUI live-buy preflight still depends on portfolio subprocess parsing for pUSD
- **File**: `backend/cli/commands/trade/trade.js`
- **Evidence**: the current buy flow now blocks submit when pUSD is unavailable, but the balance comes from a portfolio snapshot subprocess rather than a dedicated no-order account/collateral preflight.
- **Impact**: the new guard is safe, but it can block valid orders if portfolio parsing, gateway launch, timeout, or env alias resolution fails independently of CLOB buying.
- **Required reviewer decision**: add a dedicated no-order Polymarket preflight for buy preview, or accept the stricter portfolio-derived guard.
- **Verification gate**: buy preview displays resolved wallet mode, funder/deposit address, pUSD balance, orderbook depth, and min-order data from a read-only preflight before any live-submit confirmation.

### [DOC / ARTIFACT DRIFT P1] Paper trading resolves positions to `resolved_positions.jsonl`, not planned `pnl_log.jsonl`
- **Files**: `backend/gateway/src/polymarket_paper.js:23`, `backend/gateway/src/polymarket_paper.js:244`, `backend/gateway/src/polymarket_paper.js:289`, `workspace/POLYMARKET_BOT_PLAN.md:99-100`
- **Evidence**: initialization creates `pnl_log.jsonl`, but resolved paper positions are documented and written to `resolved_positions.jsonl`. The Phase 1.5 plan specifies `pnl_log.jsonl` as the resolved-position log.
- **Impact**: paper-run can appear to satisfy the plan while downstream live-deployment gates read an empty `pnl_log.jsonl`.
- **Required reviewer decision**: either rename the runtime output to `pnl_log.jsonl`, or update the plan and gate reader to use `resolved_positions.jsonl` as the canonical artifact.
- **Verification gate**: paper-run test proves a resolved position writes to the same artifact named in the plan and used by live-deployment gate checks.

## Centralization Backlog Update - 2026-06-06 focused Polymarket blast-through

| Pattern | Files | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| Polymarket account/balance readiness is inferred through multiple command paths | `backend/cli/commands/trade/trade.js`, `backend/gateway/src/index.ts`, `shared/lib/brokers/polymarket_env.js` | `backend/gateway/src/polymarket_preflight.js` returning `{wallet_mode,funder,balance,allowance,orderbook_depth,min_order}` for read-only previews | M | `B -> B+` |


## NEW - 2026-06-07 focused blast-through (resilient-crypto-fallback surface)

### [ORPHAN / DEAD EXPORT — Low] `fetchCoinGeckoHistory` has no callers and uses a naive id lookup
- **File**: `shared/lib/providers/coingecko.js:70-104`
- **Evidence**: `rg fetchCoinGeckoHistory` returns zero importers outside the definition. It resolves ids with raw `map[symbol.toLowerCase()]` — no `baseSymbol()` suffix strip, no `COINGECKO_ID_OVERRIDES` — unlike the robust `resolveCoinGeckoId()` used by the wired `fetchCoinGeckoBaseCandles()`.
- **Impact**: dead code today; latent regression risk if ever wired (would fail on `POLUSDT` and on collision symbols `pol`/`pepe`). Two divergent id-resolution paths in one module.
- **Required reviewer decision**: delete `fetchCoinGeckoHistory` + `getCoinGeckoIdMap` if both are orphaned, OR refactor it to call `resolveCoinGeckoId()` so the module has a single id path.
- **Verification gate**: `rg fetchCoinGeckoHistory` shows only test/definition refs after the decision; module exports exactly the functions with live callers.

### [STRUCTURAL DEBT — carried, no penalty] WS4 ingest shard is partial
- **File**: `backend/scripts/data_ops/ingest_market_data/index.js` (~1750 lines)
- **Evidence**: only `constants.js` was extracted; http/normalize/symbols/providers/persist still live in `index.js`. Tracked as task #6.
- **Required reviewer decision**: carve one module per commit, each gated by `npm test` + a live ingest smoke (provider code is not unit-covered).

### [GIT HYGIENE — process note] working tree carries large parent-repo drift
- **Evidence**: `git status` (root is the parent of `personal_finance_draft/`) shows 129 modified, ~8928 deleted, 183 untracked paths outside this session's committed scope.
- **Impact**: a naive `git add -A` would be catastrophic; commits MUST use explicit pathspecs (as 7a0dba5d did).
- **Verification gate**: project commits scope to `personal_finance_draft/...` pathspecs only; never `git add -A` at the repo root.

### CORRECTION 2026-06-07 — `fetchCoinGeckoHistory` orphan: DO NOT DELETE
- Reclassified from "delete or refactor" to **repurpose**. It returns `market_cap` + `volume_24h`, the exact shape needed for the ML section's cross-family market-cap reliability features (see `workspace/ML_SECTION_PLAN.md`, Phase 1). Refactor it to use `resolveCoinGeckoId` (single id path) and wire it into the crypto-aggregate ingestion instead of removing it.

### [TEST/DATA-PATH DRIFT — Medium] `kronos_integration_test` reads deprecated cache path
- **File**: `backend/core/test/kronos_integration_test.cpp:19-21`
- **Evidence**: loads `storage/data/cache/backtest_history.json` (and `../../../` variant) for BTCUSDT 1d; that monolithic file was migrated to family-partitioned `storage/data/cache/<family>/*.json` in Phase 8, so the test gets 0 points → throws "Not enough empirical data points (need at least 4)". Surfaced when building the ML test group with ONNX enabled (2026-06-07); pre-existing, NOT an ONNX regression.
- **Required reviewer decision**: point the test at the partitioned crypto cache (and ensure BTCUSDT 1d has >=4 bars), or convert it to a synthetic-fixture test.
- **Verification gate**: `kronos_integration_test.exe` exits 0 against current cache layout.

### RESOLVED 2026-06-07 — `baseSymbol()` stripped bare stablecoins to empty string
- **File**: `shared/lib/providers/coingecko.js` baseSymbol()
- **Bug**: `/(USDT|USDC|BUSD|USD)$/` strip turned bare "USDT"->"" so resolveCoinGeckoId failed for stablecoins (only pair symbols like BTCUSDT worked). Surfaced building the ML crypto-aggregate layer (Phase 1).
- **Fix**: return original symbol when stripping empties it. Verified: USDT->tether, USDC->usd-coin, DAI->dai, BTCUSDT->bitcoin; live USDT mcap 365 pts (186.9B).

### NEW 2026-06-07 — ML feature dump: full universe blocked by binary ts-index reader
- **Files**: `shared/lib/ml_dataset.js` (`loadAssetSourcesFromCache`), `backend/cli/commands/ml.js`
- **Evidence**: `ml dump` reads `storage/data/cache/<family>/backtest_history.json`, but the main crypto universe (BTCUSDT/ETHUSDT/SOLUSDT) and metals/energy anchors (XAUUSD/USOIL/NG) are NOT there — that file only holds 3 backfilled crypto symbols + equities/FX. The full 1d history lives in the binary `storage/data/ts/` index (48-byte Float64 records, the fast C++ read path). So `ml dump` currently covers equities + FX anchors + the 3 backfilled crypto only.
- **Required reviewer decision**: add a JS reader for the binary ts-index (mirror C++ loadMarketDataSnapshot), OR repopulate `backtest_history.json` for the full universe, OR have `ml dump` shell to the C++ backend to export bars.
- **Verification gate**: `ml dump --symbols BTCUSDT,ETHUSDT --json` returns rows>0 for the core crypto universe.

### NEW 2026-06-07 — crypto-aggregate anchors need a rate-limit-aware refresh job
- **Files**: `shared/lib/crypto_aggregates.js`, `backend/cli/commands/ml.js` (loadCryptoAggregateAnchors)
- **Evidence**: `ml dump` reads `storage/data/cache/crypto_aggregates.json` for CRYPTO_TOTAL_MCAP/BTC_DOMINANCE/STABLECOIN_MCAP, but no refresh job writes it yet; CoinGecko free tier rate-limits the full ~17-coin burst (saw "fetch failed").
- **Required reviewer decision**: add `ml aggregates refresh` (throttle + retry/backoff, persist to crypto_aggregates.json with TTL).
- **Verification gate**: refresh writes crypto_aggregates.json; `ml dump` reports the 3 crypto-aggregate anchors.

### NEW 2026-06-07 blast-through — ML surface parity + minor centralization
- **[SURFACE PARITY — Low] `ml` CLI handler not in TUI manifest**: `backend/cli/sovereign_cli.js` registers `ml` but `backend/cli/tui/manifest.js` has no entry. Intentional (CLI-first dev/data command); add a TUI entry when the ML section gets its UI (plan Phase 4). Gate: manifest has an `ml` entry OR it is documented as CLI-only.
- **[PENDING WIRING — not dead code] `buildCryptoAggregateSeries` has no production caller**: only `crypto_aggregates.test.js` imports it. Awaiting the rate-limit-aware refresh job (already logged). Gate: `ml aggregates refresh` calls it and writes crypto_aggregates.json.

## Centralization Backlog (append) - 2026-06-07
| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| UTC-day bucket `String(ts).slice(0,10)` | 7 (ml.js, ml_dataset.js, feature_builder.js, coingecko.js, backtest.js, indicators/price_action.js, providers/weather.js) | `shared/lib/time.js` `utcDay(ts)` | S | A-→A on dup lens (optional; one-liner) |
