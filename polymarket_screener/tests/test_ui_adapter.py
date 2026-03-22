import pytest
from app.api.ui_adapter import UIAdapter
from app.core.models import MarketSnapshot
from app.core.portfolio import PortfolioManager
from app.execution.risk import RiskManager

def test_ui_adapter_empty():
    state = UIAdapter.format_market_state(None, None, None)
    assert state["type"] == "STATE_UPDATE"
    assert "timestamp" in state
    data = state["data"]
    assert data["screener"] == []
    assert data["risk"]["label"] == "LOW"
    assert data["risk"]["color_hex"] == "#10B981"
    assert data["portfolio"]["alpha"] == 0.0

def test_ui_adapter_with_snapshot():
    snap = MarketSnapshot(
        market_id="MKT-BTC",
        spot_price=65000.0,
        implied_vol=55.0,
        polymarket_yes=0.55,
        risk_free_rate=5.0
    )
    
    port = PortfolioManager(initial_capital=1000.0)
    port.cash = 1050.0 # $50 profit
    
    risk = RiskManager()
    risk.current_exposure = 0.20 # Medium risk
    
    state = UIAdapter.format_market_state(snap, port, risk)
    data = state["data"]
    
    # Screener
    assert len(data["screener"]) == 1
    assert data["screener"][0]["id"] == "MKT-BTC"
    assert data["screener"][0]["price"] == 0.55
    
    # Risk
    assert data["risk"]["label"] == "MEDIUM"
    assert data["risk"]["color_hex"] == "#F59E0B"
    
    # Portfolio
    assert data["portfolio"]["alpha"] == 5.0 # 50 / 1000 * 100
    
    # Greeks should be computed
    assert "delta" in data["greeks"]
    assert "vega" in data["greeks"]

if __name__ == "__main__":
    pytest.main(["-v", __file__])
