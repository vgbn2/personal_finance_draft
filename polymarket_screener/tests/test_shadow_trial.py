import asyncio
import os
from app.main import startup_event, shutdown_event
from app.utils.logger import log

async def run_shadow_trial():
    log.info("=== Starting 60-Second Shadow Trial ===")
    
    # 1. Start Engine (Startup)
    # This will initialize all WS clients, aggregator, clock, audit, and reconciliation
    await startup_event()
    
    # 2. Wait and Monitor
    # We expect to see 'Aggregator: Received...' and 'ReconciliationService: State is consistent'
    log.info("Monitoring system health for 60 seconds...")
    await asyncio.sleep(60)
    
    # 3. Shutdown
    await shutdown_event()
    log.info("=== Shadow Trial Complete ===")

if __name__ == "__main__":
    asyncio.run(run_shadow_trial())
