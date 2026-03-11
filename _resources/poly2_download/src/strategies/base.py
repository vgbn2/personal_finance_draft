from abc import ABC, abstractmethod
from typing import Optional
from src.models.market import Market
from src.models.signal import Signal, SignalResult
from src.utils.logger import logger


class Strategy(ABC):
    """Base class for trading strategies."""
    
    def __init__(self, name: str):
        self.name = name
        self.enabled = True
    
    @abstractmethod
    async def analyze(self, market: Market) -> SignalResult:
        """
        Analyze market and return trading signals.
        
        Args:
            market: Current market state
            
        Returns:
            SignalResult with any detected signals
        """
        pass
    
    async def on_market_update(self, market: Market):
        """Called when market data updates."""
        pass
    
    def enable(self):
        """Enable the strategy."""
        self.enabled = True
        logger.info(f"{self.name} enabled")
    
    def disable(self):
        """Disable the strategy."""
        self.enabled = False
        logger.info(f"{self.name} disabled")


class CompositeStrategy(Strategy):
    """Runs multiple strategies and aggregates signals."""
    
    def __init__(self):
        super().__init__("CompositeStrategy")
        self.strategies: list[Strategy] = []
    
    def add_strategy(self, strategy: Strategy):
        """Add a strategy to the composite."""
        self.strategies.append(strategy)
    
    def remove_strategy(self, strategy: Strategy):
        """Remove a strategy from the composite."""
        if strategy in self.strategies:
            self.strategies.remove(strategy)
    
    async def analyze(self, market: Market) -> SignalResult:
        """Run all strategies and aggregate results."""
        result = SignalResult()
        
        for strategy in self.strategies:
            if not strategy.enabled:
                continue
            
            try:
                signal_result = await strategy.analyze(market)
                for signal in signal_result.signals:
                    result.add_signal(signal)
            except Exception as e:
                logger.error(f"Error in {strategy.name}: {e}")
        
        return result
