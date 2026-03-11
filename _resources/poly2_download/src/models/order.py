from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field
from src.utils.constants import MARKET_ORDER, LIMIT_ORDER, BUY, SELL


class Order(BaseModel):
    """Represents a trade order."""
    
    market_id: str
    side: str = Field(..., description="BUY or SELL")
    outcome: str = Field(..., description="YES or NO")
    order_type: str = Field(default=LIMIT_ORDER, description="MARKET or LIMIT")
    price: float = Field(..., description="Limit price (0-1)")
    size: float = Field(..., description="Order size in USD")
    size_pct: float = Field(default=0.0, description="Position size as % of bankroll")
    filled_size: float = Field(default=0.0, description="Filled amount")
    status: str = Field(default="PENDING", description="PENDING, FILLED, PARTIAL, CANCELLED")
    order_id: Optional[str] = None
    transaction_hash: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @property
    def is_filled(self) -> bool:
        return self.filled_size >= self.size
    
    @property
    def fill_percentage(self) -> float:
        if self.size == 0:
            return 0.0
        return self.filled_size / self.size
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
