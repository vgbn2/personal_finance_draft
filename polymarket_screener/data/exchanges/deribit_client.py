import ccxt
import time
from typing import List, Dict, Optional

class DeribitClient:
    def __init__(self, use_testnet: bool = False):
        self.exchange = ccxt.deribit({
            'enableRateLimit': True,
        })
        if use_testnet:
            self.exchange.set_sandbox_mode(True)

    def fetch_implied_volatility(self, currency: str = 'BTC') -> Optional[float]:
        """Fetches the current DVol (Deribit Volatility Index) for the given currency."""
        try:
            # Deribit provides a volatility index ticker, e.g., 'BTC-DVOL'
            ticker = self.exchange.fetch_ticker(f"{currency}-DVOL")
            return ticker.get('last')
        except Exception as e:
            print(f"Error fetching Deribit IV for {currency}: {e}")
            return None

    def fetch_options_greeks(self, currency: str = 'BTC', max_staleness: int = 60) -> Dict:
        """Fetches Greeks for ATM options nearest to expiry."""
        # Simplified for now: in production, you'd fetch the active options chain
        # and parse the greeks from tickers.
        try:
            # We fetch all active instruments for the currency (Options only)
            instruments = self.exchange.public_get_get_instruments({
                'currency': currency,
                'kind': 'option',
                'expired': False
            })
            # Just returning a placeholder structure for the framework
            # The full implementation will filter for ATM and pull greeks
            return {"delta": 0.0, "gamma": 0.0, "vega": 0.0, "theta": 0.0, "iv": self.fetch_implied_volatility(currency)}
        except Exception as e:
            print(f"Error fetching Deribit options data for {currency}: {e}")
            return {}

if __name__ == "__main__":
    client = DeribitClient()
    iv = client.fetch_implied_volatility('BTC')
    print(f"BTC DVOL (Implied Volatility): {iv}")
