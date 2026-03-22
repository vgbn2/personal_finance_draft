from typing import Dict, Any, List
import time
from app.core.domain_models import MarketSnapshot
from app.core.portfolio import PortfolioManager
from app.execution.risk_manager import RiskManager
from app.math.black_scholes import bs_engine

class UIAdapter:
    """
    Adapts complex backend state (Pydantic models, NumPy calculations)
    into the flat JSON dictionary required by the React frontend.
    """

    @staticmethod
    def format_market_state(
        snapshot: MarketSnapshot | None, 
        portfolio: PortfolioManager | None = None,
        risk_engine: RiskManager | None = None
    ) -> Dict[str, Any]:
        """
        Produce a unified state dictionary according to the UI_ADAPTATION_SPEC.
        """
        # Defaults if components aren't provided
        screener_data = []
        greeks_data = {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0}
        
        if snapshot and snapshot.has_pricing_data:
            # Reconstruct basic Greeks and edge for the active market
            # Assume 15m DTE by default for Greeks approximation
            dte_days = 15 / (24 * 60)
            
            # Using ATM spot for approximation
            try:
                greeks = bs_engine.greeks(
                    spot=snapshot.spot_price,
                    strike=snapshot.spot_price,
                    dte=dte_days * 365,
                    iv=snapshot.implied_vol / 100.0,
                    r=snapshot.risk_free_rate / 100.0 if snapshot.risk_free_rate else 0.05
                )
                greeks_data = {
                    "delta": float(greeks["delta"].item()),
                    "gamma": float(greeks["gamma"].item()),
                    "theta": float(greeks["theta"].item()),
                    "vega": float(greeks["vega"].item())
                }
            except Exception:
                pass
            
            # Determine trend (mock array if storage not available, else last price)
            trend = [snapshot.polymarket_yes] if snapshot.polymarket_yes else []
            
            screener_data.append({
                "id": snapshot.market_id,
                "label": f"Active: {snapshot.market_id}",
                "price": snapshot.polymarket_yes or 0.0,
                "volume_24h": 0.0, # Currently untracked in snapshot natively
                "signal": "NEUTRAL", # Stub for real signal tracking
                "trend": trend
            })

        # Format Risk
        risk_exposure = 0.0
        if risk_engine:
            risk_exposure = risk_engine.current_exposure
            
        risk_label = "LOW"
        color_hex = "#10B981" # Green
        if risk_exposure > 0.15:
            risk_label = "MEDIUM"
            color_hex = "#F59E0B" # Yellow
        if risk_exposure > 0.25:
            risk_label = "HIGH"
            color_hex = "#EF4444" # Red

        risk_data = {
            "label": risk_label,
            "black_swan_prob": risk_exposure * 0.1,  # Synthetic approximation
            "color_hex": color_hex
        }

        # Format Portfolio
        alpha = 0.0
        if portfolio and portfolio.initial_capital > 0:
            roi = portfolio.total_pnl / portfolio.initial_capital
            alpha = roi * 100.0
            
        portfolio_data = {
            "alpha": float(alpha),
            "survival_rate": 99.9 if risk_exposure < 0.3 else 80.0
        }

        # Final unified response
        return {
            "type": "STATE_UPDATE",
            "timestamp": time.time(),
            "data": {
                "screener": screener_data,
                "greeks": greeks_data,
                "risk": risk_data,
                "portfolio": portfolio_data
            }
        }
