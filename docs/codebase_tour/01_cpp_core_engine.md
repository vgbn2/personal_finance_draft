# Module 01 — The C++ Core Engine

`backend/core/` is the high-performance native layer: backtesting, technical indicators, pre-trade risk
checks, portfolio math, and ONNX model inference. It's a separate binary the JS side spawns and talks to
over stdin/stdout JSON, not a library Node links against directly.

## The shape

```
backend/core/
  CMakeLists.txt        <- declares the sovereign_core static lib, the sovereign_wealth exe, 30 test exes
  src/
    core/                OHLCV types
    data/                snapshots, validation, quality reports
    execution/           order routing, paper/live broker interfaces, kill-switch
    indicators/          RSI/MACD/Kalman/volatility
    backtest/            the backtester engine itself
    risk/                pre-trade risk validation, drawdown guards
    portfolio/           PnL, Kelly sizing, exposure
    ingestion/           per-asset-class adapters
    ml/                  ONNX inference, tensor builders, model registry
    features/            feature engineering, lookahead guards
    strategies/, regime/, stats/, correlation/, parser/, utils/, research/, replay/, assets/
  test/                  30 test executables + fixtures
  build/                 CMake output (gitignored)
```

## How JS reaches it

`shared/lib/runtime/paths.js`'s `findBackendBinary()` locates the compiled `sovereign_wealth` binary.
`shared/lib/runtime/backend_bridge.js:130-136`'s `runBackendCommand(args, options)` spawns it with
`spawnSync` and parses JSON off stdout (the same "smart JSON extraction" trick — first `{` to last `}` —
that strips leading/trailing log lines, `backend_bridge.js:46-57`).

The binary's CLI contract (`main.cpp:1015-1097`) dispatches on `args[0]`: `status`, `stats`, `data
summary`, `correlation`, `universe`, `portfolio`, `indicators`, `risk check`, `backtest`, `ml
predict|compare`, `kill-switch engage|disengage|status`.

## Five files worth knowing by name

| File | What it does |
|---|---|
| `src/backtest/backtester.cpp:78` `Backtester::run()` | Loads bars, computes indicators, generates entry/exit signals, tracks equity curve |
| `src/risk/pre_trade_risk.cpp:7` `PreTradeRisk::validate()` | Drawdown + concentration checks; returns `{approved, halt_trading, reason}` |
| `src/indicators/indicator_engine.cpp:54-91` | Rate-of-change, rolling volatility, Kalman filter series |
| `src/ml/onnx_model.cpp:31,68` `OnnxModel` ctor + `predictBatch()` | Loads a `.onnx` file, runs inference; falls back to a deterministic baseline if ONNX Runtime wasn't compiled in |
| `src/data/data_validator.cpp:19,32` | Rejects bad OHLC bars and macro observations with `release_timestamp` before `ingested_at` (lookahead-leak guard) |

## Three things that will surprise you if you assume otherwise

1. **The kill-switch only blocks new orders, not cancels.** `execution/kill_switch.hpp:34-37`'s comment
   is explicit: "kill switch is meant to stop new risk, not trap existing risk" — `cancel()` always
   works even when engaged.
2. **ONNX is opt-in at compile time.** The `SOVEREIGN_ENABLE_ONNX_RUNTIME` CMake flag controls whether
   you get real inference or a deterministic baseline (`CMakeLists.txt:9,25-68`). If predictions look
   suspiciously consistent, check which mode you built.
3. **JSON parsing in the C++ layer is hand-rolled**, not a library (`data_snapshot.cpp:54-80` — string
   search for `"key":`, manual quote-boundary detection). It's deliberate (no external JSON dependency
   for the core binary) but means malformed input fails differently than you'd expect from a real parser.

## Labs

**Lab 1 — build and run the real test suite.**
```bash
cmake -S backend/core -B backend/core/build
cmake --build backend/core/build --config Debug
ctest --test-dir backend/core/build -C Debug --output-on-failure
```
Expect ~29/30 passing — `kronos_integration_test` fails on a data-availability message ("need ≥4 points"),
not a real regression (standing, documented gap). If anything else fails, that's new and worth flagging.

**Lab 2 — trace one real call end to end.** Run a status check from the JS side:
```bash
node backend/cli/sovereign_cli.js backend status --json
```
Then open `shared/lib/runtime/backend_bridge.js` and find `runBackendCommand` — confirm for yourself
which binary path got invoked and what args were passed. Open `main.cpp` around line 1015 and find the
`status` branch. You now know the full round trip for one command.

**Lab 3 — find the risk gate yourself.** Without using ctrl-F for "drawdown", open
`src/risk/pre_trade_risk.cpp` and answer: what two conditions cause `halt_trading` to be set, and what
does the caller (`backend/gateway/src/index.ts`, module 04) do when it sees `halt_trading: true`? You'll
need module 04 for the second half — that's intentional, the boundary is real.

**Lab 4 — the ONNX fallback.** Find where `OnnxModel::backend()` (`onnx_model.cpp:60`) is called from
`main.cpp` (around line 913) and confirm: does the JSON output of an `ml predict` call tell you which
backend (`onnx_runtime` vs `deterministic_baseline`) actually served the prediction? If you can't find
that field, that's a real, reportable gap — not a trick question.
