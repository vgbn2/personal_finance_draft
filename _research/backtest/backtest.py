import yfinance as yf
import pandas_ta as ta
import numpy as np
import matplotlib.pyplot as plt

def get_data_with_indicators():
    df = yf.download("BTC-USD", start="2023-01-01")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Example 1: Calculate RSI (Relative Strength Index)
    # append=True adds the column to 'df' automatically
    df.ta.rsi(length=14, append=True) 
    
    # Example 2: Calculate MACD
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    
    return df

def add_rsi_strategy(df):
    # RSI < 30 is often considered oversold (Buy/Long)
    # RSI > 70 is often considered overbought (Sell/Short)
    
    # Create signals
    buy_signal = df['RSI_14'] < 30
    sell_signal = df['RSI_14'] > 70
    
    # Generate signals: 1 for buy, -1 for sell, 0 for hold/nothing
    df['signal'] = 0 
    df.loc[buy_signal, 'signal'] = 1
    df.loc[sell_signal, 'signal'] = -1
    
    # Create position: forward fill signals to hold position until it flips
    # This means we hold a "long" (1) or "short" (-1) position until the opposite signal appears
    df['position'] = df['signal'].replace(to_replace=0, method='ffill')

    # The actual strategy is to take the position on the NEXT bar to avoid lookahead bias
    df['Strategy'] = df['position'].shift(1)
    
    return df

def test_strategy(df):
    # Calculate daily returns for the asset
    df['returns'] = df['Close'].pct_change()
    
    # Calculate strategy returns
    df['strategy_returns'] = df['returns'] * df['Strategy']
    
    # Calculate cumulative returns for both
    df['asset_cumulative'] = (1 + df['returns']).cumprod() - 1
    df['strategy_cumulative'] = (1 + df['strategy_returns']).cumprod() - 1
    
    plt.figure(figsize=(12, 6))
    plt.plot(df['asset_cumulative'], label='Asset (Buy and Hold)')
    plt.plot(df['strategy_cumulative'], label='RSI Strategy')
    plt.title("Backtest: RSI Strategy vs. Buy and Hold")
    plt.xlabel("Date")
    plt.ylabel("Cumulative Returns")
    plt.legend()
    plt.grid(True)
    plt.show()

# Run
df = get_data_with_indicators()
df = add_rsi_strategy(df)
test_strategy(df)