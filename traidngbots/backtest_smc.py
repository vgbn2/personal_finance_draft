import yfinance as yf
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# --- CONFIGURATION ---
TICKER_FX = 'EURUSD=X'
TICKERS_MACRO = ['SPY', 'FEZ', '^TNX', 'CL=F'] 
INITIAL_CAPITAL = 10000
LEVERAGE = 10.0 
PIP_SIZE = 0.0001
SPREAD_PIPS = 1.0 # 1 Pip Spread Cost

# --- 1. DATA LOADER ---
def get_data():
    print("1. Fetching Daily Macro Data...")
    macro_data = yf.download(TICKERS_MACRO, period="5y", interval="1d", progress=False)['Close']
    macro = macro_data.ffill().dropna()
    
    print("2. Fetching 1H Forex Data (Last 730 Days)...")
    fx = yf.download(TICKER_FX, period="730d", interval="1h", progress=False)
    
    # Flatten columns if multi-index
    if isinstance(fx.columns, pd.MultiIndex):
        try: fx = fx.xs(TICKER_FX, level=1, axis=1)
        except: pass
    
    return macro, fx.dropna()

# --- 2. MACRO BIAS (DAILY) ---
def get_macro_bias(macro_df):
    lb = 50
    # Growth (Stocks)
    growth = macro_df['SPY'] / macro_df['FEZ']
    score_growth = np.where(growth > growth.ewm(span=lb).mean(), -1, 1)
    # Yields
    score_yield = np.where(macro_df['^TNX'] > macro_df['^TNX'].ewm(span=lb).mean(), -1, 1)
    # Oil
    score_oil = np.where(macro_df['CL=F'] > macro_df['CL=F'].ewm(span=lb).mean(), -1, 1)
    
    macro_df['Bias_Score'] = score_growth + score_yield + score_oil
    
    # Institutional Bias
    macro_df['Daily_Bias'] = 0
    macro_df.loc[macro_df['Bias_Score'] >= 1, 'Daily_Bias'] = 1  # Long EUR
    macro_df.loc[macro_df['Bias_Score'] <= -1, 'Daily_Bias'] = -1 # Short EUR
    
    # Shift to prevent look-ahead
    return macro_df[['Daily_Bias']].shift(1).fillna(0)

# --- 3. SMC ENGINE (1H - REAL TIME) ---
def run_smc_backtest(macro, fx):
    # Align Data
    aligned_bias = macro['Daily_Bias'].reindex(fx.index, method='ffill').fillna(0)
    fx['Bias'] = aligned_bias
    
    # ATR for Stops
    fx['TR'] = np.maximum(fx['High'] - fx['Low'], abs(fx['Close'] - fx['Close'].shift(1)))
    fx['ATR'] = fx['TR'].rolling(14).mean()
    
    # Simulation Vars
    balance = INITIAL_CAPITAL
    equity_curve = []
    
    position = 0 
    entry_price = 0
    stop_loss = 0
    initial_stop = 0
    take_profit = 0
    position_size = 0
    
    # LIQUIDITY MEMORY (Real-Time)
    # We will look for pivots at index [i-2]
    # This means we confirm a pivot 2 hours after it happens (No Repainting)
    pivots_high = [] 
    pivots_low = []
    
    eqh_levels = [] 
    eql_levels = [] 
    
    print("3. Hunting for Equal Highs/Lows (Real-Time Logic)...")
    
    # Start loop at index 20 to allow for lag checks
    for i in range(20, len(fx)):
        # Data
        open_p = fx['Open'].iloc[i]
        high = fx['High'].iloc[i]
        low = fx['Low'].iloc[i]
        close = fx['Close'].iloc[i]
        bias = fx['Bias'].iloc[i]
        atr = fx['ATR'].iloc[i]
        
        if np.isnan(atr): 
            equity_curve.append(balance)
            continue

        # --- A. DETECT PIVOTS (FRACTALS) ---
        # We check if candle [i-2] was a high/low relative to neighbors
        # Neighbors: [i-4], [i-3] (Left) and [i-1], [i] (Right)
        
        # Check Pivot High at i-2
        candle_ref = i - 2
        if (fx['High'].iloc[candle_ref] > fx['High'].iloc[candle_ref-1]) and \
           (fx['High'].iloc[candle_ref] > fx['High'].iloc[candle_ref-2]) and \
           (fx['High'].iloc[candle_ref] > fx['High'].iloc[candle_ref+1]) and \
           (fx['High'].iloc[candle_ref] > fx['High'].iloc[i]): # current bar is lower
               
            new_pivot = fx['High'].iloc[candle_ref]
            
            # Check for EQH (Is this new pivot close to an old one?)
            is_eqh = False
            for p in pivots_high[-10:]: # Scan recent history
                if abs(new_pivot - p) < (3 * PIP_SIZE):
                    eqh_levels.append(max(new_pivot, p)) # Use the higher wick as the trap
                    is_eqh = True
            
            if not is_eqh: pivots_high.append(new_pivot)
                
        # Check Pivot Low at i-2
        if (fx['Low'].iloc[candle_ref] < fx['Low'].iloc[candle_ref-1]) and \
           (fx['Low'].iloc[candle_ref] < fx['Low'].iloc[candle_ref-2]) and \
           (fx['Low'].iloc[candle_ref] < fx['Low'].iloc[candle_ref+1]) and \
           (fx['Low'].iloc[candle_ref] < fx['Low'].iloc[i]):
               
            new_pivot = fx['Low'].iloc[candle_ref]
            
            # Check for EQL
            is_eql = False
            for p in pivots_low[-10:]:
                if abs(new_pivot - p) < (3 * PIP_SIZE):
                    eql_levels.append(min(new_pivot, p))
                    is_eql = True
            
            if not is_eql: pivots_low.append(new_pivot)

        # Keep memory clean
        if len(eqh_levels) > 5: eqh_levels.pop(0)
        if len(eql_levels) > 5: eql_levels.pop(0)

        # --- B. MANAGE POSITIONS ---
        if position != 0:
            # Trailing Stop: Move to Breakeven if price moves > 1R
            if position == 1:
                if high > (entry_price + (entry_price - initial_stop)):
                    stop_loss = max(stop_loss, entry_price)

                if low <= stop_loss:
                    loss = (stop_loss - entry_price) * position_size
                    balance += loss
                    position = 0
                elif high >= take_profit:
                    gain = (take_profit - entry_price) * position_size
                    balance += gain
                    position = 0
            elif position == -1:
                if low < (entry_price - (initial_stop - entry_price)):
                    stop_loss = min(stop_loss, entry_price)

                if high >= stop_loss:
                    loss = (entry_price - stop_loss) * position_size
                    balance += loss
                    position = 0
                elif low <= take_profit:
                    gain = (entry_price - take_profit) * position_size
                    balance += gain
                    position = 0

        # --- C. ENTRY LOGIC (SWEEPS) ---
        if position == 0:
            
            # LONG: Bull Bias + Sweep EQL
            if bias == 1:
                for lvl in eql_levels:
                    # Current candle sweeps level and closes above
                    if (low < lvl) and (close > lvl):
                         # Only enter if we opened above (fresh sweep)
                        if open_p > lvl:
                            position = 1
                            entry_price = close
                            stop_loss = low - (0.5 * atr) 
                            initial_stop = stop_loss
                            risk = entry_price - stop_loss
                            if risk > 0:
                                position_size = (balance * 0.02) / risk
                                take_profit = entry_price + (3 * risk) 
                                balance -= (SPREAD_PIPS * PIP_SIZE * position_size)
                            
            # SHORT: Bear Bias + Sweep EQH
            elif bias == -1:
                for lvl in eqh_levels:
                    if (high > lvl) and (close < lvl):
                        if open_p < lvl:
                            position = -1
                            entry_price = close
                            stop_loss = high + (0.5 * atr)
                            initial_stop = stop_loss
                            risk = stop_loss - entry_price
                            if risk > 0:
                                position_size = (balance * 0.02) / risk
                                take_profit = entry_price - (3 * risk) 
                                balance -= (SPREAD_PIPS * PIP_SIZE * position_size)

        equity_curve.append(balance)
    
    pad = [INITIAL_CAPITAL] * (len(fx) - len(equity_curve))
    return pd.Series(pad + equity_curve, index=fx.index)

# --- RUN ---
if __name__ == "__main__":
    macro_df, fx_df = get_data()
    macro_df = get_macro_bias(macro_df)
    strat = run_smc_backtest(macro_df, fx_df)
    
    ret = ((strat.iloc[-1] - INITIAL_CAPITAL)/INITIAL_CAPITAL)*100
    dd = ((strat - strat.cummax())/strat.cummax()).min()*100
    
    print(f"\n--- 1H SMC SNIPER (FIXED) ---")
    print(f"Final Balance: ${strat.iloc[-1]:,.2f}")
    print(f"Return:        {ret:.2f}%")
    print(f"Max Drawdown:  {dd:.2f}%")
    
    plt.figure(figsize=(12, 6))
    plt.plot(strat, color='purple', label='SMC Strategy')
    plt.title('1H Strategy: Real-Time Pivot Detection')
    plt.grid(True)
    plt.show()