import yfinance as yf
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

df=yf.download("SPY", start="1990-01-01", end="2021-01-01")
print(df.head())

# Calculate RSI
delta = df['Close'].diff()
gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
rs = gain / loss
df['RSI'] = 100 - (100 / (1 + rs))

# Calculate ATR
high_low = df['High'] - df['Low']
high_close = (df['High'] - df['Close'].shift()).abs()
low_close = (df['Low'] - df['Close'].shift()).abs()
df['TR'] = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
df['ATR'] = df['TR'].rolling(window=14).mean()

# --- 10 TradingView Indicators ---
# 1. SMA (Simple Moving Average)
df['SMA_50'] = df['Close'].rolling(window=50).mean()
df['SMA_200'] = df['Close'].rolling(window=200).mean()

# 2. EMA (Exponential Moving Average)
df['EMA_12'] = df['Close'].ewm(span=12, adjust=False).mean()
df['EMA_26'] = df['Close'].ewm(span=26, adjust=False).mean()

# 3. MACD (Moving Average Convergence Divergence)
df['MACD'] = df['EMA_12'] - df['EMA_26']
df['MACD_Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()

# 4. Bollinger Bands
df['BB_Mid'] = df['Close'].rolling(window=20).mean()
df['BB_Std'] = df['Close'].rolling(window=20).std()
df['BB_Upper'] = df['BB_Mid'] + (2 * df['BB_Std'])
df['BB_Lower'] = df['BB_Mid'] - (2 * df['BB_Std'])

# 5. Stochastic Oscillator
low_14 = df['Low'].rolling(window=14).min()
high_14 = df['High'].rolling(window=14).max()
df['Stoch_K'] = 100 * ((df['Close'] - low_14) / (high_14 - low_14))
df['Stoch_D'] = df['Stoch_K'].rolling(window=3).mean()

# 6. CCI (Commodity Channel Index)
tp = (df['High'] + df['Low'] + df['Close']) / 3
sma_tp = tp.rolling(window=20).mean()
mad = tp.rolling(window=20).apply(lambda x: np.abs(x - x.mean()).mean())
df['CCI'] = (tp - sma_tp) / (0.015 * mad)

# 7. OBV (On-Balance Volume)
df['OBV'] = (np.sign(df['Close'].diff()) * df['Volume']).fillna(0).cumsum()

# 8. ROC (Rate of Change)
df['ROC'] = df['Close'].pct_change(periods=12) * 100

# 9. Williams %R
df['Williams_R'] = -100 * ((high_14 - df['Close']) / (high_14 - low_14))

# 10. Momentum
df['Momentum'] = df['Close'].diff(10)

# Calculate ATR Bands
df['Upper'] = df['Close'] + (2 * df['ATR'])
df['Lower'] = df['Close'] - (2 * df['ATR'])

# Simple Strategy: Buy if RSI < 30, Sell if RSI > 70
df['Signal'] = np.where(df['RSI'] < 30, 1, np.where(df['RSI'] > 70, -1, 0))

# Plotting
plt.figure(figsize=(12,12))
ax1 = plt.subplot(311)
ax1.plot(df['Close'], label='Close Price')
ax1.plot(df['BB_Upper'], label='BB Upper', color='green', linestyle='--', alpha=0.5)
ax1.plot(df['BB_Lower'], label='BB Lower', color='green', linestyle='--', alpha=0.5)
ax1.plot(df[df['Signal'] == 1].index, df['Close'][df['Signal'] == 1], '^', markersize=10, color='g', label='Buy')
ax1.plot(df[df['Signal'] == -1].index, df['Close'][df['Signal'] == -1], 'v', markersize=10, color='r', label='Sell')
ax1.set_title('SPY Price & Bollinger Bands')
ax1.legend()

ax2 = plt.subplot(312, sharex=ax1)
ax2.plot(df['RSI'], label='RSI')
ax2.axhline(70, color='r', linestyle='--')
ax2.axhline(30, color='g', linestyle='--')
ax2.set_title('RSI Indicator')
ax2.legend()

ax3 = plt.subplot(313, sharex=ax1)
ax3.plot(df['MACD'], label='MACD', color='blue')
ax3.plot(df['MACD_Signal'], label='Signal', color='orange')
ax3.bar(df.index, df['MACD'] - df['MACD_Signal'], label='Histogram', color='gray', alpha=0.3)
ax3.set_title('MACD')
ax3.legend()

plt.tight_layout()
plt.show()