"""
Hurricane Intensity & Path Tracker - Polymarket Analytics
Markov Chain State Transitions + Spectral Leakage Detection

Models hurricane intensity as a Markov chain with SST/wind shear transitions.
"""

import os
import sys
import time
import json
import requests
import logging
import argparse
import numpy as np
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple

# ==========================================
# ⚙️ CONFIG
# ==========================================
class Config:
    API_BASE_URL = "https://gamma-api.polymarket.com/events"
    API_HEADERS = {'User-Agent': 'Mozilla/5.0'}
    REFRESH_SECONDS = 600  # 10 minutes
    
    # Markov Chain: Category transition probabilities
    # Based on historical hurricane behavior
    # Rows: current state (0=TD, 1=TS, 2=Cat1, 3=Cat2, 4=Cat3, 5=Cat4, 6=Cat5)
    # Cols: next state
    TRANSITION_MATRIX = np.array([
        [0.50, 0.40, 0.08, 0.02, 0.00, 0.00, 0.00],  # TD
        [0.20, 0.45, 0.25, 0.08, 0.02, 0.00, 0.00],  # TS
        [0.05, 0.15, 0.45, 0.25, 0.08, 0.02, 0.00],  # Cat1
        [0.02, 0.05, 0.15, 0.45, 0.25, 0.06, 0.02],  # Cat2
        [0.00, 0.02, 0.05, 0.15, 0.50, 0.23, 0.05],  # Cat3
        [0.00, 0.00, 0.02, 0.05, 0.20, 0.55, 0.18],  # Cat4
        [0.00, 0.00, 0.00, 0.02, 0.10, 0.28, 0.60],  # Cat5
    ])
    
    CATEGORY_NAMES = ['TD', 'TS', 'Cat1', 'Cat2', 'Cat3', 'Cat4', 'Cat5']
    
    # Sea Surface Temperature thresholds (°C)
    SST_WEAKENING_THRESHOLD = 26.0  # Below this, storms weaken
    SST_INTENSIFICATION = 28.5       # Above this, rapid intensification possible
    
    # Wind shear (kt) - High shear weakens storms
    SHEAR_HIGH_THRESHOLD = 20.0

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("HurricaneTracker")

# Windows UTF-8 fix
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# ==========================================
# 🌀 MARKOV CHAIN MODEL
# ==========================================
class HurricaneMarkovModel:
    """
    Models hurricane intensity evolution as a Markov chain.
    
    State: Current Saffir-Simpson category (TD, TS, Cat1-5)
    Transitions: Governed by base probabilities adjusted for SST and wind shear
    """
    
    def __init__(self):
        self.transition_matrix = Config.TRANSITION_MATRIX.copy()
        self.current_state: int = 1  # Default: Tropical Storm
        self.sst: float = 27.0       # Sea surface temp
        self.wind_shear: float = 15.0  # kt
        
    def update_conditions(self, sst: float = None, wind_shear: float = None):
        """Update environmental conditions that affect transitions."""
        if sst is not None:
            self.sst = sst
        if wind_shear is not None:
            self.wind_shear = wind_shear
        
        self._adjust_transition_matrix()
    
    def _adjust_transition_matrix(self):
        """Modify transition probabilities based on environmental conditions."""
        self.transition_matrix = Config.TRANSITION_MATRIX.copy()
        
        # SST adjustments
        if self.sst < Config.SST_WEAKENING_THRESHOLD:
            # Increase probability of weakening (shift mass leftward)
            for i in range(1, 7):
                weakening_boost = 0.15
                self.transition_matrix[i, max(0, i-1)] += weakening_boost
                self.transition_matrix[i, min(6, i+1)] -= weakening_boost * 0.5
                self.transition_matrix[i, i] -= weakening_boost * 0.5
                
        elif self.sst > Config.SST_INTENSIFICATION:
            # Increase probability of intensification (shift mass rightward)
            for i in range(0, 6):
                intensify_boost = 0.12
                self.transition_matrix[i, min(6, i+1)] += intensify_boost
                self.transition_matrix[i, max(0, i-1)] -= intensify_boost * 0.5
                self.transition_matrix[i, i] -= intensify_boost * 0.5
        
        # Wind shear adjustments (high shear = weakening)
        if self.wind_shear > Config.SHEAR_HIGH_THRESHOLD:
            for i in range(1, 7):
                shear_penalty = 0.10
                self.transition_matrix[i, max(0, i-1)] += shear_penalty
                self.transition_matrix[i, i] -= shear_penalty
        
        # Normalize rows to sum to 1
        for i in range(7):
            row_sum = self.transition_matrix[i].sum()
            if row_sum > 0:
                self.transition_matrix[i] /= row_sum
    
    def set_current_state(self, category: int):
        """Set current hurricane category (0-6)."""
        self.current_state = max(0, min(6, category))
    
    def predict_distribution(self, steps: int = 1) -> np.ndarray:
        """
        Predict probability distribution over categories after N steps.
        
        P(X_n) = P(X_0) * T^n
        """
        # Start with current state as one-hot
        state = np.zeros(7)
        state[self.current_state] = 1.0
        
        # Matrix power for multi-step prediction
        T_n = np.linalg.matrix_power(self.transition_matrix, steps)
        
        return state @ T_n
    
    def get_landfall_probabilities(self, steps_to_landfall: int) -> Dict[str, float]:
        """
        Get probability of each category at landfall.
        """
        dist = self.predict_distribution(steps_to_landfall)
        
        return {
            Config.CATEGORY_NAMES[i]: float(dist[i]) 
            for i in range(7)
        }

# ==========================================
# 📊 SPECTRAL LEAKAGE DETECTOR
# ==========================================
class SpectralLeakageDetector:
    """
    Detects when market overprices extreme outcomes (Cat5 "long shots").
    
    "Spectral leakage" = probability mass bleeding into unlikely states.
    """
    
    @staticmethod
    def detect_overpricing(model_probs: Dict[str, float], 
                          market_probs: Dict[str, float]) -> Dict[str, Dict]:
        """
        Compare model probabilities vs market prices.
        
        Returns buckets with significant mispricing.
        """
        results = {}
        
        for cat in Config.CATEGORY_NAMES:
            model_p = model_probs.get(cat, 0)
            market_p = market_probs.get(cat, 0)
            
            if market_p == 0:
                continue
            
            # Leakage = market overweights extreme outcomes
            edge = model_p * 100 - market_p  # in percentage points
            
            # Significant if model says <1% but market says >5%
            is_spectral_leak = (model_p < 0.03 and market_p > 5)
            
            results[cat] = {
                'model_prob': model_p,
                'market_prob': market_p,
                'edge': edge,
                'is_leak': is_spectral_leak,
                'action': 'SELL' if is_spectral_leak else ('BUY' if edge > 10 else 'HOLD')
            }
        
        return results

# ==========================================
# 🌐 API CLIENT
# ==========================================
class NHCClient:
    """Parses NHC (National Hurricane Center) data."""
    
    ATLANTIC_RSS = "https://www.nhc.noaa.gov/index-at.xml"
    PACIFIC_RSS = "https://www.nhc.noaa.gov/index-ep.xml"
    
    @staticmethod
    def get_active_storms() -> List[Dict]:
        """Fetch active storms from NHC RSS feed."""
        storms = []
        try:
            import xml.etree.ElementTree as ET
            resp = requests.get(NHCClient.ATLANTIC_RSS, timeout=10)
            root = ET.fromstring(resp.content)
            
            for item in root.findall('.//item'):
                title = item.find('title')
                if title is not None and title.text:
                    title_text = title.text.lower()
                    # Look for storm advisories
                    if any(kw in title_text for kw in ['hurricane', 'tropical', 'storm', 'depression']):
                        storms.append({
                            'title': title.text,
                            'link': item.find('link').text if item.find('link') is not None else '',
                            'description': item.find('description').text if item.find('description') is not None else ''
                        })
            
            if storms:
                logger.info(f"🌀 NHC: Found {len(storms)} active storm advisories")
        except Exception as e:
            logger.warning(f"NHC RSS error: {e}")
        
        return storms
    
    @staticmethod
    def parse_category(description: str) -> int:
        """Extract category from advisory description."""
        desc_lower = description.lower()
        if 'category 5' in desc_lower or 'cat 5' in desc_lower:
            return 6
        elif 'category 4' in desc_lower or 'cat 4' in desc_lower:
            return 5
        elif 'category 3' in desc_lower or 'cat 3' in desc_lower:
            return 4
        elif 'category 2' in desc_lower or 'cat 2' in desc_lower:
            return 3
        elif 'category 1' in desc_lower or 'cat 1' in desc_lower:
            return 2
        elif 'tropical storm' in desc_lower:
            return 1
        elif 'tropical depression' in desc_lower:
            return 0
        return 1  # Default to TS


class HurricaneMarketAPI:
    @staticmethod
    def get_hurricane_markets() -> List[Dict]:
        """Fetch Polymarket hurricane-related markets."""
        events = []
        seen_ids = set()
        
        queries = ["hurricane", "tropical storm", "cyclone", "storm"]
        
        for query in queries:
            try:
                params = {"limit": 50, "closed": "false", "q": query}
                resp = requests.get(Config.API_BASE_URL, params=params,
                                   headers=Config.API_HEADERS, timeout=10)
                data = resp.json()
                
                for event in data:
                    title = event.get('title', '').lower()
                    keywords = ['hurricane', 'tropical', 'category', 'storm', 'landfall']
                    if any(kw in title for kw in keywords):
                        if event.get('closed') is False and event['id'] not in seen_ids:
                            events.append(event)
                            seen_ids.add(event['id'])
            except Exception as e:
                logger.error(f"API error ({query}): {e}")
        
        return events
    
    @staticmethod
    def get_weather_data(lat: float = 25.0, lon: float = -80.0) -> Dict:
        """
        Fetch SST and wind shear.
        Uses seasonal climatology as baseline with small variance.
        """
        # Seasonal SST baseline for Gulf/Caribbean
        from datetime import datetime
        month = datetime.now().month
        
        # Peak SST in August-September
        seasonal_sst = {
            1: 25.0, 2: 24.5, 3: 25.0, 4: 26.0, 5: 27.5, 6: 28.5,
            7: 29.5, 8: 30.0, 9: 29.5, 10: 28.0, 11: 26.5, 12: 25.5
        }
        
        base_sst = seasonal_sst.get(month, 27.0)
        
        return {
            'sst': base_sst + np.random.randn() * 0.5,
            'wind_shear': 15.0 + np.random.randn() * 5.0,
            'source': 'seasonal_climatology'
        }


# ==========================================
# 🖥️ DASHBOARD
# ==========================================
# ==========================================
# 💰 BETTING STRATEGY
# ==========================================
class BettingStrategy:
    @staticmethod
    def calculate_kelly(prob_percent: float, ask_cents: float, bankroll: float) -> Tuple[float, float, float]:
        """
        Calculate Quarter Kelly bet size.
        Returns: (fraction, amount_dollars, expected_value_roi)
        """
        p = prob_percent / 100.0
        q = 1.0 - p
        b = (100.0 - ask_cents) / ask_cents  # Decimal odds - 1
        
        if b <= 0 or p <= 0:
            return 0.0, 0.0, 0.0
            
        f_star = (b * p - q) / b
        f_safe = f_star * 0.25
        f_final = max(0.0, min(f_safe, 0.10))
        
        amount = f_final * bankroll
        roi = (f_star * b) * 100 
        
        return f_final, amount, roi

# ==========================================
# 🖥️ DASHBOARD
# ==========================================
class Dashboard:
    @staticmethod
    def clear():
        print("\033[H\033[2J", end="")
        sys.stdout.flush()
    
    @staticmethod
    def display(events: List[Dict], model: HurricaneMarkovModel, weather: Dict):
        Dashboard.clear()
        
        utc_now = datetime.now(timezone.utc)
        
        print("🌀 HURRICANE INTENSITY TRACKER (Polymarket)")
        print(f"🕒 {utc_now.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print("─"*95)
        
        # Environmental conditions
        print(f"🌡️  SST: {weather['sst']:.1f}°C | 💨 Wind Shear: {weather['wind_shear']:.1f}kt")
        sst_status = "🔴 RAPID INTENSIFICATION RISK" if weather['sst'] > Config.SST_INTENSIFICATION else \
                    "🟢 WEAKENING LIKELY" if weather['sst'] < Config.SST_WEAKENING_THRESHOLD else \
                    "🟡 NEUTRAL"
        print(f"   CONDITION: {sst_status}")
        print("─"*95)
        
        # Model predictions
        print(f"\n📊 CURRENT STATE: {Config.CATEGORY_NAMES[model.current_state]}")
        print("   12-HR FORECAST (Markov Chain):")
        probs = model.get_landfall_probabilities(steps_to_landfall=2)  # ~12hr with 6hr steps
        
        for cat, prob in probs.items():
            bar_len = int(prob * 40)
            bar = "█" * bar_len
            color = "\033[92m" if prob > 0.3 else "\033[93m" if prob > 0.1 else "\033[90m"
            print(f"   {cat:<10} {color}{prob*100:>5.1f}%\033[0m {bar}")
        
        print("─"*95)
        
        if not events:
            print("⚠️  NO ACTIVE HURRICANE MARKETS FOUND.")
            print("\n💡 Set current state: --state 3  (0=TD, 1=TS, 2-6=Cat1-5)")
            return
        
        # Market analysis
        for event in events:
            try:
                title = event['title']
                print(f"\n🌀 {title[:80]}")
                
                markets = event.get('markets', [])
                market_probs = {}
                
                # Header
                print(f"   {'BUCKET':<15} {'ASK':<6} {'PROB %':<8} {'EDGE':<8} {'KELLY':<8} {'SIZE':<8} {'ACTION'}")
                print(f"   {'──────':<15} {'───':<6} {'──────':<8} {'────':<8} {'─────':<8} {'────':<8} {'──────'}")
                
                # First pass to gather market prices for leakage detection
                parsed_markets = []
                for m in markets:
                    try:
                        name = m.get('groupItemTitle', 'Unknown')
                        prices = json.loads(m.get('outcomePrices', '["0", "0"]'))
                        market_prob = float(prices[0]) * 100
                        market_probs[name] = market_prob
                        parsed_markets.append({'m': m, 'name': name, 'ask': market_prob})
                    except:
                        continue
                
                # Check for leakage globally for this event
                leaks = SpectralLeakageDetector.detect_overpricing(probs, 
                    {k: v/100 for k, v in market_probs.items()})
                
                for pm in parsed_markets:
                    name = pm['name']
                    market_price = pm['ask']
                    
                    # Match model prob
                    model_prob = 0
                    for cat in Config.CATEGORY_NAMES:
                        if cat.lower() in name.lower():
                            model_prob = probs.get(cat, 0) * 100
                            break
                    
                    edge = model_prob - market_price
                    edge_color = "\033[92m" if edge > 0 else "\033[91m"
                    
                    # Calculate Kelly
                    kf, amt, _ = BettingStrategy.calculate_kelly(model_prob, market_price, Config.BANKROLL)
                    
                    # Signal Logic
                    sig = "-"
                    leak_info = leaks.get(name, {})
                    
                    if leak_info.get('is_leak'):
                        sig = "⚡ LEAK" # Spectral Leakage (Overpriced longtail)
                        edge_color = "\033[91m" # Red edge (usually negative)
                    elif edge > 5.0:
                        sig = "🚀 BUY"
                    elif edge < -5.0:
                         sig = "❌ AVOID"
                    
                    k_str = f"{kf*100:.1f}%" if kf > 0 else "-"
                    sz_str = f"${amt:.0f}" if amt > 0 else "-"
                    
                    print(f"   {name:<15} {market_price:>5.1f}¢  {model_prob:>6.1f}%  {edge_color}{edge:>+6.1f}%\033[0m  {k_str:<8} {sz_str:<8} {sig}")
                
            except Exception as e:
                logger.error(f"Error rendering: {e}")

# ==========================================
# 🚀 MAIN
# ==========================================
def main():
    parser = argparse.ArgumentParser(description="Hurricane Intensity Tracker")
    parser.add_argument("--test", action="store_true", help="Run once")
    parser.add_argument("--state", type=int, default=2, help="Current category (0-6)")
    parser.add_argument("--sst", type=float, help="Sea surface temp (°C)")
    parser.add_argument("--shear", type=float, help="Wind shear (kt)")
    args = parser.parse_args()
    
    model = HurricaneMarkovModel()
    model.set_current_state(args.state)
    
    try:
        while True:
            # Get weather data
            weather = HurricaneMarketAPI.get_weather_data()
            
            # Override with args if provided
            if args.sst:
                weather['sst'] = args.sst
            if args.shear:
                weather['wind_shear'] = args.shear
            
            model.update_conditions(weather['sst'], weather['wind_shear'])
            
            events = HurricaneMarketAPI.get_hurricane_markets()
            Dashboard.display(events, model, weather)
            
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
