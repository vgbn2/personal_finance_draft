"""
Polymarket Paper Trading Simulator — In-Memory Orderbook
Sorted LOB with delta application and LOB traversal for VWAP.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import time
from typing import List, Optional, Tuple

from sortedcontainers import SortedDict

from ..core.models import OrderbookSnapshot, PriceLevel

logger = logging.getLogger(__name__)


class Orderbook:
    """
    In-memory Limit Order Book for a single token.

    Bids stored in *descending* order (highest first).
    Asks stored in *ascending* order (lowest first).
    Uses SortedDict for O(log n) inserts and O(1) best price lookups.
    """

    def __init__(self, token_id: str):
        self.token_id = token_id
        # SortedDict with negated keys for bids → highest first
        self._bids: SortedDict = SortedDict()  # {neg_price: size}
        self._asks: SortedDict = SortedDict()  # {price: size}
        self._lock = asyncio.Lock()
        self._last_update: float = 0.0

    # ── Snapshot / Delta ──────────────────────────────────────

    async def apply_snapshot(self, bids: list, asks: list):
        """
        Full reset from REST snapshot or WS 'book' event.
        bids/asks: list of {price: str, size: str}
        """
        async with self._lock:
            self._bids.clear()
            self._asks.clear()

            for level in bids:
                price = float(level.get("price", level.get("p", 0)))
                size = float(level.get("size", level.get("s", 0)))
                if size > 0:
                    self._bids[-price] = size

            for level in asks:
                price = float(level.get("price", level.get("p", 0)))
                size = float(level.get("size", level.get("s", 0)))
                if size > 0:
                    self._asks[price] = size

            self._last_update = time.time()
            logger.debug(
                "Snapshot applied for %s: %d bids, %d asks",
                self.token_id, len(self._bids), len(self._asks),
            )

    async def apply_delta(self, price: float, size: float, side: str):
        """
        Apply a single price-level delta from WS 'price_change' event.
        side: "BUY" → bids, "SELL" → asks.
        size == 0 → remove level.
        """
        async with self._lock:
            if side == "BUY":
                key = -price
                book = self._bids
            else:
                key = price
                book = self._asks

            if size == 0:
                book.pop(key, None)
            else:
                book[key] = size

            self._last_update = time.time()

    # ── Queries ───────────────────────────────────────────────

    @property
    def best_bid(self) -> Optional[float]:
        if not self._bids:
            return None
        return -self._bids.keys()[0]

    @property
    def best_ask(self) -> Optional[float]:
        if not self._asks:
            return None
        return self._asks.keys()[0]

    @property
    def mid_price(self) -> Optional[float]:
        bb, ba = self.best_bid, self.best_ask
        if bb is not None and ba is not None:
            return (bb + ba) / 2.0
        return None

    @property
    def spread(self) -> Optional[float]:
        bb, ba = self.best_bid, self.best_ask
        if bb is not None and ba is not None:
            return ba - bb
        return None

    def get_bids(self, levels: int = 10) -> List[PriceLevel]:
        """Top N bid levels (highest first)."""
        result = []
        for neg_price, size in self._bids.items():
            if len(result) >= levels:
                break
            result.append(PriceLevel(price=-neg_price, size=size))
        return result

    def get_asks(self, levels: int = 10) -> List[PriceLevel]:
        """Top N ask levels (lowest first)."""
        result = []
        for price, size in self._asks.items():
            if len(result) >= levels:
                break
            result.append(PriceLevel(price=price, size=size))
        return result

    # ── LOB Traversal (for VWAP shadow fills) ─────────────────

    def walk_book(self, side: str, target_size: float) -> Optional[Tuple[float, float]]:
        """
        Walk through the orderbook to compute VWAP fill price.

        Args:
            side: "BUY" → walk asks (buying at ask prices)
                  "SELL" → walk bids (selling at bid prices)
            target_size: number of shares to fill

        Returns:
            (vwap_price, filled_size) or None if book empty.
            filled_size may be < target_size if insufficient depth.
        """
        book = self._asks if side == "BUY" else self._bids
        if not book:
            return None

        filled = 0.0
        cost = 0.0

        for key, available_size in book.items():
            price = key if side == "BUY" else -key
            take = min(available_size, target_size - filled)
            cost += price * take
            filled += take
            if filled >= target_size:
                break

        if filled == 0:
            return None

        vwap = cost / filled
        return (vwap, filled)

    # ── Snapshot for Strategies ────────────────────────────────

    def snapshot(self, depth: int = 20) -> OrderbookSnapshot:
        """Create an immutable snapshot for strategy consumption."""
        return OrderbookSnapshot(
            token_id=self.token_id,
            bids=self.get_bids(depth),
            asks=self.get_asks(depth),
            timestamp=self._last_update,
        )

    def __repr__(self) -> str:
        bb = f"{self.best_bid:.4f}" if self.best_bid else "---"
        ba = f"{self.best_ask:.4f}" if self.best_ask else "---"
        sp = f"{self.spread:.4f}" if self.spread else "---"
        return f"Orderbook({self.token_id}: bid={bb} ask={ba} spread={sp})"
