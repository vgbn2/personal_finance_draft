"""
Polymarket Paper Trading Simulator — WebSocket Client
Real-time L2 orderbook subscription via Polymarket CLOB WebSocket.
Mirrors the ClobMarketClient pattern from the reference implementation.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Dict, List, Optional

import urllib.parse
import websockets
import websockets.exceptions

from ..core import config
from ..core.dns import resolve_ip

logger = logging.getLogger(__name__)


class PolymarketWSClient:
    """
    Async WebSocket client for Polymarket CLOB orderbook data.

    Events (callbacks):
        on_book(data)          — full orderbook snapshot
        on_price_change(data)  — incremental delta
        on_connected()         — WebSocket connected
        on_disconnected()      — WebSocket disconnected
    """

    def __init__(self):
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._token_ids: List[str] = []
        self._running = False

        # Callbacks
        self._on_book: Optional[Callable] = None
        self._on_price_change: Optional[Callable] = None
        self._on_connected: Optional[Callable] = None
        self._on_disconnected: Optional[Callable] = None

        self._reconnect_delay = 1  # initial backoff (seconds)

    # ── Callback Registration ─────────────────────────────────

    def on_book(self, callback: Callable[[Dict[str, Any]], None]):
        self._on_book = callback

    def on_price_change(self, callback: Callable[[Dict[str, Any]], None]):
        self._on_price_change = callback

    def on_connected(self, callback: Callable[[], None]):
        self._on_connected = callback

    def on_disconnected(self, callback: Callable[[], None]):
        self._on_disconnected = callback

    # ── Connection Management ─────────────────────────────────

    async def connect(self, token_ids: List[str]):
        """Connect to WebSocket and subscribe to token IDs."""
        self._token_ids = token_ids
        self._running = True
        self._reconnect_delay = 1

        while self._running:
            try:
                await self._connect_and_listen()
            except (
                websockets.exceptions.ConnectionClosed,
                websockets.exceptions.ConnectionClosedError,
                ConnectionRefusedError,
                OSError,
            ) as exc:
                if not self._running:
                    break
                logger.warning(
                    "WebSocket connection lost: %s. Reconnecting in %ds...",
                    exc,
                    self._reconnect_delay,
                )
                if self._on_disconnected:
                    self._on_disconnected()
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(
                    self._reconnect_delay * 2,
                    config.WS_RECONNECT_MAX_DELAY_S,
                )
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Unexpected WebSocket error: %s", exc, exc_info=True)
                if not self._running:
                    break
                await asyncio.sleep(self._reconnect_delay)

    async def _connect_and_listen(self):
        """Single connection lifecycle with manual DNS resolution."""
        logger.info("Connecting to %s ...", config.WS_URL)

        # Bug #6 Fix: Manually resolve hostname... REVERTED.
        connect_url = config.WS_URL
        server_hostname = None
        ssl_context = None

        try:
            parsed = urllib.parse.urlparse(config.WS_URL)
            if parsed.scheme == "wss":
                import ssl
                ssl_context = ssl.create_default_context()
                # server_hostname = parsed.hostname # Handled by websockets automatically if not resolving IP
        except Exception as exc:
            logger.warning("Failed to create SSL context: %s", exc)

        # try:
        #     parsed = urllib.parse.urlparse(config.WS_URL)
        #     hostname = parsed.hostname
        #     if hostname:
        #         ip = await resolve_ip(hostname)
        #         # Reconstruct URL with IP
        #         new_netloc = parsed.netloc.replace(hostname, ip)
        #         connect_url = parsed._replace(netloc=new_netloc).geturl()
        #         logger.info("🌍 Resolved %s -> %s (Google DNS)", hostname, ip)
        #
        #         if parsed.scheme == "wss":
        #             import ssl
        #             server_hostname = hostname
        #             ssl_context = ssl.create_default_context()
        # except Exception as exc:
        #     logger.warning("DNS resolution workaround failed: %s. Falling back to system DNS.", exc)

        # Prepare connection args
        connect_kwargs = {
            "ping_interval": config.WS_PING_INTERVAL_S,
            "ping_timeout": config.WS_PING_INTERVAL_S,
            "close_timeout": 5,
            "ssl": ssl_context,
            "server_hostname": server_hostname,
        }

        # -------------------------------------------------------------------------
        # HTTP 403 FORBIDDEN FIX
        # -------------------------------------------------------------------------
        # Polymarket's Cloudflare setup blocks WebSocket connections that lack:
        # 1. A valid 'Origin' header (must match the allowed origin, e.g. https://polymarket.com)
        # 2. A valid browser-like 'User-Agent' (default Python agents are often blocked)
        #
        # We use 'websockets' library to connect. The API for passing headers changed in v14.0.
        # We attempt to use the modern API (kwargs 'origin', 'user_agent_header') 
        # but the kwargs are passed via **connect_kwargs dictionary.
        try:
            # Modern API (websockets 14+) prefer specific arguments over 'extra_headers'
            connect_kwargs["user_agent_header"] = config.WS_USER_AGENT
            connect_kwargs["origin"] = websockets.Origin(config.WS_ORIGIN)
        except AttributeError:
             # Fallback for legacy websockets (<14.0)
             # If websockets.Origin class is missing, we use 'extra_headers'
             logger.info("Using legacy websockets header format (extra_headers)")
             connect_kwargs["extra_headers"] = {
                 "User-Agent": config.WS_USER_AGENT,
                 "Origin": config.WS_ORIGIN
             }

        if "origin" in connect_kwargs:
            logger.info("Connecting with Origin/UA fixed headers...")
        
        # Debug log to verify arguments (crucial for diagnosing connection issues)
        # logger.info("WebSocket connect_kwargs: %s", {k: str(v) for k, v in connect_kwargs.items() if k != "ssl"}) 

        async with websockets.connect(connect_url, **connect_kwargs) as ws:
            self._ws = ws
            self._reconnect_delay = 1  # reset on successful connect
            logger.info("WebSocket connected.")

            if self._on_connected:
                self._on_connected()

            # Subscribe to tokens
            await self._subscribe(ws)

            # Listen for messages
            async for raw_msg in ws:
                if not self._running:
                    break
                try:
                    self._handle_message(raw_msg)
                except Exception as exc:
                    logger.error("Error handling WS message: %s", exc, exc_info=True)

    async def _subscribe(self, ws):
        """Send subscription message for all token IDs."""
        if not self._token_ids:
            logger.warning("No token IDs to subscribe to.")
            return

        sub_msg = json.dumps({
            "type": "subscribe",
            "channel": "market",
            "assets_ids": self._token_ids,
        })
        logger.info("Subscribing to %d tokens: %s", len(self._token_ids), self._token_ids)
        await ws.send(sub_msg)

    def _handle_message(self, raw: str):
        """Parse and dispatch incoming WebSocket message."""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Failed to parse WS message: %s", raw[:200])
            return

        # API sometimes wraps messages in an array — unwrap and dispatch each
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    self._handle_single_message(item)
                else:
                    logger.debug("Skipping non-dict item in WS array: %s", type(item).__name__)
            return

        if isinstance(data, dict):
            self._handle_single_message(data)
        else:
            logger.warning("Unexpected WS data type: %s", type(data).__name__)

    def _handle_single_message(self, data: dict):
        """Dispatch a single parsed WS message dict."""
        event_type = data.get("event_type") or data.get("type", "")

        if event_type == "book" or "bids" in data or "asks" in data:
            # Full orderbook snapshot
            if self._on_book:
                self._on_book(data)
        elif event_type == "price_change" or "price_changes" in data:
            # Incremental delta
            if self._on_price_change:
                self._on_price_change(data)
        elif event_type in ("subscribed", "connected", "pong"):
            logger.debug("WS control message: %s", event_type)
        else:
            logger.debug("Unknown WS event: %s", event_type)

    # ── Disconnect ────────────────────────────────────────────

    async def disconnect(self):
        """Gracefully disconnect."""
        self._running = False
        if self._ws:
            # Check if open before closing
            is_open = False
            try:
                # websockets 14+
                from websockets.protocol import State
                is_open = self._ws.state is State.OPEN
            except (ImportError, AttributeError):
                # Legacy
                is_open = not getattr(self._ws, "closed", True)

            if is_open:
                await self._ws.close()
                logger.info("WebSocket disconnected.")

        if self._on_disconnected:
            self._on_disconnected()

    @property
    def is_connected(self) -> bool:
        if self._ws is None:
            return False
        
        # Support both new (14+) and old websockets API
        try:
             # websockets 14+: state is an Enum (State.OPEN, State.CLOSED, etc.)
             # We can check if state.name == 'OPEN' to avoid importing State enum
             return self._ws.state.name == "OPEN"
        except AttributeError:
             # Legacy: closed property
             return not getattr(self._ws, "closed", True)
