# Module: Market Data & Research Invariants Specification

> **Status:** Implemented  
> **Audience:** Quantitative Researchers, Algorithmic Developers, Risk Analysts  
> **Canonical owners:** `shared/lib/strategy/backtest.js`, `shared/lib/data/macro_store.js`, `shared/lib/market/indicators.js`  
> **Review triggers:** Backtesting timeframes, time-zone handling, numeric precision conventions, indicator kernels  

## Purpose And Non-Goals

This specification defines the foundational mathematical, temporal, and economic invariants required for honest, lookahead-free market simulation and backtesting across traditional equities, crypto, and prediction markets.

**Goals:**
- Formally document seven core market data invariants, exercised alongside related edge cases by 15 native test assertions.
- Prevent subtle backtesting traps: revision lookahead, interval double-counting, float rounding drift, and fabricated availability.
- Provide a standardized test harness in Node's native test runner (`tests/run_node_tests.js`).

**Non-Goals:**
- It is not an alpha-generation strategy or signal optimizer.
- It does not replace low-level C++ binary codecs (`backend/core/`).

---

## The 7 Core Research Invariants

### 1. Half-Open Interval Bar Partitioning
- **Rule**: Every aggregated time bar (1m, 1h, 1d) represents a half-open interval $[t_{\text{start}}, t_{\text{end}})$.
- **Invariant**: A tick at exact instant $t_{\text{end}}$ belongs to the *subsequent* bar, never both. Boundary ticks must never be double-counted in volume or OHLC bounds.

### 2. UTC Primacy & Daylight Saving Disambiguation
- **Rule**: All stored and evaluated timestamps must be UTC ISO-8601 strings or millisecond timestamps.
- **Invariant**: Local wall-clock times (e.g. US Eastern `America/New_York`) must be mapped to UTC immediately upon ingestion. "Fall-back" duplicate hours and "spring-forward" missing hours must never corrupt bar sequencing.

### 3. Exact Decimal Scaling vs IEEE 754 Floating-Point Drift
- **Rule**: Prices and account balances must be rounded or scaled to fixed decimal precision (e.g. 6 decimal places in fiat, 8 in crypto).
- **Invariant**: Financial calculations must prevent floating-point representation drift (e.g. $0.1 + 0.2 \neq 0.30000000000000004$) from failing equality checks or accumulating phantom cents over long backtest runs.

### 4. Bitemporal Point-In-Time Availability (As-Of Filtering)
- **Rule**: Historical data must distinguish $t_{\text{event}}$ (period end), $t_{\text{publication}}$ (official release), and $t_{\text{receipt}}$ (local collection).
- **Invariant**: Backtests evaluated at decision time $T_{\text{decision}}$ must filter:
  $$\text{Record is visible} \iff t_{\text{publication}} \le T_{\text{decision}} \quad \text{and} \quad t_{\text{receipt}} \le T_{\text{decision}}$$
  Future revisions or late filings must not leak into historical simulated decisions.

### 5. Asymmetric Return Recovery
- **Rule**: Drawdown and recovery calculations are mathematically asymmetric:
  $$R_{\text{recovery}} = \frac{D}{1 - D} \quad \text{where } D \in [0, 1) \text{ is drawdown percentage}$$
- **Invariant**: A strategy losing $50\%$ ($D=0.50$) requires a $100\%$ return to break even, not $50\%$. Backtest reporting must never present symmetric return assumptions.

### 6. Missing Mark is Unavailable, Not Zero
- **Rule**: If an instrument has no active trades, quotes, or resolutions at time $T$, its mark price is `null` / `unavailable`.
- **Invariant**: Missing marks must never be coerced to `0.00`. Coercing missing marks to zero triggers catastrophic false liquidation signals and artificial -100% drawdown spikes.

### 7. Funding Rate Cashflow Separation
- **Rule**: Perpetual crypto futures funding rates are discrete periodic cash transfers, not trade price adjustments.
- **Invariant**: Funding payments must adjust available cash balance independently, leaving the original position entry price and size unaltered.

---

## Entrypoints And Public Contracts

| Surface | Owner | Contract |
|---|---|---|
| `selectMacroObservationsAsOf(records, asOf)` | `shared/lib/data/macro_store.js` | Returns strictly point-in-time eligible macro observations as of time $T$. |
| `withinDateRange(row, from, to)` | `shared/lib/strategy/backtest.js` | Enforces chronological boundary filtering on feature frames. |
| `market_invariants.test.js` | `tests/scripts/integration/research_invariants/` | Native test suite exercising all 7 invariants against synthetic edge cases. |

---

## Dependencies And Data Flow

```text
Raw Market Observations
       │
       ▼
UTC Normalization & Decimal Scaling ──► [Invariant 2 & 3]
       │
       ▼
Half-Open Bar Aggregator ─────────────► [Invariant 1]
       │
       ▼
Bitemporal As-Of Filter ──────────────► [Invariant 4]
       │
       ▼
Strategy Decision & Backtest Engine ──► [Invariants 5, 6, 7]
```

---

## Tests And Evidence

- **Native Test Runner**:
  ```bash
  node tests/run_node_tests.js tests/scripts/integration/research_invariants/market_invariants.test.js
  ```
- **Coverage**: 15 assertions covering the seven core invariants plus orderbook depth replacement, sequence-gap invalidation, inverse-versus-linear contract PnL, and stock-split neutrality.
  - Boundary tick uniqueness in $[t_{\text{start}}, t_{\text{end}})$.
  - Point-in-time revision filtering without future leakage.
  - Asymmetric recovery calculations ($D=0.20 \to +25\%$, $D=0.50 \to +100\%$, $D=0.75 \to +300\%$).
  - Missing mark propagation vs zero coercion.
