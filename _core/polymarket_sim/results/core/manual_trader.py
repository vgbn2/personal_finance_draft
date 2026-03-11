"""
Polymarket Paper Trading Simulator — Manual Trading Mode
Interactive paper trading via keyboard commands.
"""

from __future__ import annotations

import asyncio
import logging
from typing import List

from ..strategies.base_strategy import BaseStrategy
from ..core.models import Fill, OrderbookSnapshot, OrderSide, OrderType, TickData, VirtualOrder

logger = logging.getLogger(__name__)


class ManualTrader(BaseStrategy):
    """
    Manual trading strategy that reads commands from an async input queue.
    
    Designed to work with the TUI dashboard. Commands are submitted
    via the dashboard input panel or stdin.
    
    Commands:
        buy <size>           — Market buy
        sell <size>          — Market sell
        limit buy <price> <size>  — Limit buy
        limit sell <price> <size> — Limit sell
        status               — Print current state
        quit                 — Stop trading
    """

    name = "Manual Trader"
    description = "Interactive paper trading via keyboard commands."
    version = "1.0.0"

    def __init__(self):
        super().__init__()
        self._command_queue: asyncio.Queue = asyncio.Queue()
        self._current_token: str = ""
        self._latest_tick: TickData | None = None
        self._position: float = 0.0
        self._running = True

    def submit_command(self, command: str):
        """Submit a trading command (called from TUI input handler)."""
        self._command_queue.put_nowait(command.strip().lower())

    def on_tick(self, tick: TickData) -> List[VirtualOrder]:
        """Process pending commands on each tick."""
        orders: List[VirtualOrder] = []
        self._current_token = tick.token_id
        self._latest_tick = tick

        # Drain command queue
        while not self._command_queue.empty():
            try:
                cmd = self._command_queue.get_nowait()
                new_orders = self._process_command(cmd, tick)
                orders.extend(new_orders)
            except asyncio.QueueEmpty:
                break

        return orders

    def _process_command(self, cmd: str, tick: TickData) -> List[VirtualOrder]:
        """Parse and execute a single command."""
        parts = cmd.split()
        if not parts:
            return []

        action = parts[0]

        # ── Market Orders ─────────────────────────────────────
        if action == "buy" and len(parts) >= 2:
            try:
                size = float(parts[1])
                logger.info("📗 MANUAL BUY: %.0f shares @ market (ask: %.4f)", size, tick.best_ask)
                return [VirtualOrder(
                    token_id=tick.token_id,
                    side=OrderSide.BUY,
                    order_type=OrderType.MARKET,
                    price=tick.best_ask,
                    size=size,
                )]
            except ValueError:
                logger.warning("Invalid size: %s", parts[1])

        elif action == "sell" and len(parts) >= 2:
            try:
                size = float(parts[1])
                logger.info("📕 MANUAL SELL: %.0f shares @ market (bid: %.4f)", size, tick.best_bid)
                return [VirtualOrder(
                    token_id=tick.token_id,
                    side=OrderSide.SELL,
                    order_type=OrderType.MARKET,
                    price=tick.best_bid,
                    size=size,
                )]
            except ValueError:
                logger.warning("Invalid size: %s", parts[1])

        # ── Limit Orders ──────────────────────────────────────
        elif action == "limit" and len(parts) >= 4:
            try:
                side = OrderSide.BUY if parts[1] == "buy" else OrderSide.SELL
                price = float(parts[2])
                size = float(parts[3])
                logger.info(
                    "📋 MANUAL LIMIT %s: %.0f @ %.4f",
                    side.value, size, price,
                )
                return [VirtualOrder(
                    token_id=tick.token_id,
                    side=side,
                    order_type=OrderType.LIMIT,
                    price=price,
                    size=size,
                )]
            except (ValueError, IndexError):
                logger.warning("Usage: limit buy|sell <price> <size>")

        # ── Status ────────────────────────────────────────────
        elif action == "status":
            logger.info(
                "Position: %.0f | Mid: %.4f | Bid: %.4f | Ask: %.4f",
                self._position, tick.mid_price, tick.best_bid, tick.best_ask,
            )

        elif action == "quit":
            self._running = False
            logger.info("Manual trading session ended.")

        else:
            logger.warning(
                "Unknown command: '%s'. Use: buy <size>, sell <size>, "
                "limit buy|sell <price> <size>, status, quit",
                cmd,
            )

        return []

    def on_orderbook_update(self, book: OrderbookSnapshot) -> List[VirtualOrder]:
        return []

    def on_fill(self, fill: Fill) -> None:
        if fill.side == OrderSide.BUY:
            self._position += fill.size
        else:
            self._position -= fill.size
        logger.info(
            "💰 FILL: %s %.0f @ %.4f (net position: %.0f)",
            fill.side.value, fill.size, fill.price, self._position,
        )

    @property
    def is_running(self) -> bool:
        return self._running
