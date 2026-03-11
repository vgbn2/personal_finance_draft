from typing import Optional
from src.utils.constants import YES, NO


def kelly_criterion(
    probability: float,
    odds: float,
    fraction: float = 0.25,
    max_position_pct: float = 0.10
) -> float:
    """
    Calculate position size using Fractional Kelly Criterion.
    
    Formula: F = (p - P) / (1 - P)
    Where:
        p = estimated probability of winning
        P = decimal odds implied probability
    
    Args:
        probability: Our estimated probability of winning (0-1)
        odds: Decimal odds (e.g., 2.0 for even money)
        fraction: Kelly fraction (0.25 = quarter Kelly)
        max_position_pct: Maximum position size as fraction of bankroll
    
    Returns:
        Position size as fraction of bankroll (0-1)
    """
    if odds <= 1.0:
        return 0.0
    
    implied_prob = 1.0 / odds
    
    if probability <= implied_prob:
        return 0.0
    
    edge = probability - implied_prob
    kelly = edge / (1 - implied_prob)
    fractional_kelly = kelly * fraction
    
    return min(fractional_kelly, max_position_pct)


def kelly_for_outcome(
    estimated_prob: float,
    current_price: float,
    outcome: str = YES,
    fraction: float = 0.25,
    max_position_pct: float = 0.10
) -> float:
    """
    Calculate Kelly position for YES/NO outcomes.
    
    Args:
        estimated_prob: Our estimated probability (0-1)
        current_price: Current market price (0-1)
        outcome: YES or NO
        fraction: Kelly fraction
        max_position_pct: Max position as % of bankroll
    
    Returns:
        Position size as fraction of bankroll
    """
    if outcome == YES:
        odds = 1.0 / current_price if current_price > 0 else 0
    else:
        odds = 1.0 / (1.0 - current_price) if current_price < 1.0 else 0
    
    return kelly_criterion(estimated_prob, odds, fraction, max_position_pct)


def calculate_expected_value(
    probability: float,
    odds: float
) -> float:
    """
    Calculate expected value of a bet.
    
    EV = (win_probability * win_amount) - (loss_probability * loss_amount)
    
    Args:
        probability: Probability of winning (0-1)
        odds: Decimal odds
    
    Returns:
        Expected value (positive = profitable)
    """
    if odds <= 0:
        return 0.0
    
    loss_prob = 1.0 - probability
    win_amount = odds - 1.0
    
    return (probability * win_amount) - (loss_prob * 1.0)
