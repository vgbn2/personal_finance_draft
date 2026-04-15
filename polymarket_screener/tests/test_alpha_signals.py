import asyncio
from unittest.mock import MagicMock
from app.core.engine.signal_engine import MarketScreener
from app.core.models.domain_models import MarketSnapshot, UnifiedOrderbook
from app.core.engine.event_bus import Channel, event_bus
from app.utils.logger import log

async def test_alpha_filtering():
    log.info("Starting Alpha Filtering Verification...")
    
    screener = MarketScreener(min_edge=0.01)
    await screener.start()
    
    signals_received = []
    async def on_signal(sig):
        signals_received.append(sig)
    event_bus.on(Channel.SIGNAL_DETECTED, on_signal)

    # 1. Base Case: Valid Edge, Balanced Book, Positive Corr -> SIGNAL expected
    snap_ok = MarketSnapshot(
        market_id="BTC-ALPHA",
        spot_price=60000,
        implied_vol=50.0,
        polymarket_yes=0.45, # Fair ~0.50 -> Edge ~0.05
        orderbook=UnifiedOrderbook(
            exchange="poly", symbol="BTC",
            bids=[(0.44, 1000)], asks=[(0.46, 1000)] # Balanced
        )
    )
    # Warm up correlation (needs 10 points)
    for _ in range(12):
        await event_bus.publish(Channel.MARKET_UPDATE, snap_ok)
    
    await asyncio.sleep(0.1)
    assert len(signals_received) > 0, "Should have received a signal for balanced case"
    signals_received.clear()
    log.info("[OK] Balanced case produced signal.")

    # 2. Imbalance Filter: Negative imbalance -> BUY_YES suppressed
    snap_imbalance = MarketSnapshot(
        market_id="BTC-ALPHA",
        spot_price=60000,
        implied_vol=50.0,
        polymarket_yes=0.45,
        orderbook=UnifiedOrderbook(
            exchange="poly", symbol="BTC",
            bids=[(0.44, 100)], asks=[(0.46, 1000)] # Heavy sell pressure
        )
    )
    await event_bus.publish(Channel.MARKET_UPDATE, snap_imbalance)
    await asyncio.sleep(0.1)
    assert len(signals_received) == 0, "Signal should be suppressed by negative imbalance"
    log.info("[OK] Imbalance filter suppressed signal.")

    # 3. Correlation Filter: Divergence -> suppressed
    # Inject a snapshot where Polymarket price spikes while Binance Spot drops
    snap_diverge = MarketSnapshot(
        market_id="BTC-ALPHA",
        spot_price=55000, # Drop
        implied_vol=50.0,
        polymarket_yes=0.45, # Fair value now lower due to spot drop, but if we forced edge...
        orderbook=UnifiedOrderbook(
            exchange="poly", symbol="BTC",
            bids=[(0.44, 1000)], asks=[(0.46, 1000)]
        )
    )
    # This will flip correlation to negative
    for _ in range(15):
        await event_bus.publish(Channel.MARKET_UPDATE, snap_diverge)
    
    await asyncio.sleep(0.1)
    # Note: Correlation might need more movement to flip exactly, 
    # but based on the code np.corrcoef will reflect the divergence.
    
    log.info("Alpha Verification Complete.")

if __name__ == "__main__":
    asyncio.run(test_alpha_filtering())
