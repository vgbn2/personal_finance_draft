import asyncio
import json
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
import logging

logger = logging.getLogger(__name__)

def create_app(engine):
    """Factory to create a FastAPI App bound to a Polymarket Sim Engine."""
    
    active_websockets = []
    
    async def broadcast_state(state: dict):
        if not active_websockets:
            return
        # Serialize once for all clients
        payload = json.dumps(state)
        dead_sockets = []
        for ws in active_websockets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead_sockets.append(ws)
        
        for ws in dead_sockets:
            if ws in active_websockets:
                active_websockets.remove(ws)

    # Wire the engine's dashboard to our broadcast function
    if engine._dashboard:
        engine._dashboard.set_broadcast_callback(broadcast_state)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Startup: Run the engine in the background
        logger.info("Starting up engine via FastAPI lifespan.")
        
        async def run_engine_with_catch():
            try:
                print("[DEBUG] Engine run loop entered")
                await engine.run()
                print("[DEBUG] Engine run loop exited normally")
            except Exception as e:
                print(f"[ERROR] Engine background task crashed: {e}")
                import traceback
                traceback.print_exc()

        engine_task = asyncio.create_task(run_engine_with_catch())
        yield
        # Shutdown
        logger.info("Shutting down engine...")
        print("[DEBUG] FastAPI lifespan teardown triggered. Calling engine.stop()")
        engine.stop()
        try:
            print("[DEBUG] Awaiting engine task completion...")
            await engine_task
            print("[DEBUG] Engine task completed successfully")
        except asyncio.CancelledError:
            print("[DEBUG] Engine task was cancelled")
        except Exception as e:
            logger.error(f"Engine shutdown error: {e}")
            print(f"[DEBUG] Engine shutdown error: {e}")

    app = FastAPI(title="Polymarket Sim Dashboard", lifespan=lifespan)
    
    @app.get("/", response_class=HTMLResponse)
    async def get_index():
        html_path = Path(__file__).parent / "templates" / "index.html"
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))

    @app.get("/api/active-markets")
    async def get_active_markets():
        """Returns the list of currently active markets from the registry."""
        markets = engine._registry.get_all()
        return [
            {
                "id": m.market_id,
                "title": m.title,
                "slug": m.slug,
                "token_ids": m.token_ids,
                "outcomes": m.outcomes
            } for m in markets
        ]

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await websocket.accept()
        active_websockets.append(websocket)
        try:
            while True:
                data = await websocket.receive_text()
                # We could handle commands here (e.g. STOP, SAVE)
                if data == "PONG":
                    pass
        except WebSocketDisconnect:
            if websocket in active_websockets:
                active_websockets.remove(websocket)

    return app
