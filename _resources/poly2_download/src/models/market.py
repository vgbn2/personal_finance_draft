from typing import Optional, Dict, Any, List, Tuple
from src.utils.constants import YES, NO
from datetime import datetime
from pydantic import BaseModel, Field


class Market(BaseModel):
    """Represents a Polymarket market."""
    
    id: str = Field(..., description="Market ID")
    question: str = Field(..., description="Market question")
    description: Optional[str] = None
    volume: float = Field(default=0.0, description="24h volume in USD")
    liquidity: float = Field(default=0.0, description="Available liquidity")
    yes_price: float = Field(default=0.5, description="Current YES price (0-1)")
    no_price: float = Field(default=0.5, description="Current NO price (0-1)")
    yes_bid: float = Field(default=0.0, description="Best YES bid")
    yes_ask: float = Field(default=0.0, description="Best YES ask")
    no_bid: float = Field(default=0.0, description="Best NO bid")
    no_ask: float = Field(default=0.0, description="Best NO ask")
    outcome: Optional[str] = Field(default=None, description="Resolved outcome if settled")
    end_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    category: Optional[str] = None
    
    @property
    def total_price(self) -> float:
        """Sum of YES + NO prices (should be ~1.0)."""
        return self.yes_price + self.no_price
    
    @property
    def arb_opportunity(self) -> bool:
        """Check if arbitrage opportunity exists."""
        return self.total_price < 0.96
    
    @property
    def spread(self) -> float:
        """Bid-ask spread."""
        return self.yes_ask - self.yes_bid if self.yes_ask and self.yes_bid else 0.0
    
    @property
    def is_high_volume(self) -> bool:
        """Check if market meets volume threshold."""
        from src.config import config
        return self.volume >= config.MIN_MARKET_VOLUME
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class OrderBook(BaseModel):
    """Represents order book state for a market."""
    
    market_id: str
    yes_bids: list[tuple[float, float]] = Field(default_factory=list)  # [(price, size), ...]
    yes_asks: list[tuple[float, float]] = Field(default_factory=list)
    no_bids: list[tuple[float, float]] = Field(default_factory=list)
    no_asks: list[tuple[float, float]] = Field(default_factory=list)
    last_update: datetime = Field(default_factory=datetime.utcnow)
    
    def get_vwap(self, side: str, size: float) -> float:
        """Calculate VWAP for given size on side."""
        if side == YES:
            return self._calculate_vwap(self.yes_asks, size)
        else:
            return self._calculate_vwap(self.no_asks, size)
    
    def _calculate_vwap(self, levels: list[tuple[float, float]], size: float) -> float:
        """Calculate Volume Weighted Average Price."""
        if not levels:
            return 0.0
        
        remaining = size
        total_cost = 0.0
        
        for price, available in levels:
            if remaining <= 0:
                break
            fill = min(remaining, available)
            total_cost += fill * price
            remaining -= fill
        
        if remaining > 0:
            return 0.0  # Insufficient liquidity
        
        return total_cost / size
