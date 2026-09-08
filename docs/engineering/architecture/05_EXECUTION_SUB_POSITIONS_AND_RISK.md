# 05. Execution, Sub-Positions Ledger & Risk Management

This document specifies the sub-position virtual accounting ledger, deterministic client order signatures, physical broker fill reconciliation algorithms, fractional quantity step enforcement, and pre-trade risk management.

---

## 1. Multi-Strategy Sub-Positions Virtual Ledger Architecture

When multiple automated quantitative strategies (or manual operator trades) trade the same physical instrument (e.g. `SPY`, `QQQ`, `BTC/USD`) on a single broker account (Alpaca / Gate.io / Polymarket), the broker tracks only one aggregate net position. 

Sovereign solves this multi-strategy attribution problem via the **Sub-Positions Virtual Ledger** (`storage/data/runtime/sub_positions.json`):

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                      SUB-POSITION RECONCILIATION & ATTRIBUTION ENGINE                               |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  [ AUTONOMOUS BOT STRATEGIES (A, B, C) ]                [ DISCRETIONARY CLI OPERATOR ]                             |
|  - Auto-generated signals & target positions             - Manual buy/sell commands                                 |
|             │                                                        │                                             |
|             ▼ [Load: 1/10 | SLA: <5μs]                               ▼ [Load: 1/10 | SLA: <5μs]                    |
|  `strat_mean_rev_5m_1756148200000_3f9a2b`              `manual_cli_SPY_1756148200000_8c1e4d`                       |
|             │                                                        │                                             |
|             └──────────────────────────┬─────────────────────────────┘                                             |
|                                        │                                                                           |
|                                        ▼ [Load: 3/10 | Roundtrip: 120-250ms]                                       |
|                       [ BROKER EXECUTION GATEWAY (`backend/gateway/src/alpaca.js`) ]                               |
|                       ├── Sets `client_order_id = <signature>`                                                     |
|                       └── Clamps quantity: $Q_{\text{clamped}} = \lfloor Q / q_{\text{step}} \rfloor \times q_{\text{step}}$|
|                                        │                                                                           |
|                                        ▼ [Load: 2/10 | SLA: <1.5ms]                                                |
|                       [ ATOMIC LEDGER MUTATION ENGINE (`shared/lib/runtime/sub_positions.js`) ]                    |
|                       ├── 1. `withFileLockSync('sub_positions.json.lock')`                                         |
|                       ├── 2. Mutates sub-position state in memory                                                  |
|                       ├── 3. Writes payload to `sub_positions.json.tmp`                                            |
|                       └── 4. Atomic `fs.renameSync()` swap to `sub_positions.json`                                 |
|                                        │                                                                           |
|                                        ▼ [Load: 1/10 | Mathematical Proof]                                         |
|                       [ BROKER RECONCILIATION INVARIANT ]                                                          |
|                       $$Q_{\text{BrokerPhysical}}(S) = \sum_{k \in \text{Bots}} q_k(S) + q_{\text{[MANUAL]}}(S)$$  |
|                       - Discrepancy > 0: Auto-attributed to [MANUAL] residual                                      |
|                       - Discrepancy < 0: Fails safe, blocks unauthorized bot liquidation                           |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 2. Multi-Strategy Concurrent Execution Sequence

```text
[Bot Strategy A]    [Bot Strategy B]    [SubPositions]      [PreTradeRisk]       [Alpaca Gateway]    [Ledger Disk]
       │                   │                   │                   │                    │                   │
       │── 1. Buy SPY ────►│                   │                   │                    │                   │
       │   Qty = 0.5       │                   │── 2. Check Lock ──────────────────────────────────────────►│
       │                   │                   │      & Mutate Slice                    │                   │
       │                   │                   │── 3. Check Risk ─►│                    │                   │
       │                   │                   │      (<15μs)      │                    │                   │
       │                   │                   │◄─ 4. Pass ────────│                    │                   │
       │                   │                   │── 5. Submit Order (strat_A_sig) ──────►│                   │
       │                   │                   │                                        │── 6. Fill SPY ───► [Exchange]
       │                   │                   │                                        │      Qty = 0.5    │
       │                   │                   │                                        │◄─ 7. Confirmed ───│
       │                   │                   │◄─ 8. Fill Event ───────────────────────│                   │
       │                   │                   │── 9. Commit Ledger (strat_A = 0.5) ───────────────────────►│
       │                   │                   │                                        │                   │
       │                   │── 10. Buy SPY ───►│                                        │                   │
       │                   │   Qty = 0.3       │── 11. Mutate Slice                     │                   │
       │                   │                   │── 12. Submit Order (strat_B_sig) ─────►│                   │
       │                   │                   │                                        │── 13. Fill SPY ──► [Exchange]
       │                   │                   │                                        │       Qty = 0.3   │
       │                   │                   │                                        │◄─ 14. Confirmed ──│
       │                   │                   │── 15. Commit Ledger (strat_B = 0.3) ──────────────────────►│
       │                   │                   │       Total Physical SPY = 0.8         │                   │
```

---

## 3. Deterministic Client Order Signatures

All orders submitted to brokers carry an immutable client order ID encoding origin, strategy attribution, timeframe, and entropy:

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                          ORDER SIGNATURE ANATOMY & PARSING                                         |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  1. Automated Strategy Order Signature:                                                                            |
|     `strat_<strategy_id>_<timeframe>_<timestamp_ms>_<entropy>`                                                     |
|     Example: `strat_auto_mean_reversion_knn_v0_1h_1756148200000_a9f1b4`                                          |
|     ├── `strat`: Prefix identifying autonomous bot provenance                                                      |
|     ├── `strategy_id`: Canonical strategy registry identifier (`auto_mean_reversion_knn_v0`)                       |
|     ├── `timeframe`: Strategy operating timeframe (`1h`, `5m`)                                                     |
|     ├── `timestamp_ms`: Epoch millisecond dispatch timestamp                                                       |
|     └── `entropy`: 6-character random hex string for collision prevention                                          |
|                                                                                                                    |
|  2. Manual Discretionary CLI Order Signature:                                                                      |
|     `manual_cli_<symbol>_<timestamp_ms>_<entropy>`                                                                 |
|     Example: `manual_cli_SPY_1756148200000_c3e8d2`                                                                 |
|     ├── `manual_cli`: Prefix identifying human CLI operator provenance                                             |
|     ├── `symbol`: Target market symbol (`SPY`, `BTC/USD`)                                                          |
|     ├── `timestamp_ms`: Epoch millisecond dispatch timestamp                                                       |
|     └── `entropy`: 6-character random hex string                                                                   |
+--------------------------------------------------------------------------------------------------------------------+
```

### Signature Regex Decomposers
- **Strategy Parser**: `/^strat_(?<stratId>.+)_(?<tf>\d+[mhd])_(?<ts>\d+)_(?<entropy>[0-9a-f]{6})$/`
- **Manual CLI Parser**: `/^manual_cli_(?<symbol>[A-Z0-9_\/]+)_(?<ts>\d+)_(?<entropy>[0-9a-f]{6})$/`

---

## 4. Physical Broker Fill Reconciliation Algorithm

The reconciliation algorithm enforces exact physical-to-virtual balance equality:

$$Q_{\text{BrokerPhysical}}(S) = \sum_{k \in \text{BotStrategies}} q_k(S) + q_{\text{[MANUAL]}}(S)$$

### Reconciliation Invariant Cases:
1. **Case A (Exact Match)**: $\sum q_k(S) = Q_{\text{BrokerPhysical}}(S) \implies q_{\text{[MANUAL]}}(S) = 0$.
2. **Case B (Excess Physical Shares)**: $Q_{\text{BrokerPhysical}}(S) > \sum q_k(S)$.
   $$q_{\text{[MANUAL]}}(S) := Q_{\text{BrokerPhysical}}(S) - \sum q_k(S)$$
   Excess shares are isolated under `[MANUAL]` ownership so bots cannot liquidate them.
3. **Case C (Deficit / Under-Allocation)**: $Q_{\text{BrokerPhysical}}(S) < \sum q_k(S)$.
   Fails closed: flags an operational anomaly, pauses automated sell signals, and alerts the operator.

---

## 5. Fractional Unit Sizing & Step Precision Enforcement

To allow sub-$100 allocations on high-priced assets (SPY at $500+, BTC at $60,000+), Sovereign enforces step-precision rounding before order dispatch:

```text
[Calculated Notional Allocation: $75.00 on SPY ($550.00 / share)]
       │
       ▼
[Raw Target Quantity]: $75.00 / $550.00 = 0.1363636... shares
       │
       ▼
[Step Precision Resolution]: resolveInstrumentQuantityStep('SPY') -> 0.001
       │
       ▼
[Floor Step Rounding]: roundDownToStep(0.1363636, 0.001) -> 0.136 shares
       │
       ▼
[Step Compliance]: (0.136 % 0.001 == 0) -> Dispatched to Broker
```

### Supported Step Rules:
- **US Equities & ETFs**: Step = `0.001` shares ($q_{\text{min}} = 0.001$).
- **Crypto Pairs (`BTC/USD`, `ETH/USD`)**: Step = `0.0001` units ($q_{\text{min}} = 0.0001$).
- **Tradable Asset Filter**: `isAlpacaTradable(symbol)` pre-filters unsupported pairs (e.g. `BNBUSDT`, `EURUSD`), rejecting them at the pre-trade gate.

---

## 6. Pre-Trade Risk Multi-Tier Circuit Breaker

```text
[Incoming Order Submission]
       │
       ▼
[Gate 1: Monotonicity & Value Sanity] ───► Fails if NaN, <= 0 notional, or corrupt timestamp
       │ Passes
       ▼
[Gate 2: Portfolio Drawdown Limit] ──────► Fails if Drawdown >= 15.0%
       │ Passes
       ▼
[Gate 3: Single-Asset Concentration] ────► Fails if (Asset Notional / Total Equity) > 25.0%
       │ Passes
       ▼
[Gate 4: Fat-Finger Price Check] ────────► Fails if |OrderPrice - ClosePrice| / ClosePrice > 5.0%
       │ Passes
       ▼
[Gate 5: Step Alignment Quantization] ───► Clamps quantity to valid exchange lot step
       │
       ▼
[Order Authorized & Dispatched] (< 15μs Total Evaluation Latency)
```

---

## 7. Subsystem Load Indices & Performance Benchmarks

| Subsystem Component | CPU Utilization | Memory / RSS | Latency / SLA | Disk I/O Profile | Complexity | Load Score (1–10) |
|---|---|---|---|---|---|:---:|
| **Signature Generation & Parsing**  | < 0.01 CPU | Negligible (<50 KB) | **`< 5 μs`** per signature | Zero disk I/O | $O(1)$ constant | **1/10** |
| **Ledger Atomic Lock & Commit**     | < 0.02 CPU | `< 4.0 MB` heap | `< 1.5 ms` per transaction | Lockfile write + atomic rename | $O(1)$ atomic swap | **2/10** |
| **Broker Position Reconciliation**  | 0.1 CPU | `< 8.0 MB` heap | $120–250\text{ ms}$ (REST API)| 1 broker API request / cycle | $O(P + S)$ items | **3/10** |
| **Fast-Path Signal Evaluation**     | 0.05 CPU | `< 15.0 MB` heap | **`< 2.0 ms`** internal latency| Zero disk I/O | $O(\text{bars})$ lookback | **2/10** |
| **Pre-Trade Risk Verification**     | < 0.01 CPU | `< 1.0 MB` RSS | **`< 15 μs`** per order | Zero disk / network I/O | $O(1)$ constant | **1/10** |
