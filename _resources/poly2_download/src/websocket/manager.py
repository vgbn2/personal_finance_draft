import asyncio
from typing import Dict, Callable, Any, Optional
from src.websocket.client import PolymarketWebSocket
from src.utils.logger import logger


class BinanceWebSocket:
    """WebSocket client for Binance market data."""
    
    def __init__(self, on_trade: Callable[[str, dict], Any] | None = None):
        from src.config import config
        self.url = config.BINANCE_WSS_URL
        self.on_trade = on_trade
        self._trades: Dict[str, list] = {}
        self._last_prices: Dict[str, float] = {}
        self._running = False
    
    async def handle_message(self, data: dict):
        """Handle incoming Binance message."""
        if "e" in data and data["e"] == "trade":
            symbol = data["s"]
            price = float(data["p"])
            quantity = float(data["q"])
            timestamp = data["T"]
            
            self._last_prices[symbol] = price
            
            if symbol not in self._trades:
                self._trades[symbol] = []
            
            self._trades[symbol].append({
                "price": price,
                "quantity": quantity,
                "timestamp": timestamp
            })
            
            # Keep last 1000 trades
            self._trades[symbol] = self._trades[symbol][-1000:]
            
            if self.on_trade:
                await self.on_trade(symbol, self._trades[symbol][-1])
    
    def get_price(self, symbol: str) -> Optional[float]:
        """Get latest price for symbol."""
        return self._last_prices.get(symbol)
    
    def get_price_change_1m(self, symbol: str) -> float:
        """Calculate 1-minute price change percentage."""
        if symbol not in self._trades or len(self._trades[symbol]) < 2:
            return 0.0
        
        trades = self._trades[symbol]
        # Approximate 1 minute of trades (assuming ~10 trades/sec)
        recent = trades[-600:] if len(trades) >= 600 else trades
        
        if not recent:
            return 0.0
        
        first_price = recent[0]["price"]
        last_price = recent[-1]["price"]
        
        return (last_price - first_price) / first_price if first_price > 0 else 0.0
    
    async def subscribe_symbols(self, symbols: list[str]):
        """Subscribe to trade streams for symbols."""
        import websockets
        import json
        
        streams = [f"{s.lower()}@trade" for s in symbols]
        url = self.url + "/stream?streams=" + "/".join(streams)
        
        self._running = True
        try:
            async with websockets.connect(url) as ws:
                async for msg in ws:
                    if not self._running:
                        break
                    try:
                        data = json.loads(msg)
                        if "data" in data:
                            await self.handle_message(data["data"])
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            logger.error(f"Binance WebSocket error: {e}")
            await asyncio.sleep(5)
            if self._running:
                await self.subscribe_symbols(symbols)
    
    def stop(self):
        """Stop the WebSocket."""
        self._running = False


class WebSocketManager:
    """Manages all WebSocket connections."""
    
    def __init__(self, strategy_engine: Any):
        self.strategy_engine = strategy_engine
        self.poly_ws: Optional[PolymarketWebSocket] = None
        self.binance_ws: Optional[BinanceWebSocket] = None
        self._running = False
    
    async def start(self):
        """Start all WebSocket connections."""
        self._running = True
        
        # Initialize Polymarket WebSocket
        self.poly_ws = PolymarketWebSocket(
            on_price_update=self.handle_polymarket_update
        )
        
        # Initialize Binance WebSocket
        self.binance_ws = BinanceWebSocket(
            on_trade=self.handle_binance_trade
        )
        
        # Start both in background tasks
        asyncio.create_task(self.poly_ws.connect())
        
        # Subscribe to major crypto for lag arb
        asyncio.create_task(self.binance_ws.subscribe_symbols(["BTCUSDT", "ETHUSDT", "SOLUSDT"]))
        
        logger.info("WebSocket manager started")
    
    async def handle_polymarket_update(self, market_id: str, state: dict):
        """Handle Polymarket price update."""
        await self.strategy_engine.on_market_update(market_id, state)
    
    async def handle_binance_trade(self, symbol: str, trade: dict):
        """Handle Binance trade."""
        await self.strategy_engine.on_binance_update(symbol, trade)
    
    def subscribe_market(self, market_id: str):
        """Subscribe to a specific market."""
        if self.poly_ws:
            asyncio.create_task(self.poly_ws.subscribe_market(market_id))
    
    def unsubscribe_market(self, market_id: str):
        """Unsubscribe from a market."""
        if self.poly_ws:
            asyncio.create_task(self.poly_ws.unsubscribe_market(market_id))
    
    async def stop(self):
        """Stop all WebSocket connections."""
        self._running = False
        if self.poly_ws:
            await self.poly_ws.disconnect()
        if self.binance_ws:
            self.binance_ws.stop()
        logger.info("WebSocket manager stopped")
