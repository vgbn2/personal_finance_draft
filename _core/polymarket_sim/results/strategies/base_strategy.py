"""
Polymarket Paper Trading Simulator — Base Strategy ABC
Interface that all user strategies must implement.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import List

from ..core.models import Fill, OrderbookSnapshot, PortfolioSnapshot, TickData, VirtualOrder
from .sizing import KellySizer, SizingConfig


class BaseStrategy(ABC):
    """
    Abstract base class for trading strategies.

    Lifecycle:
        1. Engine calls on_orderbook_update() with each WS update
        2. Engine calls on_tick() with aggregated tick data
        3. Strategy returns list[VirtualOrder] — or empty list
        4. Engine calls on_fill() when virtual fills occur

    Rules:
        - All orderbook / tick data is READ-ONLY (frozen dataclasses)
        - Strategy must NOT block (no time.sleep, no long loops)
        - Return empty list if no action needed
        - Each callback has a 1-second timeout enforced by the runner

    Attributes:
        name: Human-readable strategy name
        description: What the strategy does
        version: Strategy version string
    """

    name: str = "Unnamed Strategy"
    description: str = ""
    version: str = "0.1.0"

    def __init__(self):
        self._portfolio_snapshot: PortfolioSnapshot | None = None
        
        # Position Sizing Helper
        self.sizer = KellySizer(SizingConfig())
        
        # Throttling
        self._last_trade_time: float = 0.0

    def init_params(self, params: dict):
        """
        Initializes strategy internal parameters from a JSON configuration.
        Override this in your subclass to handle specific settings.
        """
        pass

    def can_trade(self, cooldown_s: float) -> bool:
        """Check if enough time has passed since the last trade."""
        return (time.time() - self._last_trade_time) >= cooldown_s

    def record_trade(self):
        """Update the last trade timestamp."""
        self._last_trade_time = time.time()

    # ── Callbacks (implement these) ───────────────────────────

    @abstractmethod
    def on_tick(self, tick: TickData) -> List[VirtualOrder]:
        """
        Called on each tick with aggregated market data.

        Args:
            tick: TickData with mid_price, best_bid, best_ask, spread

        Returns:
            List of VirtualOrder to submit, or empty list.
        """
        ...

    @abstractmethod
    def on_orderbook_update(self, book: OrderbookSnapshot) -> List[VirtualOrder]:
        """
        Called when the orderbook changes (snapshot or delta applied).

        Args:
            book: Immutable OrderbookSnapshot with bids/asks

        Returns:
            List of VirtualOrder to submit, or empty list.
        """
        ...

    @abstractmethod
    def on_fill(self, fill: Fill) -> None:
        """
        Called when a virtual fill occurs for one of this strategy's orders.

        Args:
            fill: Immutable Fill object with price, size, slippage
        """
        ...

    # ── Helpers (available to strategies) ─────────────────────

    def get_portfolio(self) -> PortfolioSnapshot | None:
        """Read-only access to most recent portfolio snapshot."""
        return self._portfolio_snapshot

    def _update_portfolio(self, snapshot: PortfolioSnapshot):
        """Called by the engine — NOT by the strategy."""
        self._portfolio_snapshot = snapshot
