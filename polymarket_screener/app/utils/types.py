"""
Shared type aliases and base models for the POLY/SCREEN framework.
These are foundational types re-exported by multiple modules.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, NewType, Optional

from pydantic import BaseModel, Field

# ─── Semantic Type Aliases ───
MarketID = NewType("MarketID", str)
SymbolName = NewType("SymbolName", str)
USD = NewType("USD", float)
Probability = NewType("Probability", float)   # 0.0 – 1.0
Percentage = NewType("Percentage", float)      # 0.0 – 1.0 (fractional)
BPS = NewType("BPS", int)                      # basis points


def utc_now() -> datetime:
    """Timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


# ─── Base Pydantic Model ───
class TimestampedModel(BaseModel):
    """Base model with automatic UTC timestamp."""
    timestamp: datetime = Field(default_factory=utc_now)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


# ─── Common Enumerations ───
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


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    FOK = "FOK"
    POST_ONLY = "POST_ONLY"
