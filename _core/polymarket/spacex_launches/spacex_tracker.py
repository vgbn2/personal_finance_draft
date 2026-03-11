"""
SpaceX Starship Launch Tracker - Polymarket Analytics
Bayesian Reliability Function + Impulse Response Updates

Treats launch success as a time-varying reliability function.
"""

import os
import sys
import time
import json
import requests
import logging
import argparse
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field

# ==========================================
# ⚙️ CONFIG
# ==========================================
class Config:
    API_BASE_URL = "https://gamma-api.polymarket.com/events"
    API_HEADERS = {'User-Agent': 'Mozilla/5.0'}
    REFRESH_SECONDS = 300  # 5 minutes
    BANKROLL = 1000.0
    
    # Bayesian Prior Parameters
    PRIOR_SUCCESS_RATE = 0.7  # Base success probability
    
    # Impulse Response Weights (how much each milestone shifts probability)
    IMPULSE_WEIGHTS = {
        'wet_dress_rehearsal': 0.05,   # +5% if passed
        'static_fire': 0.08,            # +8% if passed
        'launch_window_open': 0.03,     # +3% when window opens
        'propellant_load': 0.02,        # +2% if loading starts
        'go_for_launch': 0.05,          # +5% final go
    }

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SpaceXTracker")

# Windows UTF-8 fix
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# ==========================================
# 📊 BAYESIAN RELIABILITY MODEL
# ==========================================
@dataclass
class LaunchEvent:
    """Represents a milestone or event that affects launch probability."""
    name: str
    occurred: bool = False
    timestamp: Optional[datetime] = None
    impulse_weight: float = 0.0

@dataclass
class BayesianLaunchModel:
    """
    Models launch success probability using Bayesian updates.
    
    P(success | milestones) ∝ P(milestones | success) * P(success)
    
    Each milestone acts as an "impulse" that shifts the probability.
    """
    prior: float = Config.PRIOR_SUCCESS_RATE
    milestones: Dict[str, LaunchEvent] = field(default_factory=dict)
    observation_count: int = 0
    
    def __post_init__(self):
        # Initialize milestones
        for name, weight in Config.IMPULSE_WEIGHTS.items():
            self.milestones[name] = LaunchEvent(name=name, impulse_weight=weight)
    
    def update_milestone(self, milestone_name: str, success: bool = True):
        """
        Bayesian update when a milestone is observed.
        
        Success: probability increases
        Failure: probability decreases significantly
        """
        if milestone_name not in self.milestones:
            return
        
        event = self.milestones[milestone_name]
        if event.occurred:
            return  # Already processed
        
        event.occurred = True
        event.timestamp = datetime.now(timezone.utc)
        
        weight = event.impulse_weight
        
        if success:
            # Bayesian update: increase probability
            # logit transform for numerical stability
            logit = np.log(self.prior / (1 - self.prior))
            logit += weight * 2  # Scale factor
            self.prior = 1 / (1 + np.exp(-logit))
        else:
            # Failure significantly reduces probability
            self.prior *= (1 - weight * 3)
        
        # Clamp to valid range
        self.prior = max(0.01, min(0.99, self.prior))
        self.observation_count += 1
        
        logger.info(f"📡 Milestone '{milestone_name}' {'PASSED' if success else 'FAILED'} | P(success) = {self.prior:.1%}")
    
    def time_decay(self, target_date: datetime) -> float:
        """
        Reliability function: probability decreases as we approach launch.
        
        R(t) = P_base * exp(-λ * t)
        
        Where t is time remaining and λ is the failure rate.
        """
        now = datetime.now(timezone.utc)
        time_remaining = (target_date - now).total_seconds() / 86400  # days
        
        if time_remaining <= 0:
            return self.prior
        
        # Bathtub curve: higher risk at start (infant mortality) and end (wear-out)
        # Simplified: linear decay in last 24 hours
        if time_remaining < 1:
            decay_factor = 0.98 ** (1 - time_remaining)
        else:
            decay_factor = 1.0
        
        return self.prior * decay_factor
    
    def get_current_probability(self, target_date: datetime) -> Tuple[float, float]:
        """Returns (probability, uncertainty)."""
        prob = self.time_decay(target_date)
        
        # Uncertainty decreases with more observations
        uncertainty = 0.2 / (1 + self.observation_count * 0.5)
        
        return prob, uncertainty
    
    def reset(self):
        """Reset for a new launch."""
        self.prior = Config.PRIOR_SUCCESS_RATE
        self.observation_count = 0
        for event in self.milestones.values():
            event.occurred = False
            event.timestamp = None

# ==========================================
# 💰 RISK-ADJUSTED ROI CALCULATOR
# ==========================================
class RiskAdjustedROI:
    """
    Calculates ROI adjusted for time-varying risk.
    
    Kelly Criterion with time decay.
    """
    
    @staticmethod
    def calculate_kelly(prob: float, ask_price: float) -> float:
        """Kelly fraction for optimal bet sizing."""
        if ask_price <= 0 or ask_price >= 100:
            return 0
        
        b = (100 / ask_price) - 1  # Odds
        q = 1 - prob
        
        kelly = (prob * b - q) / b
        return max(0, kelly)
    
    @staticmethod
    def calculate_risk_adjusted_roi(prob: float, uncertainty: float, ask_price: float) -> float:
        """
        ROI adjusted for uncertainty.
        
        Uses lower bound of confidence interval.
        """
        # Conservative estimate: prob - 1.5 * sigma
        conservative_prob = max(0.01, prob - 1.5 * uncertainty)
        
        expected_value = conservative_prob * 100  # cents if win
        cost = ask_price
        
        if cost <= 0:
            return 0
        
        return (expected_value - cost) / cost * 100

# ==========================================
# 🌐 API CLIENT
# ==========================================
class SpaceXMarketAPI:
    @staticmethod
    def get_spacex_markets() -> List[Dict]:
        """Fetch Polymarket SpaceX/Starship markets."""
        events = []
        seen_ids = set()
        
        queries = ["SpaceX", "Starship", "rocket launch"]
        
        for query in queries:
            try:
                params = {"limit": 50, "closed": "false", "q": query}
                resp = requests.get(Config.API_BASE_URL, params=params,
                                   headers=Config.API_HEADERS, timeout=10)
                data = resp.json()
                
                for event in data:
                    title = event.get('title', '').lower()
                    if ('spacex' in title or 'starship' in title or 'falcon' in title):
                        if event.get('closed') is False and event['id'] not in seen_ids:
                            events.append(event)
                            seen_ids.add(event['id'])
            except Exception as e:
                logger.error(f"API error ({query}): {e}")
        
        return events

# ==========================================
# 🖥️ DASHBOARD
# ==========================================
class Dashboard:
    @staticmethod
    def clear():
        print("\033[H\033[2J", end="")
        sys.stdout.flush()
    
    @staticmethod
    def display(events: List[Dict], model: BayesianLaunchModel):
        Dashboard.clear()
        
        utc_now = datetime.now(timezone.utc)
        
        print("🚀 SPACEX LAUNCH PROBABILITY TRACKER (Polymarket)")
        print(f"🕒 {utc_now.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print("─"*80)
        
        # Milestone status
        print("\n📋 MILESTONE STATUS:")
        for name, event in model.milestones.items():
            status = "✅" if event.occurred else "⬜"
            time_str = event.timestamp.strftime('%m-%d %H:%M') if event.timestamp else "pending"
            print(f"   {status} {name.replace('_', ' ').title():<25} (+{event.impulse_weight:.0%}) | {time_str}")
        
        print("─"*80)
        
        if not events:
            print("⚠️  NO ACTIVE SPACEX MARKETS FOUND.")
            print("\n💡 Simulate milestones with: --simulate wdr | --simulate sf")
            return
        
        for event in events:
            try:
                title = event['title']
                end_str = event['endDate'].replace('Z', '+00:00')
                end = datetime.fromisoformat(end_str)
                days_left = (end - utc_now).total_seconds() / 86400
                
                if days_left <= 0:
                    continue
                
                # Get model probability
                prob, uncertainty = model.get_current_probability(end)
                
                print(f"\n📅 {title}")
                print(f"   ⏳ T-minus: {days_left:.1f} days")
                print(f"   🎯 MODEL P(success): {prob:.1%} ± {uncertainty:.1%}")
                
                markets = event.get('markets', [])
                
                for m in markets:
                    try:
                        name = m.get('groupItemTitle', 'Unknown')
                        prices = json.loads(m.get('outcomePrices', '["0", "0"]'))
                        ask = float(prices[0]) * 100
                        
                        # Calculate risk-adjusted ROI
                        ra_roi = RiskAdjustedROI.calculate_risk_adjusted_roi(prob, uncertainty, ask)
                        kelly = RiskAdjustedROI.calculate_kelly(prob, ask)
                        
                        edge = prob * 100 - ask
                        edge_color = "\033[92m" if edge > 0 else "\033[91m"
                        
                        print(f"   {name:<20} {ask:>6.1f}¢ | Edge: {edge_color}{edge:>+6.1f}%\033[0m | RA-ROI: {ra_roi:>+6.1f}% | Kelly: {kelly:.1%}")
                        
                    except:
                        continue
                
            except Exception as e:
                logger.error(f"Error: {e}")
    
# ==========================================
# 🚀 MAIN
# ==========================================
def main():
    parser = argparse.ArgumentParser(description="SpaceX Launch Probability Tracker")
    parser.add_argument("--test", action="store_true", help="Run once")
    parser.add_argument("--simulate", type=str, help="Simulate milestone: wdr, sf, go")
    args = parser.parse_args()
    
    model = BayesianLaunchModel()
    
    # Handle simulation
    if args.simulate:
        sim_map = {
            'wdr': 'wet_dress_rehearsal',
            'sf': 'static_fire',
            'go': 'go_for_launch',
            'prop': 'propellant_load',
            'window': 'launch_window_open'
        }
        if args.simulate in sim_map:
            model.update_milestone(sim_map[args.simulate], success=True)
    
    try:
        while True:
            events = SpaceXMarketAPI.get_spacex_markets()
            Dashboard.display(events, model)
            
            if args.test:
                print("\n✅ Test Complete.")
                break
            
            for i in range(Config.REFRESH_SECONDS, 0, -1):
                sys.stdout.write(f"\r💤 Refreshing in {i}s...")
                sys.stdout.flush()
                time.sleep(1)
                
    except KeyboardInterrupt:
        print("\n👋 Exiting.")

if __name__ == "__main__":
    main()
