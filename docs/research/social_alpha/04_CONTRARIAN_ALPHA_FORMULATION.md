# 04. Contrarian Alpha & Backtesting Formulation

## Core Hypothesis

Retail financial content tends to peak in bullish enthusiasm during distribution phases at market tops and peak in bearish capitulation at market bottoms. 

> **Hypothesis**: Taking a contrarian bias against extreme consensus retail sentiment when confirmed by technical divergence yields positive risk-adjusted excess returns ($\text{Sharpe} > 1.2$, $\text{MaxDD} < 15\%$).

---

## Contrarian Signal Generation Logic

```
   Composite Retail Sentiment A_i(t)
                │
    ┌───────────┴───────────┐
    │                       │
 A_i(t) > +0.70         A_i(t) < -0.70
 (Retail Euphoria)     (Retail Panic)
    │                       │
    ▼                       ▼
 RSI(14) > 70 ?         RSI(14) < 30 ?
    │                       │
    ├─► YES: Contrarian     ├─► YES: Contrarian
    │        SHORT bias     │        LONG bias
    │                       │
    └─► NO: Filter out      └─► NO: Filter out
            (Trend continuation risk)
```

### Signal States & Actions

| Metric | Condition 1 | Condition 2 | Technical Gate | Execution Bias |
|---|---|---|---|---|
| **Contrarian Short** | $A_i(t) \ge +0.70$ | Social volume $2\sigma$ above 30d mean | $RSI(14) \ge 70$ or Bearish Divergence | Bias: `SELL` / `SHORT` |
| **Contrarian Long** | $A_i(t) \le -0.70$ | Social volume $2\sigma$ above 30d mean | $RSI(14) \le 30$ or Bullish Divergence | Bias: `BUY` / `LONG` |
| **Neutral / Hold** | $-0.70 < A_i(t) < +0.70$ | Normal volume | Any | Bias: `NEUTRAL` |

---

## Anti-Shill & Liquidity Constraints

To prevent being manipulated by coordinated pump-and-dump schemes on low-liquidity tokens/equities:

1. **Volume Floor**: Minimum 24-hour trailing exchange volume of $\$10,000,000\text{ USD}$. Any asset below this liquidity floor is automatically blacklisted.
2. **Promotional Tag Blacklist**: Any signal tagged with `is_promotional: true` by the extraction parser is immediately dropped.
3. **Creator Diversity Cap**: A single creator cannot contribute more than $25\%$ of the total aggregate sentiment weight for any single asset:
   $$\min\left(W_c, 0.25 \sum_{j=1}^M W_j\right)$$

---

## Pre-Trade Risk & Sizing Controls

When a social alpha contrarian signal passes all gating filters and enters the virtual paper ledger:

- **Max Notional Allocation**: Max $1.0\%$ of total portfolio equity per individual social trade idea.
- **Stop-Loss Invalidation**: Mandatory hard stop-loss placed at the dynamic invalidation price extracted from transcript or $2.0 \times \text{ATR}(14)$, whichever is tighter.
- **Profit Target**: Staged limit orders placed at $1.5 \times \text{ATR}$ ($50\%$ volume) and $3.0 \times \text{ATR}$ ($50\%$ volume).
- **Time Stop**: Position is forcefully closed at market after $3 \times \tau_{\text{half}}$ if neither stop nor target was triggered.
