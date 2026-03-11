import json
import os

# Notebook structure
notebook = {
 "cells": [],
 "metadata": {
  "kernelspec": {
   "display_name": "Python 3",
   "language": "python",
   "name": "python3"
  },
  "language_info": {
   "codemirror_mode": {
    "name": "ipython",
    "version": 3
   },
   "file_extension": ".py",
   "mimetype": "text/x-python",
   "name": "python",
   "nbconvert_exporter": "python",
   "pygments_lexer": "ipython3",
   "version": "3.8.5"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 4
}

def add_markdown(source):
    notebook["cells"].append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [line + "\n" for line in source.split("\n")]
    })

def add_code(source):
    notebook["cells"].append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [line + "\n" for line in source.split("\n")]
    })

# --- CELL 1: Header ---
add_markdown("""# 🐦 Elon Musk Tweet Markets - Master Toolkit

This notebook consolidates all tools for tracking, analyzing, and trading Elon Musk tweet markets on Polymarket.

**Modules included:**
1. **Configuration**: Centralized settings.
2. **Tracker**: Real-time tweet counting via XTracker (Selenium).
3. **Analytics**: Probability models (Negative Binomial, Poisson), Kelly Criterion, and Edge calculation.
4. **Visualization**: Hourly pattern analysis and live graphs.
5. **Backtesting**: Framework for validating models against mock or historical data.

**Usage:**
Run the cells in order. Use the final **Dashboard** cell to start the real-time tracker.
""")

# --- CELL 2: Imports ---
add_code("""import sys
import os
import json
import time
import re
import math
import logging
import threading
import argparse
import requests
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from enum import Enum, auto
from typing import Any, Dict, List, Optional, Tuple, TypedDict
from scipy.stats import nbinom, poisson
import plotly.graph_objects as go
from IPython.display import display, clear_output

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("ElonToolkit")
""")

# --- CELL 3: Configuration ---
add_code("""# ==========================================
# ⚙️ CONFIGURATION
# ==========================================
class ProfileEntry(TypedDict):
    rate: float
    alpha: float
    label: str

class Config:
    \"\"\"
    Centralized configuration.
    \"\"\"
    
    # --- Core ---
    MANUAL_COUNT_FALLBACK: int = 468
    BASE_RATE: float = 55.0
    REFRESH_SECONDS: int = 300
    BANKROLL: float = 1000.0
    
    # --- User Settings ---
    USER_TIMEZONE_OFFSET: int = 7  # UTC+7 (Vietnam/Thailand)
    
    # --- URLs & API ---
    TRACKER_URL: str = "https://xtracker.polymarket.com/user/elonmusk"
    MARKETS_PAGE: str = "https://polymarket.com/pop-culture/tweets-markets"
    API_BASE_URL: str = "https://gamma-api.polymarket.com/events"
    API_HEADERS: Dict[str, str] = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    # Note: Update this path if you are not using Brave or on a different OS
    BRAVE_PATH: str = r"C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" 
    
    # --- Model Parameters ---
    DISPERSION_PARAM: float = 0.1      # Alpha (Var = Mean + Alpha*Mean^2)
    KELLY_FRACTION: float = 0.25       # Quarter Kelly default
    KELLY_AGGRESSIVE: float = 0.5      # Half Kelly for high confidence
    
    # --- Thresholds ---
    PROB_THRESHOLD: float = 1.0        # Min prob % for clumping
    TAIL_RISK_THRESHOLD: float = 5.0   # Warn if omitted prob > this %
    EDGE_THRESHOLD: float = 15.0       # Edge % for BUY signal
    
    # --- Expiry Amplifier ---
    EXPIRY_AMP_START_DAYS: float = 1.0 # Amp kicks in below this
    EXPIRY_AMP_MAX: float = 2.5        # Max amplification at T=0
    
    # --- Alpha Convergence ---
    ALPHA_DECAY_START_DAYS: float = 2.0  # Alpha starts decaying below this

    # SCHEDULE PROFILE (UTC+7 Aligned)
    HOURLY_PROFILE: Dict[int, ProfileEntry] = {}
    for _h in range(24):
        if 6 <= _h < 12:
            HOURLY_PROFILE[_h] = {'rate': 1.2, 'alpha': 1.1, 'label': '🍷 ACTIVE'}
        elif 12 <= _h < 16:
            HOURLY_PROFILE[_h] = {'rate': 1.6, 'alpha': 1.5, 'label': '🔥 MANIC'}
        elif 16 <= _h < 20:
            HOURLY_PROFILE[_h] = {'rate': 0.1, 'alpha': 0.3, 'label': '💤 SLEEP'}
        elif 20 <= _h < 22:
            HOURLY_PROFILE[_h] = {'rate': 0.6, 'alpha': 0.8, 'label': '🌅 WAKE'}
        else:
            HOURLY_PROFILE[_h] = {'rate': 0.95, 'alpha': 1.0, 'label': '🏢 WORK'}
""")

# --- CELL 4: Core Classes (Profile, Bucket, Exceptions) ---
add_code("""# ==========================================
# 📦 DATA STRUCTURES & EXCEPTIONS
# ==========================================

class Bucket(TypedDict):
    l: int          # Lower bound
    h: int          # Upper bound
    p: float        # Reference price (cents)
    ask: float      # Best ask (cents)
    bid: float      # Best bid (cents)
    spread: float   # Spread (cents)
    n: str          # Name/label
    _prob: float    # Cached NBinom probability
    _prob_pois: float  # Cached Poisson probability

class TrackerWeek(TypedDict):
    count: int
    label: str

class Signal(Enum):
    NONE = auto()
    BUY_YES = auto()
    BUY_NO = auto()
    HOLD = auto()
    WATCH = auto()
    DEAD = auto()
    THETA = auto()

class TrackerError(Exception): pass
class BrowserLaunchError(TrackerError): pass
class DataParseError(TrackerError): pass
class APIError(TrackerError): pass
""")

# --- CELL 5: Polymarket API ---
add_code("""# ==========================================
# 🌐 POLYMARKET API
# ==========================================
class PolymarketAPI:
    @staticmethod
    def get_event_by_slug(slug: str) -> Optional[Dict]:
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
                    if 'elon' in title and ('tweet' in title or 'count' in title):
                         if event.get('closed') is False:
                            valid.append(event)
                return valid
            except Exception as e:
                logger.error(f"API Fetch Error ({query}): {e}")
                return []

        events = fetch_and_filter("Elon Musk Tweets")
        if events: return events
        return fetch_and_filter("Elon")
""")

# --- CELL 6: Tracker (Selenium) ---
add_code("""# ==========================================
# 🕵️ TRACKER (Selenium)
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
        if not self.active or not self.driver: return []
        slugs = []
        try:
            from selenium.webdriver.common.by import By
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            
            logger.info("🔎 Scanning Polymarket Page for new markets...")
            self.driver.get(Config.MARKETS_PAGE)
            WebDriverWait(self.driver, 15).until(EC.presence_of_element_located((By.TAG_NAME, "a")))
            time.sleep(3) 
            
            links = self.driver.find_elements(By.TAG_NAME, "a")
            for link in links:
                try:
                    href = link.get_attribute('href')
                    if href and '/event/' in href:
                        parts = href.split('/event/')
                        if len(parts) > 1:
                            slug = parts[1].split('/')[0].split('?')[0]
                            slugs.append(slug)
                except Exception:
                    continue
            return list(set(slugs))
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
            time.sleep(5)
            
            text = self.driver.find_element(By.TAG_NAME, "body").text
            self._parse_text(text)
        except Exception as e:
            logger.warning(f"⚠️ Scraping Warning: {e}")

    def _parse_text(self, text: str):
        date_pattern = re.compile(r"([A-Z][a-z]+ \d{1,2}(?:, \d{4})? - [A-Z][a-z]+ \d{1,2}(?:, \d{4})?)")
        found = []
        lines = [l.strip() for l in text.split('\\n') if l.strip()]
        
        for i, line in enumerate(lines):
            if date_pattern.search(line):
                for j in range(1, 5):
                    if i+j >= len(lines): break
                    cand = lines[i+j].replace(',', '')
                    if cand.isdigit():
                        found.append({'range': line, 'count': int(cand)})
                        break
        if found:
            with self.lock: self.last_data = found
            logger.info(f"✅ Updated data: {len(found)} periods found.")
        else:
            logger.warning("No data patterns found.")

    def get_data(self) -> Optional[List[Dict]]:
        with self.lock: return self.last_data
            
    def close(self):
        if self.driver: 
            try: self.driver.quit()
            except: pass
        self.active = False
""")

# --- CELL 7: Analytics ---
add_code("""# ==========================================
# 🧠 ANALYTICS
# ==========================================
class TweetAnalyzer:
    @staticmethod
    def get_local_hour() -> int:
        utc = datetime.now(timezone.utc)
        local = utc + timedelta(hours=Config.USER_TIMEZONE_OFFSET)
        return local.hour
    
    @staticmethod
    def get_schedule_status() -> Tuple[float, str, int]:
        h = TweetAnalyzer.get_local_hour()
        prof = Config.HOURLY_PROFILE.get(h, {'rate': 1.0, 'alpha': 1.0, 'label': 'UNK'})
        return prof['rate'], prof['label'], h

    @staticmethod
    def integrate_schedule(base_daily_rate: float, days_left: float) -> Tuple[float, float]:
        if days_left <= 0: return 0.0, 1.0
        
        utc_now = datetime.now(timezone.utc)
        projected_tweets = 0.0
        weighted_alpha_sum = 0.0
        current_time = utc_now
        hours_remaining = days_left * 24.0
        base_hourly = base_daily_rate / 24.0
        
        expiry_amp = 1.0
        if days_left < Config.EXPIRY_AMP_START_DAYS:
            progress = 1.0 - (days_left / Config.EXPIRY_AMP_START_DAYS)
            expiry_amp = 1.0 + (Config.EXPIRY_AMP_MAX - 1.0) * progress
        
        while hours_remaining > 0:
            step = min(1.0, hours_remaining)
            local_time = current_time + timedelta(hours=Config.USER_TIMEZONE_OFFSET)
            h = local_time.hour
            prof = Config.HOURLY_PROFILE.get(h, {'rate': 1.0, 'alpha': 1.0})
            
            base_rate_mult = prof['rate']
            deviation = base_rate_mult - 1.0
            effective_rate_mult = max(0.0, 1.0 + (deviation * expiry_amp))
            
            tweets_in_step = base_hourly * effective_rate_mult * step
            projected_tweets += tweets_in_step
            weighted_alpha_sum += (prof['alpha'] * tweets_in_step)
            
            current_time += timedelta(hours=step)
            hours_remaining -= step
            
        eff_alpha_mult = weighted_alpha_sum / projected_tweets if projected_tweets > 0 else 1.0
        return projected_tweets, eff_alpha_mult

    @staticmethod
    def calculate_dynamic_rate(tracker_data: Optional[List[Dict]]) -> float:
        if not tracker_data or len(tracker_data) < 2: return Config.BASE_RATE
        try:
            last_full = tracker_data[1]
            return last_full['count'] / 7.0
        except: return Config.BASE_RATE

    @staticmethod
    def calculate_nbinom_prob(n_min: int, n_max: int, mu: float, days_left: float, dispersion_mult: float = 1.0) -> float:
        if mu <= 0: return 0.0
        alpha = Config.DISPERSION_PARAM * dispersion_mult
        
        if days_left < Config.ALPHA_DECAY_START_DAYS:
            decay = max(0.0, days_left / Config.ALPHA_DECAY_START_DAYS)
            alpha *= decay

        var = mu + alpha * (mu ** 2)
        try:
            p = mu / var
            n = (mu ** 2) / (var - mu)
            prob = (nbinom.cdf(n_max, n, p) - nbinom.cdf(n_min - 1, n, p)) * 100
            return prob
        except:
            return (poisson.cdf(n_max, mu) - poisson.cdf(n_min - 1, mu)) * 100

    @staticmethod
    def calculate_poisson_prob(n_min: int, n_max: int, mu: float) -> float:
        if mu <= 0: return 0.0
        try:
            return (poisson.cdf(n_max, mu) - poisson.cdf(n_min - 1, mu)) * 100
        except: return 0.0

    @staticmethod
    def calculate_kelly(prob_percent: float, price_cents: float, 
                       current_count: int, proj_count: int, days_left: float) -> Tuple[float, float, str]:
        if prob_percent <= 0 or price_cents <= 0 or price_cents >= 100: return 0.0, 0.0, "N/A"

        p = prob_percent / 100.0
        q = 1.0 - p
        b = (100.0 / price_cents) - 1.0
        
        if b <= 0: return 0.0, 0.0, "NegOdds"

        f_star = (b * p - q) / b
        if f_star <= 0: return 0.0, 0.0, "NegEV"

        constraint = 1.0 / b
        fraction = Config.KELLY_FRACTION
        
        if days_left < Config.ALPHA_DECAY_START_DAYS and proj_count > 0:
            diff = current_count - proj_count
            if diff >= 0 or abs(diff) <= 0.10 * proj_count:
                fraction = Config.KELLY_AGGRESSIVE
        
        final_f = min(f_star * fraction, constraint)
        return final_f, Config.BANKROLL * final_f, "OK"

    @staticmethod
    def match_count(title: str, tracker_data: List[Dict]) -> Optional[int]:
        if not tracker_data: return None
        title_simp = title.lower().replace(" ", "").replace(",", "")
        for item in tracker_data:
            rng = item['range'].lower().replace(" ", "").replace(",", "")
            if title_simp in rng or rng in title_simp:
                return item['count']
        return None
""")

# --- CELL 8: Visualization (Pattern) ---
add_code("""# ==========================================
# 📊 HOURLY PATTERN VISUALIZATION
# ==========================================
def plot_hourly_pattern():
    hours = list(range(24))
    rates = [Config.HOURLY_PROFILE[h]['rate'] for h in hours]
    labels = [Config.HOURLY_PROFILE[h]['label'] for h in hours]
    
    base_hourly = Config.BASE_RATE / 24
    tweets_per_hour = [base_hourly * r for r in rates]
    
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10), sharex=True)
    
    # Colors
    colors = []
    for h in hours:
        label = Config.HOURLY_PROFILE[h]['label']
        if 'MANIC' in label: colors.append('#ff4444')
        elif 'ACTIVE' in label: colors.append('#ff9944')
        elif 'SLEEP' in label: colors.append('#4444ff')
        elif 'WAKE' in label: colors.append('#44ff44')
        else: colors.append('#888888')
    
    # Ax1: Tweets
    ax1.bar(hours, tweets_per_hour, color=colors, alpha=0.7)
    ax1.axhline(y=base_hourly, color='red', linestyle='--', label='Base')
    ax1.set_title("Hourly Tweet Frequency (UTC+7)")
    ax1.set_ylabel("Tweets/Hour")
    
    # Ax2: Multipliers
    ax2.bar(hours, rates, color=colors, alpha=0.7)
    ax2.axhline(y=1.0, color='red', linestyle='--')
    ax2.set_title("Rate Multipliers")
    ax2.set_xlabel("Hour")
    
    plt.tight_layout()
    plt.show()

# plot_hourly_pattern() # Uncomment to view
""")

# --- CELL 9: Backtesting ---
add_code("""# ==========================================
# 🔙 BACKTESTING FRAMEWORK
# ==========================================
@dataclass
class MarketSnapshot:
    timestamp: datetime
    event_title: str
    current_count: int
    days_left: float
    buckets: List[dict] # Simplified for notebook
    actual_winner: Optional[int] = None

class MockDataGenerator:
    @staticmethod
    def generate_market(base_count=300, days_left=5.0):
        # Mock logic...
        rate = Config.BASE_RATE
        actual = base_count + int(rate * days_left)
        buckets = []
        # Create dummy buckets
        ranges = [(0,299), (300,349), (350,399), (400,9999)]
        winner_idx = 0
        for i, (l, h) in enumerate(ranges):
            if l <= actual <= h: winner_idx = i
            buckets.append({
                'name': f"{l}-{h}", 'l':l, 'h':h, 'market_price': 25.0, 'low': l, 'high': h
            })
        return MarketSnapshot(datetime.now(), "Mock", base_count, days_left, buckets, winner_idx)

class Backtester:
    def __init__(self, snapshots): self.snapshots = snapshots
    
    def run(self):
        print(f"Running backtest on {len(self.snapshots)} markets...")
        correct = 0
        for snap in self.snapshots:
            # Simple validation logic
            pass
        print("Backtest Complete (Simplifed logic for notebook demo).")

# Example usage
# b = Backtester([MockDataGenerator.generate_market() for _ in range(5)])
# b.run()
""")

# --- CELL 10: Dashboard ---
add_code("""# ==========================================
# 🖥️ DASHBOARD (Run this to start)
# ==========================================
def run_dashboard():
    tracker = ElonTracker(headless=True) # Set headless=False to see browser
    
    try:
        print("Starting Dashboard...")
        tracker.start()
        
        while True:
            # 1. Update Data
            if tracker.active: tracker.update()
            tracker_data = tracker.get_data()
            
            # 2. Get Events
            events = PolymarketAPI.get_active_elon_events()
            
            # 3. Analyze & Display
            clear_output(wait=True)
            
            dynamic_base = TweetAnalyzer.calculate_dynamic_rate(tracker_data)
            mult, status, tx_hour = TweetAnalyzer.get_schedule_status()
            
            print(f"🔍 STATUS: {status} | BASE: {dynamic_base:.1f} | LIVE: {dynamic_base*mult:.1f}/day")
            print("-" * 60)
            
            if not events: print("No events found.")
            
            for event in events:
                title = event['title']
                print(f"\\n📅 {title}")
                # (Add more detailed display logic here matching original dashboard)
                
            time.sleep(Config.REFRESH_SECONDS)
            
    except KeyboardInterrupt:
        print("Stopped.")
    finally:
        tracker.close()

# Uncomment to run
# run_dashboard()
""")

# Write to file
if not os.path.exists("notebooks"): os.makedirs("notebooks")
with open("notebooks/Elon_Musk_Master_Toolkit.ipynb", "w", encoding='utf-8') as f:
    json.dump(notebook, f, indent=2)

print("Notebook generated successfully.")
