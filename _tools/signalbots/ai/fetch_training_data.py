"""
Sentinel-MT5 — Training Data Fetcher
====================================
Downloads historical M15 data from MetaTrader 5 for AI training.

Usage:
    python ai/fetch_training_data.py

Output:
    ai/data/raw/{SYMBOL}_M15.csv
"""
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

import MetaTrader5 as mt5
import pandas as pd
from core.config import Config

DATA_DIR = Path(__file__).parent / "data" / "raw"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Symbols to fetch (edit as needed)
SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD"]
BARS_COUNT = 50000  # Approx 1.5 years of M15 data

def fetch_data():
    print(f"Connecting to MT5 (Account: {Config.MT5_LOGIN_ID})...")
    if not mt5.initialize():
        print(f"❌ MT5 Init Failed: {mt5.last_error()}")
        return

    # Try login if credentials exist
    if Config.MT5_LOGIN_ID:
        if not mt5.login(Config.MT5_LOGIN_ID, Config.MT5_PASSWORD, Config.MT5_SERVER):
            print(f"❌ Login Failed: {mt5.last_error()}")
            return

    print("✅ Connected to MT5")
    
    for symbol in SYMBOLS:
        print(f"Downloading {symbol}...", end=" ", flush=True)
        
        # Check if symbol exists
        if not mt5.symbol_select(symbol, True):
            print(f"❌ Symbol not found")
            continue

        rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M15, 0, BARS_COUNT)
        
        if rates is None or len(rates) == 0:
            print("❌ No data")
            continue

        # Convert to DataFrame
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        
        # Save to CSV
        filename = DATA_DIR / f"{symbol}_M15.csv"
        df.to_csv(filename, index=False)
        print(f"✅ Saved {len(df)} rows to {filename.name}")

    mt5.shutdown()
    print("\nDone! Data saved to", DATA_DIR)

if __name__ == "__main__":
    fetch_data()
