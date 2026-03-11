"""Save API responses to file for analysis."""
import asyncio, aiohttp, json
from polymarket_sim.core.dns import get_resolver
from polymarket_sim.data.rest_client import get_current_window_timestamp, build_market_slug
from pathlib import Path

OUT = Path(__file__).parent / "api_response.txt"

async def main():
    ts = get_current_window_timestamp()
    slug = build_market_slug(ts)
    lines = [f"Generated slug: {slug}\n"]

    conn = aiohttp.TCPConnector(resolver=get_resolver())
    async with aiohttp.ClientSession(connector=conn) as s:
        # Test 1: slug
        url = f"https://gamma-api.polymarket.com/events/slug/{slug}"
        async with s.get(url) as r:
            lines.append(f"[Slug] Status: {r.status}")
            lines.append(f"[Slug] Body: {await r.text()}\n")

        # Test 2: search bitcoin
        url2 = "https://gamma-api.polymarket.com/events?title=bitcoin&limit=5&active=true&closed=false"
        async with s.get(url2) as r2:
            data = await r2.json()
            lines.append(f"[Search 'bitcoin'] Status: {r2.status}, Count: {len(data)}")
            for i, ev in enumerate(data):
                lines.append(f"  [{i}] slug={ev.get('slug', '???')}  title={ev.get('title', '???')}")

        # Test 3: search btc
        url3 = "https://gamma-api.polymarket.com/events?title=btc&limit=5&active=true&closed=false"
        async with s.get(url3) as r3:
            data3 = await r3.json()
            lines.append(f"\n[Search 'btc'] Status: {r3.status}, Count: {len(data3)}")
            for i, ev in enumerate(data3):
                lines.append(f"  [{i}] slug={ev.get('slug', '???')}  title={ev.get('title', '???')}")

        # Test 4: search "15 min"
        url4 = "https://gamma-api.polymarket.com/events?title=15+min&limit=5&active=true&closed=false"
        async with s.get(url4) as r4:
            data4 = await r4.json()
            lines.append(f"\n[Search '15 min'] Status: {r4.status}, Count: {len(data4)}")
            for i, ev in enumerate(data4):
                lines.append(f"  [{i}] slug={ev.get('slug', '???')}  title={ev.get('title', '???')}")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Saved to {OUT}")

asyncio.run(main())
