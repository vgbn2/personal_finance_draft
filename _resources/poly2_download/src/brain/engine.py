from typing import Dict, Any
from datetime import datetime
from src.models.market import Market
from src.models.signal import SignalResult
from src.strategies import (
    CompositeStrategy,
    ArbitrageStrategy,
    ReversionStrategy,
    LagStrategy,
    DipStrategy,
    OptimismTaxStrategy
)
from src.utils.logger import logger


class StrategyEngine:
    """
    The Brain - Main analysis engine that coordinates all strategies.
    
    Receives market updates and returns trading signals.
    """
    
    def __init__(self):
        self.strategy = CompositeStrategy()
        self.market_states: Dict[str, Market] = {}
        self._init_strategies()
    
    def _init_strategies(self):
        """Initialize all trading strategies."""
        self.strategy.add_strategy(ArbitrageStrategy())
        self.strategy.add_strategy(ReversionStrategy())
        self.strategy.add_strategy(LagStrategy())
        self.strategy.add_strategy(DipStrategy())
        self.strategy.add_strategy(OptimismTaxStrategy())
        logger.info("Strategy engine initialized with all strategies")
    
    async def on_market_update(self, market_id: str, state: dict):
        """Handle market data update."""
        # Update local state
        if market_id not in self.market_states:
            self.market_states[market_id] = Market(id=market_id, question="")
        
        market = self.market_states[market_id]
        market.yes_price = state.get("yes_price", market.yes_price)
        market.no_price = state.get("no_price", market.no_price)
        market.updated_at = datetime.utcnow()
        
        # Run analysis
        await self.analyze_market(market)
    
    async def on_binance_update(self, symbol: str, trade: dict):
        """Handle Binance price update."""
        # Update lag strategy with Binance data
        pass
    
    async def analyze_market(self, market: Market) -> SignalResult:
        """Run analysis on a market."""
        try:
            result = await self.strategy.analyze(market)
            
            if result.has_signal:
                for signal in result.signals:
                    logger.info(
                        f"SIGNAL: {signal.signal_type} | "
                        f"Market={signal.market_id} | "
                        f"Outcome={signal.outcome} | "
                        f"Size={signal.size_pct:.2%} | "
                        f"Edge={signal.edge:.2%}"
                    )
                    # TODO: Send to execution engine
            
            return result
        except Exception as e:
            logger.error(f"Error analyzing market {market.id}: {e}")
            return SignalResult()
    
    def get_market(self, market_id: str) -> Market | None:
        """Get market state."""
        return self.market_states.get(market_id)
    
    def enable_strategy(self, name: str):
        """Enable a specific strategy."""
        for s in self.strategy.strategies:
            if s.name == name:
                s.enable()
                return
        logger.warning(f"Strategy {name} not found")
    
    def disable_strategy(self, name: str):
        """Disable a specific strategy."""
        for s in self.strategy.strategies:
            if s.name == name:
                s.disable()
                return
        logger.warning(f"Strategy {name} not found")
