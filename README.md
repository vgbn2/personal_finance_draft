# Sovereign Trading Platform

An active algorithmic trading platform with live order execution across equities (Alpaca), prediction markets (Polymarket), and FX/CFD (MT5), a binary time-series data pipeline, ML inference (ONNX), and an Ink-based TUI dashboard.

## Quick Start

```bash
npm install
node backend/cli/sovereign_cli.js status --json
node backend/cli/sovereign_cli.js bias BTCUSDT
node backend/cli/sovereign_cli.js scorecard --family crypto --top 20
```

TUI dashboard:

```bash
node backend/cli/sovereign_cli.js
```

Web API (port 8787):

```bash
node backend/api/app.js
```

C++ core (optional — data integrity, correlation, portfolio risk):

```bash
cmake -S . -B backend/core/build && cmake --build backend/core/build
ctest --test-dir backend/core/build
```

## What Works Now

**Data pipeline**
- Binary ts-index format (`storage/data/ts/`) — 1m grain for crypto (Binance) and US equities (Alpaca), 5m/daily for Yahoo families
- Binance WebSocket live feed in `backfill-daemon` — closed 1m klines written to ts-index in real time
- `sovereign backfill-daemon [--once] [--families crypto|equities|...]`

**Research**
- `sovereign bias <SYMBOL>` — 7-TF table (1m→1w) with RSI, VWAP, Volume Profile, Wyckoff phase, HMM regime, permutation entropy, ML signal
- `sovereign scorecard [--family crypto] [--top 20]` — EdgeFinder-style ranked table across all configured assets (~1.5s for 36 crypto)
- `sovereign bt --strategy <name>` — backtests against ts-index data; ONNX models (`xgboost_v1`, `logistic_v1`, `regime_classifier`) run inference via `onnxruntime-node`

**Live execution**
- Alpaca equities: market/limit orders, position tracking, auto-exit loop (stop/target/age), `auto-trade` unattended mode
- Polymarket prediction markets: CLOB v2 orders via `@polymarket/clob-client-v2`, live cycle (`cycle.ts`)
- MT5: FX/CFD via gateway bridge
- All paths gated behind `SOVEREIGN_TRADE_PIN` + `ai_agent_trading` feature flag; risk engine fails closed

**TUI**
- Ink dashboard (`sovereign_cli.js` with no args) — chat bar, flag grid, in-pane command output
- `Settings > Layout > legacy` to switch to the older prompt-based engine and back
- Both engines have `bias` and `scorecard` in the Research section

**ML**
- ONNX inference runner (`shared/lib/ml/onnx_runner.js`) — lazy singletons, feature imputation from `storage/models/feature_config.yaml`
- 2-state Gaussian HMM (`shared/lib/ml/hmm.js`) — Baum-Welch EM + Viterbi, log-space stable
- Permutation entropy (order-3, normalized) on price series

## Architecture

```
backend/cli/         Node CLI — commands, TUI, dispatch
backend/api/         Express REST API (port 8787)
backend/gateway/     TypeScript execution gateway — all broker adapters
backend/core/        C++ data integrity, correlation, portfolio risk (CMake/ctest)
shared/lib/          Shared JS modules (market data, ML, runtime, settings)
storage/             Runtime data (ts-index, models, db) — gitignored except config
Frontend/dashboard/  React/Vite web dashboard
infra/               Docker compose, deployment configs
```

Source of truth for current work: [`workspace/STATE.md`](workspace/STATE.md)  
Session continuity: [`workspace/HANDOFF.md`](workspace/HANDOFF.md)  
Code review history: [`workspace/DEV_REVIEW.md`](workspace/DEV_REVIEW.md)  
Codebase tour: [`docs/codebase_tour/00_START_HERE.md`](docs/codebase_tour/00_START_HERE.md)

## Tests

```bash
npm test                  # node --test runner (NOT jest — jest mis-parses these files)
npm run hygiene           # lint + dead-import scan
```

Baseline: **652 pass / 0 fail / 2 skip** on `feat/ink-tui-refactor`.
