"""
Backtesting Module for Elon Tweet Tracker

This module validates model predictions against historical/mock data.
It provides metrics to measure whether the model has a real edge.

Usage:
    python backtest.py --mode mock       # Run with synthetic data
    python backtest.py --mode collect    # Start data collection
    python backtest.py --mode analyze    # Analyze collected data
"""

from __future__ import annotations

import argparse
import csv
import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import requests

# Import from main module
from elonmusk_tweet import Config, TweetAnalyzer, PolymarketAPI, logger


# ==========================================
# 📦 DATA STRUCTURES
# ==========================================

@dataclass
class MarketSnapshot:
    """A point-in-time capture of market state."""
    timestamp: datetime
    event_title: str
    current_count: int
    days_left: float
    buckets: List[BucketSnapshot]
    resolution_date: Optional[datetime] = None
    actual_winner: Optional[int] = None  # Winning bucket index
    
    def to_dict(self) -> dict:
        return {
            'timestamp': self.timestamp.isoformat(),
            'event_title': self.event_title,
            'current_count': self.current_count,
            'days_left': self.days_left,
            'resolution_date': self.resolution_date.isoformat() if self.resolution_date else None,
            'actual_winner': self.actual_winner,
            'buckets': [b.to_dict() for b in self.buckets]
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'MarketSnapshot':
        return cls(
            timestamp=datetime.fromisoformat(data['timestamp']),
            event_title=data['event_title'],
            current_count=data['current_count'],
            days_left=data['days_left'],
            resolution_date=datetime.fromisoformat(data['resolution_date']) if data.get('resolution_date') else None,
            actual_winner=data.get('actual_winner'),
            buckets=[BucketSnapshot.from_dict(b) for b in data['buckets']]
        )


@dataclass
class BucketSnapshot:
    """A single bucket's state at snapshot time."""
    name: str
    low: int
    high: int
    market_price: float  # Market ask in cents
    model_prob: float = 0.0  # Calculated probability
    
    def to_dict(self) -> dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict) -> 'BucketSnapshot':
        return cls(**data)


@dataclass
class BacktestResults:
    """Aggregated backtest metrics."""
    n_markets: int = 0
    brier_score: float = 0.0
    log_loss: float = 0.0
    avg_edge: float = 0.0
    accuracy: float = 0.0
    simulated_roi: float = 0.0
    kelly_profit: float = 0.0
    details: List[dict] = field(default_factory=list)
    
    def summary(self) -> str:
        return f"""
╔══════════════════════════════════════════════════════════╗
║              BACKTEST RESULTS (n={self.n_markets})              
╠══════════════════════════════════════════════════════════╣
║  📊 Brier Score:     {self.brier_score:.4f}  (lower = better calibration)
║  📉 Log Loss:        {self.log_loss:.4f}  (lower = better)
║  📈 Avg Edge:        {self.avg_edge:+.2f}%  (model - market)
║  🎯 Accuracy:        {self.accuracy*100:.1f}%  (correct top pick)
║  💰 Simulated ROI:   {self.simulated_roi*100:+.1f}%  (flat betting)
║  🃏 Kelly Profit:    ${self.kelly_profit:.2f}
╚══════════════════════════════════════════════════════════╝
"""


# ==========================================
# 📡 DATA COLLECTOR
# ==========================================

class DataCollector:
    """Collects and stores market snapshots for future analysis."""
    
    DATA_DIR = Path(__file__).parent / "backtest_data"
    
    def __init__(self):
        self.DATA_DIR.mkdir(exist_ok=True)
        self.snapshots_file = self.DATA_DIR / "snapshots.jsonl"
    
    def capture_current(self) -> Optional[MarketSnapshot]:
        """Captures current market state using the API."""
        api = PolymarketAPI()
        events = api.get_active_events()
        
        if not events:
            logger.warning("No active events to capture")
            return None
        
        # For simplicity, capture first event
        event = events[0]
        
        title = event.get('title', 'Unknown')
        end_date_str = event.get('endDate')
        
        if end_date_str:
            end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
            days_left = max(0, (end_date - datetime.now(timezone.utc)).total_seconds() / 86400)
        else:
            days_left = 7.0  # Default
            end_date = None
        
        # Parse buckets
        markets = event.get('markets', [])
        buckets = []
        
        for m in markets:
            try:
                name = m.get('groupItemTitle', '')
                prices = json.loads(m.get('outcomePrices', '["0", "0"]'))
                price = float(prices[0]) * 100
                
                # Parse range
                low, high = 0, 9999
                if '-' in name:
                    parts = name.split('-')
                    low = int(parts[0].replace(',', ''))
                    high = int(parts[1].replace(',', ''))
                elif '+' in name or 'more' in name.lower():
                    low = int(name.split()[0].replace(',', '').replace('+', ''))
                    high = 99999
                
                buckets.append(BucketSnapshot(
                    name=name,
                    low=low,
                    high=high,
                    market_price=price
                ))
            except Exception:
                continue
        
        if not buckets:
            logger.warning("No valid buckets parsed")
            return None
        
        snapshot = MarketSnapshot(
            timestamp=datetime.now(timezone.utc),
            event_title=title,
            current_count=Config.MANUAL_COUNT_FALLBACK,  # Would need tracker
            days_left=days_left,
            resolution_date=end_date,
            buckets=buckets
        )
        
        return snapshot
    
    def save_snapshot(self, snapshot: MarketSnapshot):
        """Appends snapshot to storage."""
        with open(self.snapshots_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(snapshot.to_dict()) + '\n')
        logger.info(f"Saved snapshot: {snapshot.event_title}")
    
    def load_snapshots(self) -> List[MarketSnapshot]:
        """Loads all stored snapshots."""
        if not self.snapshots_file.exists():
            return []
        
        snapshots = []
        with open(self.snapshots_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    snapshots.append(MarketSnapshot.from_dict(json.loads(line)))
        return snapshots
    
    def load_historical_json(self) -> List[MarketSnapshot]:
        """Loads historical markets from JSON file."""
        json_file = self.DATA_DIR / "historical_markets.json"
        if not json_file.exists():
            logger.warning(f"Historical file not found: {json_file}")
            return []
        
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        snapshots = []
        for item in data:
            try:
                snap = MarketSnapshot.from_dict(item)
                snapshots.append(snap)
            except Exception as e:
                logger.error(f"Failed to parse historical entry: {e}")
        
        return snapshots


# ==========================================
# 📜 HISTORICAL DATA FETCHER
# ==========================================

class HistoricalDataFetcher:
    """
    Fetches historical price data from Polymarket APIs.
    
    Data Sources:
    - Polymarket CLOB API: /prices-history endpoint
    - Polymarket Gamma API: Event/market metadata
    """
    
    CLOB_API = "https://clob.polymarket.com"
    GAMMA_API = "https://gamma-api.polymarket.com"
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json'
        })
    
    def get_price_history(
        self, 
        token_id: str,
        interval: str = "1d",  # 1m, 1h, 6h, 1d, 1w
        start_ts: Optional[int] = None,
        end_ts: Optional[int] = None
    ) -> List[Dict]:
        """
        Fetches historical prices for a market token.
        
        Args:
            token_id: CLOB token ID (from conditionId or tokenId)
            interval: Time interval (1m, 1h, 6h, 1d, 1w, max)
            start_ts: Start Unix timestamp (optional)
            end_ts: End Unix timestamp (optional)
            
        Returns:
            List of {t: timestamp, p: price} dicts
        """
        url = f"{self.CLOB_API}/prices-history"
        params = {
            'market': token_id,
            'interval': interval
        }
        if start_ts:
            params['startTs'] = start_ts
        if end_ts:
            params['endTs'] = end_ts
        
        try:
            resp = self.session.get(url, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            return data.get('history', [])
        except Exception as e:
            logger.error(f"Failed to fetch price history: {e}")
            return []
    
    def search_resolved_events(self, query: str = "elon tweet") -> List[Dict]:
        """Searches for resolved events matching query."""
        url = f"{self.GAMMA_API}/events"
        params = {
            'title_contains': query,
            'closed': 'true',
            'limit': 50
        }
        
        try:
            resp = self.session.get(url, params=params, timeout=15)
            resp.raise_for_status()
            return resp.json() or []
        except Exception as e:
            logger.error(f"Failed to search events: {e}")
            return []
    
    def fetch_resolved_market(self, event: Dict) -> Optional[MarketSnapshot]:
        """
        Converts a resolved Gamma API event to a MarketSnapshot.
        
        Args:
            event: Event dict from Gamma API
            
        Returns:
            MarketSnapshot with actual_winner set based on resolution
        """
        try:
            title = event.get('title', 'Unknown')
            end_date_str = event.get('endDate')
            
            if end_date_str:
                end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
            else:
                return None
            
            markets = event.get('markets', [])
            if not markets:
                return None
            
            buckets = []
            winner_idx = None
            
            for i, m in enumerate(markets):
                name = m.get('groupItemTitle', m.get('question', ''))
                
                # Parse range from name
                low, high = 0, 99999
                if '-' in name:
                    parts = name.split('-')
                    try:
                        low = int(parts[0].replace(',', '').strip())
                        high = int(parts[1].replace(',', '').strip())
                    except ValueError:
                        pass
                elif '+' in name or 'more' in name.lower():
                    try:
                        low = int(name.split()[0].replace(',', '').replace('+', ''))
                    except ValueError:
                        pass
                
                # Get final price (resolved markets have outcome prices)
                prices = json.loads(m.get('outcomePrices', '["0", "0"]'))
                final_price = float(prices[0]) * 100
                
                # Winner is the one with final price near 100
                if final_price > 90:
                    winner_idx = i
                
                buckets.append(BucketSnapshot(
                    name=name,
                    low=low,
                    high=high,
                    market_price=final_price
                ))
            
            if not buckets:
                return None
            
            # We need historical prices before resolution
            # For now, use a simple heuristic: assume uniform-ish pre-resolution
            # Real implementation would need to call get_price_history
            
            return MarketSnapshot(
                timestamp=end_date - timedelta(days=3),  # Simulate snapshot 3 days before
                event_title=title,
                current_count=300,  # Would need historical XTracker data
                days_left=3.0,
                buckets=buckets,
                resolution_date=end_date,
                actual_winner=winner_idx
            )
            
        except Exception as e:
            logger.error(f"Failed to parse event: {e}")
            return None
    
    def fetch_historical_dataset(self, query: str = "elon tweet", limit: int = 20) -> List[MarketSnapshot]:
        """
        Fetches a dataset of resolved markets for backtesting.
        
        Args:
            query: Search query for events
            limit: Max number of events to fetch
            
        Returns:
            List of MarketSnapshots with actual outcomes
        """
        events = self.search_resolved_events(query)[:limit]
        logger.info(f"Found {len(events)} resolved events")
        
        snapshots = []
        for event in events:
            snap = self.fetch_resolved_market(event)
            if snap and snap.actual_winner is not None:
                snapshots.append(snap)
        
        logger.info(f"Parsed {len(snapshots)} valid snapshots")
        return snapshots


# ==========================================
# 🎰 MOCK DATA GENERATOR
# ==========================================

class MockDataGenerator:
    """Generates synthetic historical data for testing."""
    
    @staticmethod
    def generate_market(
        base_count: int = 300,
        days_left: float = 5.0,
        actual_final: Optional[int] = None
    ) -> MarketSnapshot:
        """Generates a mock market snapshot."""
        
        # Generate bucket ranges
        bucket_ranges = [
            (0, 299), (300, 349), (350, 399), (400, 449),
            (450, 499), (500, 549), (550, 599), (600, 99999)
        ]
        
        # Simulate market prices (should roughly sum to 100)
        # Use a rough distribution centered around expected outcome
        if actual_final is None:
            # Project forward
            rate = Config.BASE_RATE
            actual_final = base_count + int(rate * days_left * np.random.normal(1.0, 0.2))
        
        buckets = []
        total_price = 0
        
        for low, high in bucket_ranges:
            name = f"{low}-{high}" if high < 99999 else f"{low}+"
            
            # Simple pricing: higher prob near actual
            if low <= actual_final <= high:
                price = np.random.uniform(40, 70)
            elif abs((low + high) / 2 - actual_final) < 100:
                price = np.random.uniform(10, 30)
            else:
                price = np.random.uniform(1, 10)
            
            total_price += price
            buckets.append(BucketSnapshot(name=name, low=low, high=high, market_price=price))
        
        # Normalize to ~100
        for b in buckets:
            b.market_price = b.market_price / total_price * 100
        
        # Find actual winner
        winner_idx = None
        for i, b in enumerate(buckets):
            if b.low <= actual_final <= b.high:
                winner_idx = i
                break
        
        return MarketSnapshot(
            timestamp=datetime.now(timezone.utc) - timedelta(days=days_left),
            event_title=f"Mock Market (Final: {actual_final})",
            current_count=base_count,
            days_left=days_left,
            buckets=buckets,
            resolution_date=datetime.now(timezone.utc),
            actual_winner=winner_idx
        )
    
    @staticmethod
    def generate_dataset(n: int = 20) -> List[MarketSnapshot]:
        """Generates multiple mock markets."""
        markets = []
        for _ in range(n):
            base = np.random.randint(200, 500)
            days = np.random.uniform(0.5, 7.0)
            markets.append(MockDataGenerator.generate_market(base, days))
        return markets


# ==========================================
# 📊 BACKTESTER
# ==========================================

class Backtester:
    """Runs backtests and calculates metrics."""
    
    def __init__(self, snapshots: List[MarketSnapshot]):
        self.snapshots = snapshots
    
    def run(self) -> BacktestResults:
        """Runs backtest on all snapshots."""
        results = BacktestResults()
        
        brier_scores = []
        log_losses = []
        edges = []
        correct = 0
        total_profit = 0.0
        kelly_profit = 0.0
        
        for snap in self.snapshots:
            if snap.actual_winner is None:
                continue
            
            # Calculate model probabilities
            remaining_proj, disp_mult = TweetAnalyzer.integrate_schedule(
                Config.BASE_RATE, snap.days_left
            )
            
            for i, bucket in enumerate(snap.buckets):
                n_min = max(0, bucket.low - snap.current_count)
                n_max = max(0, bucket.high - snap.current_count)
                remaining = max(0, remaining_proj)
                
                if remaining == 0:
                    bucket.model_prob = 100.0 if n_min == 0 else 0.0
                else:
                    bucket.model_prob = TweetAnalyzer.calculate_nbinom_prob(
                        n_min, n_max, remaining, snap.days_left, disp_mult
                    )
            
            # Metrics calculation
            actual_probs = [1.0 if i == snap.actual_winner else 0.0 
                          for i in range(len(snap.buckets))]
            model_probs = [b.model_prob / 100.0 for b in snap.buckets]
            market_probs = [b.market_price / 100.0 for b in snap.buckets]
            
            # Brier Score: mean((model - actual)^2)
            brier = np.mean([(m - a) ** 2 for m, a in zip(model_probs, actual_probs)])
            brier_scores.append(brier)
            
            # Log Loss
            eps = 1e-10
            winner_model_prob = max(eps, model_probs[snap.actual_winner])
            log_losses.append(-np.log(winner_model_prob))
            
            # Edge: model - market for winner
            winner_edge = (model_probs[snap.actual_winner] - market_probs[snap.actual_winner]) * 100
            edges.append(winner_edge)
            
            # Accuracy: did model's top pick win?
            model_top = np.argmax(model_probs)
            if model_top == snap.actual_winner:
                correct += 1
            
            # Simulated ROI (flat $10 bet on model's top pick)
            bet_price = snap.buckets[model_top].market_price
            if model_top == snap.actual_winner:
                total_profit += (100.0 / bet_price - 1) * 10
            else:
                total_profit -= 10
            
            # Kelly betting
            for i, bucket in enumerate(snap.buckets):
                kf, amt, reason = TweetAnalyzer.calculate_kelly(
                    bucket.model_prob, bucket.market_price,
                    snap.current_count, int(snap.current_count + remaining_proj),
                    snap.days_left
                )
                if amt > 0:
                    if i == snap.actual_winner:
                        kelly_profit += amt * (100.0 / bucket.market_price - 1)
                    else:
                        kelly_profit -= amt
            
            results.details.append({
                'title': snap.event_title,
                'winner': snap.buckets[snap.actual_winner].name,
                'model_top': snap.buckets[model_top].name,
                'correct': model_top == snap.actual_winner,
                'edge': winner_edge
            })
            
            results.n_markets += 1
        
        if results.n_markets > 0:
            results.brier_score = np.mean(brier_scores)
            results.log_loss = np.mean(log_losses)
            results.avg_edge = np.mean(edges)
            results.accuracy = correct / results.n_markets
            results.simulated_roi = total_profit / (results.n_markets * 10)
            results.kelly_profit = kelly_profit
        
        return results


# ==========================================
# 🚀 CLI
# ==========================================

def main():
    parser = argparse.ArgumentParser(description="Backtest Elon Tweet Model")
    parser.add_argument('--mode', choices=['mock', 'collect', 'analyze', 'historical'], 
                       default='mock', help="Operation mode")
    parser.add_argument('--n', type=int, default=20, 
                       help="Number of markets to generate/fetch")
    parser.add_argument('--query', type=str, default="elon tweet",
                       help="Search query for historical mode")
    args = parser.parse_args()
    
    if args.mode == 'mock':
        print("🎰 Generating mock data...")
        markets = MockDataGenerator.generate_dataset(args.n)
        
        print(f"📊 Running backtest on {len(markets)} mock markets...")
        backtester = Backtester(markets)
        results = backtester.run()
        
        print(results.summary())
        
        print("\n📋 Individual Results:")
        for d in results.details[:10]:  # Show first 10
            status = "✅" if d['correct'] else "❌"
            print(f"  {status} {d['title'][:40]} | Winner: {d['winner']} | Model: {d['model_top']} | Edge: {d['edge']:+.1f}%")
    
    elif args.mode == 'historical':
        print(f"📜 Fetching historical data for: '{args.query}'...")
        fetcher = HistoricalDataFetcher()
        markets = fetcher.fetch_historical_dataset(args.query, args.n)
        
        if not markets:
            print("❌ No resolved markets found. Try a different query.")
            return
        
        print(f"📊 Running backtest on {len(markets)} REAL markets...")
        backtester = Backtester(markets)
        results = backtester.run()
        
        print(results.summary())
        
        print("\n📋 Individual Results:")
        for d in results.details[:10]:
            status = "✅" if d['correct'] else "❌"
            print(f"  {status} {d['title'][:50]} | Winner: {d['winner']} | Model: {d['model_top']} | Edge: {d['edge']:+.1f}%")
    
    elif args.mode == 'collect':
        print("📡 Starting data collection...")
        collector = DataCollector()
        snapshot = collector.capture_current()
        
        if snapshot:
            collector.save_snapshot(snapshot)
            print(f"✅ Captured: {snapshot.event_title}")
            print(f"   Buckets: {len(snapshot.buckets)}")
            print(f"   Days left: {snapshot.days_left:.2f}")
        else:
            print("❌ No data captured")
    
    elif args.mode == 'analyze':
        print("📊 Loading collected data...")
        collector = DataCollector()
        snapshots = collector.load_snapshots()
        
        if not snapshots:
            print("❌ No data found. Run with --mode collect first.")
            return
        
        print(f"Found {len(snapshots)} snapshots")
        
        # Filter resolved markets
        resolved = [s for s in snapshots if s.actual_winner is not None]
        
        if not resolved:
            print("⚠️ No resolved markets yet. Update actual_winner in data.")
            return
        
        backtester = Backtester(resolved)
        results = backtester.run()
        print(results.summary())


if __name__ == '__main__':
    main()
