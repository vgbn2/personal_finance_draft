"""
Market Registry - Manages multiple concurrent market states.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from ..market.orderbook import Orderbook
from ..market.matching_engine import MatchingEngine
from ..analysis.portfolio import Portfolio

logger = logging.getLogger(__name__)

@dataclass
class MarketState:
    """Isolated state for a single market."""
    market_id: str
    title: str
    slug: str
    token_ids: List[str]
    outcomes: List[str]
    orderbooks: Dict[str, Orderbook] = field(default_factory=dict)
    matching: MatchingEngine = field(default_factory=MatchingEngine)
    portfolios: Dict[str, Portfolio] = field(default_factory=dict)
    session_ids: Dict[str, int] = field(default_factory=dict)
    
    # Lifecycle
    running: bool = False
    resolved: bool = False
    winning_outcome: Optional[str] = None
    end_time: float = 0.0
    skip_oracle: bool = False

    def __post_init__(self):
        # Initialize orderbooks
        for tid in self.token_ids:
            self.orderbooks[tid] = Orderbook(tid)

class MarketRegistry:
    """Registry managing active MarketState instances."""
    
    def __init__(self):
        self._markets: Dict[str, MarketState] = {}
        
    def register(self, state: MarketState):
        self._markets[state.market_id] = state
        logger.info("Registered market: %s (%s)", state.title, state.market_id)
        
    def get(self, market_id: str) -> Optional[MarketState]:
        return self._markets.get(market_id)
        
    def get_all(self) -> List[MarketState]:
        return list(self._markets.values())
        
    def find_by_token(self, token_id: str) -> Optional[MarketState]:
        """Reverse lookup: find which market a token belongs to."""
        for market in self._markets.values():
            if token_id in market.token_ids:
                return market
        return None
