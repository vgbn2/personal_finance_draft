# 03. Sentiment Scoring & Signal Decay

## Mathematical Formulation

Raw sentiment signals decay rapidly as market prices assimilate retail information. This document specifies the continuous decay math, confidence weighting, and aggregate sentiment formulation.

---

## Polarity & Conviction Vector

Each extracted signal for asset $i$ at time $t_0$ produces an instantaneous raw polarity $P_i(t_0) \in [-1.0, 1.0]$ and conviction $C_i(t_0) \in [0.0, 1.0]$:

$$P_i(t_0) = \begin{cases} +1.0 & \text{if Direction} = \text{BULLISH} \\ -1.0 & \text{if Direction} = \text{BEARISH} \\ 0.0 & \text{if Direction} = \text{NEUTRAL} \end{cases}$$

---

## Exponential Half-Life Decay

The effective strength of a signal $S_i(t)$ at time $t \ge t_0$ decays exponentially based on creator holding horizon:

$$S_i(t) = P_i(t_0) \cdot C_i(t_0) \cdot 2^{-\frac{t - t_0}{\tau_{\text{half}}}}$$

### Half-Life Parameters ($\tau_{\text{half}}$)

| Declared Time Horizon | Half-Life ($\tau_{\text{half}}$) | Max Useful Duration |
|---|---|---|
| `SCALP` | 4 hours | 12 hours |
| `SWING` | 24 hours | 72 hours |
| `POSITION` | 72 hours | 216 hours (9 days) |
| `MACRO_REGIME` | 168 hours (7 days) | 30 days |

---

## Bayesian Creator Credibility Weighting

Not all commentators have positive predictive value. Each content creator $c$ is assigned a dynamic credibility weight $W_c \in [0.0, 1.0]$ derived from past historical prediction accuracy:

$$W_c = \sigma\left(\beta \cdot (\text{BrierScore}_{\text{prior}} - \text{BrierScore}_c)\right) \cdot \mathbb{I}(\text{SampleCount}_c \ge 10)$$

Where:
- $\text{BrierScore}_c = \frac{1}{N} \sum_{k=1}^N (p_k - o_k)^2$
- $o_k = 1$ if price moved toward target $k$ by $\ge 1.5 \times \text{ATR}$, otherwise $0$.
- $\mathbb{I}(\text{SampleCount}_c \ge 10)$ ensures creators with insufficient history are weighted at zero until qualified.

---

## Composite Asset Sentiment Score

The aggregated sentiment $A_i(t)$ for asset $i$ across $M$ active creator signals is computed as:

$$A_i(t) = \frac{\sum_{c=1}^M W_c \cdot S_{i,c}(t)}{\sum_{c=1}^M W_c + \epsilon}$$

Where $\epsilon = 10^{-6}$ prevents division by zero. If $A_i(t) > +0.65$, asset $i$ enters the **Overheated Euphoria** regime. If $A_i(t) < -0.65$, it enters the **Peak Capitulation** regime.
