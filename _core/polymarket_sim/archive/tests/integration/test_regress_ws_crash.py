"""
Regression Test for Bug #1: WebSocket JSON Array Crash.
Verifies that the WS client handles messages wrapped in a list (e.g. [{"type": ...}])
without crashing with AttributeError.
"""
import asyncio
import json
import logging
from polymarket_sim.data.ws_client import PolymarketWSClient

# Mock logger to suppress noise
logging.basicConfig(level=logging.CRITICAL)

def test_json_array_handling():
    client = PolymarketWSClient()
    
    # Track if callback was triggered
    events = []
    def on_book(data):
        events.append(data)
    
    client.on_book(on_book)

    # 1. Simulate standard dict message (Control)
    print("Testing standard dict message...")
    msg_dict = json.dumps({"event_type": "book", "bids": [], "asks": []})
    client._handle_message(msg_dict)
    assert len(events) == 1
    print("✅ Standard message handled.")

    # 2. Simulate ARRAY message (The Bug)
    print("Testing array-wrapped message...")
    msg_list = json.dumps([{"event_type": "book", "bids": [["0.5", "100"]], "asks": []}])
    
    try:
        client._handle_message(msg_list)
        assert len(events) == 2
        print("✅ Array message handled (unwrapped successfully).")
    except AttributeError:
        print("❌ FAILED: Crashed with AttributeError (Bug #1 still present)")
        exit(1)
    except Exception as e:
        print(f"❌ FAILED: Unexpected error: {e}")
        exit(1)

if __name__ == "__main__":
    test_json_array_handling()
