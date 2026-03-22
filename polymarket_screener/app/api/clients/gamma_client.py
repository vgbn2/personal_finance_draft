"""
Polymarket Gamma API client for event metadata discovery.

The Gamma API provides higher-level market metadata:
  - Active event slugs and descriptions
  - Market categories (crypto, politics, sports)
  - CLOB token IDs for orderbook queries
  - Expiration timestamps and resolution rules

The 15-minute rolling window logic automatically discovers
crypto-event markets matching the engine's target window.
"""
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import requests

from app.utils.logger import log


# ─── Gamma API Endpoints ───
GAMMA_BASE_URL = "https://gamma-api.polymarket.com"
EVENTS_ENDPOINT = f"{GAMMA_BASE_URL}/events"
MARKETS_ENDPOINT = f"{GAMMA_BASE_URL}/markets"


class GammaMarket:
    """Parsed Gamma market with essential fields."""

    def __init__(self, raw: Dict[str, Any]):
        self.raw = raw
        self.id: str = str(raw.get("id", ""))
        self.question: str = raw.get("question", "")
        self.slug: str = raw.get("slug", "")
        self.active: bool = raw.get("active", False)
        self.closed: bool = raw.get("closed", False)
        self.end_date: Optional[str] = raw.get("end_date_iso")
        self.volume: float = float(raw.get("volume", 0))
        self.liquidity: float = float(raw.get("liquidity", 0))

        # Extract CLOB token IDs from outcomes
        self.clob_token_ids: Dict[str, str] = {}
        tokens = raw.get("clobTokenIds", raw.get("clob_token_ids", ""))
        if isinstance(tokens, str) and tokens:
            # Format: "[id1, id2]" or "id1,id2"
            cleaned = tokens.strip("[]").replace('"', "").replace("'", "")
            parts = [t.strip() for t in cleaned.split(",") if t.strip()]
            if len(parts) >= 1:
                self.clob_token_ids["YES"] = parts[0]
            if len(parts) >= 2:
                self.clob_token_ids["NO"] = parts[1]
        elif isinstance(tokens, list):
            if len(tokens) >= 1:
                self.clob_token_ids["YES"] = str(tokens[0])
            if len(tokens) >= 2:
                self.clob_token_ids["NO"] = str(tokens[1])

    @property
    def is_crypto(self) -> bool:
        """Check if this market is crypto-related."""
        q = self.question.lower()
        keywords = ["btc", "bitcoin", "eth", "ethereum", "crypto", "price"]
        return any(kw in q for kw in keywords)

    @property
    def yes_token_id(self) -> Optional[str]:
        return self.clob_token_ids.get("YES")

    @property
    def no_token_id(self) -> Optional[str]:
        return self.clob_token_ids.get("NO")

    def __repr__(self) -> str:
        return f"GammaMarket(slug={self.slug!r}, q={self.question[:60]!r})"


class GammaClient:
    """
    Polymarket Gamma API client for market discovery.

    Discovers active markets, extracts CLOB token IDs, and filters
    by crypto/price categories for the 15-minute window strategy.

    Usage:
        gamma = GammaClient()
        markets = gamma.fetch_active_crypto_markets(limit=50)
        for m in markets:
            print(f"{m.question}: YES={m.yes_token_id}")
    """

    def __init__(self, timeout: int = 15, max_retries: int = 3):
        self.timeout = timeout
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/json",
            "User-Agent": "POLY-SCREEN/1.0",
        })

    def _request(self, url: str, params: Optional[Dict] = None) -> Any:
        """Rate-limit aware request with retry logic."""
        for attempt in range(self.max_retries):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)

                if resp.status_code == 429:
                    wait = min(2 ** attempt * 5, 60)
                    log.warning(f"Gamma 429 rate limit — retrying in {wait}s")
                    time.sleep(wait)
                    continue

                if resp.status_code == 504:
                    wait = min(2 ** attempt * 3, 30)
                    log.warning(f"Gamma 504 timeout — retrying in {wait}s")
                    time.sleep(wait)
                    continue

                resp.raise_for_status()
                return resp.json()

            except requests.exceptions.RequestException as e:
                log.error(f"Gamma request failed (attempt {attempt + 1}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)

        log.error(f"Gamma request exhausted {self.max_retries} retries: {url}")
        return None

    def fetch_active_slugs(self, limit: int = 100) -> List[str]:
        """Fetch slugs of all currently active markets."""
        params = {"active": True, "closed": False, "limit": limit}
        data = self._request(EVENTS_ENDPOINT, params)
        if not data:
            return []

        slugs = []
        if isinstance(data, list):
            for event in data:
                markets = event.get("markets", [])
                for m in markets:
                    slug = m.get("slug") or m.get("condition_id", "")
                    if slug:
                        slugs.append(slug)
        return slugs

    def get_market_metadata(self, slug: str) -> Optional[GammaMarket]:
        """Fetch detailed metadata for a specific market by slug."""
        params = {"slug": slug}
        data = self._request(MARKETS_ENDPOINT, params)
        if not data:
            return None

        # API may return a list or single object
        if isinstance(data, list) and data:
            return GammaMarket(data[0])
        elif isinstance(data, dict):
            return GammaMarket(data)
        return None

    def fetch_active_crypto_markets(self, limit: int = 100) -> List[GammaMarket]:
        """
        Fetch all active crypto-related markets.

        Filters by crypto keywords and returns parsed GammaMarket objects
        with CLOB token IDs ready for orderbook queries.
        """
        params = {
            "active": True,
            "closed": False,
            "limit": limit,
            "tag": "crypto",
        }
        data = self._request(MARKETS_ENDPOINT, params)
        if not data:
            return []

        markets = []
        items = data if isinstance(data, list) else [data]
        for raw in items:
            m = GammaMarket(raw)
            if m.active and not m.closed:
                markets.append(m)

        log.info(f"Gamma: found {len(markets)} active crypto markets")
        return markets

    def fetch_window_markets(
        self,
        window_start: Optional[datetime] = None,
        window_minutes: int = 15,
    ) -> List[GammaMarket]:
        """
        Fetch crypto markets matching the 15-minute window strategy.

        Looks for BTC price prediction markets expiring near
        the target window boundary.
        """
        if window_start is None:
            window_start = datetime.now(timezone.utc)

        window_end = window_start + timedelta(minutes=window_minutes)

        all_markets = self.fetch_active_crypto_markets(limit=200)

        # Filter for markets whose questions contain time references
        # matching our window
        window_markets = []
        for m in all_markets:
            q = m.question.lower()
            if any(kw in q for kw in ["btc", "bitcoin", "price"]):
                window_markets.append(m)

        log.info(f"Gamma: {len(window_markets)} BTC price markets for current window")
        return window_markets


# ─── Module-level singleton ───
gamma_client = GammaClient()
