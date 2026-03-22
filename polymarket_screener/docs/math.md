# Mathematical Blueprint (Core Quantitative Logic)

This document centralizes the mathematical "Ground Truth" for the entire trading system.

---

## 1. Probability Engine (Black-Scholes)
We use the **Deribit IV** to price Polymarket binary outcomes.

$$d_2 = \frac{\ln(S/K) + (r - \sigma^2/2)t}{\sigma\sqrt{t}}$$
$$P(S > K) = \Phi(d_2)$$

- **S**: Spot price (Binance)
- **K**: Strike price (Polymarket)
- **σ**: Implied Volatility (Deribit) - *Adjusted by VRP_DISCOUNT (0.85)*
- **t**: Time to expiry in years.

---

## 2. Allocation Logic (Frank-Wolfe Kelly)
Determines the optimal bet size for a set of correlated strikes.

**Objective**: Maximize $\sum p_i \ln(W_i)$ subject to $\sum w_j \leq 1$

1. **State Probabilities ($p_i$)**: Derived from the Black-Scholes PDFs over discrete strike brackets.
2. **Returns Matrix ($R$)**: The ROI for each token in every state.
3. **Frank-Wolfe Steps**:
   - $g_k = \nabla f(w_k)$
   - $s_k = \text{argmax}_{s \in D} \langle s, g_k \rangle$
   - $w_{k+1} = w_k + \gamma(s_k - w_k)$

---

## 3. Execution Math (VWAP Slippage)
Calculates the actual fill price based on depth.

$$\text{Effective Price} = \frac{\sum (\text{Price}_j \times \text{Size}_j)}{\text{Target Allocation}}$$

- **Constraint**: If total orderbook depth < Target Allocation, the trade is rejected (Insufficient Liquidity).

---

## 4. Lifecycle Logic (Greed-Decay TP)
Automated Profit-Taking based on exponential decay of edge over time.

$$\text{Exit Target} = P_{real} \cdot e^{-k \cdot \text{ROI}}$$

- **k**: Decay constant (Higher for expensive tokens, lower for cheap "lottery" tokens).
- **Recycle**: If price $\geq 0.99$, sell immediately.

---

## 5. Chronological Logic (Window Rolling)
Ensures seamless 15-minute market transitions.

- **Window Index**: $W_n$
- **Handoff Condition**: $T_{exp} - T_{curr} \leq 120\text{ seconds}$
- **Sequence Target**: $T_{start, n+1} = T_{exp, n}$
- **Title Match**: `f"BTC Price {Next_Time_String}"`

---

## 6. Risk Shield (3D Matrix)
- **Gate 1**: $Exposure_{Global} \leq 30\%$
- **Gate 2**: $Exposure_{Temporal} \leq 15\%$
- **Gate 3**: $Size_{Conviction} \in [1.5\%, 5\%]$
