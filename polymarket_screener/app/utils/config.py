import yaml
import os
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

# ─── Project root resolution ───
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"


# ─── Pydantic Config Models ───

class StrategyConfig(BaseModel):
    """Strategy-level tuning parameters."""
    name: str = "polymarket_edge_screener"
    min_edge: float = 0.04
    vrp_haircut: float = 0.85
    kelly_fraction: float = 0.25
    stop_loss: float = 0.15
    greed_decay: float = 1.5
    default_dte_minutes: int = 15
    vrp_discount_factor: float = 0.85
    min_edge_no: float = 0.02

    @classmethod
    def load(cls, path: str = "") -> "StrategyConfig":
        """Load strategy config from YAML file."""
        file = Path(path) if path else CONFIG_DIR / "strategy_params.yaml"
        if not file.exists():
            return cls()
        with open(file, "r") as f:
            data = yaml.safe_load(f) or {}
        return cls(**(data.get("strategy", data)))


class RiskConfig(BaseModel):
    """Risk management parameters."""
    max_exposure: float = 0.20
    max_position_size: float = 0.05
    min_liquidity_usd: float = 500.0
    max_drawdown: float = 0.15
    heartbeat_timeout_sec: int = 30
    max_global_exposure_pct: float = 0.30
    max_temporal_exposure_pct: float = 0.15
    max_iv_spike_ratio: float = 3.0
    conviction_tiers: Dict[float, float] = Field(default_factory=lambda: {0.6: 0.10, 0.7: 0.15, 0.8: 0.25})


class ExecutionConfig(BaseModel):
    """Execution tuning."""
    slippage_bps: int = 15
    cooldown_sec: int = 5
    shadow_mode: bool = True


class ClockConfig(BaseModel):
    """Market window timing."""
    window_minutes: int = 15
    pre_warm_sec: int = 120


class ExchangeConfig(BaseModel):
    enabled: bool = True
    poll_interval: float = 1.0
    symbols: List[str] = []


class PolymarketSymbols(BaseModel):
    categories: List[str] = []
    watchlist: List[str] = []


class BinanceSymbols(BaseModel):
    spot: List[str] = []
    futures: List[str] = []


class DeribitSymbols(BaseModel):
    instruments: List[str] = []
    currencies: List[str] = []


class SymbolsConfig(BaseModel):
    """Symbol registry loaded from config/symbols.yaml."""
    polymarket: PolymarketSymbols = PolymarketSymbols()
    binance: BinanceSymbols = BinanceSymbols()
    deribit: DeribitSymbols = DeribitSymbols()

    @classmethod
    def load(cls, path: str = "") -> "SymbolsConfig":
        file = Path(path) if path else CONFIG_DIR / "symbols.yaml"
        if not file.exists():
            return cls()
        with open(file, "r") as f:
            data = yaml.safe_load(f) or {}
        return cls(**data)


class AppConfig(BaseModel):
    """Top-level application configuration."""
    version: str = "0.2.0"
    mode: str = "paper"
    log_level: str = "INFO"
    clob_endpoint: str = "https://clob.polymarket.com"
    base_currency: str = "BTC"
    quote_currency: str = "USDT"
    mongodb_uri: Optional[str] = None
    exchanges: Dict[str, ExchangeConfig] = {}
    strategies: List[StrategyConfig] = []


# ─── Singleton Config Manager ───

class ConfigManager:
    _instance = None
    _config: Optional[AppConfig] = None
    _strategy: Optional[StrategyConfig] = None
    _risk: Optional[RiskConfig] = None
    _execution: Optional[ExecutionConfig] = None
    _clock: Optional[ClockConfig] = None
    _symbols: Optional[SymbolsConfig] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ConfigManager, cls).__new__(cls)
        return cls._instance

    def load(self, config_path: str = "") -> AppConfig:
        """Load settings.yaml and all sub-configs from the config directory."""
        settings_path = Path(config_path) if config_path else CONFIG_DIR / "settings.yaml"
        if settings_path.exists():
            with open(settings_path, "r") as f:
                data = yaml.safe_load(f) or {}
                self._config = AppConfig(**data)
        else:
            self._config = AppConfig()
            self.save(str(settings_path))

        # Load sub-configs from strategy_params.yaml
        params_path = CONFIG_DIR / "strategy_params.yaml"
        if params_path.exists():
            with open(params_path, "r") as f:
                params = yaml.safe_load(f) or {}
            self._strategy = StrategyConfig(**(params.get("strategy", {})))
            self._risk = RiskConfig(**(params.get("risk", {})))
            self._execution = ExecutionConfig(**(params.get("execution", {})))
            self._clock = ClockConfig(**(params.get("clock", {})))

        # Load symbols registry
        self._symbols = SymbolsConfig.load()

        return self._config

    def save(self, config_path: str = ""):
        if not self._config:
            return
        path = Path(config_path) if config_path else CONFIG_DIR / "settings.yaml"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            yaml.dump(self._config.model_dump(), f, sort_keys=False)

    @property
    def config(self) -> AppConfig:
        if self._config is None:
            self.load()
        return self._config

    @property
    def strategy(self) -> StrategyConfig:
        if self._strategy is None:
            self.load()
        return self._strategy

    @property
    def risk(self) -> RiskConfig:
        if self._risk is None:
            self.load()
        return self._risk

    @property
    def execution(self) -> ExecutionConfig:
        if self._execution is None:
            self.load()
        return self._execution

    @property
    def clock(self) -> ClockConfig:
        if self._clock is None:
            self.load()
        return self._clock

    @property
    def symbols(self) -> SymbolsConfig:
        if self._symbols is None:
            self.load()
        return self._symbols


config_manager = ConfigManager()
