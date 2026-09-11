# 08. Financial & Quantitative Primer for Systems Engineers

This document provides a rigorous, foundational guide bridging financial market mechanics, quantitative metrics, market microstructure, and algorithmic trading concepts to distributed systems and software engineering mental models.

---

## 1. Executive Summary & The Systems Engineering Mental Model

Financial markets can be understood entirely through core computer science and distributed systems concepts:

| Distributed Systems / CompSci | Financial / Quantitative Trading Equivalent | Load Rating |
|---|---|:---:|
| Priority Queue / Ring Buffer | Central Limit Order Book (L2/L3 Bids and Asks Queue) | **5/10** |
| Rate Limiter / Circuit Breaker | Pre-Trade Risk Engine / Maximum Drawdown Kill-Switch | **1/10** |
| Distributed Consensus Log | Broker Trade Fill Event Stream / Append-Only Ledger | **2/10** |
| Packet Loss & Transmission Jitter | Slippage & Market Impact (Cost of Execution) | **3/10** |
| Clock Synchronization / Skew | Lookahead Bias / Timestamp Drift across Bar Resolutions | **2/10** |
| Distributed Partition Tolerance | Multi-Account Sub-Position Attribution on Single Broker | **2/10** |
| Binary Decision Classification | Prediction Markets / Binary Outcome Oracle Resolution | **1/10** |
| Signal-to-Noise Ratio (SNR) | Sharpe Ratio / Information Ratio / Alpha Extraction | **4/10** |

---

## 2. Market Mechanics & Order Flow

### 2.1 The Central Limit Order Book (CLOB) Microstructure

A market is a continuous double-auction mechanism matching buyers (bids) and sellers (asks) sorted by price-time priority:

| Bids Orders | Bids Qty | Queue Depth | Bid Price | Spread | Ask Price | Queue Depth | Asks Qty | Asks Orders | Level |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 4 | 150 | `$75,030` | **`$500.20`** | **`$0.05`** (1.0 bps) | **`$500.25`** | `$100,050` | 200 | 3 | **Level 1 (Best Bid/Ask)** |
| 2 | 80 | `$40,012` | `$500.15` | — | `$500.30` | `$225,135` | 450 | 7 | Level 2 |
| 9 | 320 | `$160,032` | `$500.10` | — | `$500.40` | `$60,048` | 120 | 2 | Level 3 |
| 1 | 50 | `$25,002` | `$500.05` | — | `$500.50` | `$300,300` | 600 | 11 | Level 4 |

- **Bid**: The maximum price a buyer is willing to pay.
- **Ask (Offer)**: The minimum price a seller is willing to accept.
- **Spread**: The difference between the lowest Ask and the highest Bid:

  $$\text{Spread} = P_{\text{best\_ask}} - P_{\text{best\_bid}}$$

- **Mid Price**: The arithmetic mean between the best bid and best ask:

  $$P_{\text{mid}} = \frac{P_{\text{best\_bid}} + P_{\text{best\_ask}}}{2}$$

### 2.2 Order Types & Matching Engine Semantics

| Order Type | CS / Systems Analogy | Market Behavior & Matching Semantics |
|---|---|---|
| **Market Order** | Eager / Non-blocking Read (Guaranteed Immediate Match) | Consumes liquidity immediately across L1..LK depth levels. Subject to slippage; pays exchange taker fees. |
| **Limit Order** | Enqueue / Deferred Promise (Guaranteed Price Ceiling) | Enqueues liquidity into orderbook queue at bounded price. Executes only when crossed; earns liquidity maker rebates. |
| **Fill-or-Kill (FOK)** | Atomic Transaction (Commit or Rollback) | Must fill 100% of quantity immediately against resting book, or the entire order is immediately cancelled. |
| **Immediate-or-Cancel (IOC)** | Partial Non-blocking Drain | Fills available quantity at price, cancels remaining balance without resting in the queue. |

### 2.3 Slippage and Execution Drag

**Slippage** is the difference between the expected price of a trade and the actual execution price resulting from book depth consumption:

Incoming Market Buy: $Q_{\text{target}} = 500\text{ units}$ against book with top-of-book at $\$100.00$:

| Orderbook Depth Level | Available Qty | Fill Price | Cumulative Filled | Level Notional | Cumulative Notional |
|---|:---:|:---:|:---:|:---:|:---:|
| Level 1 Ask | 200 units | `$100.00` | 200 | `$20,000.00` | `$20,000.00` |
| Level 2 Ask | 200 units | `$100.10` | 400 | `$20,020.00` | `$40,020.00` |
| Level 3 Ask | 100 units | `$100.25` | 500 | `$10,025.00` | `$50,045.00` |

- **Total Execution Cost**: `$50,045.00` for 500 units
- **Volume Weighted Average Price (VWAP)**: $\frac{\$50,045.00}{500} = \$100.09$
- **Initial Top-of-Book Price**: `$100.00`
- **Realized Slippage**: $+\$0.09$ (+9 basis points / 0.09% execution drag)

In the Sovereign Native Core (`backend/core/src/risk/cost_model.cpp`), slippage is modeled in basis points ($1 \text{ bps} = 0.01\% = 0.0001$):

$$P_{\text{entry}} = P_{\text{close}} \cdot \left(1 + \frac{\text{cost\_bps}}{10000}\right)$$

---

## 3. Market Data Structures & Time Series

### 3.1 Candlestick (OHLCV) Anatomy

Financial time series discretize continuous quote ticks into fixed time buckets called **OHLCV** bars:

| Candlestick Component | Bullish Bar ($\text{Close} \ge \text{Open}$) | Bearish Bar ($\text{Close} < \text{Open}$) | Structural Definition |
|---|---|---|---|
| **Upper Shadow (Wick)** | $\text{High} - \text{Close}$ | $\text{High} - \text{Open}$ | Range above the real body |
| **Real Body Top** | $\text{Close}$ | $\text{Open}$ | Higher of open or close |
| **Real Body Bottom** | $\text{Open}$ | $\text{Close}$ | Lower of open or close |
| **Lower Shadow (Wick)** | $\text{Open} - \text{Low}$ | $\text{Close} - \text{Low}$ | Range below the real body |
| **Total Range (High - Low)** | $H - L$ | $H - L$ | Full price excursion over interval |
| **Volume ($V$)** | Cumulative volume traded | Cumulative volume traded | Total asset units exchanged |

### 3.2 Returns & Compounding
Never analyze raw asset prices directly across assets because price scales differ ($SPY \approx \$500$, $BTC \approx \$60,000$). Instead, analyze **Returns**:

- **Simple Arithmetic Return**:

  $$R_t = \frac{P_t - P_{t-1}}{P_{t-1}} = \frac{P_t}{P_{t-1}} - 1$$

- **Logarithmic (Continuously Compounded) Return**:

  $$r_t = \ln\left(\frac{P_t}{P_{t-1}}\right) = \ln(P_t) - \ln(P_{t-1})$$

---

## 4. Quantitative Performance Metrics & Portfolio Math

| Time Period | Event | Equity ($E_t$) | High-Water Mark ($\text{HWM}$) | Current Drawdown ($DD_t$) |
|---|---|:---:|:---:|:---:|
| $t_0$ | Initial Capital | `$100,000` | `$100,000` | `0.0%` |
| $t_1$ | Peak 1 | `$120,000` | `$120,000` | `0.0%` |
| $t_2$ | Drawdown Trough | `$60,000` | `$120,000` | **`-50.0%` (Maximum Drawdown)** |
| $t_3$ | Recovery | `$100,000` | `$120,000` | `-16.7%` |
| $t_4$ | New All-Time High | `$125,000` | `$125,000` | `0.0%` |

### 4.1 Sharpe Ratio (Signal-to-Noise Ratio of Excess Returns)
The Sharpe ratio measures excess return per unit of total risk (volatility):

$$\text{Sharpe} = \frac{\mathbb{E}[R_p - R_f]}{\sigma(R_p)} \cdot \sqrt{K}$$

- $R_p$: Portfolio return, $R_f$: Risk-free interest rate ($\approx 4\%$).
- $\sigma(R_p)$: Standard deviation of returns.
- $K$: Annualization factor ($K = 252$ daily bars, $K = 19,656$ 5-minute bars).

### 4.2 Sortino Ratio (Downside Volatility Focus)
The **Sortino Ratio** penalizes only harmful downside volatility:

$$\text{Sortino} = \frac{\mathbb{E}[R_p - R_f]}{\sigma_{\text{downward}}(R_p)} \cdot \sqrt{K}$$

$$\sigma_{\text{downward}} = \sqrt{\frac{1}{T} \sum_{t=1}^T \min(0, R_t - R_f)^2}$$

### 4.3 Maximum Drawdown (MDD)
The peak-to-trough decline in portfolio equity:

$$\text{Drawdown}(t) = \frac{\max_{s \le t}(E_s) - E_t}{\max_{s \le t}(E_s)}$$

$$\text{MDD} = \max_{t \in [0, T]} \left( \text{Drawdown}(t) \right)$$

---

## 5. Prediction Markets & Binary Derivatives

In prediction markets (e.g. Polymarket), contracts represent binary event outcomes resolving to either $\$1.00$ (YES won) or $\$0.00$ (NO won):

Market Example: *"Will the Federal Reserve cut interest rates in September 2026?"*

| Contract Outcome | Implied Market Probability | Contract Unit Price | Payout If Outcome Resolves True | Net Profit / Return | Payout If Outcome Resolves False | Net Loss / Return |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **YES** | 65.0% | `$0.65` | `$1.00` | `+$0.35` (+53.8%) | `$0.00` | `-$0.65` (-100.0%) |
| **NO** | 35.0% | `$0.35` | `$1.00` | `+$0.65` (+185.7%) | `$0.00` | `-$0.35` (-100.0%) |

- **Arbitrage Parity Bound**: $P(\text{YES}) + P(\text{NO}) = \$1.00$
- **Kelly Criterion Staking Formula**:

  $$f^* = \frac{p \cdot b - q}{b} = \frac{p(b + 1) - 1}{b}, \quad \text{where } b = \frac{1.0 - P_{\text{entry}}}{P_{\text{entry}}}$$

---

## 6. Subsystem Load Indices & Complexity Index

| Operation / Concept | CPU Profile | RAM Footprint | Disk & Network I/O | Complexity | Load Score (1–10) |
|---|---|---|---|---|:---:|
| **OHLCV Bar Aggregation** | 1 Core (<2% CPU) | < 5 MB Heap | Streaming binary SOVT | $O(N) / O(1)$ | **2/10** |
| **Technical Indicator DSP** | 1 Core (<5% CPU) | < 8 MB Heap | In-memory SIMD array | $O(N) / O(1)$ | **2/10** |
| **L2 Orderbook Depth Parse** | 1 Core (<10% CPU)| < 12 MB RSS | 1s WebSocket stream | $O(L) / O(L)$ | **3/10** |
| **Monte Carlo Resampling** | Multi-thread (4-8) | < 8 MB RSS | Pure in-memory PRNG | $O(\text{runs} \times N)$ | **6/10** |
| **Sharpe / Sortino Math** | < 0.01 CPU | Negligible | In-memory pass | $O(N)$ linear | **1/10** |
