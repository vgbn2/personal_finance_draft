from src.strategies.base import Strategy
from src.models.market import Market
from src.models.signal import Signal, SignalResult
from src.utils.constants import SIGNAL_REVERSION, YES, NO, MAX_CANDLE_STREAK, STREAK_REVERSION_PROB
from src.utils.kelly import kelly_for_outcome
from src.config import config
from src.utils.logger import logger
from typing import Dict


class ReversionStrategy(Strategy):
    """
    Streak Reversion Strategy.
    
    Logic: If 3+ consecutive 5m candles have identical outcomes,
    probability of reversal > 70%.
    """
    
    def __init__(self):
        super().__init__("ReversionStrategy")
        self.candle_history: Dict[str, list] = {}  # market_id -> list of candle data
        self.streak_threshold = MAX_CANDLE_STREAK
        self.reversion_prob = STREAK_REVERSION_PROB
    
    async def analyze(self, market: Market) -> SignalResult:
        """Detect streak reversion opportunities."""
        result = SignalResult()
        
        history = self.candle_history.get(market.id, [])
        
        if len(history) < self.streak_threshold:
            # Not enough history, update and skip
            history.append({
                "price": market.yes_price,
                "timestamp": market.updated_at
            })
            self.candle_history[market.id] = history[-100:]  # Keep last 100
            return result
        
        # Check for streak
        streak_count = self._count_streak(history)
        
        if streak_count >= self.streak_threshold:
            last_price = history[-1]["price"]
            
            # Determine direction
            if last_price > 0.5:
                # Streak up, expect reversal down (buy NO)
                outcome = NO
                estimated_prob = 1.0 - self.reversion_prob
                current_price = 1.0 - last_price
            else:
                # Streak down, expect reversal up (buy YES)
                outcome = YES
                estimated_prob = self.reversion_prob
                current_price = last_price
            
            edge = estimated_prob - current_price
            
            if edge > 0.05:  # Only trade if edge > 5%
                size_pct = kelly_for_outcome(
                    estimated_prob,
                    current_price,
                    outcome,
                    config.KELLY_FRACTION,
                    config.MAX_POSITION_SIZE
                )
                
                if size_pct > 0:
                    signal = Signal(
                        signal_type=SIGNAL_REVERSION,
                        market_id=market.id,
                        outcome=outcome,
                        entry_price=current_price,
                        size_pct=size_pct,
                        confidence=self.reversion_prob,
                        edge=edge,
                        reasoning=f"Streak reversion: {streak_count} consecutive {'up' if outcome == NO else 'down'} candles"
                    )
                    result.add_signal(signal)
                    
                    logger.info(
                        f"REVERSION SIGNAL: {market.id} | "
                        f"Outcome={outcome} | Edge={edge:.2%} | Size={size_pct:.2%}"
                    )
        
        # Update history
        history.append({
            "price": market.yes_price,
            "timestamp": market.updated_at
        })
        self.candle_history[market.id] = history[-100:]
        
        return result
    
    def _count_streak(self, history: list) -> int:
        """Count consecutive candles in same direction."""
        if len(history) < 2:
            return 0
        
        streak = 1
        last_direction = None
        
        for i in range(1, len(history)):
            current_price = history[i]["price"]
            prev_price = history[i-1]["price"]
            
            if current_price > prev_price:
                current_dir = "up"
            elif current_price < prev_price:
                current_dir = "down"
            else:
                current_dir = "flat"
            
            if current_dir == last_direction and last_direction != "flat":
                streak += 1
            else:
                streak = 1
            
            last_direction = current_dir
        
        return streak
    
    def reset_history(self, market_id: str):
        """Reset candle history for a market."""
        if market_id in self.candle_history:
            del self.candle_history[market_id]
