# 04. Quantitative Alpha, Machine Learning & AI Agent Workbench

This document specifies the architecture of the autonomous quantitative alpha discovery engine, 6D normalized parameter space exploration, novelty distance filtering, rolling feature matrix synthesis, and Model Context Protocol (MCP) AI agent workbenches.

---

## 1. Autonomous AI Strategy Explorer Architecture

Sovereign includes an autonomous discovery daemon (`scripts/strategies/auto_strategy_explorer.js`) that runs continuously (e.g. 30-minute interval on HPDesk) or on-demand via CLI and MCP tooling to research novel market anomalies, backtest them using the zero-allocation native C++20 engine, and automatically persist valid YAML strategy registries into `config/strategies/automated/`.

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                    AUTONOMOUS ALPHA DISCOVERY & VALIDATION PIPELINE                                |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  [ INTEGRATION SURFACES ]                                                                                          |
|  ├── MCP Tool: `explore_strategy` (Claude Desktop, Cursor, AI Agents, LLM runners)                [Load: 2/10]     |
|  ├── CLI Subcommand: `sovereign strategy explore [--once] [--interval <mins>]`                    [Load: 2/10]     |
|  └── Docker Soak Service: `sv-strategy-explorer` container on HPDesk Proxmox VM                   [Load: 4/10]     |
|             │                                                                                                      |
|             ▼ [Load: 1/10 | SLA: <0.2ms]                                                                           |
|  [ CANDIDATE GENERATION & 6D NOVELTY HYPERCUBE GATE ]                                                              |
|  ├── 1. Parameter Projection: Map parameters onto 6D unit hypercube $[0, 1]^6$                                      |
|  ├── 2. Normalized Manhattan Distance: Enforce $\min_{j} D(\vec{P}_{\text{cand}}, \vec{P}_j) \ge 0.50$ (50% shift)    |
|  └── 3. SHA-256 Fingerprint: Reject duplicate parameter hashes                                                     |
|             │                                                                                                      |
|             ▼ [Load: 6/10 | Heap: 65-110MB]                                                                        |
|  [ MARKET DATA SOURCING & ROLLING FEATURE FRAME BUILDER ]                                                          |
|  ├── Slices 5,000+ continuous bars from binary TS storage or provider cache                                        |
|  ├── Computes rolling technical indicators: RSI, Bollinger Bands, ATR, Momentum, Volatility                        |
|  └── Synthesizes annotated feature matrix with ML model predictions (e.g. Rolling SVM)                             |
|             │                                                                                                      |
|             ▼ [Load: 7/10 | RSS: <18MB | Latency: 20-35ms]                                                         |
|  [ NATIVE C++20 SOVEREIGN CORE BACKTEST BRIDGE ]                                                                   |
|  ├── Spawns `sovereign_wealth backtest --mode frame` with zero-allocation execution                                |
|  ├── Evaluates Sharpe Ratio, Sortino Ratio, Calmar Ratio, Win Rate, Expectancy, and Max Drawdown                    |
|  └── Executes 1,000-run Monte Carlo bootstrap resampling for statistical confidence bounds                         |
|             │                                                                                                      |
|             ▼ [Load: 1/10 | Atomic File Write]                                                                     |
|  [ VIABILITY FILTER & CANONICAL STRATEGY REGISTRY ]                                                                |
|  ├── Viability Gates: Total Trades $\ge 10$, Sharpe Ratio $> 0$, Expectancy $> 0$, Max Drawdown $\le 25\%$         |
|  ├── Serializes canonical YAML: `config/strategies/automated/auto_<name>.yaml`                                     |
|  └── Updates persistent discovery state: `storage/data/strategy_explorer_state.json`                               |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 2. Autonomous Strategy Exploration State Machine

```text
       ┌──────────────┐
       │ STATE: IDLE  │  Awaiting scheduled tick (30 min) or MCP `explore_strategy` request
       └──────┬───────┘
              │ Trigger Fired
              ▼
       ┌──────────────┐
       │ HYPOTHESIS   │  Select parameter archetype, timeframe, and feature set
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │ 6D_NOVELTY   │◄──────────────────────────────────────────────┐
       └──────┬───────┘                                               │
              │                                                       │ Distance < 0.50
      ┌───────┴───────────────────────────────┐                       │ (Too Similar to Seen)
      ▼                                       ▼                       │
Distance >= 0.50                        Distance < 0.50               │
┌──────────────┐                        ┌──────────────┐              │
│ FETCH_BARS   │                        │ MUTATE_PARAMS│──────────────┘
└──────┬───────┘                        └──────────────┘
       │ Sourced 5,000 Bars
       ▼
┌──────────────┐
│ BUILD_MATRIX │  Calculate RSI, BB, ATR, MACD & generate ML signal column
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ C++_BACKTEST │  Execute `sovereign_wealth backtest --mode frame`
└──────┬───────┘
       │
      ┌┴──────────────────────────────────────┐
      ▼                                       ▼
Metrics Pass Viability                  Metrics Fail Viability
(Sharpe > 0, MaxDD <= 25%)              (Unprofitable / Excessive Drawdown)
┌──────────────┐                        ┌──────────────┐
│ SAVE_YAML    │                        │ RECORD_DROP  │
└──────┬───────┘                        └──────┬───────┘
       │                                       │
       └──────────────────┬────────────────────┘
                          ▼
                   ┌──────────────┐
                   │ UPDATE_LEDGER│ Update `strategy_explorer_state.json` & sleep
                   └──────────────┘
```

---

## 3. 6D Normalized Parameter Space & Novelty Distance Metric

To ensure the autonomous discovery engine explores structurally diverse alpha spaces rather than overfitting trivial variations, each candidate strategy is projected onto a 6-dimensional unit hypercube:

$$\vec{P} = \left[ P_1, P_2, P_3, P_4, P_5, P_6 \right] \in [0, 1]^6$$

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                       6D PARAMETER NORMALIZATION HYPERCUBE                                         |
+--------------------------------------------------------------------------------------------------------------------+
|  1. Timeframe Index ($P_1$):    $\frac{\text{tf\_idx}}{5} \in [0, 1]$ (5m, 15m, 30m, 1h, 4h, 1d)                 |
|  2. Strategy Family ($P_2$):    $\frac{\text{fam\_idx}}{4} \in [0, 1]$ (momentum, mean_rev, breakout, trend, vol) |
|  3. ML Model ($P_3$):           $\frac{\text{mod\_idx}}{4} \in [0, 1]$ (svm, knn, rsi_div, macd, bb)               |
|  4. Signal Threshold ($P_4$):   $\frac{\theta - 0.50}{0.35} \in [0, 1]$ for $\theta \in [0.50, 0.85]$              |
|  5. Holding Horizon ($P_5$):    $\frac{H - 1}{29} \in [0, 1]$ for $H \in [1, 30] \text{ days}$                     |
|  6. Risk Weight ($P_6$):        $\frac{w - 0.02}{0.23} \in [0, 1]$ for $w \in [0.02, 0.25]$                       |
+--------------------------------------------------------------------------------------------------------------------+
```

### Novelty Distance Formalism
The distance between candidate parameter vector $\vec{P}_{\text{cand}}$ and any previously evaluated strategy $\vec{P}_{\text{seen}}$ is given by the normalized Manhattan metric:

$$D(\vec{P}_{\text{cand}}, \vec{P}_{\text{seen}}) = \frac{1}{6} \sum_{i=1}^6 |P_{\text{cand}, i} - P_{\text{seen}, i}|$$

$$\text{Novelty Condition}: \min_{j \in \text{Seen}} D(\vec{P}_{\text{cand}}, \vec{P}_j) \ge 0.50 \quad (50\% \text{ structural shift})$$

### SHA-256 Fingerprinting
To guard against hash collisions and floating-point roundoff:
$$\text{Fingerprint} = \text{SHA-256}(\text{CanonicalJSON}(\text{SortedParams}))[0:16]$$

---

## 4. Rolling Feature Matrix Synthesis & SVM Classifier

```text
[Raw Continuous OHLCV Bars (5,000+ bars)]
       │
       ▼
[Rolling Feature Calculation Engine (`shared/lib/market/indicators.js`)]
       ├── 1. Relative Strength Index (RSI-14, RSI-28)
       ├── 2. Bollinger Bands (20-period, 2.0 std dev) & BandWidth ($BW = \frac{UB - LB}{MB}$)
       ├── 3. Average True Range (ATR-14) & Normalized Volatility ($\sigma_{\text{norm}} = \frac{ATR}{Close}$)
       ├── 4. Moving Average Convergence Divergence (MACD 12/26/9)
       └── 5. Rolling Support Vector Machine (SVM) Decision Boundary:
              $$f(\vec{x}) = \text{sign}\left( \sum_{i=1}^M \alpha_i y_i K(\vec{x}_i, \vec{x}) + b \right)$$
       │
       ▼
[Annotated Feature Matrix: JSON Array / CSV Buffer]
- Structure: `{ timestamp_ms, open, high, low, close, volume, rsi, bb_upper, bb_lower, atr, signal, confidence }`
```

---

## 5. Model Context Protocol (MCP) AI Agent Workbench

Any MCP-compatible client (Claude Desktop, Cursor, Cline, local LLMs) can call the registered `explore_strategy` tool:

```json
{
  "name": "crypto_vol_breakout_1h",
  "hypothesis": "High volatility regime combined with Bollinger upper band expansion produces persistent momentum continuation in crypto markets.",
  "family": "breakout",
  "model": "svm_margin_v0",
  "timeframe": "1h",
  "universe": ["BTCUSDT", "ETHUSDT"],
  "indicators": { "bollinger": true, "atr": true, "volatility": true, "rsi": true },
  "threshold": 0.65,
  "max_holding_days": 7,
  "risk_weight": 0.15,
  "entry_signal": "Price closes above 2-std dev upper Bollinger Band with ATR > 20-period median",
  "exit_signal": "Price touches 20-period moving average or holding horizon exceeds 7 days",
  "save_yaml": true
}
```

```text
[MCP Client: Claude / LLM] ───(JSON-RPC `explore_strategy`)───► [backend/mcp_server/index.ts]
                                                                        │
                                                                        ▼
                                                             [Zod Schema Validation]
                                                             (Capability: `research:run`)
                                                                        │
                                                                        ▼
                                                             [Market Data Fetch (5k bars)]
                                                                        │
                                                                        ▼
                                                             [C++ FrameBacktester Bridge]
                                                                        │
                                                                        ▼
                                                             [YAML Registry Persistence]
                                                             (`config/strategies/automated/<name>.yaml`)
```

---

## 6. Subsystem Load Indices & Performance Benchmarks

| Subsystem Component | CPU Utilization | Memory / RSS | Latency / SLA | Disk I/O Bandwidth | Complexity | Load Score (1–10) |
|---|---|---|---|---|---|:---:|
| **Novelty Distance & SHA-256 Filter**| < 0.05 CPU | `< 2.0 MB` heap | `< 0.2 ms` | Read-only state parse | $O(D \times K)$ | **1/10** |
| **Market Data Ingestion (5k bars)**  | 0.2–0.5 CPU | $25–45\text{ MB}$ heap | $250–600\text{ ms}$ | $180\text{ KB}$ network JSON | $O(N)$ network | **4/10** |
| **Rolling Feature Frame Builder**    | 0.8–1.0 CPU | $65–110\text{ MB}$ heap | $45–80\text{ ms}$ (5k bars × 8 inds)| Zero disk I/O | $O(N \times K)$ | **6/10** |
| **Native C++ Backtest Dispatch**     | 1.0 CPU (spawn)| `< 18.0 MB` child RSS | $20–35\text{ ms}$ child exec | $1.2\text{ MB}$ temp frame write | $O(N)$ linear pass | **5/10** |
| **MCP `explore_strategy` Handler**   | Async worker| `< 150 MB` Node RSS | `< 1.2 s` end-to-end SLA | Atomic YAML + State write | Multi-stage pipeline | **5/10** |
