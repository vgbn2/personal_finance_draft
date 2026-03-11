import aiohttp
from typing import Optional
from src.utils.logger import logger


class BinanceAPI:
    """REST API client for Binance."""
    
    def __init__(self):
        from src.config import config
        self.base_url = config.BINANCE_API_URL
    
    async def get_price(self, symbol: str) -> Optional[float]:
        """Get current price for symbol."""
        url = f"{self.base_url}/api/v3/ticker/price"
        params = {"symbol": symbol}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return float(data["price"])
                    return None
        except Exception as e:
            logger.error(f"Error fetching Binance price: {e}")
            return None
    
    async def get_order_book(self, symbol: str, limit: int = 20) -> Optional[dict]:
        """Get order book for symbol."""
        url = f"{self.base_url}/api/v3/depth"
        params = {"symbol": symbol, "limit": limit}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    return None
        except Exception as e:
            logger.error(f"Error fetching Binance order book: {e}")
            return None
    
    async def get_24h_stats(self, symbol: str) -> Optional[dict]:
        """Get 24h trading stats."""
        url = f"{self.base_url}/api/v3/ticker/24hr"
        params = {"symbol": symbol}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    return None
        except Exception as e:
            logger.error(f"Error fetching 24h stats: {e}")
            return None
