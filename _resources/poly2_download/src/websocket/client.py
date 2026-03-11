import asyncio
import json
import websockets
from typing import Dict, Callable, Optional, Any, Awaitable
from datetime import datetime
import src.utils.constants as constants
from src.utils.logger import logger


class WebSocketClient:
    """WebSocket client for Polymarket with reconnection logic."""
    
    def __init__(
        self,
        url: str,
        on_message: Callable[[dict], Any] | None = None,
        on_connect: Callable[[], Any] | None = None,
        on_disconnect: Callable[[], Any] | None = None,
    ):
        self.url = url
        self.ws = None
        self.on_message = on_message
        self.on_connect = on_connect
        self.on_disconnect = on_disconnect
        self._running = False
        self._reconnect_delay = 1
        self._max_reconnect_delay = 60
        self._subscriptions: Dict[str, set] = {}
    
    async def connect(self) -> bool:
        """Establish WebSocket connection."""
        try:
            self.ws = await websockets.connect(self.url, ping_interval=20)
            self._running = True
            self._reconnect_delay = 1
            logger.info(f"Connected to {self.url}")
            
            if self.on_connect:
                await self.on_connect()
            
            # Resubscribe to previous subscriptions
            for channel, markets in self._subscriptions.items():
                for market_id in markets:
                    await self.subscribe(channel, market_id)
            
            return True
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            return False
    
    async def disconnect(self):
        """Close WebSocket connection."""
        self._running = False
        if self.ws:
            await self.ws.close()
            logger.info("Disconnected from WebSocket")
    
    async def reconnect(self):
        """Reconnect with exponential backoff."""
        logger.warning(f"Reconnecting in {self._reconnect_delay}s...")
        await asyncio.sleep(self._reconnect_delay)
        
        if await self.connect():
            self._reconnect_delay = 1
        else:
            self._reconnect_delay = min(self._reconnect_delay * 2, self._max_reconnect_delay)
            await self.reconnect()
    
    async def send(self, message: dict):
        """Send JSON message."""
        if self.ws:
            await self.ws.send(json.dumps(message))
    
    async def subscribe(self, channel: str, market_id: str):
        """Subscribe to market channel."""
        msg = {
            "type": "subscribe",
            "channel": channel,
            "market": market_id
        }
        await self.send(msg)
        
        if channel not in self._subscriptions:
            self._subscriptions[channel] = set()
        self._subscriptions[channel].add(market_id)
        logger.info(f"Subscribed to {channel} for {market_id}")
    
    async def unsubscribe(self, channel: str, market_id: str):
        """Unsubscribe from market channel."""
        msg = {
            "type": "unsubscribe",
            "channel": channel,
            "market": market_id
        }
        await self.send(msg)
        
        if channel in self._subscriptions and market_id in self._subscriptions[channel]:
            self._subscriptions[channel].remove(market_id)
    
    async def listen(self):
        """Listen for messages."""
        while self._running:
            try:
                if not self.ws:
                    await self.reconnect()
                    continue
                
                async for message in self.ws:
                    try:
                        data = json.loads(message)
                        if self.on_message:
                            await self.on_message(data)
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON: {message[:100]}")
                    except Exception as e:
                        logger.error(f"Error processing message: {e}")
            except websockets.exceptions.ConnectionClosed:
                logger.warning("Connection closed")
                if self.on_disconnect:
                    await self.on_disconnect()
                await self.reconnect()
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                await self.reconnect()


class PolymarketWebSocket:
    """Manager for Polymarket WebSocket connections."""
    
    def __init__(self, on_price_update: Callable[[str, dict], Any] | None = None):
        from src.config import config
        self.url = config.POLYMARKET_WSS_URL
        self.client = WebSocketClient(self.url)
        self.on_price_update = on_price_update
        self._market_states: Dict[str, dict] = {}
    
    async def handle_message(self, data: dict):
        """Handle incoming WebSocket message."""
        msg_type = data.get("type", "")
        
        if msg_type == "price_change":
            market_id = data.get("market", "")
            price_data = data.get("price", {})
            self._market_states[market_id] = {
                "yes_price": price_data.get("yes_price", 0.5),
                "no_price": price_data.get("no_price", 0.5),
                "timestamp": datetime.utcnow()
            }
            if self.on_price_update:
                await self.on_price_update(market_id, self._market_states[market_id])
        
        elif msg_type == "order_book_change":
            market_id = data.get("market", "")
            book_data = data.get("book", {})
            if market_id in self._market_states:
                self._market_states[market_id]["book"] = book_data
                self._market_states[market_id]["timestamp"] = datetime.utcnow()
    
    async def subscribe_market(self, market_id: str):
        """Subscribe to market updates."""
        await self.client.subscribe(constants.CHANNEL_PRICE, market_id)
        await self.client.subscribe(constants.CHANNEL_BOOK, market_id)
    
    async def unsubscribe_market(self, market_id: str):
        """Unsubscribe from market updates."""
        await self.client.unsubscribe(constants.CHANNEL_PRICE, market_id)
        await self.client.unsubscribe(constants.CHANNEL_BOOK, market_id)
    
    def get_market_state(self, market_id: str) -> Optional[dict]:
        """Get current state for a market."""
        return self._market_states.get(market_id)
    
    async def connect(self):
        """Connect and start listening."""
        self.client.on_message = self.handle_message
        await self.client.connect()
        await self.client.listen()
    
    async def disconnect(self):
        """Disconnect."""
        await self.client.disconnect()
