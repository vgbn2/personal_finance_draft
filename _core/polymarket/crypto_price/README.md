# BTC Price Tracker

**Engineering Domain:** Digital Signal Processing (DSP)

## 📐 The Math

### Z-Transform Analysis
Treat BTC price as a digital signal $x[n]$:

$$X(z) = \sum_{n=0}^{N} x[n] \cdot z^{-n}$$

We fit an **AR(p) model** to price returns:
$$y[n] = a_1 y[n-1] + a_2 y[n-2] + ... + a_p y[n-p] + \epsilon[n]$$

### Pole Analysis
Find poles by solving characteristic polynomial:
$$z^p - a_1 z^{p-1} - ... - a_p = 0$$

**Stability Criterion:**
- $|z| < 0.8$ → Stable trend (momentum)
- $0.8 < |z| < 0.95$ → Marginally stable
- $|z| > 0.95$ → **Reversal imminent** (pole at unit circle)

### Dutch Betting (Clumped Arbitrage)
For equal payout across buckets:
$$w_i = \frac{1/p_i}{\sum_j 1/p_j}$$

Where $p_i$ is the ask price of bucket $i$.

## ⚠️ When It Fails

| Failure Mode | Cause | Detection |
|--------------|-------|-----------|
| **Exogenous Shocks** | SEC news, hacks, macro events | Pole stays stable but price jumps |
| **Low Liquidity** | Thin orderbooks | High bid-ask spread, false poles |
| **AR Model Misfit** | Non-stationary regime | Coefficient instability |

## 🎯 Positioning Strategy

| Condition | Action |
|-----------|--------|
| Stability > 0.95, Bullish trend | **BUY BREAKOUT** |
| Stability < 0.80, Price > 2σ from MA | **MEAN REVERSION** |
| Sum of clump probs < fair value | **CLUMPED ARBITRAGE** |

## Usage

```bash
python btc_tracker.py          # Live tracking (fetches Binance price)
python btc_tracker.py --test   # Single run
```
