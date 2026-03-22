"""
Pydantic models for database persistence.

Defines the schema for documents stored in MongoDB.
These models serve as the contract between the application layer
and the persistence layer.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AuditLogEntry(BaseModel):
    """
    Immutable audit trail entry for every significant system action.

    Tracks: signal generation, risk gate decisions, order execution,
    circuit breaker trips, and state transitions.
    """
    event_type: str                          # e.g. "SIGNAL_GENERATED", "ORDER_FILLED", "GATE_REJECTED"
    source_module: str                       # e.g. "screener", "risk_engine", "circuit_breaker"
    market_id: Optional[str] = None
    payload: Dict[str, Any] = {}             # Flexible JSON payload
    severity: str = "INFO"                   # INFO, WARNING, ERROR, CRITICAL
    timestamp: datetime = Field(default_factory=_utc_now)

    class Config:
        json_schema_extra = {
            "example": {
                "event_type": "ORDER_FILLED",
                "source_module": "execution_router",
                "market_id": "0x1234abcd",
                "payload": {"side": "BUY", "size_usd": 50.0, "fill_price": 0.55},
                "severity": "INFO",
            }
        }


class MarketStateSnapshot(BaseModel):
    """
    Point-in-time snapshot of a market's state for persistence and recovery.

    Used by the StateReconciliation routine to restore positions
    after crashes or restarts.
    """
    market_id: str
    spot_price: Optional[float] = None
    implied_vol: Optional[float] = None
    polymarket_yes: Optional[float] = None
    polymarket_no: Optional[float] = None
    fair_price: Optional[float] = None
    edge: Optional[float] = None
    signal_type: Optional[str] = None        # BUY / SELL / HOLD
    position_size_usd: float = 0.0
    unrealized_pnl: float = 0.0
    is_stale: bool = False
    snapshot_at: datetime = Field(default_factory=_utc_now)


class PortfolioCheckpoint(BaseModel):
    """
    Full portfolio state checkpoint for crash recovery.

    Serialized to MongoDB on every fill and every 60-second heartbeat.
    """
    total_equity_usd: float = 0.0
    cash_usd: float = 0.0
    positions: List[Dict[str, Any]] = []
    exposure_pct: float = 0.0
    drawdown_pct: float = 0.0
    active_markets: int = 0
    checkpoint_at: datetime = Field(default_factory=_utc_now)
