import sys
import subprocess
import time
import re
import json
import requests
import random
from datetime import datetime, timezone, timedelta
from scipy.stats import poisson

# FORCE UTF-8 OUTPUT FOR WINDOWS (Safe for Notebooks)
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# ==========================================
# 🖥️ COLOR DEFINITIONS
# ==========================================
class Colors:
    RESET = " [0m"
    GREEN = " [92m"
    RED = " [91m"
    BOLD = " [1m"
    YELLOW = " [93m"
    BLUE = " [34m"

# ==========================================
# 📦 DEPENDENCY CHECK
# ==========================================
def install(package):
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
    except: pass

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    print("⚙️ INSTALLING SELENIUM...")
    install("selenium")
    install("webdriver-manager")
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager

# ==========================================
# 🕵️ REAL SCRAPER (Headless Browser)
# ==========================================
class XTrackerAutomator:
    """
    Automatically launches a headless browser to scrape xtracker.polymarket.com
    Using Microsoft Edge (Built-in on Windows) via Selenium Manager.
    """
    def __init__(self):
        self.url = "https://xtracker.polymarket.com/user/elonmusk"
        self.options = webdriver.EdgeOptions()
        self.options.add_argument("--headless=new") # Run in background
        self.options.add_argument("--disable-gpu")
        self.options.add_argument("--no-sandbox")
        self.options.add_argument("--log-level=3")  # Quiet mode
        self.options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        self.driver = None

    def start(self):
        try:
            # Use Selenium Manager (Built-in to Selenium 4.6+)
            self.driver = webdriver.Edge(options=self.options)
            return True
        except Exception as e:
            print(f"{Colors.RED}❌ BROWSER START FAILED: {e}{Colors.RESET}")
            return False

    def get_live_data(self):
        """
        Scrapes the tracker and returns a list of dicts:
        [{'date_str': 'Jan 24 - Jan 31', 'count': 42}, ...]
        """
        if not self.driver: self.start()
        
        try:
            self.driver.get(self.url)
            # Wait for dynamic content (React/Next.js) to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//div[contains(text(), 'Tweets')]"))
            )
            
            text = self.driver.find_element(By.TAG_NAME, "body").text
            return self._parse_text(text)
        except Exception as e:
            try: self.driver.quit()
            except: pass
            self.driver = None 
            return []

    def _parse_text(self, text):
        results = []
        # Regex to find date ranges like "Jan 24 - Jan 31" or "Feb 01 - Feb 08"
        date_pattern = re.compile(r"([A-Z][a-z]+ \d{1,2}(?:, \d{4})? - [A-Z][a-z]+ \d{1,2}(?:, \d{4})?)")
        
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        for i, line in enumerate(lines):
            match = date_pattern.search(line)
            if match:
                date_str = match.group(1)
                # The count is usually a number on the lines immediately following the date
                for j in range(1, 6):
                    if i + j < len(lines):
                        candidate = lines[i+j].replace(',', '')
                        if candidate.isdigit():
                            results.append({
                                'date_str': date_str,
                                'count': int(candidate)
                            })
                            break
        return results

    def close(self):
        if self.driver: self.driver.quit()

# ==========================================
# 🧠 INTELLIGENCE & API (Polymarket)
# ==========================================
class MarketEngine:
    def __init__(self):
        self.api_url = "https://gamma-api.polymarket.com/events"
        self.headers = {'User-Agent': 'Mozilla/5.0'}

    def get_active_markets(self):
        """Fetches all active Elon Musk Tweet markets from Polymarket."""
        try:
            # Search for "Elon Musk" events
            params = {"limit": 20, "active": "true", "closed": "false", "q": "Elon Musk Tweets"}
            resp = requests.get(self.api_url, params=params, headers=self.headers)
            data = resp.json()
            
            markets = []
            for event in data:
                # Filter for weekly tweet markets
                if "Tweets" not in event['title'] or "202" not in event['title']: continue
                
                # Parse End Date
                end_dt = datetime.fromisoformat(event['endDate'].replace('Z', '+00:00'))
                
                # Extract Buckets (0-19, 20-39, etc)
                buckets = []
                for m in event.get('markets', []):
                    name = m['groupItemTitle']
                    try:
                        # Parse range "20-39" or "60+"
                        low, high = 0, 9999
                        if "-" in name: 
                            p = name.split("-")
                            low, high = int(p[0]), int(p[1])
                        elif "+" in name: 
                            low = int(name[:-1])
                        
                        price = float(json.loads(m['outcomePrices'])[0])
                        buckets.append({'name': name, 'low': low, 'high': high, 'price': price * 100}) # Convert to cents
                    except: continue
                
                buckets.sort(key=lambda x: x['low'])
                
                if buckets:
                    markets.append({
                        'title': event['title'],
                        'slug': event['slug'],
                        'end_date': end_dt,
                        'buckets': buckets,
                        'current_count': 0 # To be filled by scraper
                    })
            return markets
        except Exception as e:
            print(f"{Colors.RED}⚠️ API ERROR: {e}{Colors.RESET}")
            return []

    def match_data(self, markets, scraped_data):
        """Matches scraped counts to markets based on dates."""
        matched = []
        for m in markets:
            m_end = m['end_date']
            best_count = None

            for item in scraped_data:
                # Parse scraped string "Jan 24 - Jan 31"
                try:
                    range_end_str = item['date_str'].split("-")[1].strip() # "Jan 31"
                    
                    # Try to parse date
                    dt = None
                    for fmt in ("%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y"):
                        try:
                            dt = datetime.strptime(range_end_str, fmt).replace(tzinfo=timezone.utc)
                            break
                        except ValueError: pass
                    
                    if not dt:
                        for fmt in ("%b %d", "%B %d"):
                            try:
                                dt = datetime.strptime(range_end_str, fmt).replace(year=m_end.year, tzinfo=timezone.utc)
                                break
                            except ValueError: pass
                    
                    if not dt: continue
                    
                    # Check if dates are close (within 24h)
                    if abs((dt - m_end).days) <= 1:
                        best_count = item['count']
                        break
                except: continue
            
            if best_count is not None:
                m['current_count'] = best_count
            
            # Even if no match found (start of week), include it with 0 or last known
            matched.append(m)
            
        return matched

# ==========================================
# 💰 PORTFOLIO TRACKER
# ==========================================
class MicroPortfolio:
    """
    Manages the trading portfolio, holdings, and cash.
    """
    def __init__(self, start_cash=10.0):
        self.start_cash = start_cash
        self.cash = start_cash
        self.holdings = {}
        self.pid_counter = 0

    def update_live_prices(self, markets):
        """
        Updates the current price of holdings based on live market data.
        """
        for holding in self.holdings.values():
            for m in markets:
                if holding['event'] == m['title']:
                    for bucket in m['buckets']:
                        if holding['bucket'] == bucket['name']:
                            holding['cur_price'] = bucket['price']
                            break
                    break

    def execute(self, event_title, bucket_name, signal, price, edge):
        """
        Executes a trade based on a signal.
        """
        # Unique ID for this specific bet to avoid duplicates
        trade_id = f"{event_title}_{bucket_name}_{signal}"
        
        # Check if we already have this trade
        for h in self.holdings.values():
            if h['id'] == trade_id:
                return

        self.pid_counter += 1
        cost = self.cash * 0.1 # Risk 10% of cash
        if cost < 0.10: cost = 0.10 # Min bet size
        
        if cost > self.cash: return # Not enough cash

        shares = cost / (price / 100)
        self.cash -= cost
        
        self.holdings[self.pid_counter] = {
            'id': trade_id,
            'event': event_title,
            'bucket': bucket_name,
            'type': signal,
            'entry': price,
            'cur_price': price,
            'shares': shares,
            'cost': cost,
        }

    def get_equity(self):
        """
        Calculates the total equity of the portfolio.
        """
        total_value = self.cash
        for holding in self.holdings.values():
            total_value += holding['shares'] * (holding['cur_price'] / 100)
        return total_value

# ==========================================
# 🖥️ VISUAL ENGINE & MAIN LOOP
# ==========================================
class VisualBot:
    def __init__(self, tweet_rate=55.0):
        self.portfolio = MicroPortfolio()
        self.base_rate = tweet_rate
        self.scraper = XTrackerAutomator()
        self.engine = MarketEngine()

    def _render_market_scanner(self, active_events):
        """
        Renders the market scanner table.
        """
        print(f"{Colors.BOLD}📈 ELON MUSK TWEET MARKET SCANNER{Colors.RESET}")
        
        utc_now = datetime.now(timezone.utc)
        
        # Time Logic (Sleep vs Manic)
        h = (utc_now - timedelta(hours=6)).hour # CST approx
        status_txt = "💤 SLEEP" if 3<=h<9 else "🔥 MANIC" if (22<=h or h<2) else "🏢 WORK"
        mult = 1.5 if "MANIC" in status_txt else 0.2 if "SLEEP" in status_txt else 1.0

        for e in active_events:
            count = e.get('current_count', 0)
            days_left = (e['end_date'] - utc_now).total_seconds() / 86400
            
            if days_left <= 0: continue

            # Projection
            proj = int(count + (self.base_rate * mult * days_left))

            print(f"┌────────────────────────────────────────────────────────────────────────────────────────┐")
            print(f"│ 📅 {e['title'][:55]:<55}    ⏳ {days_left:.2f}d  │")
            print(f"│ 🐦 ACTIVE COUNT: \033[1;93m{str(count):<5}\033[0m   👉 PROJ: {str(proj):<5}   (Status: {status_txt}){' '*23}│")
            print(f"├──────────┬──────────┬──────────┬─────────┬─────────────────────────────────────────┤")
            print(f"│ BUCKET   │ MKT PROB │ MY PROB  │ EDGE %  │ STATUS / ACTION                         │")
            print(f"├──────────┼──────────┼──────────┼─────────┼─────────────────────────────────────────┤")

            for b in e['buckets']:
                low, high, price = b['low'], b['high'], b['price']

                # Poisson Calc
                lambda_val = self.base_rate * mult * days_left
                needed_min = max(0, low - count)
                needed_max = max(0, high - count)
                
                # Model Probability
                if high == 9999: # 60+
                    prob = (1 - poisson.cdf(needed_min - 1, lambda_val)) * 100
                else:
                    prob = (poisson.cdf(needed_max, lambda_val) - poisson.cdf(needed_min - 1, lambda_val)) * 100
                
                edge = prob - price

                # --- NEW STATUS LOGIC ---
                status_msg = ""
                status_color = Colors.RESET
                
                # 1. DEAD (Count already passed this bucket)
                if count > high:
                    status_msg = "💀 DEAD"
                    status_color = Colors.RED
                    prob = 0.0 # Force 0 if dead

                # 2. WON (Already in this bucket AND no time left? No, usually 'Won' if checking past markets)
                # But for live markets, if we are IN the bucket, it's "CURRENT LEADER"
                elif low <= count <= high:
                    status_msg = "⭐ CURRENT"
                    status_color = Colors.YELLOW

                # 3. TOO FAR (Impossible rate needed)
                # If we need > 100 tweets/day to reach usage
                elif days_left > 0 and (low - count) / days_left > 120:
                    status_msg = "🏃 TOO FAR"
                    status_color = Colors.RED
                
                # 4. BUY / SELL SIGNALS
                elif edge > 15.0 and price < 85:
                     status_msg = "🚀 BUY YES"
                     status_color = Colors.GREEN
                     self.portfolio.execute(e['title'], b['name'], status_msg, price, abs(edge))

                elif edge < -15.0 and price > 15:
                     status_msg = "❌ BUY NO" 
                     status_color = Colors.RED
                     self.portfolio.execute(e['title'], b['name'], status_msg, price, abs(edge))
                
                else:
                    status_msg = "👀 WAIT"
                    status_color = Colors.BLUE

                ptr = "👉" if low <= proj <= high else "  "
                edge_str = f"{edge:+.1f}%"
                
                # Render Row
                print(f"│ {ptr} {b['name']:<6} │ {price:>6.1f}%  │ {prob:>6.1f}%  │ {status_color}{edge_str:<7}{Colors.RESET} │ {status_color}{status_msg:<39}{Colors.RESET} │")
            print(f"└──────────┴──────────┴──────────┴─────────┴─────────────────────────────────────────┘\n")

    def _render_portfolio(self):
        """
        Renders the portfolio table.
        """
        equity = self.portfolio.get_equity()
        pnl = equity - self.portfolio.start_cash
        pnl_color = Colors.GREEN if pnl >= 0 else Colors.RED

        print(f"{Colors.BOLD}💰 MICRO-PORTFOLIO{Colors.RESET}")
        print(f"┌────────────────────────────────────────────────────────────────────────┐")
        print(f"│ CASH: ${self.portfolio.cash:.2f}  │  EQUITY: ${equity:.2f} ({pnl_color}{pnl:+.2f}{Colors.RESET})   │")
        print(f"├─────────────────────┬──────────┬──────┬───────┬──────────┬─────────────┤")
        print(f"│ EVENT               │ BUCKET   │ TYPE │ ENTRY │ CUR $    │ PnL         │")
        print(f"├─────────────────────┼──────────┼──────┼───────┼──────────┼─────────────┤")

        if not self.portfolio.holdings:
            print(f"│ {'(No positions yet)':^70} │")
        else:
            for pid, h in self.portfolio.holdings.items():
                trade_pnl = (h['shares'] * (h['cur_price']/100)) - h['cost']
                t_color = Colors.GREEN if trade_pnl >= 0 else Colors.RED
                type_short = "YES" if "YES" in h['type'] else "NO"
                print(f"│ {h['event'][:19]:<19} │ {h['bucket']:<8} │ {type_short:^4} │ {h['entry']:>4.1f}¢ │ {h['cur_price']:>4.1f}¢    │ {t_color}${trade_pnl:+.2f}{Colors.RESET}       │")
        
        print(f"└─────────────────────┴──────────┴──────┴───────┴──────────┴─────────────┘")

    def run(self):
        print(f"{Colors.YELLOW}🚀 STARTING ENGINE... (Opening Headless Browser){Colors.RESET}")
        if not self.scraper.start():
            return

        try:
            while True:
                time.sleep(1) # Small buffer
                print(" \033[H\033[J", end="") # Clear Screen

                # 1. Fetch Data
                print(f"{Colors.BLUE}📡 Scraping XTracker...{Colors.RESET}", end="\r")
                scraped = self.scraper.get_live_data()
                
                print(f"{Colors.BLUE}📡 Fetching Polymarket...{Colors.RESET}", end="\r")
                markets = self.engine.get_active_markets()

                # 2. Match Data
                active_events = self.engine.match_data(markets, scraped)

                # 3. Update Portfolio Prices
                self.portfolio.update_live_prices(active_events)

                # 4. Render
                print(" \033[H\033[J", end="") # Clear Again
                print(f"🤖 TWEET ANALYZER BOT | {datetime.now().strftime('%H:%M:%S')}")
                self._render_market_scanner(active_events)
                self._render_portfolio()
                
                print(f"\n{Colors.BOLD}Last updated: {datetime.now().strftime('%H:%M:%S')} (Refreshing in 30s){Colors.RESET}")
                
                # Sleep countdown
                for i in range(30, 0, -1):
                    print(f"Refresh in {i}s...", end="\r")
                    time.sleep(1)

        except KeyboardInterrupt:
            print(f"\n{Colors.RED}🛑 Stopping...{Colors.RESET}")
        finally:
            self.scraper.close()

if __name__ == "__main__":
    bot = VisualBot(tweet_rate=55.0)
    bot.run()
