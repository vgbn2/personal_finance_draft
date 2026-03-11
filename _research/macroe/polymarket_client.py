"""
Polymarket Client - Reusable wrapper with retry logic and error handling.
Extracted from t.py and manual_trader.py to eliminate duplication.
"""
import os
import json
import asyncio
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

import aiohttp
from dotenv import load_dotenv
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import OrderArgs
from py_clob_client.constants import POLYGON

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)


@dataclass
class MarketInfo:
    """Container for market metadata"""
    slug: str
    question: str
    end_time: str
    token_yes: str
    token_no: str


class PolymarketClientError(Exception):
    """Base exception for Polymarket client errors"""
    pass


class PolymarketClient:
    """
    Enhanced Polymarket client with retry logic and proper error handling.
    """
    
    CLOB_API = "https://clob.polymarket.com"
    GAMMA_API_BASE = "https://gamma-api.polymarket.com"
    WINDOW_SIZE_SECONDS = 900  # 15 minutes
    
    def __init__(
        self,
        private_key: Optional[str] = None,
        proxy_address: Optional[str] = None,
        timeout: int = 10
    ):
        """
        Initialize Polymarket client.
        
        Args:
            private_key: Ethereum private key (loads from env if None)
            proxy_address: Proxy contract address (loads from env if None)
            timeout: Request timeout in seconds
            
        Raises:
            PolymarketClientError: If credentials are missing
        """
        self.private_key = private_key or os.getenv("PRIVATE_KEY")
        self.proxy_address = proxy_address or os.getenv("POLYMARKET_PROXY")
        self.timeout = timeout
        
        if not self.private_key:
            raise PolymarketClientError("PRIVATE_KEY not found in environment")
        
        self._client: Optional[ClobClient] = None
        self._initialize_client()
    
    def _initialize_client(self) -> None:
        """Initialize the CLOB client with credentials"""
        try:
            self._client = ClobClient(
                host=self.CLOB_API,
                key=self.private_key,
                chain_id=POLYGON,
                signature_type=2,
                funder=self.proxy_address
            )
            self._client.set_api_creds(self._client.create_or_derive_api_creds())
            logger.info(f"Client initialized for proxy: {self.proxy_address}")
        except Exception as e:
            raise PolymarketClientError(f"Failed to initialize client: {e}") from e
    
    @staticmethod
    def get_15min_window_epoch(offset: int = 0) -> int:
        """
        Calculate epoch timestamp for 15-minute market window.
        
        Args:
            offset: Window offset (0=current, 1=next, -1=previous)
            
        Returns:
            Unix timestamp for window start
        """
        now = int(datetime.now(timezone.utc).timestamp())
        window_start = (now // PolymarketClient.WINDOW_SIZE_SECONDS) * PolymarketClient.WINDOW_SIZE_SECONDS
        return window_start + (offset * PolymarketClient.WINDOW_SIZE_SECONDS)
    
    async def get_market_price(self, token_id: str) -> Optional[float]:
        """
        Fetch the lowest ask price for a token.
        
        Args:
            token_id: The token identifier
            
        Returns:
            Price as float or None if orderbook empty/error
        """
        try:
            # Run blocking call in executor
            book = await asyncio.to_thread(self._client.get_order_book, token_id)
            
            # Handle different response formats
            asks = getattr(book, 'asks', [])
            if not asks and isinstance(book, dict):
                asks = book.get('asks', [])
            
            if not asks:
                logger.debug(f"No asks available for token {token_id}")
                return None
            
            # Extract price from first ask
            price = asks[0].price if hasattr(asks[0], 'price') else asks[0][0]
            return float(price)
            
        except asyncio.TimeoutError:
            logger.warning(f"Timeout fetching price for {token_id}")
            return None
        except Exception as e:
            logger.error(f"Error fetching market price: {e}", exc_info=True)
            return None
    
    async def scan_15min_markets(
        self,
        session: aiohttp.ClientSession,
        assets: List[str] = None,
        window_offsets: List[int] = None
    ) -> List[MarketInfo]:
        """
        Scan for active 15-minute crypto markets.
        
        Args:
            session: aiohttp client session
            assets: List of asset symbols (default: btc, eth, sol, xrp)
            window_offsets: Time window offsets to check (default: [0, 1])
            
        Returns:
            List of active MarketInfo objects
        """
        assets = assets or ['btc', 'eth', 'sol', 'xrp']
        window_offsets = window_offsets or [0, 1]
        markets: List[MarketInfo] = []
        
        for offset in window_offsets:
            epoch = self.get_15min_window_epoch(offset)
            
            for asset in assets:
                slug = f"{asset}-updown-15m-{epoch}"
                market = await self._fetch_market_by_slug(session, slug)
                if market:
                    markets.append(market)
        
        return markets
    
    async def _fetch_market_by_slug(
        self,
        session: aiohttp.ClientSession,
        slug: str
    ) -> Optional[MarketInfo]:
        """
        Fetch market details by slug.
        
        Args:
            session: aiohttp client session
            slug: Market slug identifier
            
        Returns:
            MarketInfo or None if not found/closed
        """
        try:
            url = f"{self.GAMMA_API_BASE}/events"
            async with session.get(
                url,
                params={"slug": slug},
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            ) as resp:
                if resp.status != 200:
                    return None
                
                data = await resp.json()
                if not data or data[0].get('closed'):
                    return None
                
                market_data = data[0]['markets'][0]
                end_date_str = market_data.get('endDate')
                
                if not end_date_str:
                    return None
                
                end_dt = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
                
                # Skip expired markets
                if end_dt <= datetime.now(timezone.utc):
                    return None
                
                # Parse token IDs
                token_ids = market_data.get('clobTokenIds', [])
                if isinstance(token_ids, str):
                    token_ids = json.loads(token_ids)
                
                if len(token_ids) < 2:
                    logger.warning(f"Invalid token IDs for {slug}")
                    return None
                
                return MarketInfo(
                    slug=slug,
                    question=market_data.get('question', 'Unknown'),
                    end_time=end_dt.strftime("%H:%M:%S"),
                    token_yes=token_ids[0],
                    token_no=token_ids[1]
                )
                
        except asyncio.TimeoutError:
            logger.warning(f"Timeout fetching market {slug}")
            return None
        except Exception as e:
            logger.debug(f"Error fetching {slug}: {e}")
            return None
    
    async def place_order(
        self,
        token_id: str,
        price: float,
        size: float,
        side: str = "BUY",
        expiration_minutes: int = 2,
        order_type: str = "GTD"
    ) -> Optional[Dict[str, Any]]:
        """
        Place a market order.
        
        Args:
            token_id: Token identifier
            price: Limit price
            size: Order size in shares
            side: "BUY" or "SELL"
            expiration_minutes: Order expiration time
            order_type: Order type (GTD, FOK, etc.)
            
        Returns:
            Order response dict or None on failure
        """
        try:
            expiration = int(
                (datetime.now(timezone.utc) + timedelta(minutes=expiration_minutes)).timestamp()
            )
            
            order = OrderArgs(
                price=price,
                size=size,
                side=side,
                token_id=token_id,
                expiration=expiration
            )
            
            # Execute in thread pool
            signed_order = await asyncio.to_thread(self._client.create_order, order)
            response = await asyncio.to_thread(
                self._client.post_order,
                signed_order,
                orderType=order_type
            )
            
            if isinstance(response, dict) and response.get("orderID"):
                logger.info(f"Order placed successfully: {response['orderID']}")
                return response
            else:
                logger.error(f"Order rejected: {response}")
                return None
                
        except Exception as e:
            logger.error(f"Order placement failed: {e}", exc_info=True)
            return None
