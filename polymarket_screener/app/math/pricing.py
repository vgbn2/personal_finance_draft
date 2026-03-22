import math
from typing import Dict, Optional
from app.utils.logger import log

def norm_cdf(x: float) -> float:
    """Cumulative distribution function for the standard normal distribution."""
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0

def black_scholes_fair_price(spot: float, strike: float, dte: int, iv: float, r: float = 0.05) -> float:
    """Calculates the N(d2) fair price for a binary choice (Polymarket style)."""
    if dte <= 0:
        return 1.0 if spot >= strike else 0.0
    
    t = dte / 365.0
    sigma = iv / 100.0  # Convert from percentage
    
    try:
        d1 = (math.log(spot / strike) + (r + 0.5 * sigma**2) * t) / (sigma * math.sqrt(t))
        d2 = d1 - sigma * math.sqrt(t)
        return norm_cdf(d2)
    except (ValueError, ZeroDivisionError) as e:
        log.error(f"Error calculating BS Fair: [red]{e}[/]")
        return 0.5 # Neutral fallback

def calculate_greeks(spot: float, strike: float, dte: int, iv: float, r: float = 0.05) -> Dict[str, float]:
    """Calculates Option Greeks (Delta, Gamma, Theta, Vega) for a binary option."""
    if dte <= 0:
        return {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0}
    
    t = dte / 365.0
    sigma = iv / 100.0
    
    d1 = (math.log(spot / strike) + (r + 0.5 * sigma**2) * t) / (sigma * math.sqrt(t))
    d2 = d1 - sigma * math.sqrt(t)
    
    # Probability density function for normal distribution
    pdf = (1.0 / math.sqrt(2 * math.pi)) * math.exp(-0.5 * d1**2)
    
    delta = pdf / (spot * sigma * math.sqrt(t))
    gamma = delta * (d1 / (spot * sigma * math.sqrt(t)))
    theta = -(spot * pdf * sigma) / (2 * math.sqrt(t)) # Simplified
    vega = spot * math.sqrt(t) * pdf
    
    return {
        "delta": delta,
        "gamma": gamma,
        "theta": theta,
        "vega": vega
    }

def get_vrp_adjusted_iv(raw_iv: float, discount: float = 0.85) -> float:
    """Applies a Volatility Risk Premium (VRP) haircut to the raw IV."""
    return raw_iv * discount
