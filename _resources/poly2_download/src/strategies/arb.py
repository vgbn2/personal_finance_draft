from src.strategies.base import Strategy
from src.models.market import Market
from src.models.signal import Signal, SignalResult
from src.utils.constants import SIGNAL_ARB, YES, NO
from src.utils.kelly import kelly_criterion
from src.config import config
from src.utils.logger import logger


class ArbitrageStrategy(Strategy):
    """
    Single-Market Arbitrage Strategy.
    
    Exploits the breakage of YES + NO = 1.0 identity.
    Trigger: Sum(Yes_Ask + No_Ask) < ARB_THRESHOLD (default 0.96)
    """
    
    def __init__(self):
        super().__init__("ArbitrageStrategy")
        self.threshold = config.ARB_THRESHOLD
    
    async def analyze(self, market: Market) -> SignalResult:
        """Detect arbitrage opportunities."""
        result = SignalResult()
        
        if not market.yes_ask or not market.no_ask:
            return result
        
        total_cost = market.yes_ask + market.no_ask
        
        if total_cost < self.threshold:
            edge = self.threshold - total_cost
            logger.info(
                f"ARB DETECTED: {market.id} | "
                f"YES_ASK={market.yes_ask:.4f} NO_ASK={market.no_ask:.4f} "
                f"TOTAL={total_cost:.4f} EDGE={edge:.4f}"
            )
            
            # For arb, we use fixed sizing based on liquidity
            # Kelly is for probabilistic bets, arb is "risk-free"
            size_pct = min(config.MAX_POSITION_SIZE, edge * 10)
            
            # Determine which leg to buy
            # Buy cheaper leg, sell more expensive
            if market.yes_ask < market.no_ask:
                outcome = YES
                entry_price = market.yes_ask
            else:
                outcome = NO
                entry_price = market.no_ask
            
            signal = Signal(
                signal_type=SIGNAL_ARB,
                market_id=market.id,
                outcome=outcome,
                entry_price=entry_price,
                size_pct=size_pct,
                confidence=1.0,  # Arb is "risk-free" so high confidence
                edge=edge,
                reasoning=f"Mint/Merge arb: {total_cost:.4f} < {self.threshold}"
            )
            result.add_signal(signal)
        
        return result


class IntegerProgrammingArb(ArbitrageStrategy):
    """
    Advanced Arbitrage using Integer Programming.
    
    Solves for optimal quantity where Cost < 1.0 using Gurobi/Highs.
    """
    
    def __init__(self):
        super().__init__()
        self.solver_available = False
        self._init_solver()
    
    def _init_solver(self):
        """Initialize optimization solver."""
        try:
            import gurobipy
            self.solver = "gurobi"
            self.solver_available = True
            logger.info("Gurobi solver initialized for arb")
        except ImportError:
            try:
                import highs
                self.solver = "highs"
                self.solver_available = True
                logger.info("Highs solver initialized for arb")
            except ImportError:
                logger.warning("No optimization solver available, falling back to simple arb")
                self.solver_available = False
    
    async def analyze(self, market: Market) -> SignalResult:
        """Run integer programming arbitrage detection."""
        # For now, use base implementation
        # Advanced IP implementation would go here
        return await super().analyze(market)
