"""
Standalone WS IP Test. No app imports.
"""
import asyncio
import websockets
import ssl
import socket
from urllib.parse import urlparse

WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
ORIGIN = "https://polymarket.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

async def test_connect(name, ip, hostname, headers_style="none"):
    print(f"\n--- Testing {name} ---")
    print(f"Target: wss://{ip}/ws/market")
    print(f"Strategies: {headers_style}")

    # Build URL with IP
    uri = f"wss://{ip}/ws/market"
    
    # SSL Context
    ssl_context = ssl.create_default_context()
    
    # Base kwargs
    kwargs = {
        "ssl": ssl_context,
        "server_hostname": hostname, # For SNI
        "open_timeout": 5,
        "close_timeout": 5
    }

    # Headers setup
    if headers_style == "new_api":
        # New websockets 14+ API
        kwargs["user_agent_header"] = UA
        kwargs["origin"] = websockets.Origin(ORIGIN)
        # For Host header, try additional_headers
        kwargs["additional_headers"] = {"Host": hostname}

    elif headers_style == "extra_headers":
        # Old API
        headers = {
            "User-Agent": UA,
            "Origin": ORIGIN,
            "Host": hostname
        }
        kwargs["extra_headers"] = headers

    print(f"Connecting with kwargs keys: {list(kwargs.keys())}")
    if "additional_headers" in kwargs:
        print(f"additional_headers: {kwargs['additional_headers']}")
    if "extra_headers" in kwargs:
        print(f"extra_headers: {kwargs['extra_headers']}")

    try:
        async with websockets.connect(uri, **kwargs) as ws:
            print("[OK] Connected!")
            await ws.close()
            return True
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False

async def main():
    # 1. Resolve IP
    hostname = "ws-subscriptions-clob.polymarket.com"
    print(f"Resolving {hostname}...")
    try:
        # Try native resolution first (might be 127.0.2.2 but let's see)
        # If it returns 127.0.2.2, we fallback to 8.8.8.8 manually or hardcode
        ip = socket.gethostbyname(hostname)
        print(f"Using IP: {ip}")
        if ip.startswith("127."):
             print("[WARN] IP is loopback/bad. Using hardcoded Cloudflare IP.")
             ip = "104.18.34.20" # Example known IP for Polymarket
    except Exception:
        print("[WARN] DNS failed. Using hardcoded Cloudflare IP.")
        ip = "104.18.34.20"

    # Test 1: New API (additional_headers)
    await test_connect("New API + Host Header", ip, hostname, headers_style="new_api")

    # Test 2: Old API (extra_headers)
    await test_connect("Old API + Host Header", ip, hostname, headers_style="extra_headers")

    # Test 3: New API but NO Host header (Control)
    # Manually constructed in call
    print("\n--- Testing Control (No Host Header) ---")
    kwargs = {
        "ssl": ssl.create_default_context(),
        "server_hostname": hostname,
        "user_agent_header": UA,
        "origin": websockets.Origin(ORIGIN)
    }
    try:
        async with websockets.connect(f"wss://{ip}/ws/market", **kwargs) as ws:
            print("[OK] Connected (Unexpectedly)!")
            await ws.close()
    except Exception as e:
        print(f"[FAIL] Control Failed (Expected): {e}")


if __name__ == "__main__":
    asyncio.run(main())
