"""
Polymarket Paper Trading Simulator — Data Models
Frozen dataclasses and enums for the entire data model.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


# ============================================================
#  ENUMS
# ============================================================

class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


# ============================================================
#  ORDERBOOK PRIMITIVES
# ============================================================

@dataclass(frozen=True, slots=True)
class PriceLevel:
    """Single price level in the orderbook."""
    price: float
    size: float


@dataclass(slots=True)
class OrderbookSnapshot:
    """Immutable snapshot of orderbook state passed to strategies."""
    token_id: str
    bids: list[PriceLevel] = field(default_factory=list)
    asks: list[PriceLevel] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)

    @property
    def best_bid(self) -> Optional[float]:
        return self.bids[0].price if self.bids else None

    @property
    def best_ask(self) -> Optional[float]:
        return self.asks[0].price if self.asks else None

    @property
    def mid_price(self) -> Optional[float]:
        if self.best_bid is not None and self.best_ask is not None:
            return (self.best_bid + self.best_ask) / 2.0
        return None

    @property
    def spread(self) -> Optional[float]:
        if self.best_bid is not None and self.best_ask is not None:
            return self.best_ask - self.best_bid
        return None


# ============================================================
#  TICK DATA  (fed to on_tick)
# ============================================================

@dataclass(frozen=True, slots=True)
class TickData:
    """Aggregated tick data fed to strategy on each update."""
    token_id: str
    mid_price: float
    best_bid: float
    best_ask: float
    spread: float
    timestamp: float
    # BTC Data for multi-signal paper bot strategies
    btc_price: float = 0.0
    btc_delta_60s: Optional[float] = None
    btc_delta_120s: Optional[float] = None
    market_end_time: float = 0.0


# ============================================================
#  VIRTUAL ORDERS & FILLS
# ============================================================

@dataclass(slots=True)
class VirtualOrder:
    """Order object returned by strategies."""
    token_id: str
    side: OrderSide
    order_type: OrderType
    price: float                          # limit price (ignored for MARKET)
    size: float
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    timestamp: float = field(default_factory=time.time)
    submitted_at: float = 0.0            # set by engine when queued
    strategy_id: str = ""                # which strategy placed this order

@dataclass(frozen=True, slots=True)
class Fill:
    """Represents a virtual fill."""
    order_id: str
    token_id: str
    side: OrderSide
    price: float          # actual fill price (VWAP for market orders)
    size: float
    slippage: float       # fill_price - order.price
    timestamp: float
    spread_at_fill: float = 0.0   # bid-ask spread when fill occurred
    mid_at_fill: float = 0.0      # mid price when fill occurred
    strategy_id: str = ""         # which strategy got filled

# ============================================================
#  POSITIONS & PORTFOLIO
# ============================================================

@dataclass(slots=True)
class Position:
    """Tracks a single token position."""
    token_id: str
    side: OrderSide
    avg_entry: float
    size: float
    realized_pnl: float = 0.0
    unrealized_pnl: float = 0.0


@dataclass(frozen=True, slots=True)
class PortfolioSnapshot:
    """Point-in-time portfolio metrics snapshot."""
    timestamp: float
    bankroll: float
    realized_pnl: float
    unrealized_pnl: float
    total_pnl: float
    num_trades: int
    win_rate: float
    sharpe: float
    ev: float
    stdev: float
    max_drawdown_pct: float


# ============================================================
#  STRATEGY GRADE
# ============================================================

@dataclass(frozen=True, slots=True)
class StrategyGrade:
    """Overall strategy viability rating."""
    letter: str              # A+ / A / B / C / D / F
    score: float             # 0-100
    sharpe_score: float
    win_rate_score: float
    ev_score: float
    drawdown_score: float
    verdict: str             # "DEPLOY" / "MONITOR" / "DO NOT USE"
    reason: str
    min_trades_met: bool
