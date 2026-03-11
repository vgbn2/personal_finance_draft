import numpy as np
import pandas as pd
import requests
import matplotlib.pyplot as plt
from scipy.stats import norm
import math

class Config:
    BINANCE_API = "https://api.binance.com/api/v3/klines"
    HORIZON_BARS = 24  # Projection horizon (e.g., 24 hours)
    PROB_TARGET_PCT = 2.0  # Strike distance (+/- %)
    LOOKBACK_BARS = 10  # Slope lookback
    IGNORE_HURST = False
    SLOPE_MULT = 1.0
    KALMAN_Q = 0.01  # Process Noise
    VOL_MULT = 2.0   # Volatility Bands multiplier
    MACRO_WEIGHT = 0.05

def get_historical_data(symbol="BTCUSDT", interval="1h", limit=300):
    url = Config.BINANCE_API
    params = {"symbol": symbol, "interval": interval, "limit": limit}
    try:
        response = requests.get(url, params=params)
        data = response.json()
        # [Open time, Open, High, Low, Close, Volume, ...]
        df = pd.DataFrame(data, columns=["time", "open", "high", "low", "close", "volume", "close_time", "qav", "num_trades", "taker_base_vol", "taker_quote_vol", "ignore"])
        df["close"] = df["close"].astype(float)
        df["time"] = pd.to_datetime(df["time"], unit="ms")
        return df
    except Exception as e:
        print(f"Error fetching data: {e}")
        return pd.DataFrame()

def calc_hurst(series, length=100):
    """
    Calculate Hurst Exponent based on the Pine Script logic.
    H < 0.5: Mean Reverting
    H > 0.5: Trending
    """
    if len(series) < length:
        return 0.5
    
    # We need to process this in a rolling window or just for the latest point?
    # The pine script calculates it per bar. For visualization, we'll calculate it for the whole series.
    # However, strictly following the simplified logic for the 'current' state:
    
    # Pine Script Logic translation:
    # l_ret = math.log(src / src[1])
    # avg = ta.sma(l_ret, len)
    # ... R/S analysis ...
    
    # Vectorized approach for the whole series would be complex, 
    # let's just implement it for the latest window to get the current Hurst for projection.
    
    # Take the last 'length' price points
    window = series[-length:].values
    if len(window) < 2: return 0.5
    
    # Log returns
    l_ret = np.log(window[1:] / window[:-1])
    
    avg = np.mean(l_ret)
    
    sum_dev = 0.0
    max_dev = 0.0
    min_dev = 0.0
    sum_sq_diff = 0.0
    
    # Loop max 49 times or len-1 (matches Pine Script limits)
    loop_count = min(len(l_ret), 49)
    
    for i in range(loop_count):
        diff = l_ret[-(i+1)] - avg # Note: Pine accesses array backwards effectively with [i]
        sum_dev += diff
        max_dev = max(max_dev, sum_dev)
        min_dev = min(min_dev, sum_dev)
        sum_sq_diff += (diff * diff)
    
    R = max_dev - min_dev
    S = math.sqrt(sum_sq_diff / len(l_ret))
    
    if S == 0 or R == 0:
        return 0.5
    
    return math.log(R / S) / math.log(len(l_ret))

class KalmanFilter:
    def __init__(self, q=0.01):
        self.q = q
        self.k_est = None
        self.k_err = 1.0
        self.estimates = []

    def update(self, price):
        if self.k_est is None:
            self.k_est = price
            self.estimates.append(price)
            return price

        # Prediction / Update
        self.k_err = self.k_err + self.q
        k_gain = self.k_err / (self.k_err + 1.0)
        self.k_est = self.k_est + k_gain * (price - self.k_est)
        self.k_err = (1.0 - k_gain) * self.k_err
        
        self.estimates.append(self.k_est)
        return self.k_est

def run_analysis():
    print("Fetching data...")
    df = get_historical_data()
    if df.empty:
        return

    print(f"Data fetched: {len(df)} candles.")

    # 1. Run Kalman Filter
    kf = KalmanFilter(q=Config.KALMAN_Q)
    estimates = []
    for price in df["close"]:
        estimates.append(kf.update(price))
    
    df["kalman"] = estimates

    # 2. Calculate Hurst (for the latest point)
    current_hurst = calc_hurst(df["close"], length=100)
    print(f"Current Hurst Exponent: {current_hurst:.4f}")

    # 3. Projection Logic
    # Slope
    if len(df) > Config.LOOKBACK_BARS:
        current_k = df["kalman"].iloc[-1]
        past_k = df["kalman"].iloc[-1 - Config.LOOKBACK_BARS]
        slope_per_bar = (current_k - past_k) / Config.LOOKBACK_BARS
    else:
        slope_per_bar = 0

    hurst_conf = 1.0 if Config.IGNORE_HURST else (0.5 if current_hurst < 0.5 else 1.0)
    final_slope = slope_per_bar * Config.SLOPE_MULT * hurst_conf

    # Volatility (Std Dev of Price - Kalman) for last 50 bars
    # Using simple std dev of residuals
    residuals = df["close"] - df["kalman"]
    current_vol = residuals.tail(50).std()

    # Projected Mean Price
    horizon = Config.HORIZON_BARS
    mu_price = current_k + (final_slope * horizon)
    
    # Projected Sigma (Time scaled)
    sigma_future = current_vol * math.sqrt(horizon)

    # Targets (2% up/down)
    current_price = df["close"].iloc[-1]
    target_u = current_price * (1 + Config.PROB_TARGET_PCT / 100.0)
    target_d = current_price * (1 - Config.PROB_TARGET_PCT / 100.0)

    # Probabilities
    # Prob > Target High
    p_up = (1.0 - norm.cdf(target_u, loc=mu_price, scale=sigma_future)) * 100
    # Prob < Target Low
    p_down = norm.cdf(target_d, loc=mu_price, scale=sigma_future) * 100

    print(f"Current Price: {current_price:.2f}")
    print(f"Trend Slope: {final_slope:.4f}/bar")
    print(f"Projected Price (+{horizon}h): {mu_price:.2f} (±{sigma_future:.2f})")
    print(f"Target UP ({target_u:.2f}): {p_up:.1f}%")
    print(f"Target DOWN ({target_d:.2f}): {p_down:.1f}%")

    # 4. Visualization
    plt.figure(figsize=(12, 7))
    plt.style.use('dark_background')

    # Plot History
    # Last 100 bars for clarity
    plot_df = df.tail(150).copy()
    x_hist = range(len(plot_df))
    plt.plot(x_hist, plot_df["close"], label="Close Price", color="cyan", alpha=0.6)
    plt.plot(x_hist, plot_df["kalman"], label="Kalman Trend", color="yellow", linewidth=1.5)

    # Plot Projection
    last_x = x_hist[-1]
    future_x = [last_x, last_x + horizon]
    
    # Mean Path
    plt.plot(future_x, [current_k, mu_price], color="white", linestyle="--", linewidth=1, label="Projected Mean")
    
    # Target Lines
    plt.axhline(target_u, color="green", linestyle=":", alpha=0.5, label=f"Target +{Config.PROB_TARGET_PCT}%")
    plt.axhline(target_d, color="red", linestyle=":", alpha=0.5, label=f"Target -{Config.PROB_TARGET_PCT}%")
    
    # 2 Sigma Cone (approx 95%)
    # Simple cone visualization
    upper_cone = [current_k, mu_price + 2*sigma_future]
    lower_cone = [current_k, mu_price - 2*sigma_future]
    
    plt.fill_between(future_x, lower_cone, upper_cone, color='white', alpha=0.1, label="95% Confidence Cone")

    # Annotate Probabilities
    plt.text(last_x + horizon + 1, target_u, f"{p_up:.1f}%", color="green", va="center")
    plt.text(last_x + horizon + 1, target_d, f"{p_down:.1f}%", color="red", va="center")
    plt.text(last_x + horizon + 1, mu_price, f"Proj: {mu_price:.0f}", color="white", va="center")

    plt.title(f"BTC/USDT Kalman Filter Projection (Hurst={current_hurst:.2f})")
    plt.legend()
    plt.grid(True, alpha=0.2)
    plt.tight_layout()
    
    plt.show()

if __name__ == "__main__":
    try:
        run_analysis()
    except KeyboardInterrupt:
        pass
