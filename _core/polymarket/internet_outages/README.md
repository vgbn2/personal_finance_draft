# Internet Outage Tracker

**Engineering Domain:** Reliability & Statistical Quality Control

## 📐 The Math

### MTBF (Mean Time Between Failures)
$$MTBF = \frac{\text{Total Operating Time}}{\text{Number of Failures}} = \theta$$

### Failure Rate
$$\lambda = \frac{1}{\theta}$$

### Probability of Outage
Using Poisson distribution:
$$P(N \geq 1) = 1 - e^{-\lambda t}$$

Where $t$ is the time window in days.

### Fair Value Calculation
$$FairValue_{cents} = P(outage) \times 100$$

### Confidence Interval
Using Beta distribution for small samples:
$$CI_{95\%} = [\text{Beta}_{0.025}(\alpha, \beta), \text{Beta}_{0.975}(\alpha, \beta)]$$

Where $\alpha = k + 1$ (outages observed) and $\beta = n - k + 1$ (periods without outage).

### Signal Detection
$$z = \frac{MarketPrice - FairValue}{\sigma}$$

| Z-Score | Signal |
|---------|--------|
| z < -2 | 🟢 **STRONG BUY** |
| -2 < z < -1 | 🟡 BUY |
| -1 < z < 1 | ⚪ HOLD |
| 1 < z < 2 | 🟠 SELL |
| z > 2 | 🔴 **STRONG SELL** |

## ⚠️ When It Fails

| Failure Mode | Cause | Detection |
|--------------|-------|-----------|
| **Clustered Failures** | Correlated outages (common vendor bug) | Multiple providers down simultaneously |
| **Black Swans** | Cyber attack, undersea cable cut | Geopolitical tension, solar flares |
| **Sample Bias** | Historical data not representative | New infrastructure, different failure modes |

## 🎯 Positioning Strategy

| Condition | Action |
|-----------|--------|
| Market > Fair Value + 2σ | **SHORT OUTAGE** (picking up pennies) |
| λ structurally increasing (solar max, zero-day) | **LONG OUTAGE** |
| High uncertainty (wide CI) | **STAY AWAY** |

## Current Baseline (Historical)

| Metric | Value |
|--------|-------|
| MTBF (Severity ≥ 3) | ~54 days |
| λ (per day) | 0.019 |
| Fair Value (1 week) | ~12¢ |
| Fair Value (1 month) | ~43¢ |

## Usage

```bash
python outage_tracker.py          # Live tracking
python outage_tracker.py --test   # Single run
```
