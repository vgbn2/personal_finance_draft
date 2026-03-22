import pytest
import asyncio
from fastapi.testclient import TestClient
from fastapi.websockets import WebSocketDisconnect
from app.main import app

client = TestClient(app)

def test_websocket_ping_pong():
    with client.websocket_connect("/ws/state") as websocket:
        # First message should be STATE_UPDATE
        data = websocket.receive_json()
        assert data["type"] == "STATE_UPDATE"
        assert "screener" in data["data"]
        
        # Second message should be PONG keep-alive
        pong = websocket.receive_json()
        assert pong["type"] == "PONG"

def test_websocket_ui_commands():
    with client.websocket_connect("/ws/state") as websocket:
        # Initial push (STATE_UPDATE and PONG)
        websocket.receive_json()
        websocket.receive_json()
        
        # Send a UI command
        cmd = {
            "type": "UI_COMMAND",
            "cmd": "OBSERVE_MARKET",
            "market_id": "MKT-123"
        }
        websocket.send_json(cmd)
        
        # Since logic just logs for now, we just ensure it doesn't crash 
        # and continues receiving state updates
        data = websocket.receive_json()
        assert data["type"] == "STATE_UPDATE"

if __name__ == "__main__":
    pytest.main(["-v", __file__])
