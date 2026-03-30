import numpy as np
from app.math.black_scholes import bs_engine
from app.math.kelly import calculate_kelly
from app.utils.config import config_manager

def diag():
    spot = 60000.0
    strike = 60000.0
    dte_mins = 15
    dte_days = dte_mins / (24 * 60)
    iv = 50.0
    
    # 1. Fair Prob
    # Signal engine does dte=dte_days * 365
    fair_prob = bs_engine.fair_price(
        spot=spot, strike=strike, dte=dte_days * 365, iv=iv
    )
    print(f"Fair Prob (ATM, 15m, 50% IV): {fair_prob.item():.4f}")
    
    # 2. Kelly
    # If market_prob = 0.45
    mkt = 0.45
    odds = 1.0 / mkt
    kelly = calculate_kelly(win_prob=fair_prob.item(), odds_offered=odds, fraction=1.0)
    print(f"Full Kelly (fair={fair_prob.item():.2f}, mkt={mkt}): {kelly:.4f}")
    
    # 3. Final Alloc with Config
    k_frac = 0.25
    score_mult = 0.5
    max_pos = 0.05
    alloc = min(kelly * k_frac * score_mult, max_pos)
    print(f"Final Alloc (frac=0.25, mult=0.5): {alloc:.4%}")

if __name__ == "__main__":
    diag()
