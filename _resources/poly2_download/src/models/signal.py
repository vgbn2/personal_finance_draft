from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field
from src.utils.constants import (
    SIGNAL_ARB, SIGNAL_REVERSION, SIGNAL_LAG, SIGNAL_DIP, SIGNAL_OPTIMISM_TAX,
    YES, NO
)


class Signal(BaseModel):
    """Represents a trading signal from the strategy engine."""
    
    signal_type: str = Field(..., description="Signal type")
    market_id: str
    outcome: str = Field(..., description="YES or NO")
    entry_price: float = Field(..., description="Target entry price")
    size_pct: float = Field(..., description="Position size as % of bankroll")
    confidence: float = Field(default=1.0, description="Signal confidence (0-1)")
    edge: float = Field(default=0.0, description="Expected edge")
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    reasoning: str = Field(default="", description="Signal reasoning")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    @property
    def is_strong(self) -> bool:
        """Check if signal has sufficient confidence."""
        return self.confidence >= 0.7 and self.edge > 0.05
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class SignalResult(BaseModel):
    """Result of signal detection."""
    
    has_signal: bool = False
    signals: list[Signal] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    def add_signal(self, signal: Signal):
        self.has_signal = True
        self.signals.append(signal)
