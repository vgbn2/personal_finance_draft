import asyncio
from polymarket_sim.data.rest_client import GammaAPIClient

async def main():
    client = GammaAPIClient()
    try:
        slug = "microstrategy-sell-any-bitcoin-in-2025"
        m = await client.fetch_market_by_slug(slug)
        token_ids = GammaAPIClient.extract_token_ids(m)
        outcomes = GammaAPIClient.extract_outcomes(m)
        print(f"TOKENS: {token_ids}")
        print(f"OUTCOMES: {outcomes}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
