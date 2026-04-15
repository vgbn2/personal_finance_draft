
import yfinance as yf
import matplotlib.pyplot as plt
import matplotlib.ticker as mtick
import pandas as pd
import numpy as np
from scipy import stats
import warnings

warnings.filterwarnings("ignore")

# ── Configuration ──────────────────────────────────────────────────────────────
TICKER      = '^GSPC' 
WINDOW      = 50
HORIZON     = 14
EWMA_LAMBDA = 0.94

# ── 1. Data Acquisition ────────────────────────────────────────────────────────
df = yf.download(TICKER, start="2024-01-01", interval='1d', progress=False)

if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.droplevel(1)

# ── 2. Historical Indicators (FIR vs IIR) ─────────────────────────────────────
df['SMA'] = df['Close'].rolling(WINDOW).mean()
df['EMA'] = df['Close'].ewm(span=WINDOW, adjust=False).mean()

# Calculate log-returns for Volatility (EWMA)
log_ret = np.log(df['Close'] / df['Close'].shift(1)).dropna()

# ── 3. Prediction Math (GBM Tunnel) ────────────────────────────────────────────
# EWMA Volatility
sigma2 = np.zeros(len(log_ret))
sigma2[0] = log_ret.iloc[0]**2
for t in range(1, len(log_ret)):
    sigma2[t] = EWMA_LAMBDA * sigma2[t-1] + (1 - EWMA_LAMBDA) * log_ret.iloc[t-1]**2
vol_now = np.sqrt(sigma2[-1])

# Drift (Extracted from the last 14 days of the EMA slope)
x_seg = np.arange(HORIZON)
y_seg = df['EMA'].iloc[-HORIZON:].values
slope = stats.linregress(x_seg, y_seg).slope
drift = slope / df['Close'].iloc[-1]

# GBM Projection path
future_steps = np.arange(1, HORIZON + 1)
last_price = df['Close'].iloc[-1]
path = last_price * np.exp((drift - 0.5 * vol_now**2) * future_steps)
upper = path * np.exp(1.96 * vol_now * np.sqrt(future_steps))
lower = path * np.exp(-1.96 * vol_now * np.sqrt(future_steps))

# Future Dates
future_dates = pd.date_range(start=df.index[-1], periods=HORIZON + 1, freq='B')[1:]

# ── 4. Styling (Light Mode - Resetting RCParams) ──────────────────────────────
plt.rcParams.update(plt.rcParamsDefault) # Reset to standard light theme
plt.rcParams.update({
    "font.family": "sans-serif",
    "grid.alpha": 0.3
})

# ── 5. Visualization ──────────────────────────────────────────────────────────
df_subset = df.iloc[-365:] 
fig, ax = plt.subplots(figsize=(12, 6))