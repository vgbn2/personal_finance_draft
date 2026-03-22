"""
Master Clock & Market Sequencing.

Handles chronological synchronization with Polymarket's 15-minute resolution windows.
Pre-warms the system prior to a market open, and triggers hard rollovers to prevent
the system from trading expired markets.
"""
import asyncio
import time
from typing import Any, Dict, List, Optional

from app.core.event_bus import Channel, event_bus
from app.utils.logger import log


class WindowSequenceHandler:
    """
    Manages the chronological sequence of target markets.

    1. Sorts loaded markets chronologically by expiry.
    2. Emits a `warming_up` event 120s before expiry.
    3. Emits an `active` event strictly at expiry to roll the market.
    """

    def __init__(self, pre_warm_sec: int = 120):
        self.pre_warm_sec = pre_warm_sec
        self.schedule: List[Dict[str, Any]] = []
        self._running: bool = False
        self._task: Optional[asyncio.Task] = None

    def load_schedule(self, markets: List[Dict[str, Any]]) -> None:
        """
        Load a list of target markets with their expiration times.
        Expected format: [{"market_id": "0x...", "expiry_time": 171...}, ...]
        """
        self.schedule = sorted(markets, key=lambda m: m["expiry_time"])
        log.info(f"Clock: Loaded schedule with {len(self.schedule)} sequential markets")

    async def start(self) -> None:
        """Start the background clock loop."""
        self._running = True
        self._task = asyncio.create_task(self._clock_loop())
        log.info("Clock: Background sequencer started")

    async def stop(self) -> None:
        """Stop the clock loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        log.info("Clock: Sequencer stopped")

    async def _clock_loop(self) -> None:
        while self._running:
            if not self.schedule:
                await asyncio.sleep(5)
                continue

            # Look at the next upcoming market
            current_target = self.schedule[0]
            market_id = current_target["market_id"]
            expiry = current_target["expiry_time"]
            now = time.time()

            time_to_expiry = expiry - now

            # Past expiration + 5 mins grace period? Drop it.
            if time_to_expiry < -300:
                log.warning(f"Clock: Discarding expired market [{market_id}]")
                self.schedule.pop(0)
                continue

            # Phase 1: Pre-warming
            if 0 < time_to_expiry <= self.pre_warm_sec and not current_target.get("warmed_up"):
                current_target["warmed_up"] = True
                await event_bus.publish(
                    Channel.WINDOW_ROLLED,
                    {"status": "warming_up", "market_id": market_id}
                )

            # Phase 2: Active Rollover
            # We roll precisely at expiry (time_to_expiry <= 0)
            if time_to_expiry <= 0 and not current_target.get("activated"):
                current_target["activated"] = True
                await event_bus.publish(
                    Channel.WINDOW_ROLLED,
                    {"status": "active", "market_id": market_id}
                )
                
                # Once activated, pop it from schedule so we focus on next
                self.schedule.pop(0)

            await asyncio.sleep(1)  # 1-second clock resolution


# Provide a singleton instance
master_clock = WindowSequenceHandler()


if __name__ == "__main__":
    # verification script
    async def verify():
        from app.core.state import system_state
        
        await system_state.start()
        
        clock = WindowSequenceHandler(pre_warm_sec=3)
        now = time.time()
        
        # Schedule a market to expire in 4 seconds
        clock.load_schedule([
            {"market_id": "MKT-1", "expiry_time": now + 4}
        ])
        
        await clock.start()
        
        print("Waiting for warm-up...")
        await asyncio.sleep(2)
        print(f"State after 2s (warming up): next={system_state.next_market}, active={system_state.active_market}")
        
        print("Waiting for rollover...")
        await asyncio.sleep(3)
        print(f"State after 5s (rolled): next={system_state.next_market}, active={system_state.active_market}")
        
        await clock.stop()
        await system_state.stop()
        
        if system_state.active_market == "MKT-1":
            print("[OK] Master Clock sequence verified.")
        else:
            print("[FAIL] Sequence failed.")

    asyncio.run(verify())
