"""
Diagnose WS 403 Error by testing different headers + server_hostname.
Updated for websockets 14.0+ API.
NO UNICODE CHARACTERS.
"""
import asyncio
import websockets
import ssl
import sys

WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
ORIGIN = "https://polymarket.com"

# Hardcoded IP for manual testing if needed, but we rely on system DNS for this test script unless we mimic ws_client logic
# In ws_client, we resolve IP manually. Here we just test if passing server_hostname conflicts with Origin.

async def test_connect(name, user_agent=None, origin=None, use_server_hostname=False):
    print(f"\n--- Testing {name} ---")
    try:
        ssl_context = ssl.create_default_context()
        
        # Keyword args for websockets.connect (14.0+)
        kwargs = {
            "ssl": ssl_context,
            "open_timeout": 10
        }
        
        if use_server_hostname:
            kwargs["server_hostname"] = "ws-subscriptions-clob.polymarket.com"
            # Note: server_hostname is only valid if we are connecting to an IP or if we just force it for SNI check
            
        if user_agent:
            kwargs["user_agent_header"] = user_agent
        
        if origin:
            kwargs["origin"] = websockets.Origin(origin)

        print(f"Connecting with kwargs={kwargs}...")
        async with websockets.connect(WS_URL, **kwargs) as ws:
            print("[OK] Connected successfully!")
            await ws.close()
            return True
            
    except TypeError as e:
        print(f"[WARN] TypeError: {e}. Retrying with additional_headers...")
        try:
            headers = {}
            if user_agent: headers["User-Agent"] = user_agent
            if origin: headers["Origin"] = origin
            
            # If server_hostname is in kwargs, we must pass it
            connect_args = {
                "ssl": ssl_context,
                "open_timeout": 10,
                "additional_headers": headers
            }
            if use_server_hostname:
                connect_args["server_hostname"] = "ws-subscriptions-clob.polymarket.com"

            async with websockets.connect(WS_URL, **connect_args) as ws:
                print("[OK] Connected successfully (via additional_headers)!")
                await ws.close()
                return True
        except Exception as e2:
             print(f"[FAIL] Failed retry: {e2}")
             return False

    except Exception as e:
        print(f"[FAIL] Failed: {e}")
        return False

async def main():
    # Test 1: Origin Only (Baseline Success)
    await test_connect("Origin Only", origin=ORIGIN)

    # Test 2: Origin + Server Hostname (Potential Conflict)
    await test_connect("Origin + Server Hostname", origin=ORIGIN, use_server_hostname=True)

if __name__ == "__main__":
    asyncio.run(main())
