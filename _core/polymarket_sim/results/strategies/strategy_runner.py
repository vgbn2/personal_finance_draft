"""
Polymarket Paper Trading Simulator — Strategy Runner
Safely loads and executes user strategy files with timeout isolation.
"""

from __future__ import annotations

import asyncio
import importlib.util
import inspect
import logging
import sys
from pathlib import Path
from typing import List, Optional

from ..core import config
from .base_strategy import BaseStrategy
from ..core.models import Fill, OrderbookSnapshot, PortfolioSnapshot, TickData, VirtualOrder

logger = logging.getLogger(__name__)


class StrategyLoadError(Exception):
    """Raised when a strategy file fails to load."""


class StrategyRunner:
    """
    Loads a user strategy from a .py file and wraps its callbacks
    with timeout protection and exception isolation.

    The strategy CANNOT:
    - Mutate the orderbook directly
    - Access engine internals
    - Block the event loop

    The strategy CAN:
    - Read immutable snapshots
    - Return VirtualOrder objects
    - Access its own internal state
    """

    def __init__(self, strategy_path: str, timeout: float = config.STRATEGY_TIMEOUT_S):
        self._path = Path(strategy_path).resolve()
        self._timeout = timeout
        self._strategy: Optional[BaseStrategy] = None
        self._error_count = 0
        self._call_count = 0

    @property
    def strategy(self) -> Optional[BaseStrategy]:
        return self._strategy

    @property
    def name(self) -> str:
        if self._strategy:
            return self._strategy.name
        return self._path.stem

    @property
    def id(self) -> str:
        """Safe alphanumeric ID for internal routing and metrics mapping."""
        return self._path.stem

    # ── Loading ───────────────────────────────────────────────

    def load(self):
        """
        Dynamically import the strategy file and instantiate the strategy class.
        The file must contain exactly one class that subclasses BaseStrategy.
        """
        if not self._path.exists():
            raise StrategyLoadError(f"Strategy file not found: {self._path}")

        if not self._path.suffix == ".py":
            raise StrategyLoadError(f"Strategy must be a .py file: {self._path}")

        logger.info("Loading strategy from: %s", self._path)

        # Fix #1: Inject project root into sys.path so 'polymarket_sim' is resolvable
        # This allows absolute imports like 'from polymarket_sim.core import ...' to work
        # even when the strategy file is loaded dynamically.
        project_root = str(self._path.parent.parent.parent)  # strategies/ -> polymarket_sim/ -> root
        if project_root not in sys.path:
            sys.path.insert(0, project_root)


        # Dynamic import
        module_name = f"user_strategy_{self._path.stem}"
        spec = importlib.util.spec_from_file_location(module_name, self._path)
        if spec is None or spec.loader is None:
            raise StrategyLoadError(f"Cannot create module spec for: {self._path}")

        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module

        try:
            spec.loader.exec_module(module)
        except Exception as exc:
            raise StrategyLoadError(f"Error executing strategy module: {exc}") from exc

        # Find the BaseStrategy subclass
        strategy_classes = []
        for _name, obj in inspect.getmembers(module, inspect.isclass):
            if issubclass(obj, BaseStrategy) and obj is not BaseStrategy:
                strategy_classes.append(obj)

        if not strategy_classes:
            raise StrategyLoadError(
                f"No BaseStrategy subclass found in {self._path.name}. "
                "Your strategy must subclass BaseStrategy."
            )

        if len(strategy_classes) > 1:
            logger.warning(
                "Multiple strategy classes found in %s, using first: %s",
                self._path.name, strategy_classes[0].__name__,
            )

        # Instantiate
        cls = strategy_classes[0]
        try:
            self._strategy = cls()
        except Exception as exc:
            raise StrategyLoadError(f"Failed to instantiate {cls.__name__}: {exc}") from exc

        # Fix #2: Load optional JSON configuration
        config_path = self._path.with_suffix(".json")
        if config_path.exists():
            try:
                import json
                config_data = json.loads(config_path.read_text())
                self._strategy.init_params(config_data)
                logger.info("⚙️ Applied JSON configuration from: %s", config_path.name)
            except Exception as exc:
                logger.warning("⚠️ Failed to load JSON config for %s: %s", self._path.name, exc)

        logger.info(
            "✅ Loaded strategy: %s v%s — %s",
            self._strategy.name, self._strategy.version, self._strategy.description,
        )

    # ── Safe Execution Wrappers ───────────────────────────────

    async def run_on_tick(self, tick: TickData) -> List[VirtualOrder]:
        """Safely execute strategy.on_tick with timeout."""
        return await self._safe_call("on_tick", tick)

    async def run_on_orderbook_update(self, book: OrderbookSnapshot) -> List[VirtualOrder]:
        """Safely execute strategy.on_orderbook_update with timeout."""
        return await self._safe_call("on_orderbook_update", book)

    async def run_on_fill(self, fill: Fill):
        """Safely execute strategy.on_fill with timeout."""
        await self._safe_call("on_fill", fill)

    def update_portfolio(self, snapshot: PortfolioSnapshot):
        """Push latest portfolio snapshot to strategy (read-only access)."""
        if self._strategy:
            self._strategy._update_portfolio(snapshot)

    async def _safe_call(self, method_name: str, *args) -> List[VirtualOrder]:
        """
        Execute a strategy method with:
        1. Timeout protection (prevents blocking)
        2. Exception isolation (logs but doesn't crash engine)
        3. Return type validation
        """
        if self._strategy is None:
            return []

        self._call_count += 1

        try:
            method = getattr(self._strategy, method_name)

            # Run in executor if it's sync (which it should be)
            loop = asyncio.get_event_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(None, method, *args),
                timeout=self._timeout,
            )

            # Validate return type
            if method_name == "on_fill":
                return []

            if result is None:
                return []

            if not isinstance(result, list):
                logger.warning(
                    "Strategy.%s returned %s instead of list, ignoring.",
                    method_name, type(result).__name__,
                )
                return []

            # Filter out non-VirtualOrder items
            orders = [o for o in result if isinstance(o, VirtualOrder)]
            if len(orders) != len(result):
                logger.warning(
                    "Strategy.%s returned %d non-VirtualOrder items, filtered.",
                    method_name, len(result) - len(orders),
                )
            return orders

        except asyncio.TimeoutError:
            self._error_count += 1
            logger.error(
                "⏰ Strategy.%s TIMED OUT after %.1fs (error #%d)",
                method_name, self._timeout, self._error_count,
            )
            return []

        except Exception as exc:
            self._error_count += 1
            logger.error(
                "💥 Strategy.%s EXCEPTION: %s (error #%d)",
                method_name, exc, self._error_count,
            )
            return []

    # ── Diagnostics ───────────────────────────────────────────

    @property
    def error_rate(self) -> float:
        if self._call_count == 0:
            return 0.0
        return self._error_count / self._call_count

    def __repr__(self) -> str:
        name = self.name
        errs = self._error_count
        calls = self._call_count
        return f"StrategyRunner({name}: {calls} calls, {errs} errors)"
