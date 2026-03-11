class PolicyKalmanFilter:
    def __init__(self, initial_rate: float):    
        self.x = initial_rate  # State estimate
        self.P = 0.5           # Uncertainty
        self.Q = Config.PROCESS_NOISE      # Process noise
        self.R = Config.MEASUREMENT_NOISE  # Measurement noise
        self.observations: List[Tuple[datetime, float, float]] = []  # (time, obs, filtered)
    
    def predict(self):
        """Time update (prior)."""
        # Random walk: x stays same, uncertainty grows
        self.P = self.P + self.Q
    
    def update(self, market_rate: float):
        """Measurement update (posterior)."""
        # Kalman gain
        K = self.P / (self.P + self.R)
        
        # Update estimate
        self.x = self.x + K * (market_rate - self.x)
        
        # Update uncertainty
        self.P = (1 - K) * self.P
        
        # Store observation
        self.observations.append((
            datetime.now(timezone.utc),
            market_rate,
            self.x
        ))
        
        # Keep history bounded
        if len(self.observations) > 100:
            self.observations.pop(0)
    
    def get_filtered_rate(self) -> Tuple[float, float]:
        """Returns (filtered_rate, uncertainty)."""
        return self.x, np.sqrt(self.P)
    
    def get_noise_estimate(self, market_rate: float) -> float:
        """Estimate of noise in current market reading."""
        return abs(market_rate - self.x)

# ==========================================
# 🌐 API CLIENT
# ==========================================
class FedMarketAPI:
    @staticmethod
    def get_fed_markets() -> List[Dict]:
        """Fetch Polymarket Fed rate markets."""
        events = []
        seen_ids = set()
        
        # Expanded search queries - user-provided keywords
        queries = [
            "Fed Rate cuts", "Fed decision", "FOMC", "Federal Reserve",
            "interest rate", "rate cut", "rate hike", "Powell"
        ]
        
        # First try direct slug-based fetch
        fed_slugs = [
            "fed-decision-in-january",
            "fed-decision-in-march", 
            "fed-decision-in-may",
            "fed-decision-in-june",
            "fomc"
        ]
        
        for slug in fed_slugs:
            try:
                resp = requests.get(f"{Config.API_BASE_URL}?slug={slug}",
                                   headers=Config.API_HEADERS, timeout=10)
                data = resp.json()
                if data and isinstance(data, list) and len(data) > 0:
                    for event in data:
                        if event.get('closed') is False and event['id'] not in seen_ids:
                            events.append(event)
                            seen_ids.add(event['id'])
                            logger.info(f"📊 Found: {event.get('title')}")
            except Exception as e:
                pass
        
        # Also search by query as fallback
        for query in queries:
            try:
                params = {"limit": 50, "closed": "false", "q": query}
                resp = requests.get(Config.API_BASE_URL, params=params,
                                   headers=Config.API_HEADERS, timeout=10)
                data = resp.json()
                
                for event in data:
                    title = event.get('title', '').lower()
                    if ('fed' in title or 'fomc' in title) and 'decision' in title:
                        if event.get('closed') is False and event['id'] not in seen_ids:
                            events.append(event)
                            seen_ids.add(event['id'])
            except Exception as e:
                logger.error(f"API error ({query}): {e}")
        
        return events

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
            
        # Full Kelly f = (bp - q) / b
        f_star = (b * p - q) / b
        
        # Quarter Kelly for safety
        f_safe = f_star * 0.25
        
        # Cap at 10% of bankroll per bet
        f_final = max(0.0, min(f_safe, 0.10))
        
        amount = f_final * bankroll
        roi = (f_star * b) * 100 # Approx edge
        
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
    def display(events: List[Dict], data: EconomicData, 
                pid: FedPIDController, kalman: PolicyKalmanFilter):
        Dashboard.clear()
        
        utc_now = datetime.now(timezone.utc)
        
        print("🏛️  FED RATE DECISION ANALYZER (Polymarket)")
        print("─"*95)
        print(f"🕒 {utc_now.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print(f"💵 FFR (Effective): {data.fed_funds_rate:.2f}%")
        print(f"📊 INFLATION GAP: {data.get_inflation_gap():+.1f}% | 📈 CPI (YoY): {data.get_current_inflation():.1f}%")
        print("─"*95)
        
        # PID Controller Output
        rate_change, direction = pid.calculate_policy_signal()
        implied_rate = pid.get_implied_rate()
        
        print(f"🎛️  PID MODEL: {rate_change:+.0f}bps ({direction}) | Implied Rate: {implied_rate:.2f}%")
        
        if not events:
            print("\n⚠️  NO ACTIVE FED MARKETS FOUND.")
            return
        
        # Market Analysis
        for event in events:
            try:
                title = event['title']
                end_str = event['endDate'].replace('Z', '+00:00')
                end = datetime.fromisoformat(end_str)
                days_left = (end - utc_now).total_seconds() / 86400
                
                if days_left <= 0:
                    continue
                
                print(f"\n📅 {title[:80]}")
                print(f"   ⏳ Decision in: {days_left:.1f} days")
                
                markets = event.get('markets', [])
                buckets = Dashboard._parse_markets(markets)
                
                # Header
                print(f"   {'BUCKET':<15} {'ASK':<6} {'PROB %':<8} {'EDGE':<8} {'KELLY':<8} {'SIZE':<8} {'ACTION'}")
                print(f"   {'──────':<15} {'───':<6} {'──────':<8} {'────':<8} {'─────':<8} {'────':<8} {'──────'}")
                
                for b in buckets:
                    # Model probability based on PID signal
                    model_prob = Dashboard._calculate_model_prob(b, rate_change)
                    
                    # Basic edge calculation
                    # Edge = Model Prob - Market Prob (if buying YES)
                    # But wait, market prob is ask/100? Close enough.
                    market_prob = b['prob']
                    edge = model_prob - market_prob
                    
                    # Store for sorting/logic
                    b['edge'] = edge
                    b['model_prob'] = model_prob
                    
                    # Calculate Kelly
                    kf, amt, _ = BettingStrategy.calculate_kelly(model_prob, b['prob'], Config.BANKROLL)
                    
                    edge_color = "\033[92m" if edge > 0 else "\033[91m"
                    
                    # Define Action
                    # Logic: If Edge > 5% -> Buy. If Edge < -5% -> Avoid (or Sell if we supported that)
                    # For Fed Rates, buckets like "No Change", "-25bps".
                    # We need to map 'rate_change' to bucket names to flag 'CURR'.
                    # E.g. rate_change = -25. Bucket "-25bps" is CURR/Target.
                    
                    sig = "-"
                    if edge > 5.0:
                        sig = "🚀 BUY"
                    elif edge < -5.0:
                         sig = "❌ AVOID"
                    
                    # Check if this bucket matches the model prediction exactly
                    # Simpler heuristic: If model_prob is the highest
                    
                    k_str = f"{kf*100:.1f}%" if kf > 0 else "-"
                    sz_str = f"${amt:.0f}" if amt > 0 else "-"
                    
                    print(f"   {b['name']:<15} {b['prob']:>5.1f}¢  {model_prob:>6.1f}%  {edge_color}{edge:>+6.1f}%\033[0m  {k_str:<8} {sz_str:<8} {sig}")
                
            except Exception as e:
                logger.error(f"Error rendering: {e}")

    @staticmethod
    def _parse_markets(markets: List) -> List[Dict]:
        buckets = []
        for m in markets:
            try:
                name = m.get('groupItemTitle', 'Unknown')
                prices = json.loads(m.get('outcomePrices', '["0", "0"]'))
                prob = float(prices[0]) * 100 # This is effectively Ask price in cents
                
                buckets.append({
                    'name': name,
                    'prob': prob # Storing as 'prob' but treated as price/ask
                })
            except:
                continue
        return buckets
    
    @staticmethod
    def _extract_market_rates(event: Dict) -> List[Dict]:
        """Extract rate+probability pairs from market."""
        results = []
        markets = event.get('markets', [])
        
        for m in markets:
            try:
                name = m.get('groupItemTitle', '').lower()
                prices = json.loads(m.get('outcomePrices', '["0", "0"]'))
                prob = float(prices[0]) * 100
                
                # Parse rate from name
                rate = 5.25  # Default
                if '-' in name:
                    # "5.00-5.25" format
                    parts = name.replace('%', '').split('-')
                    rate = (float(parts[0]) + float(parts[1])) / 2
                elif 'cut' in name:
                    rate = 5.0
                elif 'hike' in name:
                    rate = 5.5
                
                results.append({'rate': rate, 'prob': prob})
            except:
                continue
        
        return results
    
    @staticmethod
    def _calculate_model_prob(bucket: Dict, rate_signal: float) -> float:
        """Calculate model probability based on PID signal."""
        name = bucket['name'].lower()
        
        # Map PID signal to outcome probabilities
        if 'cut' in name:
            # Probability of cut increases when signal is negative
            if rate_signal < -25:
                return 80.0
            elif rate_signal < -10:
                return 50.0
            elif rate_signal < 0:
                return 30.0
            else:
                return 10.0
        
        elif 'hike' in name or 'raise' in name:
            # Probability of hike increases when signal is positive
            if rate_signal > 25:
                return 70.0
            elif rate_signal > 10:
                return 40.0
            elif rate_signal > 0:
                return 20.0
            else:
                return 5.0
        
        elif 'hold' in name or 'no change' in name:
            # Hold is likely when signal is near zero
            if abs(rate_signal) < 10:
                return 70.0
            elif abs(rate_signal) < 20:
                return 40.0
            else:
                return 20.0
        
        return bucket['prob']  # Default to market

# ==========================================
# 🚀 MAIN
# ==========================================
def main():
    parser = argparse.ArgumentParser(description="Fed Rate Decision Analyzer")
    parser.add_argument("--test", action="store_true", help="Run once")
    parser.add_argument("--cpi", type=float, help="Override CPI value")
    args = parser.parse_args()
    
    # Initialize models
    data = EconomicData()
    if args.cpi:
        data.cpi[-1] = args.cpi
    
    pid = FedPIDController(data)
    kalman = PolicyKalmanFilter(data.fed_funds_rate)
    
    try:
        while True:
            events = FedMarketAPI.get_fed_markets()
            
            # Update Kalman filter with market data
            if events:
                market_rates = Dashboard._extract_market_rates(events[0])
                if market_rates:
                    weighted_rate = sum(r['prob'] * r['rate'] for r in market_rates) / 100
                    kalman.predict()
                    kalman.update(weighted_rate)
            
            Dashboard.display(events, data, pid, kalman)
            
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
