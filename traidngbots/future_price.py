import numpy as np
import pandas as pd
import yfinance as yf
import matplotlib.pyplot as plt

# --- 1. CORE CLASSES ---

class KalmanFilter1D:
    def __init__(self, process_noise, measurement_noise, estimated_error, initial_value):
        self.Q = process_noise 
        self.R = measurement_noise
        self.P = estimated_error
        self.x = initial_value

    def update(self, measurement):
        # Prediction
        self.P = self.P + self.Q
        # Correction
        K = self.P / (self.P + self.R)
        self.x = self.x + K * (measurement - self.x)
        self.P = (1 - K) * self.P
        return self.x

class MarkovRegime:
    def __init__(self, lookback=50):
        self.lookback = lookback
        self.transition_matrix = None
        self.current_state = 0 # 0=Flat, 1=Bull, -1=Bear

    def detect_regimes(self, returns, threshold=0.001):
        # Discretize returns into states: Bull (+1), Bear (-1), Flat (0)
        states = np.zeros(len(returns))
        states[returns > threshold] = 1
        states[returns < -threshold] = -1
        return states.astype(int)

    def train_matrix(self, returns):
        states = self.detect_regimes(returns)
        # 3x3 Matrix: [Flat, Bull, Bear] -> [Flat, Bull, Bear]
        # Mapped to indices: 0->1 (Bull), 1->2 (Bear), 2->0 (Flat) for simplicity in array
        # Let's use dictionary for clarity: -1, 0, 1
        transitions = {s: { -1:0, 0:0, 1:0 } for s in [-1, 0, 1]}
        
        for i in range(len(states)-1):
            curr = states[i]
            nxt = states[i+1]
            transitions[curr][nxt] += 1
            
        # Normalize to probabilities
        self.probs = {}
        for s in [-1, 0, 1]:
            total = sum(transitions[s].values())
            if total == 0:
                self.probs[s] = { -1:1/3, 0:1/3, 1:1/3 } # Default uniform, normalized to sum to 1
            else:
                self.probs[s] = {k: v/total for k,v in transitions[s].items()}
        
        self.current_state = states[-1]
        return self.probs

# --- 2. CONFIGURATION ---
TICKER = "BTC-USD"
SIMULATIONS = 1000   # Monte Carlo runs
DAYS_AHEAD = 14      # Forecast horizon
TIMEFRAME = "1h"     # NYQUIST: High sampling rate
LOOKBACK = "1y"      # Data amount

# --- 3. DATA & NYQUIST PRE-PROCESSING ---
print(f"1. ACQUIRING DATA ({TICKER})...")
# We use hourly data to capture the 'shape' of the daily volatility
data = yf.download(TICKER, period=LOOKBACK, interval=TIMEFRAME, progress=False) # 1h satisfies Nyquist for Daily trends

if data.empty:
    raise ValueError(f"No data fetched for {TICKER}. Check ticker symbol or internet connection.")

# Handle MultiIndex columns if present (yfinance update)
if isinstance(data.columns, pd.MultiIndex):
    data.columns = data.columns.get_level_values(0)

# Calculate Log Returns
data['Log_Ret'] = np.log(data['Close'] / data['Close'].shift(1))

# Calculate ATR (True Range)
# TR = Max(High-Low, Abs(High-PrevClose), Abs(Low-PrevClose))
high_low = data['High'] - data['Low']
high_close = np.abs(data['High'] - data['Close'].shift(1))
low_close = np.abs(data['Low'] - data['Close'].shift(1))
ranges = pd.concat([high_low, high_close, low_close], axis=1)
true_range = ranges.max(axis=1)
data['ATR'] = true_range.rolling(window=14).mean() # 14-period ATR

data.dropna(inplace=True)

# --- 4. SIGNAL PROCESSING (KALMAN) ---
print("2. APPLYING KALMAN FILTER...")
prices = data['Close'].values
kf = KalmanFilter1D(process_noise=1e-5, measurement_noise=1e-2, estimated_error=1.0, initial_value=prices[0])
kalman_trend = np.array([kf.update(p) for p in prices])

# --- 5. REGIME DETECTION (MARKOV) ---
print("3. TRAINING MARKOV CHAIN...")
markov = MarkovRegime()
# We train Markov on the *Filtered* Trend returns, not noisy price returns
kalman_returns = np.diff(kalman_trend)
# Append 0 to match length
kalman_returns = np.insert(kalman_returns, 0, 0)
transition_probs = markov.train_matrix(kalman_returns)
current_state = markov.current_state
state_name = {1: "BULL", -1: "BEAR", 0: "FLAT"}[current_state]

print(f"   Current Regime: {state_name}")
print(f"   Transition Probs: {transition_probs[current_state]}")

# --- 6. MONTE CARLO SIMULATION ---
print(f"4. RUNNING {SIMULATIONS} MONTE CARLO SIMULATIONS...")
last_price = prices[-1]
current_atr = data['ATR'].iloc[-1]
hourly_vol = np.std(data['Log_Ret'][-50:]) # Short term volatility

simulation_results = np.zeros((SIMULATIONS, DAYS_AHEAD * 24)) # 24 hours per day

for i in range(SIMULATIONS):
    sim_path = [last_price]
    curr_sim_state = current_state
    
    for t in range(DAYS_AHEAD * 24): # Hourly steps
        # A. Markov Bias: Determine next state based on probabilities
        states = list(transition_probs[curr_sim_state].keys())
        probs = np.array([transition_probs[curr_sim_state][s] for s in states])
        
        if probs.sum() > 0:
            probs = probs / probs.sum()  # Normalize to ensure sum equals 1.0
        else:
            probs = np.ones(len(states)) / len(states)
            
        next_state = np.random.choice(states, p=probs)
        curr_sim_state = next_state
        
        # B. Determine Drift based on State
        # Bull = positive drift, Bear = negative, Flat = 0
        drift = 0
        if next_state == 1: drift = 0.5 * hourly_vol 
        elif next_state == -1: drift = -0.5 * hourly_vol
        
        # C. Random Shock (scaled by ATR and Volatility)
        shock = np.random.normal(0, hourly_vol)
        
        # D. Update Price
        next_price = sim_path[-1] * (1 + drift + shock)
        sim_path.append(next_price)
    
    simulation_results[i, :] = sim_path[1:]

# --- 7. ANALYSIS & VISUALIZATION ---
# Calculate Percentiles for the Cone
p50 = np.mean(simulation_results, axis=0)
p95 = np.percentile(simulation_results, 95, axis=0)
p05 = np.percentile(simulation_results, 5, axis=0)

# Time axis for plotting
future_dates = pd.date_range(start=data.index[-1], periods=DAYS_AHEAD * 24 + 1, freq='h')[1:]

plt.figure(figsize=(14, 8))
plt.style.use('dark_background')

# Plot History (Last 7 Days only for clarity)
display_window = 24 * 7 
plt.plot(data.index[-display_window:], prices[-display_window:], color='gray', alpha=0.5, label='Hourly Price')
plt.plot(data.index[-display_window:], kalman_trend[-display_window:], color='cyan', linewidth=2, label='Kalman Trend')

# Plot Monte Carlo Cloud
# We plot the first 50 paths to show "Texture"
for i in range(50):
    plt.plot(future_dates, simulation_results[i, :], color='yellow', alpha=0.05)

# Plot Statistical Cones
plt.plot(future_dates, p50, color='white', linestyle='--', label='Mean Expectation')
plt.fill_between(future_dates, p05, p95, color='green', alpha=0.2, label='95% Confidence Interval')

plt.title(f"Quant Stack: Kalman (Signal) + Markov (Bias) + Monte Carlo (Probability) - {TICKER}", fontsize=14)
plt.ylabel("Price")
plt.legend()
plt.grid(True, alpha=0.1)
plt.show()

# --- 8. OUTPUT STATISTICS ---
print("\n--- PREDICTION SUMMARY ---")
print(f"Start Price: ${last_price:.2f}")
print(f"Expected Price (Mean): ${p50[-1]:.2f}")
print(f"Bearish Case (5% Chance): < ${p05[-1]:.2f}")
print(f"Bullish Case (5% Chance): > ${p95[-1]:.2f}")
print(f"Implied Volatility (ATR): {current_atr:.2f}")