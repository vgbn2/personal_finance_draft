import asyncio
import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from app.utils.logger import log
from app.utils.config import config_manager
from app.core.clock import master_clock
from app.core.aggregator import aggregator
from app.core.ingestion import PolymarketWS
from app.execution.risk import risk_engine
from app.execution.circuit_breakers import master_breaker

app = FastAPI(title="POLY/SCREEN Backend", version="0.2.0")

# CORS for local frontend modular development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    log.info("Starting POLY/SCREEN Engine...")
    
    # Initialize Config
    config_manager.load()
    
    # Setup Ingestors
    poly = PolymarketWS()
    aggregator.add_ingestor(poly)
    
    # Start Master Clock (Background Task)
    asyncio.create_task(master_clock.start())
    
    # Start Data Aggregator (Background Task)
    asyncio.create_task(aggregator.start())
    
    log.info("[bold green]Engine successfully initialized.[/]")

@app.get("/")
def read_root():
    return {"status": "running", "version": "0.2.0"}

@app.websocket("/ws/state")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    log.info("Frontend connection: [bold green]CONNECTED[/]")
    try:
        while True:
            # Periodically push state sync
            state = {
                "type": "STATE_SYNC",
                "exposure": risk_engine.current_exposure,
                "volatility": 0.0082, # Dummy
                "pos_count": 5
            }
            await websocket.send_json(state)
            await asyncio.sleep(2)
    except Exception as e:
        log.warning(f"Frontend connection: [bold red]DISCONNECTED[/] ({e})")

def start():
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    start()
