import asyncio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.utils.logger import log
from app.utils.config import config_manager
from app.core.engine_clock import engine_clock
from app.core.feed_aggregator import feed_aggregator
from app.core.data_feed import PolymarketWS, BinanceWSClient, DeribitWSClient
from app.core.strategy_registry import strategy_registry
from app.core.reconciliation import reconciliation_service
from app.execution.risk_manager import risk_manager
from app.execution.circuit_breakers import master_breaker
from app.execution.audit import audit_daemon
from app.api import ws_bridge
from app.api import rest_endpoints

app = FastAPI(title="POLY/SCREEN Backend", version="0.3.0")
app.include_router(ws_bridge.router)
app.include_router(rest_endpoints.router)

# CORS for local frontend modular development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    log.info("Starting POLY/SCREEN Engine v0.3.0...")
    
    # Initialize Config
    config_manager.load()
    
    # Discover and load strategy plugins
    strategy_registry.discover()
    await strategy_registry.start_all()
    
    # Setup Ingestors
    poly = PolymarketWS()
    binance_ws = BinanceWSClient()
    deribit_ws = DeribitWSClient()
    
    feed_aggregator.register(poly)
    feed_aggregator.register(binance_ws)
    feed_aggregator.register(deribit_ws)
    
    # Start WebSockets
    asyncio.create_task(binance_ws.connect())
    asyncio.create_task(deribit_ws.connect())
    asyncio.create_task(poly.connect())
    asyncio.create_task(poly.listen())
    
    # Start Engine Clock (Background Task)
    asyncio.create_task(engine_clock.start())
    
    # Start Data Aggregator (Background Polling for Macro/REST fallback)
    asyncio.create_task(feed_aggregator.start_polling())
    
    # Start Audit Daemon (Background Task)
    await audit_daemon.start()
    
    # Start Reconciliation Service (Background Task)
    await reconciliation_service.start()
    
    log.info("[bold green]Engine successfully initialized (Phase 6).[/]")


@app.on_event("shutdown")
async def shutdown_event():
    log.info("Shutting down POLY/SCREEN Engine...")
    await strategy_registry.stop_all()
    await reconciliation_service.stop()
    await audit_daemon.stop()
    log.info("Engine shutdown complete.")

@app.get("/")
def read_root():
    return {"status": "running", "version": "0.3.0"}


def start():
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    start()
