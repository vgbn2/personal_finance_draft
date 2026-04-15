import numpy as np
import pandas as pd
import yfinance as yf
import matplotlib.pyplot as plt
import matplotlib.ticker as mtick
from scipy.stats import norm

# --- 1. CONFIGURATION ---
TARGET_ASSET = "GC=F"
MACRO_TICKERS = ["DX-Y.NYB", "^TNX", "^GSPC"]

INTERVAL = "1d"
LOOKBACK = "6mo"
HORIZON_STEPS = 14

# Kalman Tunings
PROCESS_NOISE = 1e-3
MEASUREMENT_NOISE = 1e-1

# Distribution Resolution
SIGMA_STEP = 0.1          # Step size between sigma levels
SIGMA_RANGE = 3.0         # Show from -3σ to +3σ
PROB_DISPLAY_THRESHOLD = 0.5  # Only print rows with prob >= this %

# --- 2. DATA FETCHER & ALIGNMENT ---
print("--- FETCHING DATA ---")
tickers_to_fetch = [TARGET_ASSET] + MACRO_TICKERS
data = yf.download(tickers_to_fetch, period=LOOKBACK, interval=INTERVAL,
                   group_by='ticker', progress=False)

if data.empty:
    raise ValueError("No data found.")

def get_close(ticker):
    try:
        if isinstance(data.columns, pd.MultiIndex):
            return data[ticker]['Close']
        return data['Close']
    except KeyError:
        print(f"Warning: Could not find data for {ticker}")
        return None

df = pd.DataFrame()
df['Target'] = get_close(TARGET_ASSET)
for m in MACRO_TICKERS:
    s = get_close(m)
    if s is not None:
        df[m] = s

df = df.ffill().dropna()
prices = df['Target'].values
dates  = df.index

# --- 3. MACRO FACTOR CALCULATION ---
returns      = np.log(df / df.shift(1)).dropna()
correlations = returns.corr()['Target']

rolling_mean = df.rolling(window=20).mean()
rolling_std  = df.rolling(window=20).std()
z_scores     = (df - rolling_mean) / rolling_std
current_z    = z_scores.iloc[-1]

macro_drag_score = 0.0
print(f"\n--- MACRO IMPACT ANALYSIS ---")
print(f"{'Asset':<12} | {'Corr':>6} | {'Z-Score':>8} | {'Impact':>8}")
print("-" * 46)

for m in MACRO_TICKERS:
    if m in df.columns:
        corr   = correlations[m]
        z      = current_z[m]
        impact = corr * z
        macro_drag_score += impact * 0.2
        print(f"{m:<12} | {corr:>+6.2f} | {z:>+8.2f} | {impact:>+8.2f}")

print("-" * 46)
print(f"TOTAL MACRO ADJUSTMENT: {macro_drag_score:+.4f} (Added to Drift)")

# --- 4. KALMAN FILTER ---
class KalmanFilter1D:
    def __init__(self, R, Q, initial_value):
        self.R = R; self.Q = Q; self.P = 1.0; self.x = initial_value

    def update(self, measurement):
        self.P   = self.P + self.Q
        K        = self.P / (self.P + self.R)
        self.x   = self.x + K * (measurement - self.x)
        self.P   = (1 - K) * self.P
        return self.x

kf = KalmanFilter1D(MEASUREMENT_NOISE, PROCESS_NOISE, prices[0])
kalman_signal = np.array([kf.update(p) for p in prices])

# --- 5. PROJECTION (WITH MACRO ADJUSTMENT) ---
current_price  = prices[-1]
trend_window   = 14
slope          = np.polyfit(np.arange(trend_window), kalman_signal[-trend_window:], 1)[0]
base_drift_pct = slope / current_price

adjusted_drift_pct = base_drift_pct + (macro_drag_score / 100)

step_volatility = np.std(np.diff(np.log(prices))[-30:])

future_steps = np.arange(1, HORIZON_STEPS + 1)
future_dates = pd.date_range(start=dates[-1], periods=HORIZON_STEPS + 1, freq='D')[1:]

path_tech  = current_price * np.exp(base_drift_pct  * future_steps)
path_macro = current_price * np.exp(adjusted_drift_pct * future_steps)

sigma_t    = step_volatility * np.sqrt(future_steps)
upper_cone = path_macro * np.exp(2 * sigma_t)
lower_cone = path_macro * np.exp(-2 * sigma_t)

# --- 6. FINE-GRAINED DISTRIBUTION (±0.1σ steps) ---
mu_total    = adjusted_drift_pct * HORIZON_STEPS   # total log-drift over horizon
sigma_total = step_volatility * np.sqrt(HORIZON_STEPS)
final_sigma = sigma_t[-1]
final_price = path_macro[-1]

# Build sigma grid
sigma_levels = np.round(
    np.arange(-SIGMA_RANGE, SIGMA_RANGE + SIGMA_STEP / 2, SIGMA_STEP), 1
)

print(f"\n--- FINE-GRAINED DISTRIBUTION  (horizon = {HORIZON_STEPS}d) ---")
print(f"Drift (technical): {base_drift_pct*100:+.4f}%/day  |  "
      f"Macro adj: {macro_drag_score:+.4f}  |  "
      f"σ/day: {step_volatility*100:.4f}%")
print(f"\n{'σ Level':>8}  {'Price':>12}  {'% from Now':>11}  {'Prob ≥ Target':>14}  {'Bar'}")
print("-" * 72)

bar_max   = 40   # characters for 100%
rows      = []

for sig in sigma_levels[::-1]:           # print from +3σ down to -3σ
    target   = final_price * np.exp(sig * final_sigma)
    pct_move = (target / current_price - 1) * 100
    z_score  = (np.log(target / current_price) - mu_total) / sigma_total

    if target > current_price:
        prob = (1 - norm.cdf(z_score)) * 100
    else:
        prob = norm.cdf(z_score) * 100

    rows.append((sig, target, pct_move, prob))

    if abs(prob - 50) > 49.5 * (1 - PROB_DISPLAY_THRESHOLD / 50):
        continue  # skip near-0% or near-100% edge rows

    bar    = "█" * int(prob / 100 * bar_max)
    marker = "  ◄ NOW" if abs(pct_move) < (SIGMA_STEP * final_sigma / current_price * 100 / 2) else ""
    print(f"{sig:>+7.1f}σ  ${target:>11,.0f}  {pct_move:>+10.2f}%  {prob:>13.1f}%  {bar}{marker}")

print("-" * 72)

# Highlight key quantiles
print(f"\n--- KEY QUANTILES ---")
for q_label, q_val in [("5th pct (strong bear)", 0.05),
                        ("25th pct (mild bear)",  0.25),
                        ("50th pct (median)",     0.50),
                        ("75th pct (mild bull)",  0.75),
                        ("95th pct (strong bull)",0.95)]:
    # Invert: find price where P(X <= price) = q_val
    log_ret   = norm.ppf(q_val) * sigma_total + mu_total
    q_price   = current_price * np.exp(log_ret)
    q_pct     = (q_price / current_price - 1) * 100
    print(f"  {q_label:<28}  ${q_price:>10,.0f}  ({q_pct:>+7.2f}%)")

# --- 7. VISUALIZATION ---
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 10),
                                gridspec_kw={'height_ratios': [3, 1]})
plt.style.use('dark_background')
fig.patch.set_facecolor('#0d0d0d')

# ── Top panel: price + projections ──────────────────────────────────────────
ax1.set_facecolor('#0d0d0d')
ax1.plot(dates, prices, color='gray', alpha=0.5, label='Price', linewidth=1)
ax1.plot(dates, kalman_signal, color='cyan', label='Kalman Signal', linewidth=1.5)
ax1.plot(future_dates, path_tech, color='white', linestyle=':', alpha=0.5,
         label='Technical Trend')
ax1.plot(future_dates, path_macro, color='lime', linewidth=2,
         label='Macro-Adjusted Trend')
ax1.fill_between(future_dates, lower_cone, upper_cone,
                 color='lime', alpha=0.08, label='±2σ Cone')

# Add ±1σ inner cone
inner_upper = path_macro * np.exp(1 * sigma_t)
inner_lower = path_macro * np.exp(-1 * sigma_t)
ax1.fill_between(future_dates, inner_lower, inner_upper,
                 color='lime', alpha=0.12, label='±1σ Cone')

ax1.set_title(f"Macro-Quant Model: {TARGET_ASSET}  |  {HORIZON_STEPS}-day horizon",
              fontsize=13, color='white', pad=10)
ax1.legend(fontsize=8, loc='upper left')
ax1.grid(True, alpha=0.08)
ax1.yaxis.set_major_formatter(mtick.StrMethodFormatter('${x:,.0f}'))

# ── Bottom panel: probability bar chart at each ±0.1σ level ─────────────────
ax2.set_facecolor('#0d0d0d')
rows_arr  = np.array(rows)                  # (sig, price, pct, prob)
sigs      = rows_arr[:, 0]
probs     = rows_arr[:, 3]
pcts      = rows_arr[:, 2]

colors    = ['#00e676' if p >= 50 else '#ff5252' for p in probs]
ax2.bar(pcts, probs, width=step_volatility * 100 * 0.8,
        color=colors, alpha=0.7, edgecolor='none')
ax2.axhline(50, color='white', linestyle='--', alpha=0.3, linewidth=0.8)
ax2.set_xlabel(f"% move from current price in {HORIZON_STEPS} days", color='white')
ax2.set_ylabel("Prob ≥ target (%)", color='white')
ax2.set_title("Fine-Grained Probability Distribution (±0.1σ steps)", color='white')
ax2.grid(True, alpha=0.08)
ax2.set_ylim(0, 105)
ax2.yaxis.set_major_formatter(mtick.PercentFormatter())

plt.tight_layout(pad=2.0)

