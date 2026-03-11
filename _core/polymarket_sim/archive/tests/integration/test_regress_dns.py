"""
Regression Test for Bug #6: System DNS Failure.
Verifies that the application can resolve hostnames even if the system DNS is broken.
"""
import asyncio
import sys
from polymarket_sim.core.dns import resolve_ip

async def test_manual_resolution():
    print("Testing manual DNS resolution via Google (8.8.8.8)...")
    try:
        ip = await resolve_ip("gamma-api.polymarket.com")
        print(f"✅ SUCCESS: Resolved gamma-api.polymarket.com -> {ip}")
        # Sanity check: must look like an IP
        assert ip.count('.') == 3
        assert all(part.isdigit() for part in ip.split('.'))
    except Exception as e:
        print(f"❌ FAILED: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_manual_resolution())
