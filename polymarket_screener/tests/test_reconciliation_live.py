import asyncio
import os
from unittest.mock import MagicMock, AsyncMock
from app.core.engine.reconciliation import ReconciliationService
from app.core.ingestion.feed_aggregator import feed_aggregator
from app.core.models.portfolio import portfolio
from app.utils.logger import log

async def test_live_reconciliation():
    log.info("Starting Live Reconciliation Verification Test...")
    
    # 1. Setup Mock Polymarket Client
    mock_poly = MagicMock()
    mock_poly.get_name.return_value = "Polymarket"
    
    # Simulate some open positions from the exchange
    mock_poly.get_open_positions = AsyncMock(return_value=[
        {"market_id": "BTC-123", "size": "100.5", "side": "BUY"},
        {"market_id": "ETH-456", "size": "50.0", "side": "SELL"}
    ])
    
    # 2. Inject into Aggregator
    feed_aggregator.clients["polymarket"] = mock_poly
    
    # 3. Setup Portfolio with Drift
    # Internal state only has BTC-123 but with different size
    portfolio.positions.clear()
    from app.core.models.domain_models import Position
    portfolio.positions["BTC-123"] = Position(
        market_id="BTC-123",
        side="BUY",
        size_usd=90.0, # Drifted from 100.5
        entry_price=60000.0,
        current_price=61000.0
    )
    
    # 4. Run Reconciliation
    reconciler = ReconciliationService(check_interval_sec=1, max_drift_tolerance_pct=0.01)
    report = await reconciler.check_once()
    
    # 5. Verify Report
    log.info(f"Reconciliation Report: {report['status']}")
    log.info(f"Drifts Found: {report['drifts_found']}")
    
    for drift in report['drifts']:
        log.info(f"Drift Detected: {drift['type']} on {drift['market_id']} - {drift['detail']}")
    
    assert report['drifts_found'] >= 2 # 1 SIZE drift for BTC, 1 PHANTOM for ETH
    log.info("Verification Test Complete.")

if __name__ == "__main__":
    asyncio.run(test_live_reconciliation())
