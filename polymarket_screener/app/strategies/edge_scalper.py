"""
Edge Scalper Strategy — Example plugin.

Passes through signals from the core screener and applies
an additional confidence filter before forwarding to execution.
"""
from typing import Optional

from app.core.models.domain_models import MarketSnapshot, TradeSignal
from app.strategies.base import BaseStrategy
from app.utils.logger import log


class EdgeScalperStrategy(BaseStrategy):
    """
    Simple edge-based scalping strategy.

    Monitors market snapshots for opportunities where the BS-derived
    fair value deviates from the market price beyond the configured
    edge threshold. Acts as a secondary confirmation on top of the
    core signal engine.
    """

    name = "edge_scalper"
    enabled = True

    def __init__(self, min_confidence: float = 0.60):
        self.min_confidence = min_confidence

    async def on_market_update(self, snapshot: MarketSnapshot) -> Optional[TradeSignal]:
        """Log snapshot receipt. Core signal generation handled by signal_engine."""
        # This strategy relies on signals from the core screener
        # rather than generating its own from raw snapshots.
        return None

    async def on_signal(self, signal: TradeSignal) -> None:
        """Apply secondary confidence filter on incoming signals."""
        if signal.confidence >= self.min_confidence:
            log.info(
                f"[EdgeScalper] CONFIRMED signal: {signal.side} "
                f"{signal.market_id[:12]}... conf={signal.confidence:.2f}"
            )
        else:
            log.debug(
                f"[EdgeScalper] Filtered low-confidence signal: "
                f"{signal.confidence:.2f} < {self.min_confidence}"
            )
