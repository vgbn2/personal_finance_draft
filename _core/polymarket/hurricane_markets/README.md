# Hurricane Intensity Tracker

**Engineering Domain:** Stochastic Processes

## 📐 The Math

### Markov Chain Model
State space: $S = \{TD, TS, Cat1, Cat2, Cat3, Cat4, Cat5\}$

Transition probability from state $i$ to $j$:
$$P(X_{t+1} = j | X_t = i) = T_{ij}$$

### Environmental Modulation
Transition matrix is adjusted by:

**Sea Surface Temperature (SST):**
- SST < 26°C → Shift probability mass **leftward** (weakening)
- SST > 28.5°C → Shift probability mass **rightward** (intensification)

**Wind Shear:**
- Shear > 20kt → Increase probability of weakening

### Multi-Step Forecast
$$P(X_n) = P(X_0) \cdot T^n$$

### Spectral Leakage Detection
Market overprices extreme outcomes when:
- Model says $P(Cat5) < 1\%$
- Market says $P(Cat5) > 5\%$

This is "spectral leakage" — probability mass bleeding into unlikely states.

## ⚠️ When It Fails

| Failure Mode | Cause | Detection |
|--------------|-------|-----------|
| **Rapid Intensification** | Non-linear physics, defies Markov | NHC RI alerts |
| **Land Interaction** | Complex structure degradation | Track crossing coastlines |
| **Eye Replacement Cycles** | Temporary weakening, then surge | Satellite imagery |

## 🎯 Positioning Strategy

| Condition | Action |
|-----------|--------|
| Spectral leakage detected in Cat5 | **SELL EXTREMES** |
| High uncertainty, central categories underpriced | **BUY CLUMPS (Cat2+Cat3)** |
| SST > 28.5°C, low shear, storm over open water | **LONG INTENSIFICATION** |

## Usage

```bash
python hurricane_tracker.py                  # Live tracking
python hurricane_tracker.py --test           # Single run
python hurricane_tracker.py --state 3        # Set current state to Cat2
python hurricane_tracker.py --sst 29.0       # Override SST
python hurricane_tracker.py --shear 25.0     # Override wind shear
```
