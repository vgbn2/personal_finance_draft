import asyncio
from app.core.signal_engine import MarketScreener
from app.core.domain_models import MarketSnapshot, UnifiedOrderbook, TradeSignal
from app.core.portfolio import portfolio
from app.core.event_bus import Channel, event_bus
from app.utils.logger import log

async def test_dynamic_sizing():
    from app.utils.logger import log as app_log
    import logging
    app_log.setLevel(logging.DEBUG)
    log.info("Starting Dynamic Sizing Verification...")
    
    screener = MarketScreener(min_edge=0.01)
    await screener.start()
    
    signals = []
    async def on_signal(sig):
        signals.append(sig)
    event_bus.on(Channel.SIGNAL_DETECTED, on_signal)

    # 1. Base Case: Fixed Equity ($10k), Balanced Case
    portfolio.cash = 10000.0
    snap_base = MarketSnapshot(
        market_id="SIZE-TEST",
        spot_price=60000,
        implied_vol=50.0,
        polymarket_yes=0.49, # Fair ~0.50 -> Edge ~0.01 (min)
        orderbook=UnifiedOrderbook(
            exchange="poly", symbol="BTC",
            bids=[(0.44, 1000)], asks=[(0.46, 1000)]
        )
    )
    
    # Send multiple updates to ensure processing
    for _ in range(5):
        await event_bus.publish(Channel.MARKET_UPDATE, snap_base)
    
    for _ in range(20): # Wait up to 2 seconds
        if len(signals) >= 1: break
        await asyncio.sleep(0.1)
    
    if not signals:
        log.error("FAIL: No signal received for base case")
        return

    size_1 = signals[-1].allocation_pct * portfolio.equity
    log.info(f"Signal 1 (Base): ${size_1:,.2f}")

    # 2. High Liquidity Case -> Should have higher score and higher size
    snap_liquid = MarketSnapshot(
        market_id="SIZE-TEST",
        spot_price=60000,
        implied_vol=50.0,
        polymarket_yes=0.49,
        orderbook=UnifiedOrderbook(
            exchange="poly", symbol="BTC",
            bids=[(0.44, 100000)], asks=[(0.46, 100000)] # 100x depth
        )
    )
    prev_count = len(signals)
    for _ in range(5):
        await event_bus.publish(Channel.MARKET_UPDATE, snap_liquid)
    
    for _ in range(20):
        if len(signals) > prev_count: break
        await asyncio.sleep(0.1)

    size_2 = signals[-1].allocation_pct * portfolio.equity
    log.info(f"Signal 2 (Liquid): ${size_2:,.2f}")
    assert size_2 > size_1, f"Liquid market (${size_2}) should have higher allocation than base (${size_1})"

    # 3. Double Equity Case -> USD size should double for same alloc%
    portfolio.cash = 20000.0
    prev_count = len(signals)
    await event_bus.publish(Channel.MARKET_UPDATE, snap_base)
    for _ in range(20):
        if len(signals) > prev_count: break
        await asyncio.sleep(0.1)
    
    size_3 = signals[-1].allocation_pct * portfolio.equity
    log.info(f"Signal 3 (2x Equity): ${size_3:,.2f}")
    assert abs(size_3 - (size_1 * 2)) < 50.0, f"Size {size_3} should be ~2x Size {size_1}"

    log.info("Dynamic Sizing Verification Complete.")

    log.info("Dynamic Sizing Verification Complete.")

if __name__ == "__main__":
    asyncio.run(test_dynamic_sizing())
