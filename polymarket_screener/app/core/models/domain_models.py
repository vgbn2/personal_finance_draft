"""
Unified data schemas for cross-exchange normalization.

All ingestion sources are forced through these Pydantic models
to prevent the Math layer from seeing inconsistent field names.

Supports: Polymarket, Binance, Deribit, FRED
"""
import time
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from pydantic import BaseModel, Field, field_validator


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UnifiedTick(BaseModel):
    """Normalized price tick from any exchange."""
    exchange: str
    symbol: str
    price: float
    bid: Optional[float] = None
    ask: Optional[float] = None
    volume_24h: Optional[float] = None
    timestamp_ms: float = Field(default_factory=lambda: time.time() * 1000)
    received_at: datetime = Field(default_factory=_utc_now)

    @property
    def spread(self) -> Optional[float]:
        if self.bid and self.ask:
            return self.ask - self.bid
        return None

    @property
    def mid_price(self) -> Optional[float]:
        if self.bid and self.ask:
            return (self.bid + self.ask) / 2.0
        return None


class OrderLevel(BaseModel):
    """Single orderbook level."""
    price: float
    size: float  # In USD or base units


class UnifiedOrderbook(BaseModel):
    """Normalized orderbook from any exchange."""
    exchange: str
    symbol: str
    bids: List[Tuple[float, float]] = []  # [(price, size), ...]
    asks: List[Tuple[float, float]] = []
    timestamp_ms: float = Field(default_factory=lambda: time.time() * 1000)

    @classmethod
    def from_polymarket(cls, raw: dict) -> "UnifiedOrderbook":
        """Parse Polymarket CLOB orderbook format."""
        bids = [(float(b["price"]), float(b["size"])) for b in raw.get("bids", [])]
        asks = [(float(a["price"]), float(a["size"])) for a in raw.get("asks", [])]
        return cls(
            exchange="polymarket",
            symbol=raw.get("asset_id", raw.get("market", "")),
            bids=sorted(bids, key=lambda x: -x[0]),  # Descending by price
            asks=sorted(asks, key=lambda x: x[0]),     # Ascending by price
        )

    @classmethod
    def from_ccxt(cls, exchange: str, symbol: str, raw: dict) -> "UnifiedOrderbook":
        """Parse ccxt orderbook format."""
        return cls(
            exchange=exchange,
            symbol=symbol,
            bids=[(p, s) for p, s in raw.get("bids", [])],
            asks=[(p, s) for p, s in raw.get("asks", [])],
            timestamp_ms=raw.get("timestamp", time.time() * 1000),
        )

    @property
    def best_bid(self) -> Optional[float]:
        return self.bids[0][0] if self.bids else None

    @property
    def best_ask(self) -> Optional[float]:
        return self.asks[0][0] if self.asks else None

    @property
    def imbalance(self) -> float:
        """
        Calculate orderbook imbalance: (bid_size - ask_size) / (bid_size + ask_size).
        Range: [-1.0 (sell pressure), 1.0 (buy pressure)].
        Uses top 5 levels for calculation.
        """
        bid_vol = sum(s for p, s in self.bids[:5])
        ask_vol = sum(s for p, s in self.asks[:5])
        total = bid_vol + ask_vol
        return (bid_vol - ask_vol) / total if total > 0 else 0.0

    @property
    def depth_usd(self) -> float:
        """Total USD liquidity in the top 10 levels of the book."""
        b_depth = sum(p * v for p, v in self.bids[:10])
        a_depth = sum(p * v for p, v in self.asks[:10])
        return b_depth + a_depth


class MarketSnapshot(BaseModel):
    """Consolidated view of a single market across exchanges."""
    market_id: str
    spot_price: Optional[float] = None        # Binance
    implied_vol: Optional[float] = None       # Deribit DVOL
    polymarket_yes: Optional[float] = None    # Polymarket YES price
    polymarket_no: Optional[float] = None     # Polymarket NO price
    orderbook: Optional[UnifiedOrderbook] = None
    risk_free_rate: Optional[float] = None    # FRED
    timestamp: datetime = Field(default_factory=_utc_now)
    is_stale: bool = False

    @property
    def has_pricing_data(self) -> bool:
        """True if we have enough data for Black-Scholes pricing."""
        return all([
            self.spot_price is not None,
            self.implied_vol is not None,
            self.polymarket_yes is not None,
        ])


class TradeSignal(BaseModel):
    """Output of strategy — describes a trade to execute."""
    market_id: str
    side: str = "BUY"                   # BUY or SELL
    target_price: float                 # Fair value from BS
    market_price: float                 # Current market price
    edge: float                         # target - market
    allocation_pct: float               # Kelly fraction
    expected_roi: float = 0.0
    confidence: float = 0.0             # 0-1
    timestamp: datetime = Field(default_factory=_utc_now)


class ExecutionResult(BaseModel):
    """Result of an executed trade."""
    market_id: str
    side: str
    filled_price: float
    size_usd: float
    slippage_bps: float = 0.0
    gas_cost_usd: float = 0.0
    tx_hash: Optional[str] = None
    timestamp: datetime = Field(default_factory=_utc_now)
    success: bool = True
    error: Optional[str] = None


class Position(BaseModel):
    """Internal tracked position."""
    market_id: str
    side: str
    size_usd: float
    entry_price: float
    current_price: float
    updated_at: datetime = Field(default_factory=_utc_now)
