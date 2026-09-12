# 06. Prediction Markets & Polymarket Orderbook Archiving

This document specifies the prediction market data ingestion architecture, Polymarket CLOB and Gamma feeds, sub-second orderbook snapshot archiving, the virtual paper trading simulator, and oracle resolution settlement.

---

## 1. Polymarket Ingestion & Archiving Pipeline

Prediction markets present unique market dynamics: outcome tokens (e.g. `YES` / `NO`) trade bounded strictly between $\$0.00$ and $\$1.00$, representing implied probabilities, with high-frequency orderbook updates and discrete binary settlement.

```mermaid
flowchart TD
    subgraph Feeds["Ingestion Feeds"]
        GAMMA["Gamma API: Market discovery, token metadata, volume, question resolution status [Load: 2/10]"]
        CLOB["CLOB WebSocket / REST: Level-2 Orderbook (bids/asks), trade tick stream [Load: 4/10]"]
    end

    subgraph Norm["Normalization & Compression Engine (shared/lib/market/polymarket_history.js) [Load: 3/10 | SLA: <10ms]"]
        N1["1. Probability Clamp: Enforce P in [0.0000, 1.0000] for all bid/ask prices"]
        N2["2. Midpoint & Spread Calculation: P_mid = (P_bid + P_ask) / 2, S = P_ask - P_bid"]
        N3["3. 1-Second Snapshot Aggregator: Top-5 bid/ask levels + volume depth into ring buffer"]
    end

    subgraph Storage["High-Density Binary & JSONL Storage [Load: 2/10 | Append-Only Stream]"]
        BIN[("storage/data/ts/<token_id>_1s.bin<br/>Binary SOVT 1s probability bars (48-byte records)")]
        JSONL[("storage/data/archive/polymarket/<market_id>_orderbook.jsonl<br/>L2 snapshot event stream")]
    end

    Feeds --> Norm
    Norm --> Storage
```

---

## 2. Orderbook Data Model & Probability Pricing

Unlike equity continuous double auctions where prices can grow unboundedly, prediction market orderbooks model probability mass functions:

| Side | Level | Price | Size (Shares) | Implied Notional | Role |
|:---:|:---:|:---:|:---:|:---:|---|
| **ASK** | Level 3 | `$0.6200` | 15,000 | `$9,300` | Deep liquidity |
| **ASK** | Level 2 | `$0.6150` | 8,500 | `$5,227` | Mid liquidity |
| **ASK** | Level 1 | `$0.6100` | 4,200 | `$2,562` | **Best Ask ($P_{\text{ask}}$)** |
| **SPREAD** | — | **`$0.0150`** | — | **1.5% Implied Cost** | Bid-Ask Spread ($S$) |
| **BID** | Level 1 | `$0.5950` | 5,000 | `$2,975` | **Best Bid ($P_{\text{bid}}$)** |
| **BID** | Level 2 | `$0.5900` | 12,000 | `$7,080` | Mid liquidity |
| **BID** | Level 3 | `$0.5850` | 20,000 | `$11,700` | Deep liquidity |

### Mathematical Definitions

$$\text{Midpoint Probability}: P_{\text{mid}} = \frac{P_{\text{best\_bid}} + P_{\text{best\_ask}}}{2}$$

$$\text{Bid-Ask Spread}: S = P_{\text{best\_ask}} - P_{\text{best\_bid}}$$

$$\text{Implied Probability of Outcome}: \pi(\text{YES}) = P_{\text{mid}}, \quad \pi(\text{NO}) = 1.00 - P_{\text{mid}}$$

---

## 3. Orderbook Snapshot & Delta Reconstruction Sequence

```mermaid
sequenceDiagram
    autonumber
    participant WS as Polymarket CLOB WS
    participant BUF as WS Ingest Buffer
    participant RING as RingBuffer L2 Book
    participant DISK as JSONL Archive Disk
    participant BIN as SOVT 1s Binary

    WS->>BUF: WS Snapshot (L2 Depth 10)
    BUF->>RING: Populate Full Book Base
    WS->>BUF: WS Delta Tick (Price, Size, Side)
    BUF->>RING: Apply Delta Update Level
    RING->>RING: 1s Timer Tick
    RING->>DISK: Extract Top-5 L2 Snapshot JSON (orderbook.jsonl)
    RING->>BIN: Synthesize 1s SOVT OHLCV Bar (<id>_1s.bin)
```

---

## 4. Virtual Prediction Paper Trading Simulator (`backend/gateway/src/paper_ledger.js`)

To test prediction strategies locally without capital risk, Sovereign maintains an append-only, checksummed virtual paper ledger:

```mermaid
flowchart TD
    subgraph Log["Append-Only Chained Event Log (storage/data/runtime/paper_trading/events.jsonl) [Load: 1/10]"]
        E0["seq: 0 | DEPOSIT | amount: 10000.0 | ts: 1756140000000"]
        E1["seq: 1 | BUY | token: 0xABC... | qty: 500 | price: 0.60 | fee: 0"]
        E2["seq: 2 | RESOLVE | token: 0xABC... | outcome: 1.0 | payout: 500.0"]
    end

    subgraph State["Atomic Rebuildable State Projection (storage/data/runtime/portfolio.v1.json) [Load: 1/10 | SLA: <1.0ms]"]
        P1["cash_balance: Available USD collateral balance"]
        P2["positions: Map of { token_id -> { shares, avg_entry_price, cost_basis } }"]
        P3["sequence_checksum: Rolling SHA-256 state digest H_n = SHA256(H_n-1 || Event_n)"]
    end

    Log -->|Sequential Replay / Real-time Ingestion| State
```

---

## 5. Oracle Resolution & Binary Payout Settlement

Upon market expiration, the oracle (e.g. UMA optimistic oracle or Polymarket resolution contract) reports the binary settlement outcome $Y \in \{0, 1\}$:

```mermaid
flowchart TD
    RES["Oracle Resolution Event: Outcome = 1 (YES won)"]
    PAY["Payout Calculation: Payout = Quantity * $1.00"]
    PNL["Realized P&L Calculation: Realized PnL = Payout - Cost Basis - Fees"]
    DISP["Ledger Event Dispatch: Append 'RESOLVE' Event -> Credit Cash Balance -> Close Position"]

    RES --> PAY
    PAY --> PNL
    PNL --> DISP
```

### Settlement Mathematics

$$\text{Binary Payout} = \begin{cases} Q \times 1.00 & \text{if Target Outcome} = \text{Resolved Outcome} \\ 0.00 & \text{otherwise} \end{cases}$$

$$\text{Realized P\&L} = \text{Payout} - (Q \times P_{\text{entry}}) - \text{Fees}$$

---

## 6. Subsystem Load Indices & Performance Benchmarks

| Subsystem Component | CPU Utilization | Memory / RSS | Latency / SLA | Disk I/O Profile | Complexity | Load Score (1–10) |
|---|---|---|---|---|---|:---:|
| **CLOB WebSocket Feed Ingest**     | 0.05–0.1 CPU | `< 25.0 MB` heap | `< 10 ms` frame parse | $15–40\text{ KB/s}$ network | $O(1)$ stream | **3/10** |
| **1s Orderbook Snapshot Archive**  | 0.1 CPU | `< 30.0 MB` heap | `< 2.0 ms` snapshot write | Append-only JSONL write | $O(\text{depth})$ | **3/10** |
| **Virtual Paper Order Execution**  | < 0.02 CPU | `< 5.0 MB` heap | **`< 1.0 ms`** per trade | JSONL log append | $O(1)$ constant | **1/10** |
| **Oracle Settlement Processing**   | < 0.01 CPU | `< 4.0 MB` heap | `< 3.0 ms` per market | Atomic projection update | $O(\text{positions})$ | **1/10** |
