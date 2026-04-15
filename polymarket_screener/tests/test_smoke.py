"""
Smoke tests: verify the Python path, dependencies, and core module imports.
Updated for Phase 4 modular architecture.
"""

def test_app_package_imports():
    """Verify the top-level app package is importable."""
    import app
    assert hasattr(app, "__name__")


def test_core_modules_import():
    """Verify all core submodules import without errors."""
    from app.core import schemas as common
    from app.core import engine_clock as clock
    from app.core import feed_aggregator as aggregator
    from app.core import portfolio
    from app.core import state_synchronizer as state
    assert common.MarketData is not None
    assert clock.WindowSequenceHandler is not None
    assert aggregator.feed_aggregator is not None
    assert portfolio.PortfolioManager is not None
    assert state.SystemState is not None


def test_math_module_import():
    """Verify the quantitative library imports."""
    from app.math.black_scholes import BlackScholes
    from app.math.kelly import calculate_kelly
    from app.math.slippage import SlippageModel
    assert BlackScholes is not None
    assert calculate_kelly is not None
    assert SlippageModel is not None


def test_utils_module_import():
    """Verify utility modules import."""
    from app.utils import config
    from app.utils import logger
    assert config.config_manager is not None
    assert logger.log is not None


def test_execution_module_import():
    """Verify execution/risk module imports."""
    from app.execution import risk_manager as risk
    from app.execution import circuit_breakers
    assert risk.RiskManager is not None
    assert circuit_breakers.MasterCircuitBreaker is not None


def test_config_yaml_parseable():
    """Verify config YAML files are syntactically valid."""
    import yaml
    from pathlib import Path

    config_dir = Path(__file__).parent.parent / "config"
    
    for yaml_file in config_dir.glob("*.yaml"):
        with open(yaml_file) as f:
            data = yaml.safe_load(f)
        assert data is not None, f"{yaml_file.name} parsed as empty/None"


def test_pydantic_models_instantiate():
    """Verify Pydantic data models can be instantiated."""
    from app.core.models.domain_models import MarketSnapshot, UnifiedTick

    snap = MarketSnapshot(market_id="test-market")
    assert snap.market_id == "test-market"

    tick = UnifiedTick(
        exchange="binance",
        symbol="BTC/USDT",
        price=67000.0,
        bid=66990.0,
        ask=67010.0
    )
    assert tick.price == 67000.0
