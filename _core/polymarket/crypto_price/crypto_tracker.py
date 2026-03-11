"""
BTC Price Target Tracker - Polymarket Analytics
Z-Transform Stability Analysis + Clumped Arbitrage

Treats BTC price as a digital signal x[n] and analyzes stability.
"""

import os
import sys
import time
import json
import requests
import logging
import argparse
import numpy as np
import math
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

# ==========================================
# ⚙️ CONFIG
# ==========================================
class Config:
    API_BASE_URL = "https://gamma-api.polymarket.com/events"
    API_HEADERS = {'User-Agent': 'Mozilla/5.0'}
    REFRESH_SECONDS = 600
    BANKROLL = 1000.0
    
    # BTC Price Data Sources
    COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price"
    BINANCE_API = "https://api.binance.com/api/v3/ticker/price"
    
    # Kalman / Projection Parameters
    HORIZON_BARS = 24       # Projection horizon (e.g., 24 hours)
    PROB_TARGET_PCT = 2.0   # Strike Distance (+/- %)
    LOOKBACK_BARS = 10      # Slope lookback
    IGNORE_HURST = False
    SLOPE_MULT = 1.0
    KALMAN_Q = 0.01         # Process Noise
    
    # Legacy Support (if needed)
    STABILITY_WINDOW = 24
    POLE_THRESHOLD = 0.95

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("BTCTracker")

# Windows UTF-8 fix
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# ==========================================
# 🧠 KALMAN & MATH ENGINES
# ==========================================
def calc_hurst(series: List[float], length: int = 100) -> float:
    """
    Calculate Hurst Exponent to determine trend persistence.
    H < 0.5: Mean Reverting
    H > 0.5: Trending
    """
    if len(series) < length:
        return 0.5
    
    # Take last 'length' points
    arr = np.array(series[-length:])
    if len(arr) < 2: return 0.5
    
    # Log returns
    l_ret = np.log(arr[1:] / arr[:-1])
    
    avg = np.mean(l_ret)
    
    sum_dev = 0.0
    max_dev = 0.0
    min_dev = 0.0
    sum_sq_diff = 0.0
    
    loop_count = min(len(l_ret), 49)
    
    for i in range(loop_count):
        diff = l_ret[-(i+1)] - avg
        sum_dev += diff
        max_dev = max(max_dev, sum_dev)
        min_dev = min(min_dev, sum_dev)
        sum_sq_diff += (diff * diff)
        
    R = max_dev - min_dev
    S = math.sqrt(sum_sq_diff / len(l_ret)) if len(l_ret) > 0 else 0
    
    if S == 0 or R == 0:
        return 0.5
    
    return math.log(R / S) / math.log(len(l_ret))

class KalmanAnalyzer:
    """
    Implements 1D Kalman Filter + Hurst Damping for Price Projection.
    Ports logic from 'TSA: Polymarket' Pine Script.
    """
    
    def __init__(self, q: float = 0.01):
        self.q = q
        self.k_est = None      # Estimate
        self.k_err = 1.0       # Error Covariance
        
        self.prices: List[float] = []
        self.estimates: List[float] = []
        
    def add_observation(self, price: float, timestamp: datetime = None):
        self.prices.append(price)
        
        # Initialize if first run
        if self.k_est is None:
            self.k_est = price
            self.estimates.append(price)
            return

        # Kalman Update
        # 1. Prediction (State doesn't change in simple random walk model, P increases)
        self.k_err = self.k_err + self.q
        
        # 2. Update
        k_gain = self.k_err / (self.k_err + 1.0)
        self.k_est = self.k_est + k_gain * (price - self.k_est)
        self.k_err = (1.0 - k_gain) * self.k_err
        
        self.estimates.append(self.k_est)
        
        # Maintain history size
        if len(self.prices) > 500:
            self.prices.pop(0)
            self.estimates.pop(0)
            
    def get_projection_stats(self) -> Dict:
        """
        Calculates Slope, Hurst, and Future Projections.
        Returns dictionary with metrics.
        """
        if len(self.estimates) < Config.LOOKBACK_BARS + 1:
            return {}
            
        current_k = self.k_est
        past_k = self.estimates[-1 - Config.LOOKBACK_BARS]
        
        # Slope
        slope_per_bar = (current_k - past_k) / Config.LOOKBACK_BARS
        
        # Hurst
        h_val = calc_hurst(self.prices, 100)
        hurst_conf = 1.0 if Config.IGNORE_HURST else (0.5 if h_val < 0.5 else 1.0)
        
        # Final Slope
        final_slope = slope_per_bar * Config.SLOPE_MULT * hurst_conf
        
        # Volatility (Std Dev of residuals)
        if len(self.prices) != len(self.estimates):
            min_len = min(len(self.prices), len(self.estimates))
            residuals = np.array(self.prices[-min_len:]) - np.array(self.estimates[-min_len:])
        else:
            residuals = np.array(self.prices) - np.array(self.estimates)
            
        current_vol = np.std(residuals[-50:]) if len(residuals) >= 50 else np.std(residuals)
        
        # Projection 24h
        horizon = Config.HORIZON_BARS
        mu_price = current_k + (final_slope * horizon)
        sigma_future = current_vol * math.sqrt(horizon)
        
        return {
            "current_k": current_k,
            "slope": final_slope,
            "hurst": h_val,
            "vol": current_vol,
            "mu_price": mu_price,
            "sigma_future": sigma_future,
            "horizon": horizon
        }


# ==========================================
# 💰 CLUMPED ARBITRAGE CALCULATOR
# ==========================================
class ClumpedArbitrage:
    """
    Calculates optimal share sizing for payout equalization across buckets.
    
    If you buy multiple adjacent buckets (e.g., $60k-$65k + $65k-$70k),
    you want equal payout regardless of which bucket wins.
    """
    
    @staticmethod
    def calculate_dutch_sizing(buckets: List[Dict], total_bet: float) -> List[Dict]:
        """
        Dutch betting: Size positions inversely proportional to ask price.
        
        If Bucket A costs 10¢ and Bucket B costs 20¢:
        - Bet 2x more shares on A to equalize payouts
        """
        if not buckets:
            return []
        
        # Sum of inverse prices
        inverse_sum = sum(1.0 / b['ask'] for b in buckets if b['ask'] > 0)
        
        if inverse_sum == 0:
            return buckets
        
        result = []
        for b in buckets:
            if b['ask'] > 0:
                weight = (1.0 / b['ask']) / inverse_sum
                allocation = total_bet * weight
                shares = allocation / (b['ask'] / 100.0)  # Convert cents to dollars
                
                result.append({
                    **b,
                    'allocation': allocation,
                    'shares': shares,
                    'payout': shares * 1.0  # $1 per share if win
                })
        
        return result
    
    @staticmethod
    def calculate_roi(buckets: List[Dict], total_cost: float) -> float:
        """ROI for Dutch bet on clumped buckets (one bucket wins)."""
        if not buckets or total_cost == 0:
            return 0
        
        # Dutch betting equalizes payout across buckets
        # Each bucket gets allocation inversely proportional to price
        # When ANY bucket wins, payout = allocation / price * $1
        
        # For Dutch: payout should be equal for all buckets
        # So we use the first bucket's payout as the expected payout
        if buckets[0].get('allocation') and buckets[0]['ask'] > 0:
            expected_payout = buckets[0]['allocation'] / (buckets[0]['ask'] / 100.0)
        else:
            # Fallback: simple average
            avg_price = sum(b['ask'] for b in buckets) / len(buckets)
            expected_payout = total_cost / (avg_price / 100.0)
        
        return (expected_payout - total_cost) / total_cost * 100

# ==========================================
# 🌐 API CLIENT
# ==========================================
class BTCMarketAPI:
    BINANCE_KLINES = "https://api.binance.com/api/v3/klines"
    
    @staticmethod
    def get_btc_price() -> Optional[float]:
        """Fetch current BTC price from Binance."""
        try:
            resp = requests.get(f"{Config.BINANCE_API}?symbol=BTCUSDT", timeout=5)
            data = resp.json()
            return float(data['price'])
        except Exception as e:
            logger.warning(f"Binance API error: {e}")
            
        # Fallback to CoinGecko
        try:
            resp = requests.get(f"{Config.COINGECKO_API}?ids=bitcoin&vs_currencies=usd", timeout=5)
            data = resp.json()
            return data['bitcoin']['usd']
        except Exception as e:
            logger.error(f"All price APIs failed: {e}")
            return None
    
    @staticmethod
    def get_coin_price(coin_id: str) -> Optional[float]:
        """Fetch price for any coin from CoinGecko. coin_id: ethereum, solana, ripple, etc."""
        try:
            resp = requests.get(f"{Config.COINGECKO_API}?ids={coin_id}&vs_currencies=usd", timeout=5)
            data = resp.json()
            return data.get(coin_id, {}).get('usd')
        except Exception as e:
            logger.warning(f"Price fetch failed for {coin_id}: {e}")
            return None
    
    @staticmethod
    def get_historical_prices(symbol: str = "BTCUSDT", interval: str = "1h", limit: int = 24) -> List[float]:
        """Fetch historical OHLCV data from Binance for AR model."""
        try:
            params = {"symbol": symbol, "interval": interval, "limit": limit}
            resp = requests.get(BTCMarketAPI.BINANCE_KLINES, params=params, timeout=10)
            data = resp.json()
            # Return close prices: index 4 is close price
            prices = [float(candle[4]) for candle in data]
            logger.info(f"📊 Loaded {len(prices)} historical prices for Z-transform")
            return prices
        except Exception as e:
            logger.error(f"Historical data error: {e}")
            return []
    
    @staticmethod
    def get_crypto_markets(coins: List[str] = None) -> List[Dict]:
        """Fetch Polymarket crypto price prediction markets for multiple coins."""
        if coins is None:
            coins = ["bitcoin", "ethereum", "solana", "xrp"]
        
        events = []
        seen_ids = set()
        
        # Slug patterns for crypto markets
        import datetime as dt
        today = dt.datetime.now()
        current_month = today.strftime("%B").lower()
        # Next month calculation
        if today.month == 12:
            next_month = "january"
            next_month_year = today.year + 1
        else:
            next_month = (today.replace(day=1) + dt.timedelta(days=32)).strftime("%B").lower()
            next_month_year = today.year
            
        current_year = today.year
        next_year_val = current_year + 1
        
        for coin in coins:
            coin_slugs = [
                # Monthly
                f"{coin}-price-{current_month}",
                f"{coin}-price-{current_month}-{current_year}",
                f"what-price-will-{coin}-hit-in-{current_month}",
                f"what-price-will-{coin}-hit-in-{current_month}-{current_year}",
                
                # Yearly
                f"what-price-will-{coin}-hit-in-{current_year}",
                f"what-price-will-{coin}-hit-in-{next_year_val}",
                f"{coin}-price-{current_year}",
            ]
            
            for slug in coin_slugs:
                try:
                    resp = requests.get(f"{Config.API_BASE_URL}?slug={slug}",
                                       headers=Config.API_HEADERS, timeout=5)
                    data = resp.json()
                    if data and isinstance(data, list):
                        for event in data:
                            if event.get('closed') is False and event['id'] not in seen_ids:
                                events.append(event)
                                seen_ids.add(event['id'])
                                logger.info(f"📊 Found: {event.get('title')}")
                except:
                    pass
        
        # Search by query
        for coin in coins:
            # Broaden queries
            queries = [
                f"{coin} price", 
                f"{coin} above", 
                f"{coin} hit", 
                f"{coin} hit {current_year}",
                f"what price will {coin} hit in {current_year}",
                f"what price will {coin} hit in {next_year_val}"
            ]
            
            for query in queries:
                try:
                    params = {"limit": 20, "closed": "false", "q": query}
                    resp = requests.get(Config.API_BASE_URL, params=params,
                                       headers=Config.API_HEADERS, timeout=5)
                    data = resp.json()
                    
                    for event in data:
                        # Deduplicate
                        if event['id'] in seen_ids:
                            continue
                            
                        # Filter relevant titles
                        title = event.get('title', '').lower()
                        coin_in_title = coin in title
                        is_price_related = any(k in title for k in ['price', 'above', 'hit', 'reach', '>'])
                        
                        if coin_in_title and is_price_related:
                            if event.get('closed') is False:
                                events.append(event)
                                seen_ids.add(event['id'])
                except Exception as e:
                    pass
        
        return events
    
    # Keep old method for backwards compatibility
    @staticmethod
    def get_btc_markets() -> List[Dict]:
        """Fetch Polymarket BTC markets (backwards compatible)."""
        return BTCMarketAPI.get_crypto_markets(["bitcoin"])


# ==========================================
# 🎲 BETTING STRATEGY
# ==========================================
class BettingStrategy:
    @staticmethod
    def calculate_kelly(prob_percent: float, price_cents: float, bankroll: float) -> Tuple[float, float, str]:
        """Calculates Quarter Kelly bet size."""
        if prob_percent <= 0 or price_cents <= 0 or price_cents >= 100:
            return 0.0, 0.0, "-"
            
        p = prob_percent / 100.0
        q = 1.0 - p
        b = (100.0 / price_cents) - 1.0
        
        if b <= 0: return 0.0, 0.0, "NegOdds"
        
        # Kelly: f = (bp - q) / b
        f_star = (b * p - q) / b
        
        if f_star <= 0: return 0.0, 0.0, "NegEV"
        
        # Quarter Kelly for safety
        f = f_star * 0.25
        
        # Max position constraint (e.g. 10%)
        f = min(f, 0.10)
        
        amt = bankroll * f
        return f, amt, "OK"

# ==========================================
# 🖥️ DASHBOARD
# ==========================================
class Dashboard:
    @staticmethod
    def clear():
        print("\033[H\033[2J", end="")
        sys.stdout.flush()
    
    @staticmethod
    def display(btc_price: float, events: List[Dict], analyzer: KalmanAnalyzer):
        Dashboard.clear()
        
        utc_now = datetime.now(timezone.utc)
        stats = analyzer.get_projection_stats()
        
        print("₿  CRYPTO PRICE TARGET ANALYZER (Kalman + Hurst)")
        print("─"*95)
        print(f"🕒 {utc_now.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print(f"💵 BTC PRICE: ${btc_price:,.2f}" if btc_price else "💵 PRICE: N/A")
        
        if stats:
            trend_icon = "↗️" if stats['slope'] > 0 else "↘️"
            print(f"� KALMAN EST: ${stats['current_k']:,.2f} | 🌊 HURST: {stats['hurst']:.3f} ({'Trending' if stats['hurst']>0.5 else 'Mean Rev'})")
            print(f"� PROJ (24h): ${stats['mu_price']:,.2f} (±${stats['sigma_future']*2:,.0f}) | SLOPE: {stats['slope']:.2f}/hr {trend_icon}")
        else:
            print("⏳ INSUFFICIENT DATA FOR PROJECTION")
            
        print("─"*95)
        
        if not events:
            print("⚠️  NO ACTIVE MARKETS FOUND.")
            return
        
        for event in events:
            try:
                title = event['title']
                end_str = event['endDate'].replace('Z', '+00:00')
                end = datetime.fromisoformat(end_str)
                days_left = (end - utc_now).total_seconds() / 86400
                
                if days_left <= 0:
                    continue
                
                # Extract coin name and get current price
                coin_name = "BTC"
                coin_price = btc_price
                title_lower = title.lower()
                if 'ethereum' in title_lower:
                    coin_name = "ETH"
                    coin_price = BTCMarketAPI.get_coin_price("ethereum")
                elif 'solana' in title_lower:
                    coin_name = "SOL"
                    coin_price = BTCMarketAPI.get_coin_price("solana")
                elif 'xrp' in title_lower:
                    coin_name = "XRP"
                    coin_price = BTCMarketAPI.get_coin_price("ripple")
                
                print(f"\n📅 {title[:80]}")
                print(f"   ⏳ Left: {days_left:.2f}d | 💵 {coin_name}: ${coin_price:,.2f}" if coin_price else "")
                
                markets = event.get('markets', [])
                buckets = Dashboard._parse_markets(markets, coin_price)
                
                if not buckets:
                    continue
                
                # Sort by absolute edge and take top 10
                sorted_buckets = sorted(buckets, key=lambda x: abs(x.get('edge', 0)), reverse=True)[:10]
                sorted_buckets.sort(key=lambda x: x['low'])  # Re-sort by price for display
                
                # Header
                print(f"   {'BUCKET':<12} {'ASK':<6} {'PROB %':<8} {'EDGE':<8} {'KELLY':<8} {'SIZE':<8} {'ACTION'}")
                print(f"   {'──────':<12} {'───':<6} {'──────':<8} {'────':<8} {'─────':<8} {'────':<8} {'──────'}")
                
                # Display buckets
                for b in sorted_buckets:
                    # Calculate Kelly
                    kf, amt, _ = BettingStrategy.calculate_kelly(b['model_prob'], b['ask'], Config.BANKROLL)
                    
                    edge_color = "\033[92m" if b.get('edge', 0) > 0 else "\033[91m"
                    sig = "-"
                    
                    if b.get('is_resolved'):
                        sig = "✅ HIT"
                        edge_color = "\033[90m" # Gray
                    elif b.get('contains_current'):
                         sig = "📍 CURR"
                         edge_color = "\033[93m"
                    elif b.get('edge', 0) > 5.0:
                        sig = "🚀 BUY"
                    elif b.get('edge', 0) < -5.0:
                        sig = "❌ AVOID"
                    
                    k_str = f"{kf*100:.1f}%" if kf > 0 else "-"
                    sz_str = f"${amt:.0f}" if amt > 0 else "-"
                    
                    print(f"   {b['name']:<12} {b['ask']:>5.1f}¢  {b['model_prob']:>6.1f}%  {edge_color}{b.get('edge', 0):>+6.1f}%\033[0m  {k_str:<8} {sz_str:<8} {sig}")
                
                # Clumped opportunity
                positive_edge = [b for b in buckets if b.get('edge', 0) > 5]
                if len(positive_edge) >= 2:
                    sized = ClumpedArbitrage.calculate_dutch_sizing(positive_edge, Config.BANKROLL * 0.2) # Use 20% bankroll
                    roi = ClumpedArbitrage.calculate_roi(sized, Config.BANKROLL * 0.2)
                    
                    print(f"\n   📦 CLUMPED OPP (n={len(positive_edge)}) | ROI: \033[92m{roi:+.1f}%\033[0m")
                    print(f"      DUTCH ALLOCATION (Target ${Config.BANKROLL*0.2:.0f}):")
                    for item in sized[:6]:
                        print(f"      - {item['name']:<10}: ${item['allocation']:.2f} (at {item['ask']:.1f}¢)")
                    if len(sized) > 6:
                        print(f"      ... and {len(sized)-6} more")
                    
            except Exception as e:
                logger.error(f"Error rendering: {e}")
    
    @staticmethod
    def _parse_markets(markets: List, current_price: float = None) -> List[Dict]:
        buckets = []
        
        for m in markets:
            try:
                name = m.get('groupItemTitle', 'Unknown')
                prices = json.loads(m.get('outcomePrices', '["0", "0"]'))
                ask = float(prices[0]) * 100
                
                low, high = 0, float('inf')
                is_target_market = False
                is_below = False
                
                try:
                    # Detect direction
                    if '↓' in name or '<' in name:
                        is_below = True
                        
                    # Strip all non-numeric chars except . and -
                    clean = name.replace('$', '').replace(',', '').replace('k', '000')
                    clean = clean.replace('↑', '').replace('↓', '').replace('>', '').replace('<', '').strip()
                    
                    if '-' in clean and len(clean.split('-')) == 2:
                        parts = clean.split('-')
                        low = float(parts[0].strip())
                        high = float(parts[1].strip())
                    elif clean.replace('.','').isdigit():
                        # "hit X" or "above X" market - threshold only
                        val = float(clean)
                        low = val
                        high = float('inf')
                        is_target_market = True
                except:
                    pass
                
                # Logic
                contains_current = False
                is_resolved = False
                
                if is_target_market:
                    if is_below:
                         # "Below X": Resolved if price <= X
                         if current_price and current_price <= low: is_resolved = True
                    else:
                         # "Above/Hit X": Resolved if price >= X
                         if current_price and current_price >= low: is_resolved = True
                    
                    # Check if current price is within 2% of threshold
                    if current_price:
                        distance_pct = abs(current_price - low) / current_price * 100
                        contains_current = distance_pct < 2.0
                else:
                    contains_current = current_price and low <= current_price <= high
                
                # Market probability from ask price
                market_prob = ask
                
                # Model probability based on how far the threshold is from current price
                if is_resolved:
                    model_prob = 0.0 # User requested "0%" for "resoluted" (implied done/ignore)
                elif current_price and low > 0:
                    # Distance from current price to threshold (as % of current)
                    distance_pct = (low - current_price) / current_price * 100
                    
                    # For "hit" markets: probability decreases with distance
                    # Using rough volatility assumption (~2% daily, ~5% weekly)
                    weekly_vol = 5.0  # Approximate weekly volatility
                    
                    # Normal CDF approximation for probability of hitting threshold
                    import math
                    z_score = abs(distance_pct) / weekly_vol
                    # Simplified: p = 50% at 0 distance, drops exponentially
                    model_prob = max(1, min(95, 50 * math.exp(-0.3 * z_score)))
                else:
                    model_prob = market_prob  # No edge if no price data
                
                # Edge = model probability - market probability
                edge = model_prob - market_prob
                
                buckets.append({
                    'name': name,
                    'low': low,
                    'high': high,
                    'ask': ask,
                    'is_resolved': is_resolved,
                    'contains_current': contains_current,
                    'prob': market_prob,
                    'model_prob': model_prob,
                    'edge': edge
                })
            except Exception:
                pass
                
        return buckets

# ==========================================
# 🚀 MAIN
# ==========================================
def main():
    parser = argparse.ArgumentParser(description="BTC Price Target Analyzer")
    parser.add_argument("--test", action="store_true", help="Run once")
    args = parser.parse_args()
    
    analyzer = KalmanAnalyzer(q=Config.KALMAN_Q)
    
    # Pre-load with historical data for proper filter convergence
    historical = BTCMarketAPI.get_historical_prices(limit=300)
    for price in historical:
        analyzer.add_observation(price)
    
    try:
        while True:
            btc_price = BTCMarketAPI.get_btc_price()
            if btc_price:
                analyzer.add_observation(btc_price)

            
            events = BTCMarketAPI.get_crypto_markets()  # Now fetches BTC, ETH, SOL, XRP
            Dashboard.display(btc_price, events, analyzer)
            
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
