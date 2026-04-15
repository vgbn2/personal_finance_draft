from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field

class Side(str, Enum):
    YES = "YES"
    NO = "NO"

class SignalType(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"

class MarketStatus(str, Enum):
    ACTIVE = "ACTIVE"
    RESOLVED = "RESOLVED"
    HALTED = "HALTED"

class MarketData(BaseModel):
    id: str
    name: str
    category: str
    price: float
    vol_24h: float
    liquidity: float
    fair_price: Optional[float] = None
    implied_vol: Optional[float] = None
    dte: Optional[int] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class Position(BaseModel):
    market_id: str
    market_name: str
    side: Side
    size_usd: float
    entry_price: float
    current_price: float
    unrealized_pnl: float = 0.0
    roi_pct: float = 0.0
    dte: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class Signal(BaseModel):
    market_id: str
    signal_type: SignalType
    side: Side
    edge: float
    confidence: float
    suggested_size_pct: float
    reasoning: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class GateExecution(BaseModel):
    gate_a_global: bool = False
    gate_b_temporal: bool = False
    gate_c_conviction: bool = False
    status: str = "PENDING"
    rejection_reason: Optional[str] = None
