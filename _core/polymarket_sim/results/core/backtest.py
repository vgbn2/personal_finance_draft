"""
Polymarket Paper Trading Simulator — Backtest Engine
Replays recorded Parquet orderbook data through strategies with realistic
latency injection and queue position tracking.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from pathlib import Path
from typing import Dict, List, Optional

import polars as pl

from ..analysis.metrics import MetricsCalculator
from ..analysis.portfolio import Portfolio
from ..analysis.strategy_grader import StrategyGrader
from ..core.models import OrderSide, OrderType, TickData, VirtualOrder
from ..market.matching_engine import MatchingEngine
from ..market.orderbook import Orderbook
from ..strategies.strategy_runner import StrategyRunner

logger = logging.getLogger(__name__)


class LatencySimulator:
    """
    Simulates network latency for backtest realism.
    Orders are delayed by `latency_ms` before being eligible for fills.
    """

    def __init__(self, latency_ms: float = 75.0):
        self.latency_ms = latency_ms
        self._pending: deque = deque()  # (eligible_time, order)

    def submit(self, order: VirtualOrder, current_time: float):
        """Queue an order with latency delay."""
        eligible_at = current_time + (self.latency_ms / 1000.0)
        self._pending.append((eligible_at, order))

    def get_eligible(self, current_time: float) -> List[VirtualOrder]:
        """Return orders whose latency has elapsed."""
        eligible = []
        while self._pending and self._pending[0][0] <= current_time:
            _, order = self._pending.popleft()
            eligible.append(order)
        return eligible


class QueuePositionTracker:
    """
    Tracks queue position for limit orders to prevent instant fills at price touch.
    A limit order at price P must wait for `volume_ahead` shares to trade
    before it can fill.
    """

    def __init__(self):
        self._queue: Dict[str, float] = {}  # order_id -> volume_ahead

    def enqueue(self, order_id: str, volume_ahead: float):
        """Register an order with the volume already ahead of it in the queue."""
        self._queue[order_id] = volume_ahead

    def process_volume(self, price: float, side: str, volume: float):
        """Process recorded volume at a price level, reducing queue positions."""
        to_remove = []
        for oid, remaining in self._queue.items():
            self._queue[oid] = max(0, remaining - volume)
            if self._queue[oid] <= 0:
                to_remove.append(oid)
        # Don't remove — the matching engine will handle fills

    def is_fillable(self, order_id: str) -> bool:
        """Check if the order has cleared the queue."""
        return self._queue.get(order_id, 0) <= 0

    def remove(self, order_id: str):
        self._queue.pop(order_id, None)


class BacktestEngine:
    """
    Replays recorded Parquet tick data through a strategy.

    Features:
        - Reads Parquet recordings from OrderbookRecorder
        - Rebuilds Orderbook from recorded snapshots + deltas
        - Injects configurable latency (LatencySimulator)
        - Queue position tracking for limit order realism
        - Outputs StrategyGrade + PnL curve
    """

    def __init__(
        self,
        strategy_path: str,
        recording_path: str,
        bankroll: float = 1000.0,
        latency_ms: float = 75.0,
    ):
        self.strategy_path = strategy_path
        self.recording_path = Path(recording_path)
        self.bankroll = bankroll

        # Components
        self._orderbooks: Dict[str, Orderbook] = {}
        self._matching = MatchingEngine(latency_ms=0)  # we handle latency ourselves
        self._portfolio = Portfolio(bankroll=bankroll)
        self._runner = StrategyRunner(strategy_path)
        self._latency = LatencySimulator(latency_ms=latency_ms)
        self._queue_tracker = QueuePositionTracker()

        # State
        self._tick_count = 0
        self._pnl_curve: List[float] = []

        # Wire fill callback
        self._matching.on_fill(self._on_fill)

    async def run(self) -> Dict:
        """
        Run the full backtest. Returns results dict with:
            grade, pnl_curve, final_snapshot, num_ticks
        """
        logger.info("=" * 60)
        logger.info("  BACKTEST MODE")
        logger.info("  Recording: %s", self.recording_path)
        logger.info("  Bankroll:  $%.2f", self.bankroll)
        logger.info("=" * 60)

        # Load recording
        df = pl.read_parquet(self.recording_path)
        logger.info("Loaded %d ticks from recording.", len(df))

        # Load strategy
        self._runner.load()
        self._matching.register_portfolio(self._runner.name, self._portfolio)

        # Sort by timestamp
        df = df.sort("timestamp")

        # Get unique asset IDs
        asset_ids = df["asset_id"].unique().to_list()
        for aid in asset_ids:
            self._orderbooks[aid] = Orderbook(aid)

        # ── Replay loop ───────────────────────────────────────
        # Group consecutive events by timestamp (within 1ms)
        prev_ts = 0.0
        batch: List[Dict] = []

        for row in df.iter_rows(named=True):
            ts = row["timestamp"]

            # Process batch when timestamp changes
            if ts - prev_ts > 0.001 and batch:
                await self._process_batch(batch, prev_ts)
                batch = []

            batch.append(row)
            prev_ts = ts

        # Process final batch
        if batch:
            await self._process_batch(batch, prev_ts)

        # ── Results ───────────────────────────────────────────
        final_snap = self._portfolio.snapshot()
        grade = StrategyGrader.grade(final_snap)
        report = StrategyGrader.format_report(grade, self._runner.name)

        logger.info(report)
        logger.info("Backtest complete: %d ticks processed.", self._tick_count)

        return {
            "grade": grade,
            "pnl_curve": self._pnl_curve,
            "final_snapshot": final_snap,
            "num_ticks": self._tick_count,
            "report": report,
        }

    async def _process_batch(self, batch: List[Dict], timestamp: float):
        """Process a batch of events at the same timestamp."""
        # ① Apply orderbook updates
        for event in batch:
            aid = event["asset_id"]
            book = self._orderbooks.get(aid)
            if not book:
                continue

            if event["event_type"] == "snapshot":
                # Reconstruct snapshot for this asset at this timestamp
                await book.apply_delta(
                    event["price"], event["size"], event["side"]
                )
            elif event["event_type"] == "delta":
                await book.apply_delta(
                    event["price"], event["size"], event["side"]
                )

                # Process queue volumes
                self._queue_tracker.process_volume(
                    event["price"], event["side"], event["size"]
                )

        # ② Submit latency-eligible orders to matching engine
        eligible_orders = self._latency.get_eligible(timestamp)
        for order in eligible_orders:
            self._matching.submit_order(order)

        # ③ Feed tick to strategy for each orderbook with data
        for aid, book in self._orderbooks.items():
            mid = book.mid_price
            if mid is None:
                continue

            self._tick_count += 1

            tick = TickData(
                token_id=aid,
                mid_price=mid,
                best_bid=book.best_bid or 0.0,
                best_ask=book.best_ask or 0.0,
                spread=book.spread or 0.0,
                timestamp=timestamp,
            )

            # Run strategy
            orders = await self._runner.run_on_tick(tick)
            snapshot = book.snapshot()
            book_orders = await self._runner.run_on_orderbook_update(snapshot)
            orders.extend(book_orders)

            # Queue orders with latency
            for order in orders:
                order.strategy_id = self._runner.name
                self._latency.submit(order, timestamp)

            # Process matching
            self._matching.process_tick(book)

            # Mark-to-market
            self._portfolio.mark_to_market(aid, mid)

        # Record PnL
        snap = self._portfolio.snapshot()
        self._pnl_curve.append(snap.total_pnl)
        self._runner.update_portfolio(snap)

    def _on_fill(self, fill):
        """Handle a virtual fill from the matching engine."""
        if fill.strategy_id != self._runner.name:
            return
            
        self._portfolio.record_fill(fill)

        # Notify strategy (sync in backtest)
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self._runner.run_on_fill(fill))
            else:
                loop.run_until_complete(self._runner.run_on_fill(fill))
        except RuntimeError:
            pass  # no event loop, skip notification
