"""
Unified Exchange Client framework.

Consolidates Binance, Deribit, and Macro data sources into a standardized
interface using BaseExchangeClient. All clients use the centralized logger
and config system.

Architecture:
    BaseExchangeClient (abstract)
    ├── BinanceClient  — OHLCV + spot prices via ccxt
    ├── DeribitClient   — DVOL + options greeks via ccxt
    ├── MacroClient     — FRED economic indicators via requests
    └── PolymarketWS    — WebSocket orderbook streams
"""
import asyncio
import json
import os
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import ccxt
import pandas as pd
import requests
import websockets

from app.utils.config import config_manager
from app.utils.logger import log


# ─── Base Client Interface ───

class BaseExchangeClient(ABC):
    """Abstract interface for all exchange data clients."""

    def __init__(self, name: str, api_key: str = ""):
        self.name = name
        self.api_key = api_key
        self.is_connected: bool = False
        self.last_update: float = 0.0

    @abstractmethod
    async def fetch_data(self, symbol: str, **kwargs) -> Dict[str, Any]:
        """Fetch data for a given symbol. Subclasses define specifics."""
        ...

    def mark_update(self) -> None:
        """Record the timestamp of the latest data update."""
        self.last_update = time.time()

    @property
    def staleness_sec(self) -> float:
        """Seconds since last data update."""
        if self.last_update == 0:
            return float("inf")
        return time.time() - self.last_update

    async def connect(self) -> None:
        """Establish connection (for Persistent/WS clients)."""
        pass

    def stop(self) -> None:
        """Stop any background loops."""
        pass


# ─── Binance Client ───

class BinanceClient(BaseExchangeClient):
    """
    Binance REST client for OHLCV and spot prices.
    Uses ccxt with built-in rate limiting.
    """

    def __init__(self, use_testnet: bool = False):
        super().__init__("Binance")
        self.exchange = ccxt.binance({"enableRateLimit": True})
        if use_testnet:
            self.exchange.set_sandbox_mode(True)
        self.is_connected = True

    async def fetch_data(self, symbol: str, **kwargs) -> Dict[str, Any]:
        """Fetch current ticker + OHLCV for a symbol."""
        try:
            ticker = self.exchange.fetch_ticker(symbol)
            self.mark_update()
            return {
                "exchange": "binance",
                "symbol": symbol,
                "price": ticker.get("last"),
                "bid": ticker.get("bid"),
                "ask": ticker.get("ask"),
                "volume_24h": ticker.get("quoteVolume"),
                "timestamp": ticker.get("timestamp", time.time() * 1000),
            }
        except Exception as e:
            log.error(f"Binance fetch_data error for {symbol}: {e}")
            return {}

    def fetch_ohlcv(
        self, symbol: str, timeframe: str = "1h", limit: int = 100
    ) -> pd.DataFrame:
        """Fetch OHLCV candles as DataFrame."""
        try:
            ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
            df = pd.DataFrame(
                ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"]
            )
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
            self.mark_update()
            return df
        except Exception as e:
            log.error(f"Binance OHLCV error for {symbol}: {e}")
            return pd.DataFrame()

    def fetch_current_price(
        self, symbol: str, max_staleness_sec: int = 60
    ) -> Optional[float]:
        """Fetch latest price with staleness enforcement."""
        try:
            ticker = self.exchange.fetch_ticker(symbol)
            ts = ticker.get("timestamp")
            if ts:
                staleness = (time.time() * 1000 - ts) / 1000
                if staleness > max_staleness_sec:
                    log.warning(
                        f"Binance {symbol} stale: {staleness:.1f}s > {max_staleness_sec}s"
                    )
                    return None
            self.mark_update()
            return ticker.get("last")
        except Exception as e:
            log.error(f"Binance price error for {symbol}: {e}")
            return None


class BinanceWSClient(BaseExchangeClient):
    """
    Binance WebSocket client for real-time OHLCV and Ticker updates.
    """

    def __init__(self):
        super().__init__("BinanceWS")
        self.base_url = "wss://stream.binance.com:9443/ws"
        self._ws = None
        self._running = False
        self._on_update_cb = None

    def set_callback(self, cb):
        """Set callback for push updates."""
        self._on_update_cb = cb

    async def fetch_data(self, symbol: str, **kwargs) -> Dict[str, Any]:
        """WS clients don't use polling, but satisfy the interface."""
        return {}

    async def subscribe(self, symbols: List[str]):
        """Subscribe to kline streams: <symbol>@kline_1m."""
        if not self._ws:
            return
        params = [f"{s.lower().replace('/', '')}@kline_1m" for s in symbols]
        msg = {"method": "SUBSCRIBE", "params": params, "id": 1}
        await self._ws.send(json.dumps(msg))
        log.info(f"BinanceWS: Subscribed to {params}")

    async def connect(self):
        """Establish WebSocket connection with auto-reconnect."""
        self._running = True
        while self._running:
            try:
                log.info(f"BinanceWS: Connecting to {self.base_url}")
                async with websockets.connect(self.base_url) as ws:
                    self._ws = ws
                    self.is_connected = True
                    log.info("BinanceWS: Connected")
                    
                    # Heartbeat is handled by websockets library pings
                    while self._running:
                        msg = await ws.recv()
                        data = json.loads(msg)
                        log.debug(f"BinanceWS: Received {data.get('e')}")
                        if "k" in data: # Kline update
                            self.mark_update()
                            if self._on_update_cb:
                                await self._on_update_cb("binance", data)
            except Exception as e:
                log.error(f"BinanceWS Error: {e}")
                self.is_connected = False
                if self._running:
                    await asyncio.sleep(5)

    def stop(self):
        self._running = False


# ─── Deribit Client ───

class DeribitClient(BaseExchangeClient):
    """
    Deribit REST client for implied volatility and options greeks.
    Uses ccxt with built-in rate limiting.
    """

    def __init__(self, use_testnet: bool = False):
        super().__init__("Deribit")
        self.exchange = ccxt.deribit({"enableRateLimit": True})
        if use_testnet:
            self.exchange.set_sandbox_mode(True)
        self.is_connected = True

    async def fetch_data(self, symbol: str = "BTC", **kwargs) -> Dict[str, Any]:
        """Fetch DVOL + greeks for a currency."""
        iv = self.fetch_implied_volatility(symbol)
        self.mark_update()
        return {
            "exchange": "deribit",
            "symbol": symbol,
            "dvol": iv,
            "timestamp": time.time() * 1000,
        }

    def fetch_implied_volatility(self, currency: str = "BTC") -> Optional[float]:
        """Fetch the Deribit Volatility Index (DVOL)."""
        try:
            ticker = self.exchange.fetch_ticker(f"{currency}-DVOL")
            self.mark_update()
            return ticker.get("last")
        except Exception as e:
            log.error(f"Deribit IV error for {currency}: {e}")
            return None

    def fetch_options_greeks(self, currency: str = "BTC") -> Dict[str, float]:
        """Fetch ATM options greeks (simplified)."""
        try:
            iv = self.fetch_implied_volatility(currency)
            return {
                "delta": 0.0,
                "gamma": 0.0,
                "vega": 0.0,
                "theta": 0.0,
                "iv": iv,
            }
        except Exception as e:
            log.error(f"Deribit greeks error for {currency}: {e}")
            return {}


class DeribitWSClient(BaseExchangeClient):
    """
    Deribit WebSocket client for real-time DVOL and Volatility updates.
    """

    def __init__(self):
        super().__init__("DeribitWS")
        self.url = "wss://www.deribit.com/ws/api/v2"
        self._ws = None
        self._running = False
        self._on_update_cb = None

    def set_callback(self, cb):
        self._on_update_cb = cb

    async def fetch_data(self, symbol: str, **kwargs) -> Dict[str, Any]:
        """WS clients don't use polling, but satisfy the interface."""
        return {}

    async def connect(self):
        """Establish connection with heartbeats."""
        self._running = True
        while self._running:
            try:
                log.info(f"DeribitWS: Connecting to {self.url}")
                async with websockets.connect(self.url) as ws:
                    self._ws = ws
                    self.is_connected = True
                    
                    # Mandatory heartbeat for Deribit
                    heartbeat_msg = {
                        "jsonrpc": "2.0",
                        "id": 9098,
                        "method": "public/set_heartbeat",
                        "params": {"interval": 30}
                    }
                    await ws.send(json.dumps(heartbeat_msg))
                    
                    # Subscribe to DVOL for BTC/ETH
                    sub_msg = {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "public/subscribe",
                        "params": {"channels": ["deribit_price_index.btc_usd", "deribit_price_index.eth_usd"]}
                    }
                    await ws.send(json.dumps(sub_msg))
                    
                    log.info("DeribitWS: Connected & Subscribed")
                    
                    while self._running:
                        msg = await ws.recv()
                        data = json.loads(msg)
                        log.debug(f"DeribitWS: Received {data.get('method') or data.get('id')}")
                        
                        # Handle heartbeat response
                        if data.get("method") == "heartbeat":
                            await ws.send(json.dumps({"jsonrpc":"2.0", "id": 9999, "method":"public/test"}))
                            continue
                            
                        if "params" in data:
                            self.mark_update()
                            if self._on_update_cb:
                                await self._on_update_cb("deribit", data)
                                
            except Exception as e:
                log.error(f"DeribitWS Error: {e}")
                self.is_connected = False
                if self._running:
                    await asyncio.sleep(5)

    def stop(self):
        self._running = False


# ─── Macro Client ───

class MacroClient(BaseExchangeClient):
    """
    Federal Reserve Economic Data (FRED) API client.
    Fetches macroeconomic indicators like interest rates, CPI, Treasury yields.
    """

    def __init__(self, api_key: str = ""):
        key = api_key or os.getenv("FRED_API_KEY", "")
        super().__init__("FRED", api_key=key)
        self.base_url = kwargs.get("url", "https://api.stlouisfed.org/fred/series/observations")
        self.is_connected = bool(key)

    async def fetch_data(self, symbol: str = "DFF", **kwargs) -> Dict[str, Any]:
        """Fetch a FRED indicator."""
        limit = kwargs.get("limit", 10)
        df = self.fetch_indicator(symbol, limit)
        self.mark_update()
        if df.empty:
            return {"exchange": "fred", "symbol": symbol, "data": []}
        return {
            "exchange": "fred",
            "symbol": symbol,
            "latest_value": float(df["value"].iloc[-1]),
            "latest_date": str(df["date"].iloc[-1]),
            "data": df.to_dict(orient="records"),
        }

    def fetch_indicator(
        self, series_id: str = "DFF", limit: int = 30
    ) -> pd.DataFrame:
        """Fetch economic indicator as DataFrame."""
        if not self.api_key:
            log.warning("FRED_API_KEY not set — returning empty")
            return pd.DataFrame()

        params = {
            "series_id": series_id,
            "api_key": self.api_key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": limit,
        }
        try:
            resp = requests.get(self.base_url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json().get("observations", [])

            df = pd.DataFrame(data)
            if df.empty:
                return df

            df["date"] = pd.to_datetime(df["date"])
            df["value"] = pd.to_numeric(df["value"], errors="coerce")
            df = df.sort_values("date").reset_index(drop=True)
            self.mark_update()
            return df[["date", "value"]]
        except Exception as e:
            log.error(f"FRED error for {series_id}: {e}")
            return pd.DataFrame()


# ─── Polymarket WebSocket ───

class PolymarketWS(BaseExchangeClient):
    """Polymarket CLOB WebSocket stream for real-time orderbook updates."""

    def __init__(self, endpoint: str = "wss://clob.polymarket.com/ws"):
        super().__init__("Polymarket")
        self.endpoint = endpoint
        self._ws = None
        self._running = False

    async def fetch_data(self, symbol: str, **kwargs) -> Dict[str, Any]:
        """Not used for WS — use listen() instead."""
        return {}

    async def connect(self) -> None:
        """Establish WebSocket connection."""
        try:
            self._ws = await websockets.connect(self.endpoint)
            self.is_connected = True
            log.info(f"Connected to {self.name} WS: {self.endpoint}")
        except Exception as e:
            log.error(f"Failed to connect to {self.name}: {e}")
            self.is_connected = False

    async def subscribe(self, symbols: List[str]) -> None:
        """Subscribe to orderbook channels."""
        if not self.is_connected or not self._ws:
            return
        msg = {
            "type": "subscribe",
            "channels": [{"name": "orderbook", "symbols": symbols}],
        }
        await self._ws.send(json.dumps(msg))
        log.info(f"Subscribed to {len(symbols)} symbols on {self.name}")

    async def listen(self) -> None:
        """Listen for orderbook updates."""
        self._running = True
        while self._running:
            try:
                msg = await self._ws.recv()
                data = json.loads(msg)
                if data.get("type") == "book":
                    self.mark_update()
                    # Process via EventBus in future integration
            except Exception as e:
                log.error(f"{self.name} connection error: {e}")
                self.is_connected = False
                await asyncio.sleep(5)
                await self.connect()

    def stop(self) -> None:
        """Stop the listener loop."""
        self._running = False
