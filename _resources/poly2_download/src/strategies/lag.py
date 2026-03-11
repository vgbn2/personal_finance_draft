from src.strategies.base import Strategy
from src.models.market import Market
from src.models.signal import Signal, SignalResult
from src.utils.constants import SIGNAL_LAG, YES, NO, PRICE_LAG_THRESHOLD
from src.utils.kelly import kelly_criterion
from src.config import config
from src.utils.logger import logger
from typing import Dict, Optional


class LagStrategy(Strategy):
    """
    Latency Arbitrage Strategy.
    
    Exploits lag between Binance and Polymarket crypto markets.
    Trigger: Binance moves > 1.5% while Polymarket moves < 0.5%
    """
    
    def __init__(self):
        super().__init__("LagStrategy")
        self.price_threshold = PRICE_LAG_THRESHOLD
        self.binance_prices: Dict[str, list] = {}  # symbol -> price history
        self.symbol_mapping = {
            "BTCUSDT": "bitcoin",
            "ETHUSDT": "ethereum", 
            "SOLUSDT": "solana"
        }
    
    async def analyze(self, market: Market) -> SignalResult:
        """Detect latency arbitrage opportunities."""
        result = SignalResult()
        
        # Skip non-crypto markets
        category = market.category or ""
        if not any(c in category.lower() for c in ["crypto", "bitcoin", "ethereum", "solana"]):
            return result
        
        # Get corresponding Binance symbol
        binance_symbol = self._get_binance_symbol(market)
        if not binance_symbol:
            return result
        
        # Get price data
        binance_delta = self._get_price_change(binance_symbol)
        
        if binance_delta is None:
            return result
        
        polymarket_delta = market.yes_price - 0.5  # Approximate delta from mid
        
        # Check for lag
        if abs(binance_delta) > self.price_threshold and abs(polymarket_delta) < self.price_threshold * 0.33:
            # Significant Binance move, minimal Polymarket response = lag
            
            if binance_delta > 0 and market.yes_price < 0.5:
                # Binance up, Polymarket hasn't caught up -> Buy YES
                outcome = YES
                estimated_prob = 0.5 + (binance_delta * 0.5)
                current_price = market.yes_price
            elif binance_delta < 0 and market.yes_price > 0.5:
                # Binance down, Polymarket hasn't caught up -> Buy NO
                outcome = NO
                estimated_prob = 0.5 + (binance_delta * 0.5)
                current_price = 1.0 - market.yes_price
            else:
                return result
            
            edge = abs(estimated_prob - (0.5 + polymarket_delta))
            
            if edge > 0.05:
                # Aggressive sizing due to high certainty of lag
                size_pct = kelly_criterion(
                    abs(estimated_prob),
                    1.0 / abs(edge),
                    config.KELLY_FRACTION * 2,  # More aggressive
                    config.MAX_POSITION_SIZE
                )
                
                signal = Signal(
                    signal_type=SIGNAL_LAG,
                    market_id=market.id,
                    outcome=outcome,
                    entry_price=current_price,
                    size_pct=size_pct,
                    confidence=0.85,
                    edge=edge,
                    reasoning=f"Binance lag: {binance_symbol} moved {binance_delta:.2%} vs Polymarket {polymarket_delta:.2%}"
                )
                result.add_signal(signal)
                
                logger.info(
                    f"LAG SIGNAL: {market.id} | "
                    f"Binance={binance_delta:.2%} Poly={polymarket_delta:.2%} | "
                    f"Outcome={outcome}"
                )
        
        return result
    
    def _get_binance_symbol(self, market: Market) -> Optional[str]:
        """Map Polymarket to Binance symbol."""
        question = (market.question or "").lower()
        
        for symbol, name in self.symbol_mapping.items():
            if name in question:
                return symbol
        
        return None
    
    def _get_price_change(self, symbol: str) -> Optional[float]:
        """Get 1-minute price change for symbol."""
        # This would be populated by the WebSocket manager
        # For now return None (requires external data)
        return None
    
    def update_binance_price(self, symbol: str, price: float):
        """Update Binance price from WebSocket."""
        if symbol not in self.binance_prices:
            self.binance_prices[symbol] = []
        
        self.binance_prices[symbol].append({
            "price": price,
            "timestamp": __import__("datetime").datetime.utcnow()
        })
        
        # Keep last 60 entries (1 minute)
        self.binance_prices[symbol] = self.binance_prices[symbol][-60:]
    
    def get_binance_delta(self, symbol: str) -> Optional[float]:
        """Calculate 1-minute price delta."""
        history = self.binance_prices.get(symbol, [])
        if len(history) < 2:
            return None
        
        first = history[0]["price"]
        last = history[-1]["price"]
        
        return (last - first) / first if first > 0 else None
