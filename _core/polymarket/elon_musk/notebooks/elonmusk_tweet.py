"""
Elon Musk Tweet Tracker - Polymarket Analytics Dashboard

This module provides real-time analytics for Polymarket tweet prediction markets.
It combines web scraping (XTracker/Selenium) with statistical modeling (Negative
Binomial Distribution) to generate probability estimates, edge calculations,
and Kelly Criterion position sizing recommendations.

Architecture:
    - Config: Centralized configuration with tunable parameters
    - PolymarketAPI: REST API client for market data
    - ElonTracker: Selenium-based scraper for XTracker data
    - TweetAnalyzer: Statistical modeling and probability calculations
    - Dashboard: Terminal-based visualization and signals

Key Features:
    - Schedule-based volatility modeling (circadian rhythms)
    - Expiry amplification for near-resolution contracts
    - Alpha convergence to Poisson near deadline
    - Adaptive Kelly Criterion with ahead/behind awareness
    - Clumped arbitrage detection with Dutch betting allocation

Author: User
Version: 2.0.0
License: MIT
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum, auto
from typing import Any, Dict, List, Optional, Tuple, TypedDict

import numpy as np
import requests
from scipy.stats import nbinom, poisson


# ==========================================
# 📦 TYPE DEFINITIONS
# ==========================================

class ProfileEntry(TypedDict):
    """Hourly schedule profile entry."""
    rate: float
    alpha: float
    label: str


class Bucket(TypedDict):
    """Market bucket with price and probability data."""
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
    """Weekly tweet count from XTracker."""
    count: int
    label: str


class Signal(Enum):
    """Trading signals for market buckets."""
    NONE = auto()
    BUY_YES = auto()
    BUY_NO = auto()
    HOLD = auto()
    WATCH = auto()
    DEAD = auto()
    THETA = auto()


class SchedulePhase(Enum):
    """Elon's activity phases (Texas time, displayed in user TZ)."""
    SLEEP = "💤 SLEEP"
    WAKE = "🌅 WAKE"
    WORK = "🏢 WORK"
    ACTIVE = "🍷 ACTIVE"
    MANIC = "🔥 MANIC"

# ==========================================
# ⚙️ CONFIGURATION
# ==========================================
class Config:
    """
    Centralized configuration for the Elon Tweet Tracker.
    
    All tunable parameters are defined here for easy adjustment without
    modifying the core logic. Parameters are organized by category.
    """
    
    # --- Core ---
    MANUAL_COUNT_FALLBACK: int = 0
    BASE_RATE: float = 55.0
    REFRESH_SECONDS: int = 900
    BANKROLL: float = 1000.0
    
    # --- Data Paths (Relative to script location) ---
    DATA_DIR: str = os.path.join(os.path.dirname(__file__), "..", "data")
    STATS_FILE: str = "elon_stats.json"
    
    # --- User Settings ---
    USER_TIMEZONE_OFFSET: int = 7  # UTC+7 (Vietnam/Thailand)
    
    # --- URLs & API ---
    TRACKER_URL: str = "https://xtracker.polymarket.com/user/elonmusk"
    MARKETS_PAGE: str = "https://polymarket.com/pop-culture/tweets-markets"
    API_BASE_URL: str = "https://gamma-api.polymarket.com/events"
    API_HEADERS: Dict[str, str] = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    BRAVE_PATH: str = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
    LOG_FORMAT: str = '%(asctime)s - %(levelname)s - %(message)s'
    
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

    # SCHEDULE PROFILE (UTC+7 Aligned) - TUNED v2
    # Reduced rates by ~15% to fix 600+ over-prediction
    # Texas is UTC-6. User is UTC+7. Diff: +13 Hours.
    # ------------------------------------------------------------------
    HOURLY_PROFILE: Dict[int, ProfileEntry] = {}
    for _h in range(24):
        if 6 <= _h < 12:
            HOURLY_PROFILE[_h] = {'rate': 1.2, 'alpha': 1.1, 'label': '🍷 ACTIVE'}  # Was 1.4/1.2
        elif 12 <= _h < 16:
            HOURLY_PROFILE[_h] = {'rate': 1.6, 'alpha': 1.5, 'label': '🔥 MANIC'}   # Was 2.0/1.8
        elif 16 <= _h < 20:
            HOURLY_PROFILE[_h] = {'rate': 0.1, 'alpha': 0.3, 'label': '💤 SLEEP'}   # Was 0.05/0.2
        elif 20 <= _h < 22:
            HOURLY_PROFILE[_h] = {'rate': 0.6, 'alpha': 0.8, 'label': '🌅 WAKE'}    # Was 0.5/0.8
        else:
            HOURLY_PROFILE[_h] = {'rate': 0.95, 'alpha': 1.0, 'label': '🏢 WORK'}   # Was 1.0/1.0


# ==========================================
# ⚠️ CUSTOM EXCEPTIONS
# ==========================================

class TrackerError(Exception):
    """Base exception for tracker-related errors."""
    pass


class BrowserLaunchError(TrackerError):
    """Raised when the browser fails to launch."""
    pass


class DataParseError(TrackerError):
    """Raised when data parsing fails."""
    pass


class APIError(TrackerError):
    """Raised when API requests fail."""
    pass


# ==========================================
# 📝 LOGGING SETUP
# ==========================================
logging.basicConfig(level=logging.INFO, format=Config.LOG_FORMAT)
logger = logging.getLogger("ElonTweet")

# Windows UTF-8 fix
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass  # Ignore if reconfigure not available

# ==========================================
# 📈 KALMAN FILTER FOR RATE ESTIMATION
# ==========================================
class KalmanRateEstimator:
    """
    1D Kalman filter for estimating tweet rate (tweets/hour).
    
    State: x = estimated rate (tweets/hour)
    Process: x_{t+1} = alpha*x_t + (1-alpha)*BASE_RATE + w  (mean-reverting random walk)
    Observation: z = (count_t - count_{t-1}) / dt  (observed rate)
    
    Attributes:
        x: Current rate estimate
        P: Estimate uncertainty (variance)
        Q: Process noise variance
        R: Measurement noise variance
        alpha: Mean reversion parameter (0.9 = slow reversion, 0.5 = fast)
    """
    
    def __init__(self, 
                 initial_rate: float = None,
                 process_noise: float = 0.5,
                 measurement_noise: float = 2.0,
                 mean_reversion: float = 0.95):
        """
        Args:
            initial_rate: Starting rate estimate (default: Config.BASE_RATE/24)
            process_noise: Q - how much rate can drift per update
            measurement_noise: R - observation uncertainty
            mean_reversion: alpha - how fast rate reverts to baseline (0-1)
        """
        self.base_rate = (initial_rate if initial_rate else Config.BASE_RATE) / 24.0  # per hour
        self.x = self.base_rate  # State estimate
        self.P = 1.0             # Initial uncertainty
        self.Q = process_noise   # Process noise
        self.R = measurement_noise  # Measurement noise
        self.alpha = mean_reversion
        
        self.last_count: Optional[int] = None
        self.last_time: Optional[datetime] = None
        self.observations: List[float] = []  # History for debugging
        
    def predict(self):
        """Time update: Predict next state with mean reversion."""
        # Mean reversion toward base rate
        self.x = self.alpha * self.x + (1 - self.alpha) * self.base_rate
        self.P = self.P + self.Q
        
    def update(self, observed_rate: float):
        """Measurement update: Incorporate new observation."""
        # Kalman gain
        K = self.P / (self.P + self.R)
        
        # Update estimate
        innovation = observed_rate - self.x
        self.x = self.x + K * innovation
        
        # Update uncertainty
        self.P = (1 - K) * self.P
        
        # Clamp to reasonable range
        self.x = max(0.0, min(self.x, 20.0))  # 0 to 20 tweets/hour
        
        self.observations.append(observed_rate)
        if len(self.observations) > 100:
            self.observations.pop(0)
    
    def process_count(self, count: int, timestamp: datetime = None):
        """
        Main entry: Process a new count observation.
        Calculates rate from count difference and updates filter.
        """
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)
            
        if self.last_count is not None and self.last_time is not None:
            dt_hours = (timestamp - self.last_time).total_seconds() / 3600.0
            
            if dt_hours > 0.01:  # At least ~36 seconds between updates
                count_diff = count - self.last_count
                observed_rate = count_diff / dt_hours
                
                # Only update if observation is plausible
                if observed_rate >= 0 and observed_rate < 100:  # Sanity check
                    self.predict()
                    self.update(observed_rate)
                    logger.debug(f"Kalman: obs={observed_rate:.2f}, est={self.x:.2f}, P={self.P:.3f}")
        
        self.last_count = count
        self.last_time = timestamp
    
    def get_rate(self) -> Tuple[float, float]:
        """Returns (estimated_rate_per_hour, std_dev)."""
        return self.x, np.sqrt(self.P)
    
    def get_daily_rate(self) -> Tuple[float, float]:
        """Returns (estimated_rate_per_day, std_dev_per_day)."""
        return self.x * 24, np.sqrt(self.P) * 24
    
    def reset(self, new_rate: float = None):
        """Reset filter to initial state."""
        self.x = new_rate / 24.0 if new_rate else self.base_rate
        self.P = 1.0
        self.last_count = None
        self.last_time = None


# ==========================================
# 💾 DATA MANAGER
# ==========================================
class DataManager:
    """Handles loading/saving/archiving elon_stats.json."""
    
    @staticmethod
    def _get_path() -> str:
        return os.path.join(Config.DATA_DIR, Config.STATS_FILE)
    
    @staticmethod
    def load() -> Dict:
        """Loads the stats file, returns empty structure if missing."""
        path = DataManager._get_path()
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load stats: {e}")
        return {"timestamp": 0, "data": [], "historical_markets": []}
    
    @staticmethod
    def save(stats: Dict):
        """Saves the stats file."""
        path = DataManager._get_path()
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(stats, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save stats: {e}")
    
    @staticmethod
    def archive_event(event: Dict, final_count: int, buckets: List[Dict]):
        """Archives an ended market event."""
        stats = DataManager.load()
        historical = stats.get("historical_markets", [])
        
        event_id = event.get("id", "unknown")
        # Check if already archived
        if any(h.get("event_id") == event_id for h in historical):
            return  # Already archived
        
        record = {
            "event_id": event_id,
            "title": event.get("title", "Unknown"),
            "end_date": event.get("endDate"),
            "final_count": final_count,
            "archived_at": datetime.now(timezone.utc).isoformat(),
            "buckets": [
                {
                    "name": b.get("n"),
                    "low": b.get("l"),
                    "high": b.get("h"),
                    "ask": b.get("ask"),
                    "bid": b.get("bid"),
                    "model_prob": b.get("_prob", 0)
                }
                for b in buckets
            ]
        }
        
        historical.append(record)
        stats["historical_markets"] = historical
        DataManager.save(stats)
        logger.info(f"📦 Archived market: {event.get('title', 'Unknown')}")


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
        self.cached_data: Optional[List[Dict]] = None  # From disk
        self.cached_timestamp: float = 0
        self.lock = threading.Lock()
        self.active = False
        self.headless = headless
        self.kalman = KalmanRateEstimator()  # Kalman filter for rate estimation
        self._load_cached()
    
    def _load_cached(self):
        """Loads cached data from elon_stats.json."""
        stats = DataManager.load()
        if stats.get("data"):
            self.cached_data = stats["data"]
            self.cached_timestamp = stats.get("timestamp", 0)
            logger.info(f"💾 Loaded cached data ({len(self.cached_data)} periods)")

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
                except Exception:
                    continue
                
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
            
            # Feed current week count to Kalman filter
            if found and 'count' in found[0]:
                self.kalman.process_count(found[0]['count'])
        else:
            logger.warning("No data patterns found in page text.")

    def get_data(self) -> Tuple[Optional[List[Dict]], bool]:
        """Returns (data, is_live). If live data unavailable, falls back to cached."""
        with self.lock:
            if self.last_data:
                return self.last_data, True
            elif self.cached_data:
                return self.cached_data, False
            return None, False
            
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
    def get_local_hour() -> int:
        """Returns current hour in user's local timezone (Config.USER_TIMEZONE_OFFSET)."""
        utc = datetime.now(timezone.utc)
        local = utc + timedelta(hours=Config.USER_TIMEZONE_OFFSET)
        return local.hour
    
    @staticmethod
    def get_schedule_status() -> Tuple[float, str, int]:
        """Returns (rate_mult, label, hour) for current schedule phase."""
        h = TweetAnalyzer.get_local_hour()
        prof = Config.HOURLY_PROFILE.get(h, {'rate': 1.0, 'alpha': 1.0, 'label': 'UNK'})
        return prof['rate'], prof['label'], h

    @staticmethod
    def integrate_schedule(base_daily_rate: float, days_left: float) -> Tuple[float, float]:
        """
        Integrates the rate and dispersion over the remaining time.
        Returns: (projected_tweets_remaining, weighted_avg_dispersion_mult)
        
        EXPIRY AMPLIFIER:
        - Kicks in when days_left < EXPIRY_AMP_START_DAYS
        - Scales from 1.0x to EXPIRY_AMP_MAX as T -> 0
        - Amplifies deviation from baseline rate (1.0)
        """
        if days_left <= 0:
            return 0.0, 1.0
        
        utc_now = datetime.now(timezone.utc)
        projected_tweets = 0.0
        weighted_alpha_sum = 0.0
        
        current_time = utc_now
        hours_remaining = days_left * 24.0
        base_hourly = base_daily_rate / 24.0
        
        # Calculate Expiry Amplifier
        expiry_amp = 1.0
        if days_left < Config.EXPIRY_AMP_START_DAYS:
            # Smooth ramp from 1.0 to EXPIRY_AMP_MAX
            progress = 1.0 - (days_left / Config.EXPIRY_AMP_START_DAYS)
            expiry_amp = 1.0 + (Config.EXPIRY_AMP_MAX - 1.0) * progress
        
        # Iterate in hourly steps
        while hours_remaining > 0:
            step = min(1.0, hours_remaining)
            
            # Get Schedule Hour (User Timezone)
            local_time = current_time + timedelta(hours=Config.USER_TIMEZONE_OFFSET)
            h = local_time.hour
            prof = Config.HOURLY_PROFILE.get(h, {'rate': 1.0, 'alpha': 1.0})
            
            # Apply Amplifier to Rate Deviation
            base_rate_mult = prof['rate']
            deviation = base_rate_mult - 1.0
            
            # Amplified rate (clamped to 0)
            effective_rate_mult = 1.0 + (deviation * expiry_amp)
            effective_rate_mult = max(0.0, effective_rate_mult)
            
            tweets_in_step = base_hourly * effective_rate_mult * step
            projected_tweets += tweets_in_step
            weighted_alpha_sum += (prof['alpha'] * tweets_in_step)
            
            current_time += timedelta(hours=step)
            hours_remaining -= step
            
        # Calculate weighted average alpha
        eff_alpha_mult = weighted_alpha_sum / projected_tweets if projected_tweets > 0 else 1.0
        return projected_tweets, eff_alpha_mult

    @staticmethod
    def calculate_dynamic_rate(tracker_data: Optional[List[Dict]]) -> float:
        """
        Calculates average daily tweets from the most recent COMPLETED week.
        Falls back to BASE_RATE if data is invalid or unavailable.
        """
        if not tracker_data or len(tracker_data) < 2:
            return Config.BASE_RATE
            
        try:
            last_full = tracker_data[1]
            if not isinstance(last_full, dict) or 'count' not in last_full:
                return Config.BASE_RATE
            count = last_full['count']
            if not isinstance(count, (int, float)) or count <= 0:
                return Config.BASE_RATE
            return count / 7.0
        except Exception:
            return Config.BASE_RATE

    @staticmethod
    def calculate_nbinom_prob(n_min: int, n_max: int, mu: float, days_left: float, dispersion_mult: float = 1.0) -> float:
        """
        Calculates probability using Negative Binomial Distribution.
        
        Args:
            n_min, n_max: Tweet count range (tweets needed, not total)
            mu: Mean projection (expected remaining tweets)
            days_left: Time until resolution
            dispersion_mult: Schedule-based alpha multiplier
            
        Returns:
            Probability (0-100%) that tweets fall in [n_min, n_max] range.
            
        Note:
            Alpha decays to 0 as days_left approaches 0, converging to Poisson.
            This is SEPARATE from the Expiry Amplifier which affects the mean.
        """
        if mu <= 0:
            return 0.0
        
        # Base alpha from config and schedule
        alpha = Config.DISPERSION_PARAM * dispersion_mult
        
        # Alpha Convergence: decay to Poisson as deadline approaches
        if days_left < Config.ALPHA_DECAY_START_DAYS:
            decay = max(0.0, days_left / Config.ALPHA_DECAY_START_DAYS)
            alpha *= decay

        # NBinom variance: Var = Mean + Alpha * Mean^2
        var = mu + alpha * (mu ** 2)
        
        try:
            # Scipy parameterization: n, p where p = mu/var
            p = mu / var
            n = (mu ** 2) / (var - mu)
            
            prob = (nbinom.cdf(n_max, n, p) - nbinom.cdf(n_min - 1, n, p)) * 100
            return prob
        except Exception:
            # Fallback to Poisson if NBinom fails
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
        except Exception:
            return 0.0

    @staticmethod
    def calculate_kelly(prob_percent: float, price_cents: float, 
                       current_count: int, proj_count: int, days_left: float) -> Tuple[float, float, str]:
        """
        Calculates Kelly Criterion bet sizing with Adaptive Aggression.
        
        Args:
            prob_percent: Model probability (0-100)
            price_cents: Market ask price in cents
            current_count: Current tweet count
            proj_count: Projected final count
            days_left: Time until resolution
            
        Returns:
            (fraction, dollar_amount, reason_code)
            
        Adaptive Logic:
            - AHEAD of projection + close to end -> more aggressive (KELLY_AGGRESSIVE)
            - BEHIND projection -> stay conservative (KELLY_FRACTION)
        """
        if prob_percent <= 0 or price_cents <= 0 or price_cents >= 100:
            return 0.0, 0.0, "N/A"

        p = prob_percent / 100.0
        q = 1.0 - p
        b = (100.0 / price_cents) - 1.0  # Net odds
        
        if b <= 0:
            return 0.0, 0.0, "NegOdds"

        # Kelly Formula: f* = (bp - q) / b
        f_star = (b * p - q) / b
        
        if f_star <= 0:
            return 0.0, 0.0, "NegEV"

        # Position constraint: max 1/b
        constraint = 1.0 / b
        
        # Default fractional Kelly
        fraction = Config.KELLY_FRACTION
        
        # Adaptive: boost confidence when conditions favor us
        if days_left < Config.ALPHA_DECAY_START_DAYS and proj_count > 0:
            diff = current_count - proj_count  # Positive = ahead, Negative = behind
            
            # AHEAD of projection: safer position, can be more aggressive
            if diff >= 0 or abs(diff) <= 0.10 * proj_count:
                fraction = Config.KELLY_AGGRESSIVE
            # BEHIND projection: stay conservative
            # (fraction stays at KELLY_FRACTION)
        
        safe_f = f_star * fraction
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

# ==========================================
# 🖥️ DASHBOARD
# ==========================================
class Dashboard:
    @staticmethod
    def clear():
        # ANSI escape codes: \033[H (Home), \033[2J (Clear Screen)
        # This is more reliable in modern terminals/VS Code than os.system('cls')
        print("\033[H\033[2J", end="")
        sys.stdout.flush()

    @staticmethod
    def display(tracker_data: Optional[List[Dict]], events: List[Dict], is_live: bool = True, 
                kalman: Optional[KalmanRateEstimator] = None, api_mode: bool = False):
        Dashboard.clear()
        
        # 1. Header & Status
        dynamic_base = TweetAnalyzer.calculate_dynamic_rate(tracker_data)
        mult, status, tx_hour = TweetAnalyzer.get_schedule_status()
        live_rate = dynamic_base * mult
        
        # Determine Dispersion Multiplier
        dispersion_mult = 1.0
        if "MANIC" in status:
            dispersion_mult = 1.5
        elif "SLEEP" in status:
            dispersion_mult = 0.5
            
        effective_alpha = Config.DISPERSION_PARAM * dispersion_mult
        
        # Theta Play Indicator (Hour 2: 02:00-02:59) - Transition to Sleep
        is_theta_play = (tx_hour == 2)
        
        if tracker_data:
            if is_live:
                source = "🤖 AUTO (XTracker - LIVE)"
            else:
                source = "⚠️ CACHED DATA (XTracker offline - using last known counts)"
        else:
            source = f"🔴 NO DATA (Fallback: {Config.MANUAL_COUNT_FALLBACK})"
        print(f"{source}")
        print(f"🕵️ STATUS: {status} | ⚡ BASE: {dynamic_base:.1f} | 🔥 CLOCK: {live_rate:.1f}/day")
        
        # Display Kalman filter info if available
        if kalman:
            k_rate, k_std = kalman.get_daily_rate()
            print(f"📈 KALMAN RATE: {k_rate:.1f} ± {k_std:.1f}/day | PROFILE: {live_rate:.1f}/day | BLEND: {(k_rate + live_rate)/2:.1f}/day")
        
        print(f"📊 IMPLIED DISPERSION: {effective_alpha:.3f} (x{dispersion_mult}) {'💎 THETA MODE ACTIVE' if is_theta_play else ''}")
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
                
                # Projection Calculation (Schedule Integrated)
                tweets_remaining, future_dispersion_mult = TweetAnalyzer.integrate_schedule(dynamic_base, days_left)
                
                # Calculate Expiry Amp for Display
                curr_expiry_amp = 1.0
                if days_left < 1.0:
                    curr_expiry_amp = 1.0 + (1.0 - days_left) * 1.5
                    
                proj = int(my_count + tweets_remaining)
                
                # Sanity Check for User
                if proj < my_count: proj = my_count # Should not decrease
                
                # Header
                print(f"\n📅 {title[:70]}")
                print(f"   🐦 Count: {my_count} | 🎯 Proj: {proj} | ⏳ Left: {days_left:.2f}d | ⚡ Rate: {dynamic_base:.1f}")
                print(f"   📊 Avg Dispersion Mult: x{future_dispersion_mult:.2f} | 💥 Expiry Amp: x{curr_expiry_amp:.2f}")
                print(f"   {'BUCKET':<12} {'BID':<6} {'ASK':<6} {'SPREAD':<8} {'PROB %':<8} {'EDGE':<8} {'EDGE(2)':<8} {'KELLY %':<8} {'SIZE ($)':<8} {'ACTION'}")
                print(f"   {'──────':<12} {'───':<6} {'───':<6} {'──────':<8} {'──────':<8} {'────':<8} {'───────':<8} {'───────':<8} {'────────':<8} {'──────'}")

                # Buckets
                markets = event.get('markets', [])
                buckets = Dashboard._parse_markets(markets)
                
                # --- ARBITRAGE CHECK ---
                total_ask_price = sum(b['ask'] for b in buckets)
                if total_ask_price < 99.0:
                    roi = (100.0 - total_ask_price) / total_ask_price * 100.0
                    print(f"   🚨 ARBITRAGE OPPORTUNITY: Sum of Asks = {total_ask_price:.1f}¢ (ROI: {roi:.2f}%) 🚨")
                    print(f"      ACTION: BUY ALL OUTCOMES")
                
                # --- BUCKET ANALYSIS (Calculate and cache probabilities) ---
                for b in buckets:
                    if my_count > b['h']: 
                        prob = 0.0
                        prob_pois = 0.0
                    else:
                        n_max = max(0, b['h'] - my_count)
                        n_min = max(0, b['l'] - my_count)
                        remaining_proj = max(0, proj - my_count)
                        if remaining_proj == 0:
                            prob = 100.0 if (n_min == 0) else 0.0
                            prob_pois = prob
                        else:
                            prob = TweetAnalyzer.calculate_nbinom_prob(n_min, n_max, remaining_proj, days_left, future_dispersion_mult)
                            prob_pois = TweetAnalyzer.calculate_poisson_prob(n_min, n_max, remaining_proj)
                    
                    # Cache in bucket for reuse
                    b['_prob'] = prob
                    b['_prob_pois'] = prob_pois
                    
                    # Calculate edge and Kelly
                    edge = prob - b['ask']
                    edge2 = prob_pois - b['ask']
                    kf, amt, _ = TweetAnalyzer.calculate_kelly(prob, b['ask'], my_count, proj, days_left)
                    
                    # Signal formatting
                    sig, col = "-", "\033[0m"
                    if days_left > 0:
                        if my_count > b['h']: 
                            sig, col = "💀 DEAD", "\033[90m"
                        elif my_count >= b['l']:
                            if prob > 80: 
                                sig, col = "💎 HOLD", "\033[96m"
                            else: 
                                sig, col = "⚠️ WATCH", "\033[93m"
                            if is_theta_play:
                                sig = "💎 THETA PLAY"
                                col = "\033[95m"
                        else:
                            if edge > Config.EDGE_THRESHOLD: 
                                sig, col = "🚀 BUY YES", "\033[92m"
                            elif edge < -Config.EDGE_THRESHOLD: 
                                sig, col = "❌ BUY NO", "\033[91m"
                    
                    # Filter junk
                    if b['p'] < 1.0 and prob < 1.0: 
                        continue 
                    
                    k_str = f"{kf*100:>4.1f}%" if kf > 0 else "-"
                    sz_str = f"${amt:>4.0f}" if amt > 0 else "-"
                    print(f"   {b['n']:<12} {b['bid']:>5.1f}¢   {b['ask']:>5.1f}¢   {b['spread']:>5.1f}¢   {prob:>5.1f}%    {col}{edge:+.1f}%   {edge2:+.1f}%\033[0m   {k_str:<8} {sz_str:<8} {sig}\033[0m")

                # --- CLUMPED ARBITRAGE & DUTCHING (Use cached probabilities) ---
                clump = [{'b': b, 'prob': b['_prob']} for b in buckets if b['_prob'] > Config.PROB_THRESHOLD]
                omitted_prob_sum = sum(b['_prob'] for b in buckets if b['_prob'] <= Config.PROB_THRESHOLD)

                if clump:
                    # Calculate Clump Stats
                    clump_ask_sum = sum(item['b']['ask'] for item in clump)
                    clump_prob_sum = sum(item['prob'] for item in clump)
                    
                    # ROI = (1.0 / Cost) - 1
                    # using Ask sum as cost
                    roi = 0.0
                    if clump_ask_sum > 0:
                        roi = (100.0 / clump_ask_sum) - 1.0
                    
                    roi_str = f"{roi*100:+.1f}%"
                    color = "\033[92m" if roi > 0 else "\033[91m"
                    
                    # Kelly for the Clump (Treat as one binary event)
                    # Win Prob = clump_prob_sum
                    # Price = clump_ask_sum
                    kf_clump, amt_clump, _ = TweetAnalyzer.calculate_kelly(
                        clump_prob_sum, clump_ask_sum, my_count, proj, days_left
                    )
                    
                    print(f"   ────────────────────────────────────────────────────────────────────────")
                    print(f"   📦 CLUMPED OPP (n={len(clump)}) | AvgSpread: {sum(x['b']['spread'] for x in clump)/len(clump):.4f}")
                    print(f"      Sum(Ask): {clump_ask_sum:.1f}¢ | Prob: {clump_prob_sum:.1f}% | ROI: {color}{roi_str}\033[0m")
                    
                    if omitted_prob_sum > Config.TAIL_RISK_THRESHOLD:
                        print(f"      ⚠️ HIGH TAIL RISK: Omitted Prob = {omitted_prob_sum:.1f}% > {Config.TAIL_RISK_THRESHOLD}%")
                        
                    if amt_clump > 0:
                        print(f"      💰 KELLY BET: ${amt_clump:.0f} (Total) -> DUTCH ALLOCATION:")
                        # Distribute to equalize payout
                        # Bet_i = Total_Bet * (Price_i / Sum_Prices)
                        for item in clump:
                            share = item['b']['ask'] / clump_ask_sum
                            alloc = amt_clump * share
                            print(f"         - {item['b']['n']}: ${alloc:.2f} (at {item['b']['ask']:.1f}¢)")
                    else:
                        print(f"      Advice: NO BET (EV {kf_clump:.4f})")
                 
                    
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
                
                # Parse Spread/Ask for Clumping
                # usage: bestAsk is decimal (0.01), convert to cents
                best_ask = m.get('bestAsk')
                if best_ask is None: best_ask = price / 100.0 # Fallback
                best_ask_cents = float(best_ask) * 100
                
                spread = m.get('spread', 0.0)
                spread_cents = float(spread) * 100
                
                # Derive Bid
                best_bid_cents = max(0.0, best_ask_cents - spread_cents)
                
                buckets.append({
                    'l':l, 'h':h, 
                    'p':price, # Keep original price for reference if needed, but we use Ask for edge
                    'ask': best_ask_cents,
                    'bid': best_bid_cents,
                    'spread': spread_cents,
                    'n':name
                })
            except Exception:
                continue
        
        buckets.sort(key=lambda x: x['l'])
        return buckets

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
                
            tracker_data, is_live = tracker.get_data()
            
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
                    ev = PolymarketAPI.get_event_by_slug(slug)
                    if ev and ev['id'] not in known_ids:
                        if ev.get('closed') is False:
                            combined_events.append(ev)
                            known_ids.add(ev['id'])
            
            # 3. Analytics & Display
            if not combined_events:
                 logger.info("No events found from Search or Page Scan.")
            
            Dashboard.display(tracker_data, combined_events, is_live, kalman=tracker.kalman)
            
            # 4. Archive ended events
            utc_now = datetime.now(timezone.utc)
            for event in combined_events:
                try:
                    end_str = event.get('endDate', '').replace('Z', '+00:00')
                    if end_str:
                        end = datetime.fromisoformat(end_str)
                        if end <= utc_now:
                            # Market has ended, try to archive
                            title = event.get('title', '')
                            final_count = TweetAnalyzer.match_count(title, tracker_data) if tracker_data else None
                            if final_count is not None:
                                markets = event.get('markets', [])
                                buckets = Dashboard._parse_markets(markets)
                                DataManager.archive_event(event, final_count, buckets)
                except Exception as e:
                    logger.debug(f"Archive check failed for event: {e}")
            
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