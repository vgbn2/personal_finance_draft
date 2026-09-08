# 04. Quantitative Alpha, Machine Learning & AI Agent Workbench

This document specifies the architecture of the autonomous quantitative alpha discovery engine, 6D normalized parameter space exploration, novelty distance filtering, rolling feature matrix synthesis, and Model Context Protocol (MCP) AI agent workbenches.

---

## 1. Autonomous AI Strategy Explorer Architecture

Sovereign includes an autonomous discovery daemon (`scripts/strategies/auto_strategy_explorer.js`) that runs continuously (e.g. 30-minute interval on HPDesk) or on-demand via CLI and MCP tooling to research novel market anomalies, backtest them using the zero-allocation native C++20 engine, and automatically persist valid YAML strategy registries into `config/strategies/`.

```text
+----------------------------------------------------------------------------------------------------+
|                                 AUTONOMOUS AI STRATEGY EXPLORER                                    |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ Integration Surfaces ]                                                                          |
|  ├── MCP Tool: `explore_strategy` (Claude Desktop, AI Agents, LLM runners)                         |
|  ├── CLI Subcommand: `sovereign strategy explore [--once] [--interval <mins>]`                     |
|  └── Docker Soak Service: `sv-strategy-explorer` container on HPDesk Proxmox VM                   |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ Candidate Generation & 6D Novelty Gate ]                                                        |
|  ├── Normalized 6D Parameter Space: [timeframe, family, model, threshold, horizon, risk_weight]    |
|  ├── Novelty Distance Filter: Enforces $D(\vec{P}_{\text{cand}}, \vec{P}_{\text{seen}}) \ge 0.50$ (50% shift)     |
|  └── SHA-256 Fingerprinting: Rejects identical duplicate candidate hashes                          |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ Market Data Sourcing & Feature Frame Builder ]                                                  |
|  ├── Ingests 5,000+ continuous bars from Binance / Yahoo cache or TS index                        |
|  └── Computes rolling indicators: RSI, Bollinger, ATR, Volatility, Momentum, Log Returns           |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ Native C++20 Sovereign Core Backtest Bridge ]                                                   |
|  ├── Spawns `sovereign_wealth --mode frame` with zero-allocation execution                         |
|  └── Parses structured telemetry: Win Rate, Sharpe, Sortino, Max Drawdown, Expectancy             |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ Viability Evaluation & Canonical YAML Registry ]                                                |
|  ├── Filters: Trades >= 10, Sharpe > 0, Positive Expectancy, Max Drawdown <= 25%                   |
|  ├── Serializes canonical YAML: `config/strategies/<name>.yaml`                                    |
|  └── Updates persistent discovery ledger: `storage/data/strategy_explorer_state.json`               |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. 6D Normalized Parameter Space & Novelty Distance Metric

To ensure the autonomous discovery engine does not overfit to trivial variations of previous parameters, each strategy candidate is projected onto a 6-dimensional unit hypercube:

$$\vec{P} = \left[ P_1, P_2, P_3, P_4, P_5, P_6 \right] \in [0, 1]^6$$

```text
+----------------------------------------------------------------------------------------------------+
|                               6D PARAMETER NORMALIZATION HYPERCUBE                                 |
+----------------------------------------------------------------------------------------------------+
|  1. Timeframe Index ($P_1$):    $\frac{\text{tf\_idx}}{5} \in [0, 1]$ (5m, 15m, 30m, 1h, 4h, 1d) |
|  2. Strategy Family ($P_2$):    $\frac{\text{fam\_idx}}{4} \in [0, 1]$ (mom, mean_rev, break, trend, vol) |
|  3. ML Model ($P_3$):           $\frac{\text{mod\_idx}}{4} \in [0, 1]$ (svm, knn, rsi_div, macd, bb) |
|  4. Signal Threshold ($P_4$):   $\frac{\theta - 0.50}{0.35} \in [0, 1]$ for $\theta \in [0.50, 0.85]$ |
|  5. Holding Horizon ($P_5$):    $\frac{H - 1}{29} \in [0, 1]$ for $H \in [1, 30] \text{ days}$     |
|  6. Risk Weight ($P_6$):        $\frac{w - 0.02}{0.23} \in [0, 1]$ for $w \in [0.02, 0.25]$       |
+----------------------------------------------------------------------------------------------------+
```

### Novelty Distance Formalism
The distance between candidate parameter vector $\vec{P}_{\text{cand}}$ and any previously evaluated strategy $\vec{P}_{\text{seen}}$ is given by the normalized Manhattan metric:

$$D(\vec{P}_{\text{cand}}, \vec{P}_{\text{seen}}) = \frac{1}{6} \sum_{i=1}^6 |P_{\text{cand}, i} - P_{\text{seen}, i}|$$

$$\text{Novelty Condition}: \min_{j \in \text{Seen}} D(\vec{P}_{\text{cand}}, \vec{P}_j) \ge 0.50 \quad (50\% \text{ structural shift})$$

### SHA-256 Fingerprinting
To guard against hash collisions and floating-point roundoff:
$$\text{Fingerprint} = \text{SHA-256}(\text{CanonicalJSON}(\text{SortedParams}))[0:16]$$

---

## 3. Rolling Feature Matrix Synthesis

```text
[Raw Continuous OHLCV Bars (5,000+ bars)]
       │
       ▼
[Rolling Feature Calculation Engine (`shared/lib/market/indicators.js`)]
       ├── 1. Relative Strength Index (RSI-14, RSI-28)
       ├── 2. Bollinger Bands (20-period, 2.0 std dev) & BandWidth ($BW = \frac{UB - LB}{MB}$)
       ├── 3. Average True Range (ATR-14) & Normalized Volatility ($\sigma_{\text{norm}} = \frac{ATR}{Close}$)
       ├── 4. Moving Average Convergence Divergence (MACD 12/26/9)
       └── 5. Micro-Regime Labeling: Trend Strength, Mean Reversion State, Volatility Expansion
       │
       ▼
[Annotated Feature Matrix: Array of Objects / CSV Matrix]
- Structure: `{ timestamp_ms, open, high, low, close, volume, rsi, bb_upper, bb_lower, atr, signal }`
```

---

## 4. Model Context Protocol (MCP) AI Agent Workbench

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
                                                             (`config/strategies/<name>.yaml`)
```

---

## 5. Subsystem Load Indices & Performance Benchmarks

| Subsystem Component | CPU Utilization | Memory / RSS | Latency / SLA | Disk I/O Bandwidth | Complexity |
|---|---|---|---|---|---|
| **Novelty Distance & SHA-256 Filter**| < 0.05 CPU | `< 2.0 MB` heap | `< 0.2 ms` | Read-only state parse | $O(D \times K)$ |
| **Market Data Ingestion (5k bars)**  | 0.2–0.5 CPU | $25–45\text{ MB}$ heap | $250–600\text{ ms}$ | $180\text{ KB}$ network JSON | $O(N)$ network |
| **Rolling Feature Frame Builder**    | 0.8–1.0 CPU | $65–110\text{ MB}$ heap | $45–80\text{ ms}$ (5k bars × 8 inds)| Zero disk I/O | $O(N \times K)$ |
| **Native C++ Backtest Dispatch**     | 1.0 CPU (spawn)| `< 18.0 MB` child RSS | $20–35\text{ ms}$ child exec | $1.2\text{ MB}$ temp frame write | $O(N)$ linear pass |
| **MCP `explore_strategy` Handler**   | Async worker| `< 150 MB` Node RSS | `< 1.2 s` end-to-end SLA | Atomic YAML + State write | Multi-stage pipeline |
