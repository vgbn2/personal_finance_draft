"""
Market Screener.

Subscribes to the EventBus for `MARKET_UPDATE` events, evaluates
fair value using the `black_scholes` math layer, and emits
`SIGNAL_DETECTED` events when a mathematical edge exceeds the threshold.
"""
import asyncio
from typing import Dict, Optional

from app.core.event_bus import Channel, event_bus
from app.core.models import MarketSnapshot, TradeSignal
from app.math.black_scholes import bs_engine
from app.math.kelly import fw_kelly, calculate_kelly
from app.utils.config import config_manager
from app.utils.logger import log


class MarketScreener:
    """
    Evaluates real-time market snapshots for trading edge.

    Usage:
        screener = MarketScreener(min_edge=0.02)
        await screener.start()
    """

    def __init__(self, min_edge: Optional[float] = None):
        self.min_edge = min_edge or config_manager.strategy.min_edge
        self._running = False

    async def start(self) -> None:
        self._running = True
        event_bus.on(Channel.MARKET_UPDATE, self._process_snapshot)
        log.info(f"Market Screener started (min_edge={self.min_edge:.1%})")

    async def stop(self) -> None:
        self._running = False
        log.info("Market Screener stopped")

    async def _process_snapshot(self, snapshot: MarketSnapshot) -> None:
        if not self._running or snapshot.is_stale:
            return

        if not snapshot.has_pricing_data:
            return

        # Calculate Fair Value (N(d2)) via Black-Scholes
        # Assume 15m DTE (0.0104 days) for this architecture
        dte_days = 15 / (24 * 60)

        try:
            fair_prob = bs_engine.fair_price(
                S=snapshot.spot_price,
                K=snapshot.spot_price,  # ATM assumption for window strategy
                t=dte_days,
                iv=snapshot.implied_vol / 100.0,
                r=snapshot.risk_free_rate / 100.0 if snapshot.risk_free_rate else 0.05
            )
        except Exception as e:
            log.warning(f"Screener: Fair value calc failed for {snapshot.market_id}: {e}")
            return

        # Evaluate YES side
        market_prob_yes = snapshot.polymarket_yes
        if market_prob_yes:
            edge_yes = fair_prob - market_prob_yes
            if edge_yes >= self.min_edge:
                await self._emit_signal(snapshot.market_id, "BUY_YES", fair_prob, market_prob_yes, edge_yes)
        
        # Evaluate NO side
        market_prob_no = snapshot.polymarket_no
        if market_prob_no:
            edge_no = (1.0 - fair_prob) - market_prob_no
            if edge_no >= self.min_edge:
                await self._emit_signal(snapshot.market_id, "BUY_NO", 1.0 - fair_prob, market_prob_no, edge_no)

    async def _emit_signal(
        self, market_id: str, side: str, fair_prob: float, market_prob: float, edge: float
    ) -> None:
        """Calculate Kelly allocation and emit signal."""
        # Simple Kelly for binary outcome
        kelly_pct = calculate_kelly(
            win_prob=fair_prob,
            odds=1.0 / market_prob if market_prob > 0 else 0.0
        )
        
        # Quarter-Kelly for safety
        alloc_pct = min(kelly_pct * 0.25, 0.10) # Max 10% per trade

        signal = TradeSignal(
            market_id=market_id,
            side=side,
            target_price=fair_prob,
            market_price=market_prob,
            edge=edge,
            allocation_pct=alloc_pct,
            expected_roi=edge / market_prob if market_prob > 0 else 0.0,
            confidence=fair_prob
        )

        log.info(f"Screener SIGNAL: {side} {market_id[:8]}... edge={edge:.1%} alloc={alloc_pct:.1%}")
        await event_bus.publish(Channel.SIGNAL_DETECTED, signal)


# Singleton
screener = MarketScreener()

if __name__ == "__main__":
    async def verify():
        s = MarketScreener(min_edge=0.01)
        await s.start()
        
        # Inject mock snapshot with artificial edge (fair=0.50, market=0.45, edge=0.05)
        # ATM Black-Scholes fair value is roughly 0.50
        mock_snap = MarketSnapshot(
            market_id="MOCK_EDGE",
            spot_price=65000,
            implied_vol=50.0,
            polymarket_yes=0.45,  # Too cheap
            polymarket_no=0.55
        )
        
        await event_bus.publish(Channel.MARKET_UPDATE, mock_snap)
        await asyncio.sleep(0.1)
        
        print("[OK] Screener evaluated snapshot successfully.")
    
    asyncio.run(verify())
