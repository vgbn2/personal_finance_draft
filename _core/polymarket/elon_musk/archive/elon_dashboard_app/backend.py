
import time
import requests
import json
import numpy as np
import threading
import re
import logging
import os
from datetime import datetime, timezone, timedelta
from scipy.stats import poisson, nbinom
from typing import List, Dict, Optional, Any, Tuple

# ==========================================
# ⚙️ CONFIGURATION
# ==========================================
class Config:
    MANUAL_COUNT_FALLBACK = 468
    BASE_RATE = 55.0
    REFRESH_SECONDS = 300
    TRACKER_URL = "https://xtracker.polymarket.com/user/elonmusk"
    BANKROLL = 1000.0  # User Bankroll
    KELLY_FRACTION = 0.25 # Safety factor
    DISPERSION_PARAM = 0.1 # Alpha (Controls overdispersion: Var = Mean + Alpha*Mean^2)
    MARKETS_PAGE = "https://polymarket.com/pop-culture/tweets-markets"
    API_BASE_URL = "https://gamma-api.polymarket.com/events"
    API_HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    BRAVE_PATH = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
    LOG_FORMAT = '%(asctime)s - %(levelname)s - %(message)s'

# Setup Logging
logger = logging.getLogger("ElonTweetBack")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format=Config.LOG_FORMAT)
    logger = logging.getLogger("ElonTweetBack")

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
            
            options = Options()
            options.binary_location = Config.BRAVE_PATH
            if self.headless:
                options.add_argument("--headless=new")
            options.add_argument("--disable-gpu")
            options.add_argument("--log-level=3")
            options.add_argument("--no-first-run") 
            
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
    def calculate_nbinom_prob(n_min: int, n_max: int, mu: float) -> float:
        """
        Calculates probability using Negative Binomial Distribution.
        Mu (Mean) = Projected Tweets
        Alpha (Dispersion) = Config.DISPERSION_PARAM
        Variance = Mu + Alpha * Mu^2
        """
        if mu <= 0: return 0.0
        
        alpha = Config.DISPERSION_PARAM
        var = mu + alpha * (mu ** 2)
        
        # Scipy nbinom(n, p) parameterization:
        # p = mu / var
        # n = mu^2 / (var - mu)
        
        try:
            p = mu / var
            n = (mu ** 2) / (var - mu)
            
            # Probability mass in range [n_min, n_max]
            # CDF(Max) - CDF(Min - 1)
            prob = (nbinom.cdf(n_max, n, p) - nbinom.cdf(n_min - 1, n, p)) * 100
            return prob
        except:
             # Fallback to Poisson if something explodes (e.g. var <= mu which shouldn't happen with alpha > 0)
             return (poisson.cdf(n_max, mu) - poisson.cdf(n_min - 1, mu)) * 100

    @staticmethod
    def calculate_poisson_prob(n_min: int, n_max: int, mu: float) -> float:
        """
        Calculates probability using standard Poisson Distribution.
        Mean = Variance = Mu
        """
        if mu <= 0: return 0.0
        try:
            prob = (poisson.cdf(n_max, mu) - poisson.cdf(n_min - 1, mu)) * 100
            return prob
        except:
            return 0.0

    @staticmethod
    def calculate_kelly(prob_percent: float, price_cents: float) -> Tuple[float, float, str]:
        """
        Calculates Kelly Criterion bet sizing.
        """
        if prob_percent <= 0 or price_cents <= 0 or price_cents >= 100:
            return 0.0, 0.0, "N/A"

        p = prob_percent / 100.0
        q = 1.0 - p
        b = (100.0 / price_cents) - 1.0 # Net odds received (decimal - 1)
        
        if b <= 0: return 0.0, 0.0, "NegOdds"

        # Kelly Formula: f* = (bp - q) / b
        f_star = (b * p - q) / b
        
        if f_star <= 0:
            return 0.0, 0.0, "NegEV"

        constraint = 1.0 / b
        safe_f = f_star * Config.KELLY_FRACTION
        final_f = min(safe_f, constraint)
        
        amount = Config.BANKROLL * final_f
        return final_f, amount, "OK"

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
