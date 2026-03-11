"""
Polymarket Paper Trading Simulator — Headless Web Dashboard State
Maintains the internal state of all active markets and broadcasts global updates.
"""

import logging
import time
import asyncio
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

class Dashboard:
    """
    Headless dashboard state manager. 
    Aggregates state across multiple markets and broadcasts to UI.
    """

    def __init__(self):
        self._strategy_names: List[str] = []
        self._tick_count = 0
        self._start_time = time.time()
        self._activity_log: List[dict] = []
        self._max_log_lines = 50
        
        # Multi-Market state
        self._markets: Dict[str, dict] = {} # market_id -> {title, token_ids, outcomes, portfolios, etc}
        self._global_orderbooks: Dict[str, Any] = {} # asset_id -> book object
        self._token_to_outcome: Dict[str, str] = {} # asset_id -> label
        
        self._broadcast_callback: Optional[Callable[[dict], Any]] = None
        self._running = False

    def start(self):
        self._start_time = time.time()
        self._running = True

    def stop(self):
        self._running = False

    def set_broadcast_callback(self, callback: Callable[[dict], Any]):
        self._broadcast_callback = callback

    def set_market(self, title: str):
        # Legacy: for single-market back-compat if needed
        pass

    def set_strategies(self, names: List[str]):
        self._strategy_names = names

    def set_market_end_time(self, timestamp: float):
        # Legacy
        pass

    def log_activity(self, message: str):
        ts = time.strftime("%H:%M:%S")
        log_entry = {"time": ts, "message": message}
        self._activity_log.append(log_entry)
        if len(self._activity_log) > self._max_log_lines:
            self._activity_log = self._activity_log[-self._max_log_lines:]

    def update(
        self,
        market_id: str, # ADDED: now requires market context
        open_orders: int,
        tick_count: int,
        orderbooks: Dict[str, Any],
        portfolios: Dict[str, Any],
        outcomes: List[str],
        token_ids: List[str],
        impact_report: Optional[Any] = None,
        current_spread: float = 0.0,
        active_orders: Optional[List[Any]] = None,
    ):
        """Update a specific market's part of the global state."""
        self._tick_count = tick_count

        # Update global token mapping
        for i, tid in enumerate(token_ids):
            self._token_to_outcome[tid] = outcomes[i] if i < len(outcomes) else tid

        # Update global orderbooks
        self._global_orderbooks.update(orderbooks)

        # Update market metadata
        self._markets[market_id] = {
            "open_orders": open_orders,
            "portfolios": portfolios,
            "token_ids": token_ids,
            "outcomes": outcomes,
            "active_orders": active_orders or []
        }

        # Broadcast full state
        if self._broadcast_callback and self._running:
            state = self._build_state_payload()
            asyncio.create_task(self._safe_broadcast(state))

    async def _safe_broadcast(self, state: dict):
        if self._broadcast_callback:
            try:
                await self._broadcast_callback(state)
            except Exception as e:
                logger.error(f"Dashboard broadcast failed: {e}")

    def _build_state_payload(self) -> dict:
        """Serialize all markets into a global payload."""
        
        # Serialize Orderbooks (all active ones)
        serialized_books = {}
        for asset_id, book in self._global_orderbooks.items():
            label = self._token_to_outcome.get(asset_id, asset_id[:8])
            
            serialized_books[asset_id] = {
                "label": label,
                "mid": book.mid_price,
                "spread": book.spread,
                "bids": [{"price": lvl.price, "size": lvl.size} for lvl in book.get_bids(10)],
                "asks": [{"price": lvl.price, "size": lvl.size} for lvl in book.get_asks(10)]
            }

        # Serialize Market structure
        market_payload = {}
        for mid, mdata in self._markets.items():
            # Portfolios
            p_payload = {}
            for strat_id, portfolio in mdata["portfolios"].items():
                pos_dict = {}
                for tid, pos in portfolio.positions.items():
                    pos_dict[tid] = {
                        "label": self._token_to_outcome.get(tid, tid[:8]),
                        "side": pos.side.value,
                        "size": pos.size,
                        "avg_entry": pos.avg_entry,
                        "unrealized_pnl": pos.unrealized_pnl
                    }
                p_payload[strat_id] = {
                    "bankroll": portfolio.bankroll,
                    "realized_pnl": portfolio.realized_pnl,
                    "total_pnl": portfolio.total_pnl,
                    "positions": pos_dict
                }
            
            market_payload[mid] = {
                "open_orders": mdata["open_orders"],
                "portfolios": p_payload,
                "token_ids": mdata["token_ids"],
                "outcomes": mdata["outcomes"]
            }

        return {
            "time": time.strftime("%M:%S", time.gmtime(time.time() - self._start_time)),
            "system_runtime": f"{int(time.time() - self._start_time)}s",
            "strategies": self._strategy_names,
            "tick_count": self._tick_count,
            "markets": market_payload,
            "orderbooks": serialized_books,
            "activity_log": self._activity_log
        }
