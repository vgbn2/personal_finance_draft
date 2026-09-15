# Codebase Tour — Start Here

**What this is:** a hands-on companion to the real, current code in this repo. Every claim below is
grounded in a real `file:line` you can open right now. Every module ends with labs — read this, trace
that, run this command, interpret the output — instead of just prose to skim.

**What this is not:** a replacement for `docs/engineering/architecture/01_ARCHITECTURE_AND_CODEBASE.md` (the canonical system architecture & folder map) or `docs/guide/` (the 24-chapter "build it from scratch" book — useful
for *why* a pattern like a gateway exists, written with placeholder filenames, not *what this repo's
real files do*). This tour exists for the gap between those two: real current code, traced and exercised.

If you only have ten minutes, read `docs/explanation/architecture/01_system_topology_and_invariants.md` first, then come back here for
whichever module matches what you're touching today.

## Onboarding Purpose & Architecture Tour

This tutorial series guides contributors through the core subsystems of the Sovereign Trading Platform with hands-on labs:

1. **Native Engine (`backend/core/`)**: C++20 indicators, backtesting, and microsecond risk checks.
2. **Data Pipeline (`shared/lib/market/`)**: Binary time-series ingestion and rolling indicator calculation.
3. **Strategy Engine (`config/strategies/`)**: Declarative alpha models, backtests, and signal generation.
4. **Execution Gateway (`backend/gateway/`)**: Broker order routing, risk gating, and double-entry paper ledger.
5. **User Interfaces (`backend/cli/`, `Frontend/dashboard/`)**: Terminal UI (Ink 5) and React 19 web dashboard.

## Module map

| # | Module | Covers | Don't re-read elsewhere for |
|---|---|---|---|
| 01 | [01_cpp_core_engine.md](01_cpp_core_engine.md) | `backend/core/` — the C++ trade/risk/ML engine | building & running ctest, tracing one real backtest/risk call |
| 02 | [02_data_ingestion_pipeline.md](02_data_ingestion_pipeline.md) | `shared/lib/market/`, the backfill daemon, `storage/data/ts/` | the real binary ts-index format, base-grain mapping, staleness logic |
| 03 | [03_strategy_backtest_ml.md](03_strategy_backtest_ml.md) | Strategy registry, backtests, ONNX inference, live automation | what a "strategy" is on disk, the live-automation stage list |
| 04 | [04_trading_gateway_live_orders.md](04_trading_gateway_live_orders.md) | **Real money path** — Alpaca/Polymarket/MT5, risk engine, PIN gate | read this before touching anything in `backend/gateway/` or `trade.js` |
| 05 | [05_tui_cli_dashboard.md](05_tui_cli_dashboard.md) | The CLI/TUI dispatch model, the two competing menu definitions | why editing `manifest.js` sometimes does nothing |
| 06 | [06_web_dashboard_api.md](06_web_dashboard_api.md) | `backend/api/`, `Frontend/dashboard/` | route auth model, where the frontend actually talks to the backend |
| 07 | [07_testing_methodology.md](07_testing_methodology.md) | How tests actually run today | why `npx jest` lies to you about failures |

## How to use a module

Each one has the same shape: a short grounded explainer, then a **Labs** section with concrete steps.
The labs are designed to take 10-20 minutes each and to leave you able to answer a specific question
about the real system, not a generic one. Do them in an actual terminal in this repo — reading the
answer without running anything defeats the point.

## Auth & settings (the two small subsystems that didn't earn a full module)

- **Auth**: `backend/cli/lib/auth.js` — session persists to `~/.sovereign/session.json` (mode `0o600`).
  `loginWithCredentials()` calls Supabase's `signInWithPassword`; `refreshSession()` auto-refreshes when
  `expires_at - 60s` has passed. Trade PIN hashing is HMAC-SHA256 with a timing-safe compare
  (`verifyPin`). Real gate call sites: `trade.js` (live trading), `trade_polymarket.js` (live Polymarket
  trading) — both call `requireAuth(...)` before any order path runs.
- **Settings/feature flags**: `shared/lib/settings/user_settings.js` persists `timezone`,
  `favorite_symbols`, a `trading` block (`position_size`/`stop_loss`/`take_profit`/`max_positions`/etc.),
  and a `feature_flags` block (`bot_autopilot`, `polymarket`, `onchain_data`, `multi_agent_research`,
  `auto_rebalance`, `ai_agent_trading`, `auto_backfill`). `shared/lib/settings/runtime.js`'s
  `featureGate(name)` is the one real gate function — it returns `{ok, enabled, reason, hint}` and is
  called at the top of every gated command (e.g. `trade.js`'s `featureGate('ai_agent_trading', ...)`
  before the automation loop).

### Lab 0 — confirm your own settings state

```bash
node backend/cli/sovereign_cli.js settings show
```

Read the output against the `feature_flags` list above. Which flags are on? If `ai_agent_trading` is on,
that's the live automated-trading loop — know that before module 04.
