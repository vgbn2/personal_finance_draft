"""
Strategy Plugin Registry — Dynamic strategy discovery and lifecycle manager.

Scans the ``app/strategies/`` directory at boot, loads all concrete
``BaseStrategy`` subclasses, and wires them into the EventBus.

Usage:
    registry = StrategyRegistry()
    registry.discover()
    await registry.start_all()
"""
import importlib
import inspect
import os
from pathlib import Path
from typing import Dict, List, Optional

from app.core.domain_models import MarketSnapshot, TradeSignal
from app.core.event_bus import Channel, event_bus
from app.strategies.base import BaseStrategy
from app.utils.logger import log


STRATEGIES_DIR = Path(__file__).parent.parent / "strategies"


class StrategyRegistry:
    """
    Discovers, loads, and manages strategy plugin lifecycles.

    1. ``discover()``    — Scans ``app/strategies/`` for BaseStrategy subclasses.
    2. ``start_all()``   — Calls ``start()`` on each enabled strategy.
    3. ``dispatch_*()``  — Routes EventBus messages to all active strategies.
    """

    def __init__(self):
        self.strategies: Dict[str, BaseStrategy] = {}
        self._running: bool = False

    def discover(self, directory: Optional[Path] = None) -> int:
        """
        Scan the strategies directory and load all valid plugins.

        Returns:
            Number of strategies discovered.
        """
        scan_dir = directory or STRATEGIES_DIR

        if not scan_dir.exists():
            log.warning(f"StrategyRegistry: directory {scan_dir} not found")
            return 0

        discovered = 0
        for filename in os.listdir(scan_dir):
            if not filename.endswith(".py"):
                continue
            if filename.startswith("_") or filename == "base.py":
                continue

            module_name = filename[:-3]
            try:
                module = importlib.import_module(f"app.strategies.{module_name}")
            except Exception as e:
                log.error(f"StrategyRegistry: failed to import {module_name}: {e}")
                continue

            # Find all BaseStrategy subclasses in the module
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (
                    inspect.isclass(attr)
                    and issubclass(attr, BaseStrategy)
                    and attr is not BaseStrategy
                ):
                    try:
                        instance = attr()
                        self.strategies[instance.name] = instance
                        discovered += 1
                        log.info(
                            f"StrategyRegistry: loaded [{instance.name}] "
                            f"from {module_name}.py"
                        )
                    except Exception as e:
                        log.error(
                            f"StrategyRegistry: failed to instantiate "
                            f"{attr_name}: {e}"
                        )

        log.info(
            f"StrategyRegistry: {discovered} strategies discovered, "
            f"{len(self.strategies)} total loaded"
        )
        return discovered

    async def start_all(self) -> None:
        """Start all enabled strategies and subscribe to EventBus."""
        self._running = True
        for name, strategy in self.strategies.items():
            if strategy.enabled:
                await strategy.start()

        # Wire EventBus routing
        event_bus.on(Channel.MARKET_UPDATE, self._dispatch_market_update)
        event_bus.on(Channel.SIGNAL_DETECTED, self._dispatch_signal)
        log.info(
            f"StrategyRegistry: {len(self.strategies)} strategies active"
        )

    async def stop_all(self) -> None:
        """Gracefully stop all strategies."""
        self._running = False
        for name, strategy in self.strategies.items():
            await strategy.stop()
        log.info("StrategyRegistry: all strategies stopped")

    async def _dispatch_market_update(self, snapshot: MarketSnapshot) -> None:
        """Route MarketSnapshot to all enabled strategies."""
        if not self._running:
            return
        for name, strategy in self.strategies.items():
            if strategy.enabled:
                try:
                    result = await strategy.on_market_update(snapshot)
                    if result and isinstance(result, TradeSignal):
                        await event_bus.publish(Channel.SIGNAL_DETECTED, result)
                except Exception as e:
                    log.error(f"Strategy [{name}] market_update error: {e}")

    async def _dispatch_signal(self, signal: TradeSignal) -> None:
        """Route TradeSignal to all enabled strategies."""
        if not self._running:
            return
        for name, strategy in self.strategies.items():
            if strategy.enabled:
                try:
                    await strategy.on_signal(signal)
                except Exception as e:
                    log.error(f"Strategy [{name}] signal error: {e}")

    def get_strategy(self, name: str) -> Optional[BaseStrategy]:
        """Get a strategy by name."""
        return self.strategies.get(name)

    def list_strategies(self) -> List[Dict]:
        """List all loaded strategies and their status."""
        return [
            {
                "name": s.name,
                "enabled": s.enabled,
                "type": type(s).__name__,
            }
            for s in self.strategies.values()
        ]


# ─── Module-level singleton ───
strategy_registry = StrategyRegistry()


if __name__ == "__main__":
    print("=== Strategy Registry Self-Test ===")
    count = strategy_registry.discover()
    print(f"Discovered {count} strategies")
    for info in strategy_registry.list_strategies():
        print(f"  {info}")
    print("[OK] Registry self-test passed")
