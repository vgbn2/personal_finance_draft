"""
Diagnose WS connection via IP address.
Mimics ws_client.py behavior to check if Host header is missing.
"""
import asyncio
import websockets
import ssl
import socket
from urllib.parse import urlparse

WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
WS_ORIGIN = "https://polymarket.com"
WS_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

async def test_connect_ip(name, set_host_header=False):
    print(f"\n--- Testing {name} ---")
    
    # 1. Resolve IP manually (mimic dns.py)
    parsed = urlparse(WS_URL)
    hostname = parsed.hostname
    port = parsed.port or 443
    path = parsed.path
    
    print(f"Resolving {hostname}...")
    try:
        # Use simple gethostbyname for test (system DNS might fail, but let's try 8.8.8.8 if needed)
        # Actually our system DNS is broken (127.0.2.2).
        # So we must use a known IP for Polymarket CLOB or try to resolve via python properly.
        # Let's hardcode one known IP implies via 'nslookup' from implementation plan: 104.18.34.20
        # But that might change.
        # Let's use the actual core.dns if possible, or just hack it.
        # I'll try to import core.dns.
        from polymarket_sim.core.dns import resolve_ip
        ip = await resolve_ip(hostname)
        print(f"Resolved to {ip}")
    except Exception as e:
        print(f"DNS Resolution failed: {e}")
        return

    # 2. Construct IP-based URL
    ip_url = f"wss://{ip}:{port}{path}"
    print(f"Connecting to {ip_url} (SNI={hostname})...")

    # 3. Setup SSL
    ssl_context = ssl.create_default_context()
    
    # 4. Prepare headers
    headers = {
        "User-Agent": WS_USER_AGENT,
        "Origin": WS_ORIGIN
    }
    
    if set_host_header:
        headers["Host"] = hostname
        print(f"Adding extra header => Host: {hostname}")

    kwargs = {
        "ssl": ssl_context,
        "server_hostname": hostname,
        "additional_headers": headers,
        "open_timeout": 5
    }

    try:
        async with websockets.connect(ip_url, **kwargs) as ws:
            print("✅ Connected successfully!")
            await ws.close()
    except Exception as e:
        print(f"❌ Failed: {e}")

async def main():
    # Test 1: Connect to IP without Host header (Polymarket might reject)
    await test_connect_ip("IP Connection - NO Host Header", set_host_header=False)

    # Test 2: Connect to IP WITH Host header
    await test_connect_ip("IP Connection - WITH Host Header", set_host_header=True)

if __name__ == "__main__":
    asyncio.run(main())
