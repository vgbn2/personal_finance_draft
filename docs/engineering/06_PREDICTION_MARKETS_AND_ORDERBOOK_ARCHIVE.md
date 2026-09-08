# 06. Prediction Markets & Polymarket Orderbook Archiving

This document specifies the prediction market data ingestion architecture, Polymarket CLOB and Gamma feeds, sub-second orderbook snapshot archiving, the virtual paper trading simulator, and oracle resolution settlement.

---

## 1. Polymarket Ingestion & Archiving Pipeline

Prediction markets present unique market dynamics: outcome tokens (e.g. `YES` / `NO`) trade bounded strictly between $\$0.00$ and $\$1.00$, representing implied probabilities, with high-frequency orderbook updates and discrete binary settlement.

```text
+----------------------------------------------------------------------------------------------------+
|                               POLYMARKET INGESTION & ARCHIVE PIPELINE                              |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ Ingestion Feeds ]                                                                               |
|  ├── Gamma API: Market discovery, token metadata, volume, question resolution status               |
|  └── CLOB WebSocket / REST: Level-2 Orderbook (bids/asks), trade tick stream                       |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ Normalization & Compression Engine (`shared/lib/market/polymarket_history.js`) ]                |
|  ├── Price Normalization: Clamps all prices strictly to $[0.0000, 1.0000]$                         |
|  ├── Midpoint & Spread Calculation: $P_{\text{mid}} = \frac{P_{\text{bid}} + P_{\text{ask}}}{2}$  |
|  └── 1-Second Orderbook Snapshot Aggregator: Top-5 bid/ask levels + volume depth                  |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ High-Density Binary & JSONL Storage ]                                                           |
|  ├── `storage/data/ts/<token_id>_1s.bin`: Binary SOVT 1s probability bars                          |
|  └── `storage/data/archive/polymarket/<market_id>_orderbook.jsonl`: L2 snapshot event stream        |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Orderbook Data Model & Probability Pricing

Unlike equity continuous double auctions where prices can grow unboundedly, prediction market orderbooks model probability mass functions:

```text
+----------------------------------------------------------------------------------------------------+
|                                 L2 PROBABILITY ORDERBOOK MODEL                                     |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  ASKS (Sellers of YES / Buyers of NO at $1.00 - P)                                                 |
|  ├── Level 3: $0.6200  |  Size: 15,000 shares  ($9,300 notional)                                   |
|  ├── Level 2: $0.6150  |  Size:  8,500 shares  ($5,227 notional)                                   |
|  └── Level 1: $0.6100  |  Size:  4,200 shares  ($2,562 notional)  <-- Best Ask ($P_{\text{ask}}$)  |
|                                                                                                    |
|  -------------------------------- SPREAD: $0.0150 (1.5%) ----------------------------------------- |
|                                                                                                    |
|  BIDS (Buyers of YES / Sellers of NO)                                                              |
|  ├── Level 1: $0.5950  |  Size:  5,000 shares  ($2,975 notional)  <-- Best Bid ($P_{\text{bid}}$)  |
|  ├── Level 2: $0.5900  |  Size: 12,000 shares  ($7,080 notional)                                   |
|  └── Level 3: $0.5850  |  Size: 20,000 shares ($11,700 notional)                                   |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

### Mathematical Definitions
$$\text{Midpoint Probability}: P_{\text{mid}} = \frac{P_{\text{best\_bid}} + P_{\text{best\_ask}}}{2}$$
$$\text{Bid-Ask Spread}: S = P_{\text{best\_ask}} - P_{\text{best\_bid}}$$
$$\text{Implied Probability of Outcome}: \pi(\text{YES}) = P_{\text{mid}}, \quad \pi(\text{NO}) = 1.00 - P_{\text{mid}}$$

---

## 3. Virtual Prediction Paper Trading Simulator (`backend/gateway/src/paper_ledger.js`)

To test prediction strategies locally without capital risk, Sovereign maintains an append-only, checksummed virtual paper ledger:

```text
+----------------------------------------------------------------------------------------------------+
|                                VIRTUAL PREDICTION PAPER LEDGER                                     |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ Append-Only Chained Event Log (`storage/data/runtime/paper_ledger.jsonl`) ]                     |
|  ├── Event 0: {"seq": 0, "type": "DEPOSIT", "amount": 10000.0, "ts": 1756140000000}              |
|  ├── Event 1: {"seq": 1, "type": "BUY", "token": "0xABC...", "qty": 500, "price": 0.60, "fee": 0}|
|  └── Event 2: {"seq": 2, "type": "RESOLVE", "token": "0xABC...", "outcome": 1.0, "payout": 500.0} |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ Atomic Rebuildable State Projection (`portfolio.v1.json`) ]                                     |
|  ├── `cash_balance`: Available USD collateral                                                      |
|  ├── `positions`: Map of `{ token_id -> { shares, avg_entry_price, cost_basis } }`                |
|  └── `sequence_checksum`: SHA-256 state digest preventing unverified state mutations               |
+----------------------------------------------------------------------------------------------------+
```

---

## 4. Oracle Resolution & Binary Payout Settlement

Upon market expiration, the oracle (e.g. UMA optimistic oracle or Polymarket resolution contract) reports the binary settlement outcome $Y \in \{0, 1\}$:

```text
[Oracle Resolution Event: Outcome = 1 (YES won)]
       │
       ▼
[Payout Calculation]: Payout = Quantity * $1.00
       │
       ▼
[Realized P&L Calculation]: Realized PnL = Payout - Cost Basis - Fees
       │
       ▼
[Ledger Event Dispatch]: Append 'RESOLVE' Event -> Credit Cash Balance -> Close Position
```

### Settlement Mathematics
$$\text{Binary Payout} = \begin{cases} Q \times \$1.00 & \text{if Target Outcome} = \text{Resolved Outcome} \\ \$0.00 & \text{otherwise} \end{cases}$$
$$\text{Realized P\&L} = \text{Payout} - (Q \times P_{\text{entry}}) - \text{Fees}$$

---

## 5. Subsystem Load Indices & Performance Benchmarks

| Subsystem Component | CPU Utilization | Memory / RSS | Latency / SLA | Disk I/O Bandwidth | Complexity |
|---|---|---|---|---|---|
| **CLOB WebSocket Feed Ingest**     | 0.05–0.1 CPU | `< 25.0 MB` heap | `< 10 ms` frame parse | $15–40\text{ KB/s}$ network | $O(1)$ stream |
| **1s Orderbook Snapshot Archive**  | 0.1 CPU | `< 30.0 MB` heap | `< 2.0 ms` snapshot write | Append-only JSONL write | $O(\text{depth})$ |
| **Virtual Paper Order Execution**  | < 0.02 CPU | `< 5.0 MB` heap | **`< 1.0 ms`** per trade | JSONL log append | $O(1)$ constant |
| **Oracle Settlement Processing**   | < 0.01 CPU | `< 4.0 MB` heap | `< 3.0 ms` per market | Atomic projection update | $O(\text{positions})$ |
