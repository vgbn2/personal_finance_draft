"""
Sentinel-MT5 — Backpressure (Leaky Bucket)
============================================
Protects against Discord API rate-limits (5 req/sec).

Strategy:
  - Normal:  Pop 1 message every DRAIN_INTERVAL seconds.
  - Overload (queue > AGGREGATE_THRESHOLD):
      Merge queued signals into a single summary message.
"""
from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timezone
from typing import AsyncIterator


# ─── Tuning knobs ─────────────────────────────────────────────
DRAIN_INTERVAL: float = 0.5          # seconds between pops
AGGREGATE_THRESHOLD: int = 10        # merge if queue exceeds this


class LeakyBucket:
    """Thread-safe (via asyncio) leaky-bucket queue."""

    def __init__(
        self,
        drain_interval: float = DRAIN_INTERVAL,
        aggregate_threshold: int = AGGREGATE_THRESHOLD,
    ):
        self._queue: deque[dict] = deque()
        self._drain_interval = drain_interval
        self._aggregate_threshold = aggregate_threshold

    # ── Ingress ───────────────────────────────────────────────

    def push(self, signal: dict) -> None:
        """Enqueue a new signal payload."""
        signal.setdefault("_ts", datetime.now(timezone.utc).isoformat())
        self._queue.append(signal)

    # ── Queries ───────────────────────────────────────────────

    @property
    def depth(self) -> int:
        return len(self._queue)

    def should_aggregate(self) -> bool:
        return self.depth > self._aggregate_threshold

    # ── Egress ────────────────────────────────────────────────

    def pop(self) -> dict | None:
        """Pop one item, or None if empty."""
        return self._queue.popleft() if self._queue else None

    def aggregate(self) -> dict:
        """
        Drain the entire queue into one summary payload.

        Returns a dict with:
          - "type": "summary"
          - "count": number of aggregated signals
          - "signals": list of individual signal dicts
          - "symbols": unique symbols involved
        """
        signals: list[dict] = []
        while self._queue:
            signals.append(self._queue.popleft())

        symbols = list({s.get("symbol", "?") for s in signals})
        return {
            "type": "summary",
            "count": len(signals),
            "signals": signals,
            "symbols": symbols,
        }

    async def drain(self) -> AsyncIterator[dict]:
        """
        Async generator — yields one item per drain interval.

        If the queue is overloaded, yields a single aggregated
        summary instead of individual signals.
        """
        while True:
            if self.should_aggregate():
                yield self.aggregate()
            elif self._queue:
                item = self._queue.popleft()
                yield item
            await asyncio.sleep(self._drain_interval)
