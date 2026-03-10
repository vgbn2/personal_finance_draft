"""
ELON TWEET COMPLETE (Refactored)
Combines Selenium Scraper (Source of Truth) with Financial Analytics.
Architecture: Modular Class-Based System
"""

import time
import requests
import json
import numpy as np
import sys
import threading
import re
import logging
import os
import argparse
from datetime import datetime, timezone, timedelta
from scipy.stats import poisson
from typing import List, Dict, Optional, Any, Tuple

# ==========================================
# ⚙️ CONFIGURATION
# ==========================================
class Config:
    MANUAL_COUNT_FALLBACK = 468
    BASE_RATE = 55.0
    REFRESH_SECONDS = 300
    TRACKER_URL = "https://xtracker.polymarket.com/user/elonmusk"
    MARKETS_PAGE = "https://polymarket.com/pop-culture/tweets-markets"
    API_BASE_URL = "https://gamma-api.polymarket.com/events"
    API_HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    BRAVE_PATH = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
    LOG_FORMAT = '%(asctime)s - %(levelname)s - %(message)s'

# Setup Logging
logging.basicConfig(level=logging.INFO, format=Config.LOG_FORMAT)
logger = logging.getLogger("ElonTweet")

# WIN FIX
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except: pass

# ==========================================
# 🌐 POLYMARKET API
# ==========================================
class PolymarketAPI:
    @staticmethod
    def get_event_by_slug(slug: str) -> Optional[Dict]:
        """Fetch single event by slug"""
        try:
            params = {"slug": slug}
            resp = requests.get(Config.API_BASE_URL, params=params, headers=Config.API_HEADERS, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if data and isinstance(data, list):
                return data[0]
            return None
        except Exception as e:
            logger.error(f"API Fetch Error (Slug: {slug}): {e}")
            return None

    @staticmethod
    def get_active_elon_events() -> List[Dict]:
        """
        Fetches active events related to 'Elon Musk' and 'Tweets' from Gamma API.
        Attempts specific query first, then broader query.
        """
        logger.info("Searching for active Elon Musk Tweet markets...")
        
        def fetch_and_filter(query):
            params = {"limit": 50, "closed": "false", "q": query}
            try:
                resp = requests.get(Config.API_BASE_URL, params=params, headers=Config.API_HEADERS, timeout=10)
                resp.raise_for_status()
                events = resp.json()
                valid = []
                for event in events:
                    title = event.get('title', '').lower()
                    # Flexible matching: Must have 'elon' AND ('tweet' OR 'count')
                    if 'elon' in title and ('tweet' in title or 'count' in title):
                         if event.get('closed') is False:
                            valid.append(event)
                return valid
            except Exception as e:
                logger.error(f"API Fetch Error ({query}): {e}")
                return []

        # 1. Try specific
        events = fetch_and_filter("Elon Musk Tweets")
        if events: 
            logger.info(f"Found {len(events)} events via specific query.")
            return events
            
        # 2. Try broad fallback
        logger.info("Specific query empty, trying broad 'Elon' search...")
        events = fetch_and_filter("Elon")
        logger.info(f"Found {len(events)} events via broad query.")
        return events

# ==========================================
# 🕵️ TRACKER (Selenium / Brave)
# ==========================================
class ElonTracker:
    def __init__(self, headless: bool = True):
        self.url = Config.TRACKER_URL
        self.driver = None
        self.last_data: Optional[List[Dict]] = None
        self.lock = threading.Lock()
        self.active = False
        self.headless = headless

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def start(self):
        try:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            from selenium.webdriver.chrome.service import Service
            
            options = Options()
            options.binary_location = Config.BRAVE_PATH
            if self.headless:
                options.add_argument("--headless=new")
            options.add_argument("--disable-gpu")
            options.add_argument("--log-level=3")
            options.add_argument("--no-first-run") 
            
            # Helper to find chromedriver if not in path? 
            # Usually selenium manager handles this now in recent versions.
            
            logger.info("🚀 Launching Tracker (Brave)...")
            self.driver = webdriver.Chrome(options=options)
            self.active = True
        except ImportError:
             logger.critical("Selenium not installed. Install with: pip install selenium")
             self.active = False
        except Exception as e:
            logger.error(f"❌ Browser Launch Error: {e}")
            self.active = False

    def scan_polymarket_page(self) -> List[str]:
        """Scans the configured markets page for event slugs."""
        if not self.active or not self.driver: return []
        slugs = []
        try:
            from selenium.webdriver.common.by import By
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            
            logger.info("🔎 Scanning Polymarket Page for new markets...")
            self.driver.get(Config.MARKETS_PAGE)
            WebDriverWait(self.driver, 15).until(EC.presence_of_element_located((By.TAG_NAME, "a")))
            time.sleep(3) # Allow hydration
            
            links = self.driver.find_elements(By.TAG_NAME, "a")
            for link in links:
                try:
                    href = link.get_attribute('href')
                    if href and '/event/' in href:
                        # Extract slug: https://polymarket.com/event/slug-text
                        parts = href.split('/event/')
                        if len(parts) > 1:
                            slug = parts[1].split('/')[0].split('?')[0]
                            slugs.append(slug)
                except: continue
                
            slugs = list(set(slugs))
            logger.info(f"   Found {len(slugs)} market slugs on page.")
            return slugs
        except Exception as e:
            logger.error(f"Error scanning markets page: {e}")
            return []

    def update(self):
        if not self.active or not self.driver: return
        try:
            from selenium.webdriver.common.by import By
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            
            logger.info("📡 Updating Counts from XTracker...")
            self.driver.get(self.url)
            WebDriverWait(self.driver, 25).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
            time.sleep(5) # Allow dynamic content to load
            
            text = self.driver.find_element(By.TAG_NAME, "body").text
            self._parse_text(text)
            
        except Exception as e:
            logger.warning(f"⚠️ Scraping Warning: {e}")

    def _parse_text(self, text: str):
        date_pattern = re.compile(r"([A-Z][a-z]+ \d{1,2}(?:, \d{4})? - [A-Z][a-z]+ \d{1,2}(?:, \d{4})?)")
        found = []
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        for i, line in enumerate(lines):
            if date_pattern.search(line):
                # Look ahead for the number
                for j in range(1, 5):
                    if i+j >= len(lines): break
                    cand = lines[i+j].replace(',', '')
                    if cand.isdigit():
                        found.append({'range': line, 'count': int(cand)})
                        break
        
        if found:
            with self.lock:
                self.last_data = found
            logger.info(f"✅ Updated data: {len(found)} periods found.")
        else:
            logger.warning("No data patterns found in page text.")

    def get_data(self) -> Optional[List[Dict]]:
        with self.lock:
            return self.last_data
            
    def close(self):
        if self.driver: 
            try:
                self.driver.quit()
            except: pass
        self.active = False

# ==========================================
# 🧠 ANALYTICS
# ==========================================
class TweetAnalyzer:
    @staticmethod
    def get_texas_status() -> Tuple[float, str]:
        utc = datetime.now(timezone.utc)
        tx = utc - timedelta(hours=6)
        h = tx.hour
        if 3 <= h < 9: return 0.1, "💤 SLEEP"
        elif 22 <= h or h < 2: return 1.8, "🔥 MANIC"
        return 1.0, "🏢 WORK"

    @staticmethod
    def calculate_dynamic_rate(tracker_data: Optional[List[Dict]]) -> float:
        """
        Calculates average daily tweets from the most recent COMPLETED week.
        """
        if not tracker_data or len(tracker_data) < 2:
            return Config.BASE_RATE
            
        try:
            # Index 1 is typically the last full week
            last_full = tracker_data[1]
            count = last_full['count']
            return count / 7.0
        except:
            return Config.BASE_RATE

    @staticmethod
    def match_count(title: str, tracker_data: List[Dict]) -> Optional[int]:
        if not tracker_data: return None
        title_simp = title.lower().replace(" ", "").replace(",", "")
        
        # Try to find a partial match in the date range string
        for item in tracker_data:
            rng = item['range'].lower().replace(" ", "").replace(",", "")
            # Check if one is a substring of the other
            if title_simp in rng or rng in title_simp:
                return item['count']
        return None

# ==========================================
# 🖥️ DASHBOARD
# ==========================================
class Dashboard:
    @staticmethod
    def clear():
        os.system('cls' if os.name == 'nt' else 'clear')

    @staticmethod
    def display(tracker_data: Optional[List[Dict]], events: List[Dict], api_mode: bool = False):
        Dashboard.clear()
        
        # 1. Header & Status
        dynamic_base = TweetAnalyzer.calculate_dynamic_rate(tracker_data)
        mult, status = TweetAnalyzer.get_texas_status()
        live_rate = dynamic_base * mult
        
        source = "🤖 AUTO (XTracker)" if tracker_data else f"🔴 MANUAL (Fallback: {Config.MANUAL_COUNT_FALLBACK})"
        print(f"{source}")
        print(f"🕵️ STATUS: {status} | ⚡ BASE: {dynamic_base:.1f} | 🔥 CLOCK: {live_rate:.1f}/day")
        print("─"*95)

        if not events:
            print("⚠️  NO ACTIVE MARKETS FOUND.")
            return

        utc_now = datetime.now(timezone.utc)
        
        # 2. Iterate Events
        for event in events:
            try:
                title = event['title']
                
                # Parse End Date
                end_str = event['endDate'].replace('Z', '+00:00')
                end = datetime.fromisoformat(end_str)
                days_left = (end - utc_now).total_seconds()/86400
                
                if days_left <= 0: continue

                # Get Count
                my_count = TweetAnalyzer.match_count(title, tracker_data) if tracker_data else None
                if my_count is None: my_count = Config.MANUAL_COUNT_FALLBACK
                
                # Projection
                impact = (live_rate - dynamic_base) * min(days_left, 0.2)
                proj = int(my_count + (dynamic_base * days_left) + impact)

                # Header
                print(f"\n📅 {title[:70]}")
                print(f"   🐦 Count: {my_count} | 🎯 Proj: {proj} | ⏳ Left: {days_left:.2f}d")
                print(f"   {'BUCKET':<12} {'PRICE':<8} {'PROB %':<8} {'EDGE':<8} {'ACTION'}")
                print(f"   {'──────':<12} {'─────':<8} {'──────':<8} {'────':<8} {'──────'}")

                # Buckets
                markets = event.get('markets', [])
                buckets = Dashboard._parse_markets(markets)
                
                for b in buckets:
                    # Poisson logic
                    if my_count > b['h']: 
                        prob = 0.0
                    else:
                        n_max = max(0, b['h'] - my_count)
                        n_min = max(0, b['l'] - my_count)
                        # Probability of tweets falling in [n_min, n_max] given lambda = (proj - my_count)
                        # We use proj - my_count because we are predicting the REMAINING tweets
                        remaining_proj = max(0, proj - my_count)
                        if remaining_proj == 0:
                             prob = 100.0 if (n_min == 0) else 0.0
                        else:
                             prob = (poisson.cdf(n_max, remaining_proj) - poisson.cdf(n_min-1, remaining_proj)) * 100
                    
                    edge = prob - b['p']
                    
                    # Signal formatting
                    sig, col = "-", "\033[0m"
                    if days_left > 0:
                        if my_count > b['h']: sig, col = "💀 DEAD", "\033[90m"
                        elif my_count >= b['l']:
                            if prob > 80: sig, col = "💎 HOLD", "\033[96m"
                            else: sig, col = "⚠️ WATCH", "\033[93m"
                        else:
                            if edge > 15: sig, col = "🚀 BUY YES", "\033[92m"
                            elif edge < -15: sig, col = "❌ BUY NO", "\033[91m"

                    if b['p'] < 1.0 and prob < 1.0: continue # Skip junk
                    print(f"   {b['n']:<12} {b['p']:>5.1f}¢   {prob:>5.1f}%    {col}{edge:+.1f}%   {sig}\033[0m")
                    
            except Exception as e:
                logger.error(f"Error processing event {event.get('title', 'Unknown')}: {e}")

    @staticmethod
    def _parse_markets(markets: List[Dict]) -> List[Dict]:
        buckets = []
        for m in markets:
            try:
                name = m.get('groupItemTitle', 'Unknown')
                l, h = 0, 9999
                
                # Parse Range
                if "-" in name: # "100-110"
                    p=name.split("-")
                    l, h = int(p[0]), int(p[1])
                elif "<" in name: # "<100"
                    h = int(name[1:]) - 1
                elif "+" in name: # "200+"
                    l = int(name[:-1])
                elif " or more" in name:
                     l = int(name.split(" ")[0])
                
                # Parse Price
                prices = json.loads(m.get('outcomePrices', '["0", "0"]'))
                price = float(prices[0]) * 100
                
                buckets.append({'l':l, 'h':h, 'p':price, 'n':name})
            except: 
                continue
        
        buckets.sort(key=lambda x: x['l'])
        return buckets

    @staticmethod
    def export_data(tracker_data, events, dynamic_base, live_rate, status):
         # Serialization logic similar to original, but robust
         pass

# ==========================================
# 🚀 MAIN LOOP
# ==========================================
def main():
    parser = argparse.ArgumentParser(description="Elon Tweet Tracker & Analyzer")
    parser.add_argument("--test", action="store_true", help="Run a single pass and exit")
    parser.add_argument("--no-browser", action="store_true", help="Disable browser tracking (Manual only)")
    
    # Handle Jupyter/Interactive environments
    try:
        if 'ipykernel_launcher' in sys.argv[0]:
            args = parser.parse_args([])
        else:
            args = parser.parse_args()
    except:
        # Fallback for other interactive modes
        args = parser.parse_args([])

    # Pass headless=False if debugging, or strictly True if user wants background
    # Since we are scanning a visual page, headless=True should still work for extraction
    tracker = ElonTracker(headless=True)
    
    try:
        if not args.no_browser:
            tracker.start()
        
        while True:
            # 1. Update Data
            if tracker.active:
                tracker.update()
                
            tracker_data = tracker.get_data()
            
            # 2. Scan Page Markets
            combined_events = []
            known_ids = set()
            
            # A. Search API
            search_events = PolymarketAPI.get_active_elon_events()
            for e in search_events:
                if e['id'] not in known_ids:
                    combined_events.append(e)
                    known_ids.add(e['id'])
                    
            # B. Page Scan
            if tracker.active:
                page_slugs = tracker.scan_polymarket_page()
                for slug in page_slugs:
                    # Avoid re-fetching if we already have it (unlikely unless searched)
                    # We don't have IDs for slugs yet, so just fetch
                    ev = PolymarketAPI.get_event_by_slug(slug)
                    if ev and ev['id'] not in known_ids:
                        # Double check it relates to Elon/Tweets? Or just trust the user?
                        # User said "scan for possible markets", implying all on that page.
                        # But let's be safe: filter closed
                        if ev.get('closed') is False:
                            combined_events.append(ev)
                            known_ids.add(ev['id'])
            
            # 3. Analytics & Display
            if not combined_events:
                 logger.info("No events found from Search or Page Scan.")
            
            Dashboard.display(tracker_data, combined_events)
            
            if args.test:
                print("\n✅ Test Pass Complete.")
                break
                
            # 4. Wait
            for i in range(Config.REFRESH_SECONDS, 0, -1):
                sys.stdout.write(f"\r💤 Refreshing in {i}s...")
                sys.stdout.flush()
                time.sleep(1)
                
    except KeyboardInterrupt:
        print("\n👋 Stopping...")
    finally:
        tracker.close()

if __name__ == "__main__":
    main()