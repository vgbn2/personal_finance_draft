"""
Polymarket Paper Trading Simulator — REST Client
Gamma API market discovery, L2 snapshots, and 15-min window helpers.
"""

from __future__ import annotations

import json
import math
import time
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import aiohttp
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from ..core import config
from ..core.dns import get_resolver

logger = logging.getLogger(__name__)


# ============================================================
#  15-MINUTE WINDOW HELPERS  (ported from reference impl)
# ============================================================

def get_current_window_timestamp() -> int:
    """Return the Unix‑second start of the current 15-min window."""
    now = int(time.time())
    return now - (now % config.WINDOW_SECONDS)


def get_next_window_timestamp() -> int:
    """Return the Unix‑second start of the *next* 15-min window."""
    return get_current_window_timestamp() + config.WINDOW_SECONDS


def get_ms_until_next_window() -> int:
    """Milliseconds remaining until the next window opens."""
    now_ms = int(time.time() * 1000)
    next_ms = get_next_window_timestamp() * 1000
    return max(0, next_ms - now_ms)


def build_market_slug(window_ts: int) -> str:
    """
    Build the Polymarket event slug for a BTC 15-min window.
    Format: 'btc-updown-15m-{epoch_seconds}'
    Example: 'btc-updown-15m-1771509600'
    """
    return f"btc-updown-15m-{window_ts}"


def parse_iso_to_unix(iso_str: str) -> float:
    """
    Parse Gamma API ISO8601 strings to Unix seconds.
    Example: '2023-11-07T05:31:56Z' -> 1699335116.0
    """
    if not iso_str:
        return 0.0
    # Replace Z with +00:00 for older python versions if needed, 
    # but 3.11+ handle Z fine. We'll be safe:
    clean = iso_str.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(clean)
        return dt.timestamp()
    except Exception as e:
        logger.warning("Failed to parse ISO date %s: %s", iso_str, e)
        return 0.0

class GammaAPIClient:
    """REST client for Polymarket Gamma API + CLOB orderbook snapshots."""

    def __init__(self, session: Optional[aiohttp.ClientSession] = None):
        self._session = session
        self._owns_session = session is None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            # connector = aiohttp.TCPConnector(resolver=get_resolver())
            self._session = aiohttp.ClientSession(
                # connector=connector,
                headers={
                    "User-Agent": config.WS_USER_AGENT,
                    "Accept": "application/json, text/plain, */*",
                    "Origin": "https://polymarket.com",
                    "Referer": "https://polymarket.com/",
                }
            )
            self._owns_session = True
        return self._session

    async def close(self):
        if self._owns_session and self._session and not self._session.closed:
            await self._session.close()

    # ── Market Discovery ──────────────────────────────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((aiohttp.ClientError, TimeoutError)),
    )
    async def fetch_market_by_slug(self, slug: str) -> Dict[str, Any]:
        """
        Fetch market data from Gamma API by slug.
        Mirrors: GET https://gamma-api.polymarket.com/events/slug/{slug}
        """
        session = await self._get_session()
        url = f"{config.GAMMA_API_BASE}/events/slug/{slug}"
        logger.info("Fetching market: %s", url)

        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                raise aiohttp.ClientError(f"Gamma API returned {resp.status}")
            data = await resp.json()
            return data

    async def fetch_current_market(self) -> Dict[str, Any]:
        """
        Fetch the current 15-min BTC Up/Down market.
        Uses smart discovery: direct slug -> fallback search.
        """
        ts = get_current_window_timestamp()
        slug = build_market_slug(ts)
        
        # Try finding it smartly
        return await self.find_active_market(slug_hint=slug, window_ts=ts)

    async def find_active_market(self, slug_hint: str, window_ts: int) -> Dict[str, Any]:
        """
        Robustly find the target market.
        1. Try direct slug lookup (fastest).
        2. If 404, search for "Bitcoin Up Down" and filter for the one starting at window_ts.
        """
        # 1. Try direct slug
        try:
            return await self.fetch_market_by_slug(slug_hint)
        except Exception as exc:
            logger.warning("Direct slug lookup failed for %s: %s. Falling back to search...", slug_hint, exc)

        # 2. Fallback search
        query = "Bitcoin Up Down"
        try:
            candidates = await self.search_markets(query, limit=10)
            
            # Filter for start time match
            # The market 'startDate' is usually ISO8601 string.
            # We need to parse or just check slug contains timestamp?
            # Actually easier: check if slug contains our timestamp.
            target_ts_str = str(window_ts)
            
            for market in candidates:
                mslug = market.get("slug", "")
                # Check if it looks right
                if target_ts_str in mslug and "btc" in mslug.lower():
                     logger.info("🎯 Found market via search: %s", mslug)
                     # Fetch full details to ensure we have tokenIds, etc.
                     return await self.fetch_market_by_slug(mslug)
            
            logger.error("❌ Smart discovery failed. No matching market found in search results.")
            raise ValueError(f"Market not found for timestamp {window_ts}")

        except Exception as search_exc:
             logger.error("Fallback search failed: %s", search_exc)
             raise

    # ── Token Extraction ──────────────────────────────────────

    @staticmethod
    def extract_token_ids(market_data: Dict[str, Any]) -> Optional[List[str]]:
        """
        Extract clobTokenIds from market response.
        Returns list of token IDs or None if not found.
        """
        try:
            markets = market_data.get("markets", [])
            if not markets:
                return None
            raw = markets[0].get("clobTokenIds")
            if raw is None:
                return None
            return json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, IndexError, KeyError) as exc:
            logger.warning("Failed to extract token IDs: %s", exc)
            return None

    @staticmethod
    def extract_outcomes(market_data: Dict[str, Any]) -> List[str]:
        """Extract outcome labels (e.g. ['Up', 'Down'])."""
        try:
            raw = market_data["markets"][0]["outcomes"]
            return json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, IndexError, KeyError):
            return ["Up", "Down"]

    @staticmethod
    def is_accepting_orders(market_data: Dict[str, Any]) -> bool:
        """Check if market is currently accepting orders."""
        try:
            return bool(market_data["markets"][0].get("acceptingOrders", False))
        except (IndexError, KeyError):
            return False

    # ── Market Search ─────────────────────────────────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((aiohttp.ClientError, TimeoutError)),
    )
    async def search_markets(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search for markets by keyword using Gamma API.
        Returns list of market event dicts.
        """
        session = await self._get_session()
        url = f"{config.GAMMA_API_BASE}/events"
        params = {
            "q": query,
            "limit": limit,
            "active": "true",
            "closed": "false",
        }
        logger.info("Searching markets: %s", query)

        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                raise aiohttp.ClientError(f"Gamma API search returned {resp.status}")
            return await resp.json()

    # ── Orderbook Snapshot (CLOB REST fallback) ───────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((aiohttp.ClientError, TimeoutError)),
    )
    async def fetch_orderbook_snapshot(self, token_id: str) -> Dict[str, Any]:
        """
        Fetch L2 orderbook snapshot via CLOB REST API.
        GET https://clob.polymarket.com/book?token_id=...
        """
        session = await self._get_session()
        url = f"{config.CLOB_API_BASE}/book"
        params = {"token_id": token_id}

        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                raise aiohttp.ClientError(f"CLOB /book returned {resp.status}")
            return await resp.json()
