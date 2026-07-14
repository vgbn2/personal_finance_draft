# Module 03 — Strategy, Backtesting & ML

Supplements `docs/guide/chapter_17` and `chapter_18` (generic "why backtest gates exist" reading) and
corrects `docs/engineering/kronos_pipeline.md`, which is labeled a "roadmap" but is partially stale in
the other direction — Kronos already has a real (if data-starved) test in the C++ suite (module 01).

## What a strategy actually is

A YAML file under `config/strategies/`, registered in `config/trading/strategies.yaml`. Read/write
functions all live in `backend/cli/commands/strategy/strategy.js`:
`readStrategyRegistry()` (:170), `writeStrategyRegistry()` (:404), `parseStrategyYaml()` (:220) — the
parsed schema has `universe`, `signals`, `data`, `features`, `indicators`, and a `risk` block
(`signal_threshold`, `max_holding_days`, `risk_weight`, `fail_closed`) at :233-253.

## One backtest, traced

```
commandBacktest(args)                                  backend/cli/commands/research/research.js:400
  -> inspectStrategyFile()                              strategy.js:261
  -> loadUsableSources() / loadHistoricalSources()       research_sources.js
  -> calculateRollingFeatureFrame()                      shared/lib/market/indicators.js:13
  -> splitFeatureFrame()                                 research.js:20  (train/test split)
  -> runBacktest(split, options)                          research.js:549-557
       -> runBacktestCppNative() OR runBacktestJs()       backend/cli/commands/strategy/backtest.js:1050-1068
            JS path: resolveModel(name).predict(feature)   shared/lib/ml/models.js:365, :84-88
  -> buildTrustAssessment() + upsertStrategyGradeRecord()  research_render.js, shared/lib/strategy/registry.js:18
```

The engine choice (C++ vs JS) is automatic — native when the binary's available, JS fallback otherwise.
Either way you get the same trade-list + equity-curve + metrics shape back.

## The ONNX inference path specifically

JS-side prediction (`shared/lib/ml/models.js:84-88`) is a deterministic adapter, not real ONNX — it's
the fast/portable fallback. Real ONNX inference only happens in the C++ binary: `main.cpp:911` loads
`models/{name}.onnx`, `main.cpp:913` calls `predictBatch()`. If you need to know which one actually ran,
module 01's Lab 4 is the way to check.

## Backtest → live automation, stage by stage

`strategy.js:735` `runAutomationPass()`:

1. **Exit check first** (:745-749) — `runAlpacaExitCheck()` closes target/stop/age-triggered positions
   *before* looking for new entries (module 04 covers this function in depth).
2. **Position-capacity load** (:754-757) — reads `openPositionCount` vs `maxOpenPositions`.
3. **Strategy selection** (:759-770), **data refresh** (:774-795, batched by timeframe).
4. **Per-strategy signal generation** (:813-831) — runs a real backtest, takes the latest trade as the
   candidate signal.
5. **Signal freshness gate** (:846-864) — rejects a signal older than 1.5× its own bar duration. This is
   the guard against a cron running late and acting on a stale bar.
6. **Trust gate** (:866-872, thresholds at :328-349) — requires `verdict === 'researchable'`,
   `score >= minTrustScore` (default 70), and **positive out-of-sample alpha vs buy-and-hold**. Dry-run
   bypasses this; live does not.
7. **Position sizing** (:875-886) — equity × risk_weight, capped by a fixed `position_size` setting if
   configured.
8. **Live execution** (:895-912) — only here does a real order get sent, via `commandTrade()` (module 04).

## A constraint worth knowing before you trust a backtest result

**Equity session-gap guard** (`backtest.js:778-785`): an intraday trade whose entry and exit land on
different calendar dates is rejected outright for equities — it's treating overnight/weekend gaps as
untradeable artifacts rather than real PnL. If a strategy looks worse than you expected on equities
specifically, check whether this guard is silently dropping its best trades.

## Labs

**Lab 1 — read a real strategy file.** Pick any file under `config/strategies/` and map its sections to
the schema list above. What's its `risk.signal_threshold` and `max_holding_days`?

**Lab 2 — run one backtest and follow the trust gate by hand.**
```bash
node backend/cli/sovereign_cli.js bt --strategy <name-from-lab-1> --timeframe 1d --allow-degraded --json
```
From the JSON output, compute by hand whether this strategy would pass the trust gate (`verdict`,
`score`, `oos_alpha_vs_buy_hold` — find the exact field name in the real output, it may differ slightly
from the prose name above) at the default `minTrustScore=70`.

**Lab 3 — find the engine that actually ran.** Re-run the same backtest and check whether the C++ native
path or the JS fallback served it (`backend/cli/commands/strategy/backtest.js:1050-1068` tells you what
to check for in the output or logs).

**Lab 4 — trace one automation pass without going live.**
```bash
node backend/cli/sovereign_cli.js auto-trade --passes 1
```
(dry-run — no `--live`). This is gated behind the `ai_agent_trading` feature flag
(`trade.js:425`/`strategy.js:925`) — if it's off, you'll get a feature-gate rejection instead of a real
pass; that's expected and itself confirms the gate works (check with `settings show` from module 00's
Lab 0, toggle with `settings flags --flag ai_agent_trading --value true` if you want to actually run it).
If it runs, match each console line of output to one of the 8 numbered stages above. Which stage, if
any, rejected a signal, and why?
