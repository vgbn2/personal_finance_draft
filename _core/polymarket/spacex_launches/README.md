# SpaceX Launch Tracker

**Engineering Domain:** Reliability Engineering

## 📐 The Math

### Bayesian Reliability
Prior probability updated by evidence:

$$P(Success|Evidence) = \frac{P(Evidence|Success) \cdot P(Success)}{P(Evidence)}$$

### Impulse Response Updates
Each milestone shifts probability via logit transform:

$$logit(p_{new}) = logit(p_{old}) + w_{impulse}$$

| Milestone | Impulse Weight |
|-----------|----------------|
| Wet Dress Rehearsal | +5% |
| Static Fire | +8% |
| Launch Window Open | +3% |
| Propellant Load | +2% |
| Go for Launch | +5% |

### Time Decay
Reliability decreases as launch approaches:
$$R(t) = P_{base} \cdot e^{-\lambda t}$$

### Risk-Adjusted ROI
Uses conservative probability estimate:
$$p_{conservative} = p - 1.5\sigma$$
$$ROI = \frac{p_{conservative} \cdot 100 - cost}{cost}$$

## ⚠️ When It Fails

| Failure Mode | Cause | Detection |
|--------------|-------|-----------|
| **Hidden Failures** | Micro-fractures not public | Post-scrub anomaly reports |
| **Go Fever** | Political pressure overrides safety | Repeated "all systems go" despite delays |
| **Novelty Risk** | New hardware, no baseline | First flight of configuration |

## 🎯 Positioning Strategy

| Condition | Action |
|-----------|--------|
| Post-milestone, market slow to react | **LONG SUCCESS** |
| Repeated delays, price sticky high | **SHORT / HEDGE** |
| T-24h to T-0 | **EXIT** (avoid binary coin flip) |

## Usage

```bash
python spacex_tracker.py                # Live tracking
python spacex_tracker.py --test         # Single run
python spacex_tracker.py --simulate sf  # Simulate static fire passed
python spacex_tracker.py --simulate wdr # Simulate wet dress rehearsal
```
