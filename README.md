# Sovereign Trading Platform

An active algorithmic trading platform with live order execution across equities (Alpaca), prediction markets (Polymarket), and FX/CFD (MT5), a binary time-series data pipeline, ML inference (ONNX), and an Ink-based TUI dashboard.

## Quick Start

```bash
npm install
npm install --prefix backend/api
npm install --prefix backend/gateway
npm install --prefix backend/mcp_server
npm install --prefix Frontend/dashboard
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

Run the local Linux suite:

```bash
./start_local.sh
```

C++ core (optional — data integrity, correlation, portfolio risk):

```bash
npm run native:build
node backend/cli/sovereign_cli.js backend status --json
ctest --test-dir backend/core/build
```

## Dependencies

This repo has multiple Node package roots. After a fresh clone or Windows-to-Ubuntu migration, install
each one explicitly:

```bash
npm install
npm install --prefix backend/api
npm install --prefix backend/gateway
npm install --prefix backend/mcp_server
npm install --prefix Frontend/dashboard
```

The root install powers the CLI, TUI, shared libraries, tests, and most gateway launches. The nested
installs remove `UNMET DEPENDENCY` errors when checking or running each service directly.

Current workspace check: all package roots resolve cleanly with `npm ls --depth=0`, so no extra
libraries are required beyond the installs listed above unless you add or remove dependencies.

Ubuntu system packages for the optional native/C++ path:

```bash
sudo apt update
sudo apt install -y build-essential cmake
```

Useful dependency checks:

```bash
npm ls --depth=0
npm ls --prefix backend/api --depth=0
npm ls --prefix backend/gateway --depth=0
npm ls --prefix backend/mcp_server --depth=0
npm ls --prefix Frontend/dashboard --depth=0
```

If `onnxruntime-node` reports blocked install scripts after `npm install`, review it with:

```bash
npm approve-scripts
```

## What Works Now

**Data pipeline**
- Binary ts-index format (`storage/data/ts/`) — 1m grain for crypto (Binance) and US equities (Alpaca), 5m/daily for Yahoo families
- Binance WebSocket live feed in `backfill-daemon` — strictly newer closed 1m klines append without rewriting deep history
- `sovereign backfill-daemon [--once] [--families crypto|equities|...]`

**Research**
- `sovereign bias <SYMBOL>` — 7-TF table (1m→1w) with RSI, VWAP, Volume Profile, Wyckoff phase, HMM regime, permutation entropy, ML signal
- `sovereign scorecard [--family crypto] [--top 20]` — research ranking across assets whose requested timeframes are complete and fresh; rows expose source time and validity metadata
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
backend/api/         Native Node HTTP API + Socket.IO bridge (port 8787)
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
