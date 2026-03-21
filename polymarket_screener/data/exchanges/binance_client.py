import ccxt
import time
import pandas as pd
from typing import List, Dict, Optional

class BinanceClient:
    def __init__(self, use_testnet: bool = False):
        self.exchange = ccxt.binance({
            'enableRateLimit': True,
        })
        if use_testnet:
            self.exchange.set_sandbox_mode(True)
    
    def fetch_ohlcv(self, symbol: str, timeframe: str = '1h', limit: int = 100) -> pd.DataFrame:
        """Fetches OHLCV data for a given symbol."""
        try:
            ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            return df
        except Exception as e:
            print(f"Error fetching Binance data for {symbol}: {e}")
            return pd.DataFrame()

    def fetch_current_price(self, symbol: str, max_staleness: int = 60) -> Optional[float]:
        """Fetches the latest ticker price and enforces freshness."""
        try:
            ticker = self.exchange.fetch_ticker(symbol)
            timestamp = ticker.get('timestamp')
            
            if timestamp:
                current_time = time.time() * 1000
                staleness = (current_time - timestamp) / 1000
                if staleness > max_staleness:
                    print(f"Warning: Binance data for {symbol} is stale ({staleness:.1f}s old)")
                    return None
                    
            return ticker.get('last')
        except Exception as e:
            print(f"Error fetching Binance ticker for {symbol}: {e}")
            return None

if __name__ == "__main__":
    client = BinanceClient()
    print("Testing Binance OHLCV fetch for BTC/USDT...")
    print(client.fetch_ohlcv("BTC/USDT", limit=5))
    print(f"Current BTC/USDT Price: {client.fetch_current_price('BTC/USDT')}")
