# Native C++20 Core & Backtesting Engine Architecture

## 1. Subsystem Purpose & Architecture

The Native Core (`backend/core/`) is a high-performance C++20 library and standalone CLI tool (`sovereign_wealth`) engineered for zero-allocation market data analytics, sub-millisecond indicator generation, deterministic backtesting, Monte Carlo risk simulation, and streaming binary time-series manipulation.

```text
+---------------------------------------------------------------------------------------------------+
|                                  NATIVE C++20 CORE ARCHITECTURE                                   |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ sovereign_wealth CLI Bridge ] (JSON over stdout subprocess dispatch)                           |
|  Commands: `backtest`, `ts-merge`, `stats`, `correlation`, `indicators`, `risk check`, `sweep`    |
|         │                                                                                         |
|         ▼                                                                                         |
|  [ sovereign_core STATIC Library ]                                                                |
|  ┌───────────────────────────────┬───────────────────────────────┬─────────────────────────────┐  |
|  │ Data Subsystem (`src/data/`)  │ Backtest Engine (`src/backtest/`) Risk Engine (`src/risk/`)  │  |
|  │ - BinaryTsMerger (O(1) Merge) │ - FrameBacktester (Dual-mode) │ - PreTradeRisk (25% cap)    │  |
|  │ - BinaryTsReader (SOVT format)│ - Backtester (Zero-alloc Span)│ - DrawdownGuard             │  |
|  │ - DataValidator & Sanitizer   │ - Monte Carlo (xorshift64)    │ - CostModel (Fees/Slippage) │  |
|  │ - DataSnapshot Summarizer     │ - Walk-Forward Rolling Folds  │                             │  |
|  ├───────────────────────────────┼───────────────────────────────┼─────────────────────────────┤  |
|  │ Indicators (`src/indicators/`)│ ML & Features (`src/ml/`)     │ Portfolio & Execution       │  |
|  │ - RSI, MACD, ATR, Bollinger   │ - OnnxModel (Pimpl / Stub)    │ - Kelly Sizing & Exposure   │  |
|  │ - Stochastic, EMA, SMA        │ - Kronos / CNN Tensor Builder │ - PnL & Multi-Asset Math    │  |
|  │ - LookaheadGuard (Causality)  │ - Scalar KalmanFilter         │ - TWAP / VWAP Simulation    │  |
|  └───────────────────────────────┴───────────────────────────────┴─────────────────────────────┘  |
|         │                                                                                         |
|         ▼                                                                                         |
|  [ CTest Suite ] (34 independent C++20 contract & unit test binaries)                             |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Streaming Binary Merger (`BinaryTsMerger`)

The `BinaryTsMerger` provides streaming, constant-memory on-disk merges of two binary time-series files (`SOVT` format).

### Algorithm & Invariants
- **Dual Stream Buffering**: Allocates two 48 KB `BinaryStreamReader` buffers (1024 records each) and one `BinaryStreamWriter` buffer.
- **Two-Pointer Linear Merge**:
  1. Compares timestamps $T_{\text{existing}}$ and $T_{\text{incoming}}$ at stream heads.
  2. The smaller timestamp is emitted to the output buffer.
  3. On timestamp equality ($T_{\text{existing}} == T_{\text{incoming}}$), deduplicates records. If `existing_wins_on_tie` is true, the existing bar is kept; otherwise the incoming bar overwrites.
- **Constant Memory Guarantee**:
  $$\text{Memory Overhead} = O(1) \quad (\text{Peak RSS } < 5\text{MB})$$
  Processes multi-gigabyte files without memory scaling or V8 garbage collection overhead.

---

## 3. Backtesting Engines & Execution Modes

The platform supports two complementary backtest execution modes through `FrameBacktester`:

### Mode A: Native C++ Engine (`runNative`)
- Consumes raw `std::span<const OhlcvBar>` bar data.
- Evaluates native trend, momentum, and mean-reversion rules directly in compiled C++ code.
- Generates simulated trade entries, exits, profit-and-loss curves, and drawdown metrics with microsecond latency.

### Mode B: Annotated Feature Frame Bridge (`runFromAnnotated`)
- Consumes pre-computed feature rows and ML model predictions passed from the JavaScript/TypeScript layer via a temporary JSON frame file.
- Executes position simulation, slippage modeling, stop-loss/take-profit triggers, and holding horizon exits.
- Returns comprehensive metrics including Sharpe ratio, Sortino ratio, Calmar ratio, max drawdown, win rate, expectancy, and profit factor.

### Monte Carlo & Walk-Forward Validation
- **Monte Carlo Simulation**: Runs bootstrap resampling (typically 1,000 runs) over empirical trade return sequences using an ultra-fast `xorshift64` pseudo-random number generator (PRNG seed=42). Computes drawdown confidence intervals (95th, 99th percentiles).
- **Walk-Forward Analysis**: Evaluates rolling in-sample / out-of-sample folds to detect over-fitting and parameter degradation across regime shifts.

---

## 4. Pre-Trade Risk Engine & Safety Gates

The risk subsystem ensures capital preservation before orders reach the broker execution gateway:

1. **`PreTradeRisk` Gate**:
   - **Drawdown Limit**: Halts trading if current drawdown exceeds the configured maximum threshold (default 20%).
   - **Finiteness & Positivity**: Validates that order notionals, portfolio equity, and prices are strictly finite, positive, non-zero values.
   - **Single-Position Concentration Cap**: Enforces a strict 25% single-asset portfolio concentration limit.
2. **`DrawdownGuard`**:
   - Performs stateless verification of equity curves against `RiskLimits` parameters.
3. **Fail-Closed Execution Policy**:
   - When `fail_closed: true` is enabled, any calculation error, missing data frame, or ambiguous risk state immediately halts order generation.

---

## 5. Verification & CTest Matrix

The native engine is verified by 34 CTest binaries compiled under strict flags (`-Wall -Wextra -Werror -Wpedantic`):

| Test Binary | Target Tested | Assertion Scope |
|---|---|---|
| `binary_ts_merger_test` | `BinaryTsMerger` | Fast-path stream, 2-pointer merge, deduplication, tie-break policy |
| `binary_ts_reader_test` | `BinaryTsReader` | SOVT magic header, record parsing, SHA-256 integrity, symlink rejection |
| `backtest_test` | `Backtester` | Trade execution, cost model, PnL calculations, drawdown tracking |
| `frame_backtester_test` | `FrameBacktester` | Mode A/B execution, Monte Carlo bootstrap, walk-forward folds |
| `risk_test` | `PreTradeRisk` | Max drawdown breach, concentration cap, non-finite input rejection |
| `indicator_engine_test` | `IndicatorEngine` | RSI, MACD, ATR, Bollinger bands mathematical accuracy |
