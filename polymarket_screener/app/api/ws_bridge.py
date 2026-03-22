import asyncio
from typing import Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.ui_adapter import UIAdapter
from app.core.state import system_state
from app.core.portfolio import portfolio
from app.execution.risk import risk_engine
from app.utils.logger import log

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        log.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            log.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                log.warning(f"Error sending message to WS client: {e}")
                self.disconnect(connection)

manager = ConnectionManager()

@router.websocket("/ws/state")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    # Broadcast task
    async def push_state():
        while True:
            state_json = UIAdapter.format_market_state(
                snapshot=system_state.latest_snapshot,
                portfolio=portfolio,
                risk_engine=risk_engine
            )
            try:
                await websocket.send_json(state_json)
                # Send VPN keep-alive per specification
                await websocket.send_json({"type": "PONG"})
            except BaseException:
                break
            await asyncio.sleep(0.5)

    push_task = asyncio.create_task(push_state())

    try:
        while True:
            # Handle commands sent by the UI
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue
                
            cmd_type = data.get("type")
            if cmd_type == "UI_COMMAND":
                cmd = data.get("cmd")
                # e.g., 'OBSERVE_MARKET'
                if cmd == "OBSERVE_MARKET":
                    target_market = data.get("market_id")
                    if target_market:
                        log.info(f"UI requested deep observation on market: {target_market}")
                        # In Phase 5/6, we'd fire an event here to trigger the ML data loader or deep CCXT depth fetching
                        # event_bus.publish(Channel.COMMAND, data)
                elif cmd == "EXECUTE_TRADE":
                    log.info(f"UI requested manual trade: {data}")
                elif cmd == "PING":
                    # Let the client keep the connection alive
                    pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    finally:
        push_task.cancel()
