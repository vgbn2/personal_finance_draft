import aiohttp
from typing import List, Optional
from src.models.market import Market
from src.utils.logger import logger


class PolymarketAPI:
    """REST API client for Polymarket."""
    
    def __init__(self):
        from src.config import config
        self.base_url = config.POLYMARKET_API_URL
    
    async def get_markets(
        self,
        limit: int = 100,
        active: bool = True,
        closed: bool = False
    ) -> List[dict]:
        """Fetch markets from API."""
        url = f"{self.base_url}/markets"
        params = {
            "limit": limit,
            "active": active,
            "closed": closed
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("markets", [])
                    else:
                        logger.error(f"Failed to fetch markets: {resp.status}")
                        return []
        except Exception as e:
            logger.error(f"Error fetching markets: {e}")
            return []
    
    async def get_market(self, market_id: str) -> Optional[dict]:
        """Fetch a single market by ID."""
        url = f"{self.base_url}/markets/{market_id}"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    return None
        except Exception as e:
            logger.error(f"Error fetching market {market_id}: {e}")
            return None
    
    async def get_order_book(self, market_id: str) -> Optional[dict]:
        """Fetch order book for a market."""
        url = f"{self.base_url}/orderbook"
        params = {"market": market_id}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    return None
        except Exception as e:
            logger.error(f"Error fetching orderbook for {market_id}: {e}")
            return None
    
    async def get_market_price(self, market_id: str) -> Optional[dict]:
        """Fetch current price for a market."""
        url = f"{self.base_url}/prices"
        params = {"market": market_id}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("markets", [{}])[0] if data.get("markets") else None
                    return None
        except Exception as e:
            logger.error(f"Error fetching price for {market_id}: {e}")
            return None
    
    def parse_market(self, data: dict) -> Market:
        """Parse API response into Market model."""
        from datetime import datetime
        
        return Market(
            id=data.get("id", ""),
            question=data.get("question", ""),
            description=data.get("description"),
            volume=float(data.get("volume", 0) or 0),
            liquidity=float(data.get("liquidity", 0) or 0),
            yes_price=float(data.get("yesPrice", 0.5) or 0.5),
            no_price=float(data.get("noPrice", 0.5) or 0.5),
            category=data.get("category"),
            end_date=datetime.fromisoformat(data["endDate"]) if data.get("endDate") else None
        )
    
    async def fetch_high_volume_markets(self, min_volume: float = 10000) -> List[Market]:
        """Fetch markets with volume above threshold."""
        markets_data = await self.get_markets(limit=200, active=True)
        
        markets = []
        for m in markets_data:
            try:
                volume = float(m.get("volume", 0) or 0)
                if volume >= min_volume:
                    market = self.parse_market(m)
                    markets.append(market)
            except Exception as e:
                logger.warning(f"Failed to parse market: {e}")
        
        logger.info(f"Found {len(markets)} markets with volume >= ${min_volume}")
        return markets
