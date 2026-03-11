# Fed Rates Tracker

**Engineering Domain:** Control Systems & Estimation Theory

## 📐 The Math

### PID Controller Model
The Fed is modeled as a PID controller minimizing inflation error:

$$u(t) = K_p \cdot e(t) + K_i \int e(t)\,dt + K_d \frac{de}{dt}$$

Where:
- $e(t) = CPI_{current} - 2.0\%$ (inflation gap)
- $K_p = 1.5$ (proportional gain)
- $K_i = 0.3$ (integral gain)  
- $K_d = 0.8$ (derivative gain)

### Kalman Filter
Separates "true policy signal" from market noise:

```
State:       x_k = policy rate (hidden)
Observation: z_k = market price (noisy)

Predict:  x̂_k|k-1 = x̂_k-1
Update:   K = P / (P + R)
          x̂_k = x̂_k|k-1 + K(z_k - x̂_k|k-1)
```

## ⚠️ When It Fails

| Failure Mode | Cause | Detection |
|--------------|-------|-----------|
| **Regime Change** | Fed abandons Taylor Rule (crisis, war) | CPI/FFR correlation breaks |
| **Data Lag** | CPI is backward-looking | Real-time shocks invisible |
| **Forward Guidance** | Fed signals diverge from data | Watch FOMC dot plots |

## 🎯 Positioning Strategy

| Condition | Action |
|-----------|--------|
| PID Signal > Market + 20bps, inflation accelerating | **LONG HAWKISH** |
| PID Signal < Market - 20bps, unemployment spiking | **LONG DOVISH** |
| Kalman noise > 50bps | **STAY AWAY** (binary event priced in) |

## Usage

```bash
python fed_tracker.py          # Live tracking
python fed_tracker.py --test   # Single run
python fed_tracker.py --cpi 4.0  # Override CPI
```
