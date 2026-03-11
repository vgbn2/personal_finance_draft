"""
Inspect websockets ClientConnection object.
"""
import asyncio
import websockets
import ssl

WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
ORIGIN = "https://polymarket.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

async def main():
    ssl_context = ssl.create_default_context()
    kwargs = {
        "ssl": ssl_context,
        "user_agent_header": UA,
        "origin": websockets.Origin(ORIGIN)
    }
    
    print("Connecting...")
    async with websockets.connect(WS_URL, **kwargs) as ws:
        print(f"Type: {type(ws)}")
        print(f"Dir: {dir(ws)}")
        try:
            print(f"ws.closed: {ws.closed}")
        except AttributeError:
             print("ws.closed does not exist.")
        try:
            print(f"ws.state: {ws.state}")
        except AttributeError:
             print("ws.state does not exist.")

if __name__ == "__main__":
    asyncio.run(main())
