"""
Async Data Aggregator.

Fuses Polymarket, Binance, Deribit, and Macro data streams into
unified MarketSnapshot objects. Implements stale-data poisoning
detection to prevent cross-exchange timestamp drift from corrupting
pricing decisions.

Uses the EventBus for downstream publishing.
"""
import asyncio
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.event_bus import Channel, event_bus
from app.core.ingestion import BaseExchangeClient
from app.core.models import MarketSnapshot, UnifiedTick
from app.utils.logger import log


# ─── Staleness Thresholds ───
BINANCE_STALE_MS = 200     # Binance tick older than 200ms
POLYMARKET_STALE_MS = 5000  # Polymarket tick older than 5s
MACRO_STALE_MS = 3600000    # Macro data older than 1 hour


class DataAggregator:
    """
    Central nervous system for market data fusion.

    Pulls from all registered exchange clients and merges into
    MarketSnapshot objects with stale-data protection.

    Usage:
        agg = DataAggregator()
        agg.register(binance_client)
        agg.register(deribit_client)
        snapshot = await agg.get_snapshot("BTC")
    """

    def __init__(self):
        self.clients: Dict[str, BaseExchangeClient] = {}
        self.cache: Dict[str, MarketSnapshot] = {}
        self._running: bool = False

    def register(self, client: BaseExchangeClient) -> None:
        """Register an exchange client for aggregation."""
        self.clients[client.name.lower()] = client
        log.info(f"Aggregator: registered [{client.name}]")

    async def get_snapshot(self, market_id: str) -> MarketSnapshot:
        """
        Fetch and merge data from all registered clients into a snapshot.

        Args:
            market_id: Market identifier to query

        Returns:
            MarketSnapshot with cross-exchange data
        """
        snapshot = MarketSnapshot(market_id=market_id)
        tasks = {}

        # Dispatch concurrent fetches
        base = config_manager.config.base_currency
        quote = config_manager.config.quote_currency
        
        for name, client in self.clients.items():
            if name == "binance":
                tasks[name] = client.fetch_data(f"{base}/{quote}")
            elif name == "deribit":
                tasks[name] = client.fetch_data(base)
            elif name == "fred":
                tasks[name] = client.fetch_data("DFF")
            elif name == "polymarket":
                tasks[name] = client.fetch_data(market_id)

        # Await all concurrently
        if tasks:
            results = await asyncio.gather(
                *tasks.values(), return_exceptions=True
            )
            for (name, _), result in zip(tasks.items(), results):
                if isinstance(result, Exception):
                    log.error(f"Aggregator: {name} fetch failed: {result}")
                    continue
                self._merge(snapshot, name, result)

        # Stale-data check
        snapshot.is_stale = self._check_staleness(snapshot)
        if snapshot.is_stale:
            log.warning(f"Snapshot for {market_id} flagged STALE")

        # Cache and publish
        self.cache[market_id] = snapshot
        await event_bus.publish(Channel.MARKET_UPDATE, snapshot)

        return snapshot

    def _merge(
        self, snapshot: MarketSnapshot, source: str, data: Dict[str, Any]
    ) -> None:
        """Merge exchange data into snapshot."""
        if not data:
            return

        if source == "binance":
            snapshot.spot_price = data.get("price")
        elif source == "deribit":
            snapshot.implied_vol = data.get("dvol")
        elif source == "fred":
            snapshot.risk_free_rate = data.get("latest_value")
        elif source == "polymarket":
            snapshot.polymarket_yes = data.get("yes_price")
            snapshot.polymarket_no = data.get("no_price")

    def _check_staleness(self, snapshot: MarketSnapshot) -> bool:
        """
        Detect cross-exchange timestamp drift.
        If any source is too far behind, flag as stale.
        """
        now_ms = time.time() * 1000

        for name, client in self.clients.items():
            if client.last_update == 0:
                continue  # Never fetched — not stale, just missing

            age_ms = now_ms - (client.last_update * 1000)

            if name == "binance" and age_ms > BINANCE_STALE_MS:
                log.warning(f"Binance data stale: {age_ms:.0f}ms")
                return True
            elif name == "polymarket" and age_ms > POLYMARKET_STALE_MS:
                log.warning(f"Polymarket data stale: {age_ms:.0f}ms")
                return True
            elif name == "fred" and age_ms > MACRO_STALE_MS:
                log.warning(f"Macro data stale: {age_ms:.0f}ms")
                return True

        return False

    async def start_polling(self, interval_sec: float = 1.0) -> None:
        """Continuous polling loop for all markets."""
        self._running = True
        log.info(f"Aggregator: polling started (interval={interval_sec}s)")

        while self._running:
            try:
                for market_id in list(self.cache.keys()) or list(config_manager.symbols.polymarket.watchlist):
                    await self.get_snapshot(market_id)
                await asyncio.sleep(interval_sec)
            except Exception as e:
                log.error(f"Aggregator polling error: {e}")
                await asyncio.sleep(5)

    def stop(self) -> None:
        """Stop the polling loop."""
        self._running = False
        log.info("Aggregator: polling stopped")


# ─── Module-level singleton ───
aggregator = DataAggregator()
