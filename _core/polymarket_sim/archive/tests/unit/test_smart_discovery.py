
import asyncio
import logging
import time
from polymarket_sim.data.rest_client import GammaAPIClient, get_current_window_timestamp

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("test_smart_discovery")

async def test():
    client = GammaAPIClient()
    
    # 1. Test Normal Discovery (Current Window)
    ts = get_current_window_timestamp()
    logger.info(f"Testing current window: {ts}")
    
    try:
        market = await client.fetch_current_market()
        logger.info(f"✅ Found current market: {market.get('slug')} (ID: {market.get('id')})")
    except Exception as e:
        logger.error(f"❌ Failed to find current market: {e}")

    # 2. Test Smart Fallback (Bad Slug)
    logger.info("Testing fallback with BAD slug...")
    bad_slug = f"btc-updown-15m-INVALID-{ts}"
    
    try:
        # We ask it to find market for 'ts' but give it a bad slug hint
        # It should fail the slug lookup, then search for "Bitcoin Up Down" and find the one matching 'ts'
        market = await client.find_active_market(slug_hint=bad_slug, window_ts=ts)
        logger.info(f"✅ Found market via fallback: {market.get('slug')}")
        
        # Verify it's the right one
        if str(ts) in market.get('slug', ''):
             logger.info("✅ Verified fallback market matches timestamp.")
        else:
             logger.warning(f"⚠️ Fallback market slug {market.get('slug')} does not contain {ts}!")

    except Exception as e:
        logger.error(f"❌ Fallback failed: {e}")

    await client.close()

if __name__ == "__main__":
    asyncio.run(test())
