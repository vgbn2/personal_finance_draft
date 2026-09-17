# 05. Execution, Sub-Positions Ledger & Risk Management

This document specifies the sub-position virtual accounting ledger, deterministic client order signatures, physical broker fill reconciliation algorithms, fractional quantity step enforcement, and pre-trade risk management.

---

## 1. Multi-Strategy Sub-Positions Virtual Ledger Architecture

When multiple automated quantitative strategies (or manual operator trades) trade the same physical instrument (e.g. `SPY`, `QQQ`, `BTC/USD`) on a single broker account (Alpaca / Gate.io / Polymarket), the broker tracks only one aggregate net position. 

Sovereign solves this multi-strategy attribution problem via the **Sub-Positions Virtual Ledger** (`storage/data/runtime/ledger/sub_positions.json`):

```mermaid
flowchart TD
    subgraph Senders["Signal Generators"]
        BOTS["Autonomous Bot Strategies (A, B, C)<br/>Auto-generated signals & target positions<br/>ID: strat_mean_rev_5m_1756148200000_3f9a2b<br/>[Load: 1/10 | SLA: <5μs]"]
        CLI["Discretionary CLI Operator<br/>Manual buy/sell commands<br/>ID: manual_cli_SPY_1756148200000_8c1e4d<br/>[Load: 1/10 | SLA: <5μs]"]
    end

    subgraph Broker["Broker Execution Gateway (backend/gateway/src/adapters/alpaca_adapter.ts) [Load: 3/10 | 120-250ms]"]
        B1["Sets client_order_id = signature"]
        B2["Clamps quantity: Q_clamped = floor(Q / q_step) * q_step"]
    end

    subgraph Ledger["Atomic Ledger Mutation Engine (shared/lib/runtime/sub_positions_ledger.js) [Load: 2/10 | <1.5ms]"]
        L1["1. withFileLockSync('sub_positions.json.lock')"]
        L2["2. Mutate sub-position state in memory"]
        L3["3. Write payload to sub_positions.json.tmp"]
        L4["4. Atomic fs.renameSync() swap to sub_positions.json"]
    end

    subgraph Invariant["Broker Reconciliation Invariant [Load: 1/10]"]
        INV["Q_BrokerPhysical(S) = sum_k q_k(S) + q_manual(S)<br/>• Discrepancy > 0: Auto-attributed to manual residual<br/>• Discrepancy < 0: Fails safe, blocks unauthorized bot liquidation"]
    end

    BOTS --> Broker
    CLI --> Broker
    Broker --> Ledger
    Ledger --> Invariant
```

---

## 2. Multi-Strategy Concurrent Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    participant A as Bot Strategy A
    participant B as Bot Strategy B
    participant SUB as SubPositions Ledger
    participant RISK as PreTradeRisk
    participant ALP as Alpaca Gateway
    participant DISK as Storage Disk (JSON)

    A->>SUB: Buy SPY (Qty = 0.5)
    SUB->>DISK: Check Lock & Mutate Slice
    SUB->>RISK: Check Risk (<15μs)
    RISK-->>SUB: Pass
    SUB->>ALP: Submit Order (strat_A_sig)
    ALP->>ALP: Fill SPY (Qty = 0.5)
    ALP-->>SUB: Fill Event
    SUB->>DISK: Commit Ledger (strat_A = 0.5)
    
    B->>SUB: Buy SPY (Qty = 0.3)
    SUB->>SUB: Mutate Slice
    SUB->>ALP: Submit Order (strat_B_sig)
    ALP->>ALP: Fill SPY (Qty = 0.3)
    ALP-->>SUB: Fill Event
    SUB->>DISK: Commit Ledger (strat_B = 0.3, Net SPY = 0.8)
```

---

## 3. Deterministic Client Order Signatures

All orders submitted to brokers carry an immutable client order ID encoding origin, strategy attribution, timeframe, and entropy:

### 1. Automated Strategy Order Signature
Format: `strat_<strategy_id>_<timeframe>_<timestamp_ms>_<entropy>`  
Example: `strat_auto_mean_reversion_knn_v0_1h_1756148200000_a9f1b4`

| Segment | Value in Example | Description |
|---|---|---|
| Prefix | `strat` | Identifies autonomous bot provenance |
| `strategy_id` | `auto_mean_reversion_knn_v0` | Canonical strategy registry identifier |
| `timeframe` | `1h` | Strategy operating timeframe (`1h`, `5m`, `1d`) |
| `timestamp_ms` | `1756148200000` | Epoch millisecond dispatch timestamp |
| `entropy` | `a9f1b4` | 6-character random hex string for collision prevention |

### 2. Manual Discretionary CLI Order Signature
Format: `manual_cli_<symbol>_<timestamp_ms>_<entropy>`  
Example: `manual_cli_SPY_1756148200000_c3e8d2`

| Segment | Value in Example | Description |
|---|---|---|
| Prefix | `manual_cli` | Identifies human CLI operator provenance |
| `symbol` | `SPY` | Target market symbol (`SPY`, `BTC/USD`) |
| `timestamp_ms` | `1756148200000` | Epoch millisecond dispatch timestamp |
| `entropy` | `c3e8d2` | 6-character random hex string |

### Signature Regex Decomposers
- **Strategy Parser**: `/^strat_(?<stratId>.+)_(?<tf>\d+[mhd])_(?<ts>\d+)_(?<entropy>[0-9a-f]{6})$/`
- **Manual CLI Parser**: `/^manual_cli_(?<symbol>[A-Z0-9_\/]+)_(?<ts>\d+)_(?<entropy>[0-9a-f]{6})$/`

---

## 4. Physical Broker Fill Reconciliation Algorithm

The reconciliation algorithm enforces exact physical-to-virtual balance equality:

$$Q_{\text{BrokerPhysical}}(S) = \sum_{k \in \text{BotStrategies}} q_k(S) + q_{\text{manual}}(S)$$

### Reconciliation Invariant Cases:
1. **Case A (Exact Match)**: $\sum q_k(S) = Q_{\text{BrokerPhysical}}(S) \implies q_{\text{manual}}(S) = 0$.
2. **Case B (Excess Physical Shares)**: $Q_{\text{BrokerPhysical}}(S) > \sum q_k(S)$.

   $$q_{\text{manual}}(S) := Q_{\text{BrokerPhysical}}(S) - \sum q_k(S)$$

   Excess shares are isolated under manual residual ownership so bots cannot liquidate them.
3. **Case C (Deficit / Under-Allocation)**: $Q_{\text{BrokerPhysical}}(S) < \sum q_k(S)$.
   Fails closed: flags an operational anomaly, pauses automated sell signals, and alerts the operator.

---

## 5. Fractional Unit Sizing & Step Precision Enforcement

To allow sub-$100 allocations on high-priced assets (SPY at $500+, BTC at $60,000+), Sovereign enforces step-precision rounding before order dispatch:

```mermaid
flowchart TD
    ALLOC["Calculated Notional Allocation: $75.00 on SPY ($550.00 / share)"]
    RAW["Raw Target Quantity: $75.00 / $550.00 = 0.1363636... shares"]
    STEP["Step Precision Resolution: resolveInstrumentQuantityStep('SPY') -> 0.001"]
    ROUND["Floor Step Rounding: roundDownToStep(0.1363636, 0.001) -> 0.136 shares"]
    DISP["Step Compliance: (0.136 % 0.001 == 0) -> Dispatched to Broker"]

    ALLOC --> RAW
    RAW --> STEP
    STEP --> ROUND
    ROUND --> DISP
```

---

## 6. Pre-Trade Risk Multi-Tier Circuit Breaker

```mermaid
flowchart TD
    ORDER["Incoming Order Submission"]
    G1["Gate 1: Monotonicity & Value Sanity<br/>Fails if NaN, <= 0 notional, or corrupt timestamp"]
    G2["Gate 2: Portfolio Drawdown Limit<br/>Fails if Drawdown >= 15.0%"]
    G3["Gate 3: Single-Asset Concentration<br/>Fails if (Asset Notional / Total Equity) > 25.0%"]
    G4["Gate 4: Fat-Finger Price Check<br/>Fails if |OrderPrice - ClosePrice| / ClosePrice > 5.0%"]
    G5["Gate 5: Step Alignment Quantization<br/>Clamps quantity to valid exchange lot step"]
    DISP["Order Authorized & Dispatched<br/>(< 15μs Total Evaluation Latency)"]

    ORDER --> G1
    G1 -->|Passes| G2
    G2 -->|Passes| G3
    G3 -->|Passes| G4
    G4 -->|Passes| G5
    G5 --> DISP
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
| **MT5 IPC NDJSON Bridge Engine**    | 0.02 CPU | `< 6.0 MB` heap | **`< 1.2 ms`** loopback | Zero disk I/O | $O(1)$ socket framing | **2/10** |

---

## 8. MetaTrader 5 (MT5) Execution Architecture & 64-Bit ORDER_MAGIC Attribution

MetaTrader 5 execution operates through a high-performance native IPC bridge between the Node.js execution gateway and an MQL5 Expert Advisor (`SovereignTradeBridge.mq5`).

```mermaid
flowchart TD
    subgraph Gateway["Node.js Execution Gateway (backend/gateway/src/adapters/mt5_adapter.ts) [Load: 2/10]"]
        TCP["Persistent TCP Server<br/>127.0.0.1:8282 (NDJSON Framing)"]
        MAGIC["MagicCodec Encoder<br/>64-bit ORDER_MAGIC Bitmask"]
        NONCE["Nonce Router & Request Map<br/>Timeout: 15,000ms"]
    end

    subgraph EA["MQL5 Expert Advisor Bridge (tools/mt5/SovereignTradeBridge.mq5) [Load: 2/10]"]
        SOCK["Client Socket (SocketConnect)<br/>OnTimer(50ms) Polling Loop"]
        NORM["Lot Sizer & Normalizer<br/>Step / Min / Max / Contract Size"]
        FILL["Dynamic Filling Resolver<br/>IOC / FOK / RETURN"]
        ECN["ECN Two-Step Order Flow<br/>Market Deal -> Modify SL/TP"]
    end

    subgraph Terminal["MetaTrader 5 Terminal64 (/portable)"]
        BOOK["Broker Match Engine"]
        POS["Hedging / Netting Position Ledger"]
    end

    TCP <-->|NDJSON Frames| SOCK
    MAGIC --> TCP
    NONCE --> TCP
    SOCK --> NORM
    NORM --> FILL
    FILL --> ECN
    ECN --> BOOK
    BOOK --> POS
```

### 1. Inverted Socket Topology
Native MQL5 network functions are strictly client-only (`SocketCreate`, `SocketConnect`, `SocketSend`, `SocketRead`). Native MQL5 has no server socket capabilities (`SocketListen`/`SocketAccept` do not exist). Sovereign inverts the topology:
- **Server**: Node.js `Mt5Adapter` hosts a localhost TCP server on port 8282 using newline-delimited JSON (`NDJSON`).
- **Client**: `SovereignTradeBridge.mq5` connects outbound on initialization and polls incoming commands inside `OnTimer(50ms)` via `EventSetMillisecondTimer(50)`. Running inside `OnTimer` rather than `OnTick` prevents the bridge from going deaf during weekend and holiday market closures.

### 2. 64-Bit ORDER_MAGIC Bitmask Codec
Broker comment fields (`ORDER_COMMENT`) are truncated to 31 characters and frequently overwritten during broker-side rollovers, dividend adjustments, and partial fills. Strategy attribution is preserved using an immutable 64-bit integer bitmask:

```text
Bits [63..48] (16 bits): Sovereign System ID (0x534F = "SO", bit 63 is 0 for positive signed logs)
Bits [47..32] (16 bits): Strategy ID Hash (CRC16 of strategy identifier string or uint16)
Bits [31..16] (16 bits): Timeframe in minutes (1, 5, 15, 60, 240, 1440)
Bits [15..0]  (16 bits): Sub-Position Instance / Ticket ID
```

### 3. Dynamic Lot Normalization & Filling Mode Resolution
- **Contract Size & Volume Step**: Before placing an order, the EA dynamically queries `SYMBOL_TRADE_CONTRACT_SIZE`, `SYMBOL_VOLUME_MIN`, `SYMBOL_VOLUME_MAX`, and `SYMBOL_VOLUME_STEP`. Notional base quantities are converted to lots and normalized:

  $$\text{Lots} = \max\left(\text{Vol}_{\min}, \min\left(\text{Vol}_{\max}, \left\lfloor\frac{\text{Quantity} / \text{ContractSize}}{\text{Step}}\right\rfloor \times \text{Step}\right)\right)$$

- **Filling Modes**: Hardcoding `ORDER_FILLING_FOK` triggers broker rejection `10030` (`TRADE_RETCODE_INVALID_FILL`) on retail STP/ECN accounts. The EA queries `SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE)` and dynamically selects `ORDER_FILLING_IOC`, `ORDER_FILLING_FOK`, or `ORDER_FILLING_RETURN`.

### 4. ECN Two-Step Market Execution
On Market Execution brokers (`SYMBOL_TRADE_EXECUTION_MARKET`), sending Stop Loss or Take Profit in the initial market deal triggers fatal broker rejection (`10016` / `TRADE_RETCODE_INVALID_STOPS`). The EA submits the initial market order with `sl=0, tp=0`, awaits fill confirmation, and immediately modifies the position ticket with SL/TP via `TRADE_ACTION_SLTP`.

