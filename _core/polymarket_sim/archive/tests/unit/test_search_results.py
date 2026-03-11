
import asyncio
import logging
import json
from polymarket_sim.data.rest_client import GammaAPIClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("debug_search")

async def main():
    client = GammaAPIClient()
    queries = ["Bitcoin Up Down", "Bitcoin", "BTC"]
    
    try:
        for q in queries:
            logger.info(f"\n--- Testing Query: '{q}' ---")
            results = await client.search_markets(q, limit=5)
            logger.info(f"Found {len(results)} markets:")
            for m in results:
                # Print minimal info to avoid huge logs but enough to identify
                slug = m.get('slug', 'N/A')
                title = m.get('title', 'N/A')
                start = m.get('startDate', 'N/A')
                logger.info(f"Slug: {slug} | Start: {start} | Title: {title}")
                
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
