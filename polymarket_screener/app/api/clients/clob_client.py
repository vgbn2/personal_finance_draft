"""
Polymarket CLOB (Central Limit Orderbook) client.

Provides direct access to the Polymarket CLOB REST API for:
  - Orderbook depth queries
  - VWAP calculation with slippage estimation
  - Order placement readiness (structure only, no signing)

The CLOB API is separate from the Gamma API:
  - Gamma = event metadata (slugs, questions, categories)
  - CLOB  = orderbooks, trades, prices
"""
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

from app.core.models.domain_models import UnifiedOrderbook
from app.math.slippage import calculate_vwap, calculate_slippage_bps
from app.utils.logger import log


# ─── CLOB API Endpoints ───
CLOB_BASE_URL = "https://clob.polymarket.com"
BOOK_ENDPOINT = f"{CLOB_BASE_URL}/book"
PRICE_ENDPOINT = f"{CLOB_BASE_URL}/price"
MIDPOINT_ENDPOINT = f"{CLOB_BASE_URL}/midpoint"


class ClobClient:
    """
    Polymarket CLOB REST client for orderbook access and VWAP calculation.

    Usage:
        clob = ClobClient()
        book = clob.get_orderbook(token_id="0x1234...")
        vwap = clob.calculate_vwap(token_id="0x1234...", size_usd=1000)
    """

    def __init__(self, timeout: int = 10, max_retries: int = 3):
        self.timeout = timeout
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/json",
            "User-Agent": "POLY-SCREEN/1.0",
        })

    def _request(self, url: str, params: Optional[Dict] = None) -> Any:
        """Rate-limit aware request with retry for 429/504."""
        for attempt in range(self.max_retries):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)

                if resp.status_code == 429:
                    wait = min(2 ** attempt * 5, 60)
                    log.warning(f"CLOB 429 rate limit -- retrying in {wait}s")
                    time.sleep(wait)
                    continue

                if resp.status_code == 504:
                    wait = min(2 ** attempt * 3, 30)
                    log.warning(f"CLOB 504 timeout -- retrying in {wait}s")
                    time.sleep(wait)
                    continue

                resp.raise_for_status()
                return resp.json()

            except requests.exceptions.RequestException as e:
                log.error(f"CLOB request failed (attempt {attempt + 1}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)

        log.error(f"CLOB request exhausted {self.max_retries} retries: {url}")
        return None

    def get_orderbook(self, token_id: str) -> Optional[UnifiedOrderbook]:
        """
        Fetch full orderbook for a CLOB token.

        Args:
            token_id: Polymarket CLOB token ID (from Gamma API)

        Returns:
            UnifiedOrderbook or None on failure
        """
        params = {"token_id": token_id}
        data = self._request(BOOK_ENDPOINT, params)

        if not data:
            log.warning(f"CLOB: empty orderbook for {token_id[:16]}...")
            return None

        try:
            # Parse Polymarket CLOB format
            bids = [
                (float(b.get("price", 0)), float(b.get("size", 0)))
                for b in data.get("bids", [])
            ]
            asks = [
                (float(a.get("price", 0)), float(a.get("size", 0)))
                for a in data.get("asks", [])
            ]

            book = UnifiedOrderbook(
                exchange="polymarket",
                symbol=token_id,
                bids=sorted(bids, key=lambda x: -x[0]),
                asks=sorted(asks, key=lambda x: x[0]),
            )

            log.debug(f"CLOB book: {len(bids)} bids, {len(asks)} asks, "
                       f"depth=${book.depth_usd:.0f}")
            return book

        except Exception as e:
            log.error(f"CLOB orderbook parse error: {e}")
            return None

    def get_midpoint(self, token_id: str) -> Optional[float]:
        """Fetch the current midpoint price for a token."""
        params = {"token_id": token_id}
        data = self._request(MIDPOINT_ENDPOINT, params)
        if data and "mid" in data:
            return float(data["mid"])
        return None

    def get_price(self, token_id: str, side: str = "buy") -> Optional[float]:
        """Fetch the current best price for a token."""
        params = {"token_id": token_id, "side": side}
        data = self._request(PRICE_ENDPOINT, params)
        if data and "price" in data:
            return float(data["price"])
        return None

    def calculate_vwap(
        self, token_id: str, size_usd: float, side: str = "buy"
    ) -> Dict[str, Any]:
        """
        Calculate VWAP for a given order size by traversing the orderbook.

        Integrates with the math/slippage module for consistent slippage
        estimation across the entire system.

        Args:
            token_id: CLOB token ID
            size_usd: Target order size in USD
            side: "buy" (traverse asks) or "sell" (traverse bids)

        Returns:
            Dict with vwap, slippage_bps, executable, and depth info
        """
        book = self.get_orderbook(token_id)
        if not book:
            return {
                "executable": False,
                "vwap": None,
                "slippage_bps": 0.0,
                "depth_usd": 0.0,
                "reason": "Failed to fetch orderbook",
            }

        # Select levels based on side
        if side == "buy":
            levels = [(p, s) for p, s in book.asks]
        else:
            levels = [(p, s) for p, s in book.bids]

        if not levels:
            return {
                "executable": False,
                "vwap": None,
                "slippage_bps": 0.0,
                "depth_usd": 0.0,
                "reason": f"No {side} levels in orderbook",
            }

        # Delegate to math/slippage for VWAP calculation
        vwap = calculate_vwap(levels, size_usd)
        best_price = levels[0][0]
        depth = sum(s for _, s in levels)

        if vwap is None:
            return {
                "executable": False,
                "vwap": None,
                "slippage_bps": 0.0,
                "depth_usd": depth,
                "reason": f"Insufficient liquidity: ${depth:.0f} < ${size_usd:.0f}",
            }

        slip = calculate_slippage_bps(best_price, vwap)

        return {
            "executable": True,
            "vwap": vwap,
            "best_price": best_price,
            "slippage_bps": slip,
            "depth_usd": depth,
            "reason": None,
        }


# ─── Module-level singleton ───
clob_client = ClobClient()
