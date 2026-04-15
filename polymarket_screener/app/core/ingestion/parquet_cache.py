"""
Local Parquet Caching for TimeSeries Data.

Buffers incoming MarketSnapshots and flushes them to disk as highly
compressed Parquet files every N ticks. This is critical for building
the historical dataset used by the Zero-API-Wait backtesting engine.
"""
import asyncio
import os
from pathlib import Path
from typing import List, Dict, Any

import pandas as pd

from app.core.engine.event_bus import Channel, event_bus
from app.core.models.domain_models import MarketSnapshot
from app.utils.logger import log

CACHE_DIR = Path("data/cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


class TimeSeriesStore:
    """
    High-speed local parquet cache for market ticks.

    Listens to the EventBus for MARKET_UPDATE events, buffers them,
    and flushes to `data/cache/{market_id}_{timestamp}.parquet`.

    Usage:
        store = TimeSeriesStore(flush_threshold=1000)
        await store.start()
    """

    def __init__(self, flush_threshold: int = 1000):
        self.flush_threshold = flush_threshold
        self.buffers: Dict[str, List[Dict[str, Any]]] = {}
        self._running = False

    async def start(self) -> None:
        """Subscribe to MARKET_UPDATE events and begin buffering."""
        self._running = True
        event_bus.on(Channel.MARKET_UPDATE, self._on_market_update)
        log.info(f"Parquet Storage started (flush threshold={self.flush_threshold})")

    async def stop(self) -> None:
        """Stop listening and flush any remaining data to disk."""
        self._running = False
        log.info("Parquet Storage stopping — flushing buffers")
        for market_id in list(self.buffers.keys()):
            self._flush(market_id)

    async def _on_market_update(self, snapshot: MarketSnapshot) -> None:
        """Handle incoming snapshot from EventBus."""
        if not self._running:
            return

        mid = snapshot.market_id
        if mid not in self.buffers:
            self.buffers[mid] = []

        # Flatten strictly the pricing data for fast querying
        flat_data = {
            "timestamp": snapshot.timestamp,
            "market_id": snapshot.market_id,
            "spot_price": snapshot.spot_price,
            "implied_vol": snapshot.implied_vol,
            "polymarket_yes": snapshot.polymarket_yes,
            "polymarket_no": snapshot.polymarket_no,
            "risk_free_rate": snapshot.risk_free_rate,
            "is_stale": snapshot.is_stale,
        }
        self.buffers[mid].append(flat_data)

        if len(self.buffers[mid]) >= self.flush_threshold:
            self._flush(mid)

    def _flush(self, market_id: str) -> None:
        """Write buffer to a Parquet file and clear it."""
        buffer = self.buffers.get(market_id, [])
        if not buffer:
            return

        try:
            df = pd.DataFrame(buffer)
            # Use the first timestamp and last timestamp for filename
            start_ts = df["timestamp"].min().strftime("%Y%m%d_%H%M%S")
            end_ts = df["timestamp"].max().strftime("%H%M%S")
            filename = CACHE_DIR / f"{market_id}_{start_ts}_to_{end_ts}.parquet"

            # Write to disk using fastparquet engine
            # Requires `fastparquet` installed
            df.to_parquet(filename, engine="fastparquet", index=False)
            
            log.info(f"Flushed {len(buffer)} ticks to {filename.name}")
            
            # Clear buffer
            self.buffers[market_id] = []
        except Exception as e:
            log.error(f"Failed to flush parquet for {market_id}: {e}")

if __name__ == "__main__":
    # verification script
    async def verify():
        from app.core.engine.event_bus import event_bus
        store = TimeSeriesStore(flush_threshold=5)
        await store.start()
        
        # publish 6 dummy snapshots to trigger a flush
        for i in range(6):
            snap = MarketSnapshot(
                market_id="BTC-MOCK",
                spot_price=60000 + i,
                polymarket_yes=0.5
            )
            await event_bus.publish(Channel.MARKET_UPDATE, snap)
            
        await asyncio.sleep(0.5)
        await store.stop()
        
        files = list(CACHE_DIR.glob("BTC-MOCK_*.parquet"))
        if files:
            print(f"[OK] Parquet testing passed. File created: {files[0].name}")
        else:
            print("[FAIL] Parquet test failed. No file created.")

    asyncio.run(verify())
