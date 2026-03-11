"""
Internet Outage Tracker - Polymarket Analytics
MTBF (Mean Time Between Failures) Analysis + Statistical Signal Detection

Models global internet traffic as steady-state signal, outages as HF impulses.
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
from scipy import stats

# ==========================================
# ⚙️ CONFIG
# ==========================================
class Config:
    API_BASE_URL = "https://gamma-api.polymarket.com/events"
    API_HEADERS = {'User-Agent': 'Mozilla/5.0'}
    REFRESH_SECONDS = 300  # 5 minutes
    
    # Historical MTBF Data (in days) - Based on major cloud provider outages
    # Source: Aggregated from AWS, Azure, GCP, Cloudflare incident reports
    HISTORICAL_OUTAGES = [
        # (Provider, Date, Duration_hours, Severity 1-5)
        ("AWS", "2024-06-13", 4.5, 3),
        ("Azure", "2024-07-19", 8.0, 4),
        ("Cloudflare", "2024-04-04", 0.5, 2),
        ("Google", "2024-08-08", 2.0, 2),
        ("AWS", "2023-12-07", 3.0, 3),
        ("Meta", "2024-03-05", 6.0, 5),
        ("Azure", "2023-11-15", 5.0, 3),
        ("Cloudflare", "2024-02-20", 1.0, 2),
        ("Google", "2023-10-25", 4.0, 3),
        ("AWS", "2024-01-31", 2.5, 2),
    ]
    
    # Statistical parameters
    CONFIDENCE_LEVEL = 0.95
    SIGNAL_THRESHOLD_SD = 2.0  # Signal BUY if market is 2 SD below fair value

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("OutageTracker")

# Windows UTF-8 fix
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# ==========================================
# 📊 MTBF ANALYZER
# ==========================================
@dataclass
class OutageEvent:
    provider: str
    date: datetime
    duration_hours: float
    severity: int

class MTBFAnalyzer:
    """
    Analyzes Mean Time Between Failures to calculate fair value
    of outage probability in a given time window.
    
    Uses exponential distribution: P(T > t) = exp(-λt)
    Where λ = 1/MTBF
    """
    
    def __init__(self):
        self.outages: List[OutageEvent] = []
        self._load_historical()
    
    def _load_historical(self):
        """Load historical outage data."""
        from datetime import datetime
        
        for provider, date_str, duration, severity in Config.HISTORICAL_OUTAGES:
            date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            self.outages.append(OutageEvent(
                provider=provider,
                date=date,
                duration_hours=duration,
                severity=severity
            ))
        
        self.outages.sort(key=lambda x: x.date)
    
    def calculate_mtbf(self, severity_threshold: int = 2) -> Tuple[float, float]:
        """
        Calculate MTBF in days for outages above severity threshold.
        
        Returns (mtbf_days, std_dev_days)
        """
        # Filter by severity
        relevant = [o for o in self.outages if o.severity >= severity_threshold]
        
        if len(relevant) < 2:
            return 30.0, 10.0  # Default: ~monthly
        
        # Calculate inter-arrival times
        gaps = []
        for i in range(1, len(relevant)):
            gap = (relevant[i].date - relevant[i-1].date).total_seconds() / 86400
            gaps.append(gap)
        
        mtbf = np.mean(gaps)
        std = np.std(gaps)
        
        return mtbf, std
    
    def calculate_failure_rate(self, severity_threshold: int = 2) -> float:
        """
        Calculate failure rate λ = 1/MTBF (per day).
        """
        mtbf, _ = self.calculate_mtbf(severity_threshold)
        return 1.0 / mtbf if mtbf > 0 else 0.1
    
    def probability_of_outage(self, window_days: float, severity_threshold: int = 2) -> float:
        """
        Probability of at least one outage in the given time window.
        
        Using Poisson approximation:
        P(N >= 1) = 1 - P(N = 0) = 1 - exp(-λ * t)
        """
        lambda_rate = self.calculate_failure_rate(severity_threshold)
        
        # Poisson probability of at least 1 event
        prob = 1 - np.exp(-lambda_rate * window_days)
        
        return prob
    
    def get_fair_value(self, window_days: float, severity: int = 3) -> Tuple[float, float, float]:
        """
        Calculate fair value and confidence interval for outage market.
        
        Returns (fair_value_cents, lower_bound, upper_bound)
        """
        prob = self.probability_of_outage(window_days, severity)
        
        # Convert to cents (market price)
        fair_value = prob * 100
        
        # Confidence interval using Beta distribution
        # Assume we've seen k successes (outages) in n periods
        k = len([o for o in self.outages if o.severity >= severity])
        n = (datetime.now(timezone.utc) - self.outages[0].date).days / window_days if self.outages else 1
        
        alpha = k + 1
        beta = n - k + 1
        
        try:
            lower = stats.beta.ppf(0.025, alpha, beta) * 100
            upper = stats.beta.ppf(0.975, alpha, beta) * 100
        except:
            lower = fair_value * 0.5
            upper = min(100, fair_value * 1.5)
        
        return fair_value, lower, upper

# ==========================================
# 🚨 SIGNAL DETECTOR
# ==========================================
class SignalDetector:
    """
    Detects BUY/SELL signals based on statistical deviation from fair value.
    """
    
    @staticmethod
    def analyze(market_price: float, fair_value: float, 
                lower_bound: float, upper_bound: float) -> Dict:
        """
        Analyze market price vs fair value.
        
        BUY signal if market is significantly below fair value.
        SELL signal if market is significantly above fair value.
        """
        # Standard deviation approximation
        std = (upper_bound - lower_bound) / 4  # ~95% CI
        
        if std == 0:
            std = fair_value * 0.2
        
        # Z-score
        z_score = (market_price - fair_value) / std if std > 0 else 0
        
        # Trading signal
        if z_score < -Config.SIGNAL_THRESHOLD_SD:
            signal = "🟢 STRONG BUY"
            action = "BUY"
            rationale = f"Market {abs(z_score):.1f}σ below fair value"
        elif z_score < -1:
            signal = "🟡 BUY"
            action = "BUY"
            rationale = f"Market {abs(z_score):.1f}σ below fair value"
        elif z_score > Config.SIGNAL_THRESHOLD_SD:
            signal = "🔴 STRONG SELL"
            action = "SELL"
            rationale = f"Market {z_score:.1f}σ above fair value"
        elif z_score > 1:
            signal = "🟠 SELL"
            action = "SELL"
            rationale = f"Market {z_score:.1f}σ above fair value"
        else:
            signal = "⚪ HOLD"
            action = "HOLD"
            rationale = "Within normal range"
        
        edge = fair_value - market_price
        
        return {
            'signal': signal,
            'action': action,
            'z_score': z_score,
            'edge': edge,
            'rationale': rationale
        }

# ==========================================
# 🌐 API CLIENT
# ==========================================
class OutageMarketAPI:
    @staticmethod
    def get_outage_markets() -> List[Dict]:
        """Fetch Polymarket internet/cloud outage markets."""
        events = []
        seen_ids = set()
        
        queries = ["internet outage", "AWS", "Azure", "cloud outage", 
                   "google down", "cloudflare", "major outage"]
        
        for query in queries:
            try:
                params = {"limit": 50, "closed": "false", "q": query}
                resp = requests.get(Config.API_BASE_URL, params=params,
                                   headers=Config.API_HEADERS, timeout=10)
                data = resp.json()
                
                for event in data:
                    title = event.get('title', '').lower()
                    keywords = ['outage', 'down', 'failure', 'crash', 'offline']
                    if any(kw in title for kw in keywords):
                        if event.get('closed') is False and event['id'] not in seen_ids:
                            events.append(event)
                            seen_ids.add(event['id'])
            except Exception as e:
                logger.error(f"API error ({query}): {e}")
        
        return events

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
    def display(events: List[Dict], analyzer: MTBFAnalyzer):
        Dashboard.clear()
        
        utc_now = datetime.now(timezone.utc)
        
        # MTBF Statistics
        mtbf, std = analyzer.calculate_mtbf(severity_threshold=3)
        lambda_rate = analyzer.calculate_failure_rate(severity_threshold=3)
        
        print("🌐 INTERNET OUTAGE PROBABILITY TRACKER (Polymarket)")
        print("─"*95)
        print(f"🕒 {utc_now.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print(f"📊 MTBF: {mtbf:.1f} ± {std:.1f} days | λ (Failure Rate): {(lambda_rate*30):.2f}/month")
        print("─"*95)
        
        if not events:
            print("\n⚠️  NO ACTIVE OUTAGE MARKETS FOUND.")
            return
        
        # Market analysis
        for event in events:
            try:
                title = event['title']
                end_str = event['endDate'].replace('Z', '+00:00')
                end = datetime.fromisoformat(end_str)
                days_left = (end - utc_now).total_seconds() / 86400
                
                if days_left <= 0:
                    continue
                
                # Calculate fair value for this window
                fv, low, high = analyzer.get_fair_value(max(days_left, 1), severity=3)
                
                print(f"\n📅 {title[:80]}")
                print(f"   ⏳ Window: {days_left:.1f}d | 📊 Fair Value: {fv:.1f}¢ (CI: {low:.1f}-{high:.1f}¢)")
                
                markets = event.get('markets', [])
                
                # Header
                print(f"   {'BUCKET':<20} {'ASK':<6} {'PROB %':<8} {'EDGE':<8} {'KELLY':<8} {'SIZE':<8} {'ACTION'}")
                print(f"   {'──────':<20} {'───':<6} {'──────':<8} {'────':<8} {'─────':<8} {'────':<8} {'──────'}")
                
                for m in markets:
                    try:
                        name = m.get('groupItemTitle', 'Unknown')
                        prices = json.loads(m.get('outcomePrices', '["0", "0"]'))
                        market_price = float(prices[0]) * 100
                        
                        # Determine Fair Value for this outcome
                        if 'yes' in name.lower() or 'outage' in name.lower() or 'over' in name.lower():
                            target_fv = fv
                        else:
                            # "No" / "Under"
                            target_fv = 100 - fv
                        
                        edge = target_fv - market_price
                        edge_color = "\033[92m" if edge > 0 else "\033[91m"
                        
                        # Calculate Kelly
                        kf, amt, _ = BettingStrategy.calculate_kelly(target_fv, market_price, Config.BANKROLL)
                        
                        # Signal Logic (using Z-score proxy from edge)
                        sig = "-"
                        if edge > 5.0:
                            sig = "🚀 BUY"
                        elif edge < -5.0:
                             sig = "❌ AVOID"
                        elif abs(edge) < 2.0:
                             sig = "📍 FAIR"
                        
                        k_str = f"{kf*100:.1f}%" if kf > 0 else "-"
                        sz_str = f"${amt:.0f}" if amt > 0 else "-"
                        
                        print(f"   {name:<20} {market_price:>5.1f}¢  {target_fv:>6.1f}%  {edge_color}{edge:>+6.1f}%\033[0m  {k_str:<8} {sz_str:<8} {sig}")
                        
                    except:
                        continue
                
            except Exception as e:
                logger.error(f"Error rendering: {e}")

# ==========================================
# 🚀 MAIN
# ==========================================
def main():
    parser = argparse.ArgumentParser(description="Internet Outage Probability Tracker")
    parser.add_argument("--test", action="store_true", help="Run once")
    args = parser.parse_args()
    
    analyzer = MTBFAnalyzer()
    
    try:
        while True:
            events = OutageMarketAPI.get_outage_markets()
            Dashboard.display(events, analyzer)
            
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
