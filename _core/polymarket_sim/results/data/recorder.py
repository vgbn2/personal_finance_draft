"""
Polymarket Paper Trading Simulator — Orderbook Tick Recorder
Saves L2 orderbook ticks to Apache Parquet via Polars for high-performance
backtesting. Buffered writes to avoid per-tick I/O.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import polars as pl

logger = logging.getLogger(__name__)

RECORDINGS_DIR = Path(__file__).resolve().parent / "recordings"
FLUSH_INTERVAL_S = 5.0       # flush buffer to disk every N seconds
FLUSH_THRESHOLD = 500        # or every N ticks, whichever comes first


class OrderbookRecorder:
    """
    Records orderbook snapshots and deltas to Parquet files.

    Usage:
        recorder = OrderbookRecorder("btc-updown-session-1")
        recorder.record_snapshot(asset_id, bids, asks)
        recorder.record_delta(asset_id, price, size, side)
        recorder.flush()   # call periodically or at shutdown
    """

    def __init__(self, session_name: str, output_dir: Optional[Path] = None):
        self._dir = output_dir or RECORDINGS_DIR
        self._dir.mkdir(parents=True, exist_ok=True)
        self._session_name = session_name
        self._file_path = self._dir / f"{session_name}.parquet"

        # Buffer: list of dicts, flushed to Parquet periodically
        self._buffer: List[Dict[str, Any]] = []
        self._last_flush = time.time()
        self._total_written = 0

        logger.info("🎙️ Recording to: %s", self._file_path)

    def record_snapshot(
        self,
        asset_id: str,
        bids: List[Dict[str, str]],
        asks: List[Dict[str, str]],
    ):
        """Record a full orderbook snapshot as individual level entries."""
        ts = time.time()
        for level in bids:
            self._buffer.append({
                "timestamp": ts,
                "asset_id": asset_id,
                "event_type": "snapshot",
                "side": "BUY",
                "price": float(level.get("price", 0)),
                "size": float(level.get("size", 0)),
            })
        for level in asks:
            self._buffer.append({
                "timestamp": ts,
                "asset_id": asset_id,
                "event_type": "snapshot",
                "side": "SELL",
                "price": float(level.get("price", 0)),
                "size": float(level.get("size", 0)),
            })
        self._maybe_flush()

    def record_delta(
        self,
        asset_id: str,
        price: float,
        size: float,
        side: str,
    ):
        """Record a single price change delta."""
        self._buffer.append({
            "timestamp": time.time(),
            "asset_id": asset_id,
            "event_type": "delta",
            "side": side,
            "price": price,
            "size": size,
        })
        self._maybe_flush()

    def _maybe_flush(self):
        """Flush if buffer is large enough or enough time has passed."""
        now = time.time()
        if (
            len(self._buffer) >= FLUSH_THRESHOLD
            or now - self._last_flush >= FLUSH_INTERVAL_S
        ):
            self.flush()

    def flush(self):
        """Write buffer to Parquet (append mode)."""
        if not self._buffer:
            return

        df = pl.DataFrame(self._buffer)

        if self._file_path.exists():
            # Read existing, concat, write
            existing = pl.read_parquet(self._file_path)
            df = pl.concat([existing, df])

        df.write_parquet(self._file_path, compression="zstd")

        self._total_written += len(self._buffer)
        logger.debug(
            "💾 Flushed %d ticks (total: %d) to %s",
            len(self._buffer), self._total_written, self._file_path.name,
        )
        self._buffer.clear()
        self._last_flush = time.time()

    @staticmethod
    def load_recording(file_path: Path) -> pl.DataFrame:
        """Load a Parquet recording for backtesting."""
        return pl.read_parquet(file_path)

    @property
    def total_ticks(self) -> int:
        return self._total_written + len(self._buffer)
