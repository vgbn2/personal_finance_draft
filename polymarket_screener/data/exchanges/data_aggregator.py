import time
from typing import Dict, Any
from .binance_client import BinanceClient
from .deribit_client import DeribitClient
from .macro_client import MacroClient
import json
import os

class DataAggregator:
    """
    Pulls data from multiple sources and validates freshness.
    No stale data allowed.
    """
    def __init__(self, config_path: str = '../../config/strategy_params.json'):
        self.binance_client = BinanceClient()
        self.deribit_client = DeribitClient()
        self.macro_client = MacroClient()
        self.config = self._load_config(config_path)

    def _load_config(self, path: str) -> Dict:
        try:
            full_path = os.path.join(os.path.dirname(__file__), path)
            with open(full_path, 'r') as f:
                return json.load(f).get('data_ingestion', {})
        except Exception as e:
            print(f"Could not load config: {e}. Using defaults.")
            return {
                "binance_symbols": ["BTC/USDT"],
                "deribit_currencies": ["BTC"],
                "max_staleness_seconds": 60
            }

    def fetch_latest_snapshot(self) -> Dict[str, Any]:
        """
        Fetches the latest snapshot from Binance, Deribit, and Macro.
        Verifies everything is fresh.
        """
        snapshot = {
            "timestamp": time.time(),
            "crypto_prices": {},
            "options_greeks": {},
            "macro_rates": {}
        }
        
        max_staleness = self.config.get("max_staleness_seconds", 60)

        # 1. Fetch Crypto Prices (Binance)
        for symbol in self.config.get("binance_symbols", []):
            price = self.binance_client.fetch_current_price(symbol, max_staleness=max_staleness)
            if price is None:
                print(f"[STALE/ERROR] Could not fetch fresh data for {symbol}.")
                # Reject stale data or raise Exception depending on strategy rules
            else:
                snapshot["crypto_prices"][symbol] = price

        # 2. Fetch Greeks (Deribit)
        for currency in self.config.get("deribit_currencies", []):
            greeks = self.deribit_client.fetch_options_greeks(currency, max_staleness=max_staleness)
            if not greeks:
                print(f"[STALE/ERROR] Could not fetch fresh options data for {currency}.")
            else:
                snapshot["options_greeks"][currency] = greeks

        # 3. Macro Data
        # We assume Macro data updates daily, so 'freshness' is different here.
        # This is a placeholder for macro data integration.
        # snapshot["macro_rates"]["DFF"] = self.macro_client.fetch_indicator("DFF", limit=1)...

        return snapshot

if __name__ == "__main__":
    aggregator = DataAggregator()
    print("Latest Unified Data Snapshot:")
    print(aggregator.fetch_latest_snapshot())
