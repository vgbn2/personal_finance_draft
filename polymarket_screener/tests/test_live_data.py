import asyncio
import json
from app.core.data_feed import BinanceWSClient, DeribitWSClient
from app.core.feed_aggregator import feed_aggregator
from app.utils.logger import log

async def test_live_feeds():
    log.info("Starting Live Feed Verification Test...")
    
    # 1. Setup Clients
    binance = BinanceWSClient()
    deribit = DeribitWSClient()
    
    # 2. Register with Aggregator
    feed_aggregator.register(binance)
    feed_aggregator.register(deribit)
    
    # 3. Start Connection Tasks
    tasks = [
        asyncio.create_task(binance.connect()),
        asyncio.create_task(deribit.connect())
    ]
    
    # 4. Subscribe (Binance needs explicit sub)
    log.info("Waiting for connections...")
    await asyncio.sleep(5) 
    if binance.is_connected:
        await binance.subscribe(["btcusdt", "ethusdt"])
    else:
        log.error("BinanceWS failed to connect in time")
    
    # 5. Monitor for a few seconds
    log.info("Monitoring feeds for 10 seconds...")
    start_time = asyncio.get_event_loop().time()
    while asyncio.get_event_loop().time() - start_time < 15:
        btc_snap = await feed_aggregator.get_snapshot("BTC")
        eth_snap = await feed_aggregator.get_snapshot("ETH")
        log.info(f"Snapshot [BTC]: Price={btc_snap.spot_price}, Vol={btc_snap.implied_vol}")
        log.info(f"Snapshot [ETH]: Price={eth_snap.spot_price}, Vol={eth_snap.implied_vol}")
        log.info(f"Status: BinanceWS={binance.is_connected}, DeribitWS={deribit.is_connected}")
        await asyncio.sleep(3)
        
    # 6. Stop
    binance.stop()
    deribit.stop()
    for t in tasks:
        t.cancel()
    
    log.info("Verification Test Complete.")

if __name__ == "__main__":
    asyncio.run(test_live_feeds())
