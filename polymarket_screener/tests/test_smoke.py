"""
Smoke tests: verify the Python path, dependencies, and core module imports.
If these fail, the environment is broken.
"""


def test_app_package_imports():
    """Verify the top-level app package is importable."""
    import app
    assert hasattr(app, "__name__")


def test_core_modules_import():
    """Verify all core submodules import without errors."""
    from app.core import common
    from app.core import clock
    from app.core import ingestion
    from app.core import portfolio
    assert common.MarketData is not None
    assert clock.MasterClock is not None
    assert ingestion.DataAggregator is not None
    assert portfolio.PortfolioManager is not None


def test_math_module_import():
    """Verify the quantitative library imports."""
    from app.math import pricing
    assert callable(pricing.black_scholes_fair_price)
    assert callable(pricing.calculate_greeks)


def test_utils_module_import():
    """Verify utility modules import."""
    from app.utils import config
    from app.utils import logger
    assert config.ConfigManager is not None
    assert logger.log is not None


def test_execution_module_import():
    """Verify execution/risk module imports."""
    from app.execution import risk
    assert risk.RiskManager is not None
    assert risk.CircuitBreaker is not None


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
    from app.core.common import MarketData, Signal, Position, Side, SignalType

    market = MarketData(
        id="test-market",
        name="Test Market",
        category="crypto",
        price=0.55,
        vol_24h=10000.0,
        liquidity=5000.0,
    )
    assert market.price == 0.55

    signal = Signal(
        market_id="test-market",
        signal_type=SignalType.BUY,
        side=Side.YES,
        edge=0.05,
        confidence=0.75,
        suggested_size_pct=0.02,
        reasoning="Test signal",
    )
    assert signal.edge == 0.05
