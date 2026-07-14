# Codebase Tour — Start Here

**What this is:** a hands-on companion to the real, current code in this repo. Every claim below is
grounded in a real `file:line` you can open right now. Every module ends with labs — read this, trace
that, run this command, interpret the output — instead of just prose to skim.

**What this is not:** a replacement for `docs/engineering/codebase_org.md` (the canonical folder map,
verified current as of 2026-06-25) or `docs/guide/` (the 24-chapter "build it from scratch" book — useful
for *why* a pattern like a gateway exists, written with placeholder filenames, not *what this repo's
real files do*). This tour exists for the gap between those two: real current code, traced and exercised.

If you only have ten minutes, read `docs/engineering/codebase_org.md` first, then come back here for
whichever module matches what you're touching today.

## Why this exists

2026-06-25 (session 59): direct request after noticing that ~50+ sessions of AI-assisted work had left
a lot of real understanding undocumented, *and* that the documentation that did exist (`docs/`, 30+
files) had quietly fallen out of session memory because nothing in the normal boot sequence reads it.
`workspace/BOOTSTRAP.md` fixes the recurrence; this tour fixes the actual content gap. Full triage
findings (what's current, what's stale, what's broken) are in `workspace/BOOTSTRAP.md` and
`workspace/STATE.md`'s 2026-06-25 entries — the short version: the folder map is trustworthy, the
"architecture overview" and "capability manifest" docs are stale enough to actively mislead on whether
live trading exists (it does, extensively), and 17 links in the documentation hub itself were broken.

## Module map

| # | Module | Covers | Don't re-read elsewhere for |
|---|---|---|---|
| 01 | `01_cpp_core_engine.md` | `backend/core/` — the C++ trade/risk/ML engine | building & running ctest, tracing one real backtest/risk call |
| 02 | `02_data_ingestion_pipeline.md` | `shared/lib/market/`, the backfill daemon, `storage/data/ts/` | the real binary ts-index format, base-grain mapping, staleness logic |
| 03 | `03_strategy_backtest_ml.md` | Strategy registry, backtests, ONNX inference, live automation | what a "strategy" is on disk, the live-automation stage list |
| 04 | `04_trading_gateway_live_orders.md` | **Real money path** — Alpaca/Polymarket/MT5, risk engine, PIN gate | read this before touching anything in `backend/gateway/` or `trade.js` |
| 05 | `05_tui_cli_dashboard.md` | The CLI/TUI dispatch model, the two competing menu definitions | why editing `manifest.js` sometimes does nothing |
| 06 | `06_web_dashboard_api.md` | `backend/api/`, `Frontend/dashboard/` | route auth model, where the frontend actually talks to the backend |
| 07 | `07_testing_methodology.md` | How tests actually run today | why `npx jest` lies to you about failures |

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
