# 04. Quantitative Alpha, Machine Learning & AI Agent Workbench

This document specifies the architecture of the autonomous quantitative alpha discovery engine, 6D normalized parameter space exploration, novelty distance filtering, rolling feature matrix synthesis, and Model Context Protocol (MCP) AI agent workbenches.

---

## 1. Autonomous AI Strategy Explorer Architecture

Sovereign includes an autonomous discovery daemon (`scripts/strategies/auto_strategy_explorer.js`) that runs continuously (e.g. 30-minute interval on HPDesk) or on-demand via CLI and MCP tooling to research novel market anomalies, backtest them using the zero-allocation native C++20 engine, and automatically persist valid YAML strategy registries into `config/strategies/automated/`.

```mermaid
flowchart TD
    subgraph Surfaces["Integration Surfaces"]
        MCP["MCP Tool: explore_strategy<br/>(Claude Desktop, Cursor, AI Agents, LLMs) [Load: 2/10]"]
        CLI["CLI Subcommand: sovereign strategy explore<br/>[--once] [--interval <mins>] [Load: 2/10]"]
        SOAK["Docker Soak Service: sv-strategy-explorer<br/>Container on HPDesk Proxmox VM [Load: 4/10]"]
    end

    subgraph Gate["Candidate Generation & 6D Novelty Hypercube Gate [Load: 1/10 | SLA: <0.2ms]"]
        P1["1. Parameter Projection: Map parameters onto 6D unit hypercube [0, 1]^6"]
        P2["2. Normalized Manhattan Distance: min_j D(P_cand, P_j) >= 0.50"]
        P3["3. SHA-256 Fingerprint: Reject duplicate parameter hashes"]
    end

    subgraph Features["Market Data Sourcing & Rolling Feature Frame Builder [Load: 6/10 | Heap: 65-110MB]"]
        F1["Slice 5,000+ continuous bars from binary TS storage or provider cache"]
        F2["Compute rolling technical indicators: RSI, Bollinger Bands, ATR, Momentum, Volatility"]
        F3["Synthesize annotated feature matrix with ML model predictions (e.g. Rolling SVM)"]
    end

    subgraph Backtest["Native C++20 Sovereign Core Backtest Bridge [Load: 7/10 | RSS: <18MB | Latency: 20-35ms]"]
        B1["Spawn sovereign_wealth backtest --mode frame with zero-allocation execution"]
        B2["Evaluate Sharpe, Sortino, Calmar, Win Rate, Expectancy, Max Drawdown"]
        B3["Execute 1,000-run Monte Carlo bootstrap resampling for confidence bounds"]
    end

    subgraph Registry["Viability Filter & Canonical Strategy Registry [Load: 1/10 | Atomic File Write]"]
        R1["Viability Gates: Trades >= 10, Sharpe > 0, Expectancy > 0, Max Drawdown <= 25%"]
        R2["Serialize canonical YAML: config/strategies/automated/auto_<name>.yaml"]
        R3["Update persistent discovery state: storage/data/strategy_explorer_state.json"]
    end

    Surfaces --> Gate
    Gate --> Features
    Features --> Backtest
    Backtest --> Registry
```

---

## 2. Autonomous Strategy Exploration State Machine

```mermaid
stateDiagram-v2
    [*] --> IDLE: Daemon Boot
    IDLE --> HYPOTHESIS: Trigger Fired (30m tick or MCP request)
    HYPOTHESIS --> NOVELTY_CHECK: Select Archetype, Timeframe & Features

    state NOVELTY_CHECK <<choice>>
    NOVELTY_CHECK --> FETCH_BARS: Distance >= 0.50
    NOVELTY_CHECK --> MUTATE_PARAMS: Distance < 0.50

    MUTATE_PARAMS --> NOVELTY_CHECK: Re-sample Candidate
    FETCH_BARS --> BUILD_MATRIX: Sourced 5,000 Bars
    BUILD_MATRIX --> CPP_BACKTEST: Features & ML Column Ready

    state CPP_BACKTEST <<choice>>
    CPP_BACKTEST --> SAVE_YAML: Pass (Sharpe > 0, MaxDD <= 25%)
    CPP_BACKTEST --> RECORD_DROP: Fail (Unprofitable / High Risk)

    SAVE_YAML --> UPDATE_LEDGER: Write config/strategies/automated/
    RECORD_DROP --> UPDATE_LEDGER: Record Rejection Reason

    UPDATE_LEDGER --> IDLE: Update strategy_explorer_state.json & Sleep
```

---

## 3. 6D Normalized Parameter Space & Novelty Distance Metric

To ensure the autonomous discovery engine explores structurally diverse alpha spaces rather than overfitting trivial variations, each candidate strategy is projected onto a 6-dimensional unit hypercube:

$$\vec{P} = \left[ P_1, P_2, P_3, P_4, P_5, P_6 \right] \in [0, 1]^6$$

| Dimension | Parameter Name | Normalized Value Metric | Range / Domain |
|:---:|---|---|---|
| $P_1$ | Timeframe Index | $\frac{\text{tf\_idx}}{5} \in [0, 1]$ | `5m`, `15m`, `30m`, `1h`, `4h`, `1d` |
| $P_2$ | Strategy Family | $\frac{\text{fam\_idx}}{4} \in [0, 1]$ | `momentum`, `mean_rev`, `breakout`, `trend`, `vol` |
| $P_3$ | ML Model | $\frac{\text{mod\_idx}}{4} \in [0, 1]$ | `svm`, `knn`, `rsi_div`, `macd`, `bb` |
| $P_4$ | Signal Threshold | $\frac{\theta - 0.50}{0.35} \in [0, 1]$ | $\theta \in [0.50, 0.85]$ |
| $P_5$ | Holding Horizon | $\frac{H - 1}{29} \in [0, 1]$ | $H \in [1, 30] \text{ days}$ |
| $P_6$ | Risk Weight | $\frac{w - 0.02}{0.23} \in [0, 1]$ | $w \in [0.02, 0.25]$ |

### Novelty Distance Formalism
The distance between candidate parameter vector $\vec{P}_{\text{cand}}$ and any previously evaluated strategy $\vec{P}_{\text{seen}}$ is given by the normalized Manhattan metric:

$$D(\vec{P}_{\text{cand}}, \vec{P}_{\text{seen}}) = \frac{1}{6} \sum_{i=1}^6 |P_{\text{cand}, i} - P_{\text{seen}, i}|$$

$$\text{Novelty Condition}: \min_{j \in \text{Seen}} D(\vec{P}_{\text{cand}}, \vec{P}_j) \ge 0.50 \quad (50\% \text{ structural shift})$$

### SHA-256 Fingerprinting
To guard against hash collisions and floating-point roundoff:
$$\text{Fingerprint} = \text{SHA-256}(\text{CanonicalJSON}(\text{SortedParams}))[0:16]$$

---

## 4. Rolling Feature Matrix Synthesis & SVM Classifier

```mermaid
flowchart TD
    BARS["Raw Continuous OHLCV Bars (5,000+ bars)"]
    
    subgraph Engine["Rolling Feature Calculation Engine (shared/lib/market/indicators.js)"]
        F1["1. Relative Strength Index: RSI-14, RSI-28"]
        F2["2. Bollinger Bands (20-period, 2.0 std dev) & BandWidth: BW = (UB - LB) / MB"]
        F3["3. Average True Range (ATR-14) & Normalized Volatility: σ_norm = ATR / Close"]
        F4["4. Moving Average Convergence Divergence: MACD 12/26/9"]
        F5["5. Rolling Support Vector Machine (SVM) Decision Boundary:<br/>f(x) = sign( sum_i α_i y_i K(x_i, x) + b )"]
    end

    MATRIX[("Annotated Feature Matrix: JSON Array / CSV Buffer<br/>Fields: timestamp_ms, open, high, low, close, volume, rsi, bb_upper, bb_lower, atr, signal, confidence")]

    BARS --> Engine
    Engine --> MATRIX
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

```mermaid
sequenceDiagram
    autonumber
    actor AI as MCP Client (Claude / LLM)
    participant MCP as backend/mcp_server/index.ts
    participant VAL as Zod Schema Validator
    participant DATA as Market Data Store
    participant CPP as C++ FrameBacktester
    participant FS as Strategy Registry

    AI->>MCP: JSON-RPC explore_strategy(params)
    MCP->>VAL: Validate capability (research:run) & schema
    VAL-->>MCP: Parameters Valid
    MCP->>DATA: Sourced 5,000 continuous bars
    DATA-->>MCP: OHLCV Buffers
    MCP->>CPP: Spawn sovereign_wealth backtest --mode frame
    CPP-->>MCP: Performance & Monte Carlo metrics
    MCP->>FS: Persist config/strategies/automated/<name>.yaml
    MCP-->>AI: Return strategy YAML, Sharpe, WinRate, MaxDD
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
