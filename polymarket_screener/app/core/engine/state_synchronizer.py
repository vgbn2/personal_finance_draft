"""
Global State Synchronizer.

Maintains the system-wide contextual state, including the currently active
market, orderbook cache, and global exposure limits. It listens to the
Master Clock (`WINDOW_ROLLED`) to automate transitions without manual input.
"""
import asyncio
from typing import Dict, Optional

from app.core.engine.event_bus import Channel, event_bus
from app.core.models.domain_models import MarketSnapshot
from app.utils.logger import log


class SystemState:
    """
    Central repository for global bot state.

    Listens to:
    - WINDOW_ROLLED: Updates the active market ID.
    - MARKET_UPDATE: Caches the latest snapshot for the active market.

    Usage:
        if system_state.active_market == snapshot.market_id:
            process_logic()
    """

    def __init__(self):
        self.active_market: Optional[str] = None
        self.next_market: Optional[str] = None
        self.latest_snapshot: Optional[MarketSnapshot] = None
        self.is_warming_up: bool = False
        self._running: bool = False

    async def start(self) -> None:
        """Subscribe to necessary EventBus channels."""
        self._running = True
        event_bus.on(Channel.WINDOW_ROLLED, self._on_window_rolled)
        event_bus.on(Channel.MARKET_UPDATE, self._on_market_update)
        log.info("SystemState tracker started")

    async def stop(self) -> None:
        self._running = False
        log.info("SystemState tracker stopped")

    async def _on_window_rolled(self, event_data: Dict[str, str]) -> None:
        """Handle transition to a new market window."""
        if not self._running:
            return

        status = event_data.get("status")
        market_id = event_data.get("market_id")

        if status == "warming_up":
            self.next_market = market_id
            self.is_warming_up = True
            log.info(f"SystemState: Warming up for next market [{market_id}]")

        elif status == "active":
            old_market = self.active_market
            self.active_market = market_id
            self.is_warming_up = False
            self.latest_snapshot = None  # Clear cache for the old market
            log.warning(f"SystemState: Rolled strictly from [{old_market}] -> [{market_id}]")

    async def _on_market_update(self, snapshot: MarketSnapshot) -> None:
        """Cache the latest tick for the currently active market."""
        if not self._running:
            return
        
        # Only cache if it matches either the active or the warming-up market
        if snapshot.market_id in (self.active_market, self.next_market):
            self.latest_snapshot = snapshot


# Module-level singleton
state_synchronizer = SystemState()
