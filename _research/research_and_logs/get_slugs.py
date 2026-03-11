import asyncio
import json
from polymarket_sim.data.rest_client import GammaAPIClient

async def main():
    client = GammaAPIClient()
    try:
        slugs = [
            "microstrategy-sell-any-bitcoin-in-2025",
            "ukraine-recognize-crimea-as-part-of-russia-by-july-1"
        ]
        for slug in slugs:
            print(f"FETCHING: {slug}")
            m = await client.fetch_market_by_slug(slug)
            token_ids = GammaAPIClient.extract_token_ids(m)
            outcomes = GammaAPIClient.extract_outcomes(m)
            end_time = m.get("endDate")
            
            print(f"SLUG: {slug}")
            print(f"TOKEN_IDS: {json.dumps(token_ids)}")
            print(f"OUTCOMES: {json.dumps(outcomes)}")
            print(f"END_TIME: {end_time}")
            print("-" * 40)
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
