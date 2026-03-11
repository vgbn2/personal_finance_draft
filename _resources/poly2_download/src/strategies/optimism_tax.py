from src.strategies.base import Strategy
from src.models.market import Market
from src.models.signal import Signal, SignalResult
from src.utils.constants import SIGNAL_OPTIMISM_TAX, YES, NO
from src.utils.kelly import kelly_for_outcome
from src.config import config
from src.utils.logger import logger


class OptimismTaxStrategy(Strategy):
    """
    Optimism Tax Strategy.
    
    Exploits retail over-optimism on longshots (YES < 10c).
    Retail pays structural premium for "hope".
    System acts as Maker, selling YES or Buying NO.
    """
    
    # Historical win rates at different price tiers (from research)
    LONGSHOT_WIN_RATES = {
        0.05: 0.04,   # 5c wins ~4% of time
        0.08: 0.06,   # 8c wins ~6% of time  
        0.10: 0.08,   # 10c wins ~8% of time
    }
    
    CATEGORIES = ["Sports", "Entertainment", "Politics", "Elections"]
    
    def __init__(self):
        super().__init__("OptimismTaxStrategy")
        self.longshot_threshold = 0.10  # Below 10c
    
    async def analyze(self, market: Market) -> SignalResult:
        """Detect optimism tax opportunities."""
        result = SignalResult()
        
        # Check if market qualifies
        if not self._qualifies(market):
            return result
        
        yes_price = market.yes_price
        
        if yes_price < self.longshot_threshold:
            # This is a longshot - check if overpriced
            
            actual_win_rate = self._get_actual_win_rate(yes_price)
            implied_prob = yes_price
            
            # If actual win rate < implied, YES is overpriced
            if actual_win_rate < implied_prob:
                # Sell YES (or buy NO)
                edge = implied_prob - actual_win_rate
                
                # NO price
                no_price = market.no_price
                no_implied_win = 1.0 - no_price
                
                # Expected value of selling YES at current price
                ev_sell_yes = (actual_win_rate * 0) + ((1 - actual_win_rate) * yes_price)
                
                if ev_sell_yes > 0.05:  # At least 5% expected return
                    # Sell YES
                    size_pct = min(
                        config.MAX_POSITION_SIZE * 0.5,  # Smaller size for this strategy
                        edge * 2
                    )
                    
                    signal = Signal(
                        signal_type=SIGNAL_OPTIMISM_TAX,
                        market_id=market.id,
                        outcome=YES,
                        entry_price=yes_price,
                        size_pct=size_pct,
                        confidence=0.75,
                        edge=edge,
                        reasoning=f"Optimism Tax: {yes_price:.2f} implies {implied_prob:.1%} win, actual ~{actual_win_rate:.1%}"
                    )
                    result.add_signal(signal)
                    
                    logger.info(
                        f"OPTIMISM TAX: {market.id} | "
                        f"YES={yes_price:.2f} | Implied={implied_prob:.1%} | "
                        f"Actual={actual_win_rate:.1%}"
                    )
            
            # Also check NO side (if NO is underpriced)
            no_price = market.no_price
            if no_price < self.longshot_threshold:
                actual_no_win = self._get_actual_win_rate(no_price)
                implied_no = no_price
                
                if actual_no_win < implied_no:
                    edge = implied_no - actual_no_win
                    
                    if edge > 0.05:
                        size_pct = min(
                            config.MAX_POSITION_SIZE * 0.5,
                            edge * 2
                        )
                        
                        signal = Signal(
                            signal_type=SIGNAL_OPTIMISM_TAX,
                            market_id=market.id,
                            outcome=NO,
                            entry_price=no_price,
                            size_pct=size_pct,
                            confidence=0.75,
                            edge=edge,
                            reasoning=f"Optimism Tax (NO): {no_price:.2f} implied {implied_no:.1%}, actual ~{actual_no_win:.1%}"
                        )
                        result.add_signal(signal)
        
        return result
    
    def _qualifies(self, market: Market) -> bool:
        """Check if market qualifies for optimism tax strategy."""
        category = market.category or ""
        
        # Check if in target categories
        if any(c.lower() in category.lower() for c in self.CATEGORIES):
            return True
        
        # Also check sports/entertainment keywords in question
        keywords = ["game", "match", "win", "championship", "election", "candidate"]
        question = market.question.lower() if market.question else ""
        
        return any(k in question for k in keywords)
    
    def _get_actual_win_rate(self, price: float) -> float:
        """Get historical win rate for price tier."""
        for tier, win_rate in sorted(self.LONGSHOT_WIN_RATES.items()):
            if price <= tier:
                return win_rate
        
        # Extrapolate for prices not in table
        # Assume linear relationship
        return max(price * 0.8, 0.01)
