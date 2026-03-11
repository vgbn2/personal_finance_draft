"""
Verify PolymarketWSClient connection with the new headers.
ASCII-safe version + Fixed Logging + NO server_hostname (since we reverted IP logic).
"""
import asyncio
import logging
import sys
# Import setup_logging to ensure configuration matches app (logs to file) but we also want stdout
from polymarket_sim.core.logger import setup_logging
from polymarket_sim.data.ws_client import PolymarketWSClient

# Configure logging
root = logging.getLogger()
root.setLevel(logging.INFO)
# Clear existing handlers to avoid duplicates/mess
for h in root.handlers[:]:
    root.removeHandler(h)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
root.addHandler(handler)

logging.getLogger("polymarket_sim").setLevel(logging.INFO)

async def main():
    print("[INFO] Starting verification...")
    client = PolymarketWSClient()
    
    # Mock callbacks
    client.on_connected(lambda: print("[OK] Callback: Connected!"))
    client.on_disconnected(lambda: print("[WARN] Callback: Disconnected"))
    
    task = asyncio.create_task(client.connect([]))
    
    print("[INFO] Waiting for connection...")
    for _ in range(10):
        await asyncio.sleep(1)
        if client.is_connected:
            print("[OK] Client reported is_connected=True")
            break
    else:
        print("[FAIL] Timed out waiting for connection.")
    
    await client.disconnect()
    try:
        await task
    except asyncio.CancelledError:
        pass

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
