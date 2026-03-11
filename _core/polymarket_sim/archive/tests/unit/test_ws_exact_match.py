"""
Test EXACT `ws_client.py` configuration.
"""
import asyncio
import websockets
import ssl
from polymarket_sim.core import config

async def main():
    print("Testing exact match of ws_client.py...")
    
    # Replicate ws_client.py logic exactly
    connect_url = config.WS_URL  
    server_hostname = None
    ssl_context = None

    # Logic from ws_client.py (simplified as per current state)
    import urllib.parse
    parsed = urllib.parse.urlparse(config.WS_URL)
    if parsed.scheme == "wss":
        ssl_context = ssl.create_default_context()

    connect_kwargs = {
        "ping_interval": config.WS_PING_INTERVAL_S, # 30
        "ping_timeout": config.WS_PING_INTERVAL_S, # 30
        "close_timeout": 5,
        "ssl": ssl_context,
        "server_hostname": server_hostname, # Explicity None
    }
    
    # Headers
    connect_kwargs["user_agent_header"] = config.WS_USER_AGENT
    connect_kwargs["origin"] = websockets.Origin(config.WS_ORIGIN)
    
    print(f"Connecting to {connect_url}")
    print(f"Kwargs: {connect_kwargs.keys()}")
    print(f"Origin: {connect_kwargs['origin']}")
    print(f"UA: {connect_kwargs['user_agent_header']}")
    
    try:
        async with websockets.connect(connect_url, **connect_kwargs) as ws:
            print("[OK] Connected successfully!")
            await ws.close()
    except Exception as e:
        print(f"[FAIL] Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
