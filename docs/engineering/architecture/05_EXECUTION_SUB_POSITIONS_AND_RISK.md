# 05. Execution, Sub-Positions Ledger & Risk Management

This document specifies the sub-position virtual accounting ledger, deterministic client order signatures, physical broker fill reconciliation algorithms, fractional quantity step enforcement, and pre-trade risk management.

---

## 1. Multi-Strategy Sub-Positions Virtual Ledger Architecture

When multiple automated quantitative strategies (or manual operator trades) trade the same physical instrument (e.g. `SPY`, `QQQ`, `BTC/USD`) on a single broker account (Alpaca / Gate.io / Polymarket), the broker tracks only one aggregate net position. 

Sovereign solves this multi-strategy attribution problem via the **Sub-Positions Virtual Ledger** (`storage/data/runtime/sub_positions.json`):

```text
+----------------------------------------------------------------------------------------------------+
|                                 SUB-POSITION RECONCILIATION ENGINE                                 |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ Bot Strategies (A, B, C) ]                          [ Discretionary CLI Operator ]              |
|  - Auto-generated signals                              - Manual buy/sell commands                  |
|             │                                                        │                             |
|             ▼                                                        ▼                             |
|  `strat_mean_rev_5m_1756148200000_3f9a2b`              `manual_cli_SPY_1756148200000_8c1e4d`       |
|             │                                                        │                             |
|             └──────────────────────────┬─────────────────────────────┘                             |
|                                        ▼                                                           |
|                       [ Broker Execution Gateway ]                                                 |
|                       (Alpaca Paper/Live, Gate.io, Polymarket)                                     |
|                       - Dispatches order with client_order_id = signature                          |
|                       - Fractional step sizing clamp (e.g. 0.0001 BTC, 0.001 shares)              |
|                                        │                                                           |
|                                        ▼                                                           |
|                       [ Atomic Ledger Mutation Engine ]                                            |
|                       - `withFileLockSync('sub_positions.json.lock')`                              |
|                       - Mutates memory structure -> Writes `sub_positions.json.tmp`                |
|                       - Atomic `fs.renameSync()` swap to `sub_positions.json`                      |
|                                        │                                                           |
|                                        ▼                                                           |
|                       [ Broker Reconciliation Invariant ]                                          |
|                       $$Q_{\text{BrokerTotal}}(S) = \sum q_k(S) + q_{\text{[MANUAL]}}(S)$$         |
|                       - Discrepancy > 0: Auto-attributed to [MANUAL] residual                      |
|                       - Discrepancy < 0: Fails safe, prevents unauthorized bot liquidation         |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Deterministic Client Order Signatures

All orders submitted to brokers carry an immutable client order ID encoding origin, strategy attribution, timeframe, and entropy:

```text
+----------------------------------------------------------------------------------------------------+
|                                   ORDER SIGNATURE STRUCTURE                                        |
+----------------------------------------------------------------------------------------------------+
|  1. Automated Strategy Order Signature:                                                            |
|     `strat_<strategy_id>_<timeframe>_<timestamp_ms>_<entropy>`                                     |
|     Example: `strat_auto_mean_reversion_knn_v0_1h_1756148200000_a9f1b4`                          |
|     - `strat`: Prefix identifying autonomous bot provenance                                        |
|     - `strategy_id`: Strategy registry identifier                                                  |
|     - `timeframe`: Strategy operating timeframe (e.g. `1h`, `5m`)                                   |
|     - `timestamp_ms`: Epoch millisecond dispatch timestamp                                         |
|     - `entropy`: 6-character random hex string for collision avoidance                             |
|                                                                                                    |
|  2. Manual Discretionary CLI Order Signature:                                                      |
|     `manual_cli_<symbol>_<timestamp_ms>_<entropy>`                                                 |
|     Example: `manual_cli_SPY_1756148200000_c3e8d2`                                                 |
|     - `manual_cli`: Prefix identifying human CLI operator provenance                               |
|     - `symbol`: Target market symbol                                                               |
+----------------------------------------------------------------------------------------------------+
```

### Signature Regex Decomposers
- **Strategy Parser**: `/^strat_(?<stratId>.+)_(?<tf>\d+[mhd])_(?<ts>\d+)_(?<entropy>[0-9a-f]{6})$/`
- **Manual CLI Parser**: `/^manual_cli_(?<symbol>[A-Z0-9_\/]+)_(?<ts>\d+)_(?<entropy>[0-9a-f]{6})$/`

---

## 3. Physical Broker Fill Reconciliation Algorithm

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

## 4. Fractional Unit Sizing & Step Enforcement

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

## 5. Subsystem Load Indices & Performance Benchmarks

| Subsystem Component | CPU Utilization | Memory / RSS | Latency / SLA | Disk I/O Bandwidth | Complexity |
|---|---|---|---|---|---|
| **Signature Generation & Parsing**  | < 0.01 CPU | Negligible (<50 KB) | **`< 5 μs`** per signature | Zero disk I/O | $O(1)$ constant |
| **Ledger Atomic Lock & Commit**     | < 0.02 CPU | `< 4.0 MB` heap | `< 1.5 ms` per transaction | Lockfile write + atomic rename | $O(1)$ atomic swap |
| **Broker Position Reconciliation**  | 0.1 CPU | `< 8.0 MB` heap | $120–250\text{ ms}$ (REST API)| 1 broker API request / cycle | $O(P + S)$ items |
| **Fast-Path Signal Evaluation**     | 0.05 CPU | `< 15.0 MB` heap | **`< 2.0 ms`** internal latency| Zero disk I/O | $O(\text{bars})$ lookback |
| **Pre-Trade Risk Verification**     | < 0.01 CPU | `< 1.0 MB` RSS | **`< 15 μs`** per order | Zero disk / network I/O | $O(1)$ constant |
