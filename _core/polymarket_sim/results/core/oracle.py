"""
Polymarket Paper Trading Simulator — Oracle Manager
Periodically polls market status and handles settlement for resolved markets.
"""

import asyncio
import logging
import time
from typing import List, Optional
from .registry import MarketRegistry, MarketState
from .database import TradeDatabase
from ..data.rest_client import GammaAPIClient
from ..analysis.reporting import SessionReporter

logger = logging.getLogger(__name__)

class OracleManager:
    """
    Background manager that monitors active markets for resolution.
    When a market resolves, it triggers settlement for all strategy portfolios.
    """

    def __init__(
        self,
        registry: MarketRegistry,
        db: TradeDatabase,
        rest: GammaAPIClient,
        poll_interval: int = 60
    ):
        self._registry = registry
        self._db = db
        self._rest = rest
        self._poll_interval = poll_interval
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def start(self):
        """Start the background resolution polling."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("🔮 Oracle Manager started (polling every %ds)", self._poll_interval)

    def stop(self):
        """Stop the background polling."""
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("🔮 Oracle Manager stopped.")

    async def _poll_loop(self):
        """Main polling loop."""
        while self._running:
            try:
                markets = self._registry.get_all()
                for market in markets:
                    # Skip if market is configured to bypass oracle polling
                    if market.skip_oracle:
                        continue
                    # Skip if already marked as resolved in our state
                    await self._check_market_resolution(market)
                
                await asyncio.sleep(self._poll_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in Oracle Manager poll loop: %s", e, exc_info=True)
                await asyncio.sleep(self._poll_interval)

    async def _check_market_resolution(self, market: MarketState):
        """Fetch market status and trigger settlement if resolved."""
        try:
            # We use slug to fetch, or market_id? config uses both. slug is more reliable for API.
            data = await self._rest.fetch_market_by_slug(market.slug)
            
            resolved = data.get("resolved", False)
            if resolved:
                await self._settle_market(market, data)
                # Unregister or mark resolved? For now, we'll unregister after settlement to free WS/Tick slots
                # But wait, Engine needs to know it's gone.
                # Actually, settlement is the terminal state. 
                logger.info("🏁 Market %s (%s) resolved. Settlement complete.", market.market_id, market.slug)
                self._registry.unregister(market.market_id)
                
        except Exception as e:
            logger.debug("Failed to check resolution for %s: %s", market.slug, e)

    async def _settle_market(self, market: MarketState, market_data: dict):
        """
        Finalize all portfolios for a market based on its outcome.
        """
        winning_outcome = market_data.get("winningOutcome", "")
        if not winning_outcome:
            # Try to extract from nested markets if it's a field
            nested = market_data.get("markets", [])
            if nested:
                winning_outcome = nested[0].get("winningOutcome", "")

        logger.info("🏁 Settling Market [%s]: Winner is '%s'", market.title, winning_outcome)

        for runner_id, portfolio in market.portfolios.items():
            # Realize pnl for all positions
            portfolio.settle_positions(winning_outcome, market.outcomes, market.token_ids)
            
            # Save final snapshot
            snap = portfolio.snapshot()
            sid = market.session_ids.get(runner_id)
            if sid:
                await self._db.save_snapshot(sid, snap)
                # We don't necessarily 'end' the session if the bot continues to other markets,
                # but for THIS market-session combo, we should save a cycle report.
                SessionReporter.save_cycle_report(
                    session_id=sid,
                    market_slug=market.slug,
                    market_title=market.title,
                    winning_outcome=winning_outcome,
                    start_time=0.0, # We don't track market start time strictly yet
                    end_time=time.time(),
                    final_snapshot=snap,
                    trade_history=[] # TODO
                )
