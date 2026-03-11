from src.strategies.base import Strategy
from src.models.market import Market
from src.models.signal import Signal, SignalResult
from src.utils.constants import SIGNAL_DIP, YES, PRICE_DROP_THRESHOLD
from src.utils.kelly import kelly_for_outcome
from src.config import config
from src.utils.logger import logger
from typing import Dict
from datetime import datetime, timedelta


class DipStrategy(Strategy):
    """
    Dip Buying / Crash Recovery Strategy.
    
    Logic: If price drops > 20% in < 5min without news, it's a liquidity cascade.
    Target: 50% retrace of the drop.
    """
    
    def __init__(self):
        super().__init__("DipStrategy")
        self.drop_threshold = PRICE_DROP_THRESHOLD
        self.price_history: Dict[str, list] = {}
        self.time_window_minutes = 5
    
    async def analyze(self, market: Market) -> SignalResult:
        """Detect dip buying opportunities."""
        result = SignalResult()
        
        history = self.price_history.get(market.id, [])
        
        # Update price history
        history.append({
            "yes_price": market.yes_price,
            "no_price": market.no_price,
            "timestamp": market.updated_at
        })
        
        # Filter to time window
        cutoff = datetime.utcnow() - timedelta(minutes=self.time_window_minutes)
        recent = [h for h in history if h["timestamp"] > cutoff]
        
        if len(recent) < 2:
            self.price_history[market.id] = recent
            return result
        
        # Find high and current price in window
        high_price = max(h["yes_price"] for h in recent)
        current_price = recent[-1]["yes_price"]
        
        # Calculate drop
        drop_pct = (high_price - current_price) / high_price if high_price > 0 else 0
        
        if drop_pct > self.drop_threshold:
            # Significant drop detected
            
            # Estimate retrace (expect 50% bounce)
            target_price = current_price + (high_price - current_price) * 0.5
            
            # Current edge = target - current
            edge = (target_price - current_price) / current_price if current_price > 0 else 0
            
            if edge > 0.05:
                size_pct = kelly_for_outcome(
                    0.65,  # 65% chance of bounce
                    1.0 / edge,
                    YES,
                    config.KELLY_FRACTION,
                    config.MAX_POSITION_SIZE
                )
                
                signal = Signal(
                    signal_type=SIGNAL_DIP,
                    market_id=market.id,
                    outcome=YES,
                    entry_price=current_price,
                    size_pct=size_pct,
                    confidence=0.6,
                    edge=edge,
                    take_profit=target_price,
                    reasoning=f"Dip buy: {drop_pct:.1%} drop in {self.time_window_minutes}min, target {target_price:.4f}"
                )
                result.add_signal(signal)
                
                logger.info(
                    f"DIP SIGNAL: {market.id} | "
                    f"Drop={drop_pct:.1%} | Entry={current_price:.4f} | "
                    f"Target={target_price:.4f}"
                )
        
        self.price_history[market.id] = recent[-100:]  # Keep last 100
        return result
    
    def reset_history(self, market_id: str):
        """Reset price history for a market."""
        if market_id in self.price_history:
            del self.price_history[market_id]
