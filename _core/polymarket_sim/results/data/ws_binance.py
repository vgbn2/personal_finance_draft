"""
Binance WebSocket Client
Maintains real-time BTC price and history for momentum/delta calculations.
"""

import asyncio
import json
import logging
import time
from collections import deque
from typing import Optional

import websockets

logger = logging.getLogger(__name__)

BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@trade"


class BinanceWSClient:
    """
    Connects to Binance WS for real-time BTC trades.
    Tracks price history to provide rolling window deltas (e.g., 60-second % change).
    """

    def __init__(self, history_len: int = 800):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        
        # Current state
        self.btc_price: float = 0.0
        # Deque of {"p": float, "t": float} for delta lookbacks
        self.history: deque = deque(maxlen=history_len)

    async def start(self):
        """Start the background websocket connection task."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._listen_loop())
        logger.info("Started Binance WS client (BTC/USDT).")

    async def stop(self):
        """Stop the background task."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self.history.clear()
        logger.info("Stopped Binance WS client.")

    async def _listen_loop(self):
        retry_delay = 1.0
        while self._running:
            try:
                async with websockets.connect(BINANCE_WS_URL, ping_interval=20, ping_timeout=10) as ws:
                    retry_delay = 1.0  # reset on successful connect
                    logger.debug("Connected to Binance WS.")
                    
                    async for msg in ws:
                        if not self._running:
                            break
                        try:
                            data = json.loads(msg)
                            if data.get("e") == "trade":
                                price = float(data["p"])
                                ts = float(data["T"]) / 1000.0
                                
                                self.btc_price = price
                                self.history.append({"p": price, "t": ts})
                        except (json.JSONDecodeError, KeyError, ValueError):
                            pass
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Binance WS disconnected: %s. Reconnecting in %.1fs...", e, retry_delay)
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 10.0)

    def get_price(self) -> float:
        """Returns the most recent BTC price, 0.0 if not yet synced."""
        return self.btc_price

    def get_delta(self, window_sec: float) -> Optional[float]:
        """
        Calculates the BTC % change over the last `window_sec` seconds.
        Returns None if not enough history exists yet.
        """
        if self.btc_price == 0.0 or len(self.history) < 3:
            return None
            
        now = time.time()
        old_price = None
        
        # Iterate backwards (newest to oldest) to find the first snapshot older than window_sec
        for snap in reversed(self.history):
            if now - snap["t"] >= window_sec:
                old_price = snap["p"]
                break

        if not old_price or old_price == 0.0:
            return None
            
        return (self.btc_price - old_price) / old_price

