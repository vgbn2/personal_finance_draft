"""
Base Strategy — Abstract interface for all trading strategy plugins.

Every concrete strategy must inherit from ``BaseStrategy`` and implement
the two callbacks:

  * ``on_market_update`` — receives each aggregated MarketSnapshot.
  * ``on_signal``        — receives TradeSignal objects emitted by the engine.

The ``StrategyRegistry`` discovers and instantiates these at boot-time.
"""
from abc import ABC, abstractmethod
from typing import Any, Optional

from app.core.domain_models import MarketSnapshot, TradeSignal
from app.core.event_bus import Channel, event_bus
from app.utils.logger import log


class BaseStrategy(ABC):
    """
    Abstract base class for all Polymarket trading strategies.

    Subclass Contract:
        name  — unique identifier string (e.g., ``"edge_scalper"``).
        on_market_update(snapshot) — called on every new MarketSnapshot.
        on_signal(signal)         — called when the screener emits a TradeSignal.

    Lifecycle:
        start()  — called once by the registry after all strategies load.
        stop()   — called once during graceful shutdown.
    """

    name: str = "unnamed_strategy"
    enabled: bool = True

    @abstractmethod
    async def on_market_update(self, snapshot: MarketSnapshot) -> Optional[TradeSignal]:
        """
        Invoked on each new MarketSnapshot tick.

        Returns:
            Optionally emit a TradeSignal if the strategy detects an edge.
        """
        ...

    @abstractmethod
    async def on_signal(self, signal: TradeSignal) -> None:
        """
        Invoked when the screener emits a signal that passes risk gates.

        Use this for position management, logging, or secondary validation.
        """
        ...

    async def start(self) -> None:
        """Called once when the strategy is loaded by the registry."""
        log.info(f"Strategy [{self.name}] started")

    async def stop(self) -> None:
        """Called once during graceful shutdown."""
        log.info(f"Strategy [{self.name}] stopped")

    def __repr__(self) -> str:
        return f"<Strategy: {self.name} enabled={self.enabled}>"
