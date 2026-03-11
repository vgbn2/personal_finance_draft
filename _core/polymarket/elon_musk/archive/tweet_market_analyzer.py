import requests
import pandas as pd
import plotly.graph_objects as go
from datetime import datetime

# 1. CONFIGURATION
# Replace this with the Token ID you found in Phase 1
TOKEN_ID = "YOUR_CLOB_TOKEN_ID_HERE" 
INTERVAL = "1h"  # Resample frequency: '1h', '15min', '1d'

def get_polymarket_candles(token_id, freq):
    # 2. FETCH RAW HISTORY
    # The 'fidelity' param controls data density. We want mostly raw data.
    url = f"https://clob.polymarket.com/prices-history"
    params = {
        "market": token_id,
        "interval": "max", # Get all history
        "fidelity": 10     # Minutes per data point (lower = more raw)
    }
    
    resp = requests.get(url, params=params).json()
    
    if not resp.get('history'):
        print("No data found!")
        return None

    # 3. PROCESS DATA TO DATAFRAME
    df = pd.DataFrame(resp['history'])
    
    # Polymarket returns: 't' (unix timestamp), 'p' (price)
    df['date'] = pd.to_datetime(df['t'], unit='s')
    df.set_index('date', inplace=True)
    
    # 4. THE MAGIC: RESAMPLE TO OHLC
    # This converts the single price line into 4 dimensions
    ohlc = df['p'].resample(freq).agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last'
    })
    
    # Drop gaps (periods with no trades)
    ohlc.dropna(inplace=True)
    
    return ohlc

# 5. EXECUTE & PLOT
df_candles = get_polymarket_candles(TOKEN_ID, INTERVAL)

if df_candles is not None:
    print(f"Generated {len(df_candles)} candles.")
    
    fig = go.Figure(data=[go.Candlestick(
        x=df_candles.index,
        open=df_candles['open'],
        high=df_candles['high'],
        low=df_candles['low'],
        close=df_candles['close']
    )])
    
    fig.update_layout(
        title=f"Polymarket Candles ({INTERVAL})",
        yaxis_title="Probability (Price)",
        template="plotly_dark"
    )
    
    fig.show()