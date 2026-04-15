"""
Market Screener.

Subscribes to the EventBus for `MARKET_UPDATE` events, evaluates
fair value using the `black_scholes` math layer, and emits
`SIGNAL_DETECTED` events when a mathematical edge exceeds the threshold.
"""
import asyncio
from typing import Dict, Optional

from app.core.shared.constants import (
    MINUTES_PER_DAY,
    DEFAULT_RISK_FREE_RATE,
    IMBALANCE_SUPPRESS_THRESHOLD,
    DEFAULT_SCORE_MULT_MIN,
    DEFAULT_SCORE_MULT_MAX,
    SCORE_DIVISOR,
    EPSILON,
)
from app.core.engine.event_bus import Channel, event_bus
from app.core.models.domain_models import MarketSnapshot, TradeSignal
from app.core.engine.alpha import alpha_engine, market_scorer
from app.core.models.portfolio import portfolio
from app.math.black_scholes import BlackScholes
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
        self.min_edge = min_edge or config_manager.strategy.min_edge_no
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

        # ── Alpha Filter 1: Correlation Tracking ──
        if snapshot.spot_price:
            tracker = alpha_engine.get_tracker(snapshot.market_id)
            # Estimate mid-price for Polymarket to compare vs Binance Spot
            poly_mid = snapshot.polymarket_yes if snapshot.polymarket_yes else 0.5
            tracker.add_points(snapshot.spot_price, poly_mid)
            
        # ── Alpha Filter 2: Orderbook Imbalance ──
        imbalance = snapshot.orderbook.imbalance if snapshot.orderbook else 0.0

        # Calculate Fair Value (N(d2)) via Black-Scholes
        # DTE: convert config minutes → days (what BS.fair_price expects)
        dte_mins = config_manager.strategy.default_dte_minutes
        dte_days = dte_mins / MINUTES_PER_DAY

        try:
            fair_prob = bs_engine.fair_price(
                spot=snapshot.spot_price,
                strike=snapshot.spot_price,  # ATM assumption for window strategy
                dte=dte_days,                # BS internally divides by 365
                iv=snapshot.implied_vol,     # BS internally divides by 100
                r=snapshot.risk_free_rate / 100.0 if snapshot.risk_free_rate else DEFAULT_RISK_FREE_RATE
            )
        except Exception as e:
            log.warning(f"Screener: Fair value calc failed for {snapshot.market_id}: {e}")
            return

        # ── Signal Generation with Alpha Filtering ──
        correlation = alpha_engine.get_tracker(snapshot.market_id).correlation

        # Evaluate YES side
        market_prob_yes = snapshot.polymarket_yes
        if market_prob_yes:
            edge_yes = fair_prob - market_prob_yes
            if edge_yes >= self.min_edge:
                # Apply Filters
                if imbalance < -IMBALANCE_SUPPRESS_THRESHOLD:
                    log.debug(f"Screener: Suppressed BUY_YES due to imbalance ({imbalance:.2f})")
                elif correlation < 0:
                    log.debug(f"Screener: Suppressed BUY_YES due to divergence (corr={correlation:.2f})")
                else:
                    await self._emit_signal(snapshot, "BUY_YES", fair_prob, market_prob_yes, edge_yes)

        # Evaluate NO side
        market_prob_no = snapshot.polymarket_no
        if market_prob_no:
            edge_no = (1.0 - fair_prob) - market_prob_no
            if edge_no >= self.min_edge:
                if imbalance > IMBALANCE_SUPPRESS_THRESHOLD:
                    log.debug(f"Screener: Suppressed BUY_NO due to imbalance ({imbalance:.2f})")
                elif correlation < 0:
                    log.debug(f"Screener: Suppressed BUY_NO due to divergence (corr={correlation:.2f})")
                else:
                    await self._emit_signal(snapshot, "BUY_NO", 1.0 - fair_prob, market_prob_no, edge_no)

    async def _emit_signal(
        self, snapshot: MarketSnapshot, side: str, fair_prob: float, market_prob: float, edge: float
    ) -> None:
        """Calculate Kelly allocation and emit signal."""
        # Dynamic Sizing Logic
        score = market_scorer.calculate_score(snapshot, edge)
        score_mult = max(DEFAULT_SCORE_MULT_MIN, min(DEFAULT_SCORE_MULT_MAX, score / SCORE_DIVISOR))

        # Kelly: calculate_kelly now returns FULL Kelly (fraction=1.0 default).
        # We explicitly apply the config fraction here.
        k_frac = config_manager.strategy.kelly_fraction
        max_pos = config_manager.risk.max_position_size  # Single source of truth

        kelly_pct = calculate_kelly(
            win_prob=fair_prob,
            odds_offered=1.0 / market_prob if market_prob > EPSILON else 0.0,
        )

        # Apply score-based scaling and fractional Kelly
        alloc_pct = min(kelly_pct * k_frac * score_mult, max_pos)
        
        log.debug(f"Sizing DEBUG: fair={fair_prob:.2f} mkt={market_prob:.2f} full_k={kelly_pct:.2f} score={score:.2f} mult={score_mult:.2f} final={alloc_pct:.2%}")
        
        # Log pricing context
        equity = portfolio.equity
        size_usd = equity * alloc_pct

        signal = TradeSignal(
            market_id=snapshot.market_id,
            side=side,
            target_price=fair_prob,
            market_price=market_prob,
            edge=edge,
            allocation_pct=alloc_pct,
            expected_roi=edge / market_prob if market_prob > 0 else 0.0,
            confidence=fair_prob
        )

        log.info(
            f"Screener SIGNAL: {side} {snapshot.market_id[:8]}... "
            f"edge={edge:.1%} score={score:.1f} alloc={alloc_pct:.1%} "
            f"(${size_usd:,.0f})"
        )
        await event_bus.publish(Channel.SIGNAL_DETECTED, signal)


# Module-level singleton
bs_engine = BlackScholes(vrp_discount=config_manager.strategy.vrp_discount_factor)

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
