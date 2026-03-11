
import argparse
import asyncio
import sys
import logging
import re
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from datetime import datetime
from typing import List, Dict, Tuple
import os

# Fix import path for sibling directory
# Fix import path for sibling directory
import os
try:
    # Script mode
    current_dir = os.path.dirname(os.path.abspath(__file__))
except NameError:
    # Interactive/Jupyter mode
    current_dir = os.getcwd()

sys.path.append(os.path.abspath(os.path.join(current_dir, '..', '..')))
from macroe.polymarket_client import PolymarketClient  # We can likely use simple requests for this live polling

import requests

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("LiveGraph")

class Outcome:
    def __init__(self, title: str, price: float, market_id: str):
        self.title = title
        self.price = price
        self.market_id = market_id
        self.sort_val = self._parse_val(title)

    def _parse_val(self, title: str) -> int:
        try:
            clean = title.replace(",", "")
            if "-" in clean: return int(clean.split("-")[0])
            if "<" in clean: return 0
            if "+" in clean: return int(clean.replace("+", ""))
            return 9999
        except: return 9999

class LivePolymarketGraph:
    def __init__(self, search_query: str = "Tweets", group_size: int = 80):
        self.search_query = search_query
        self.group_size = group_size
        self.history: Dict[str, List[Tuple[datetime, float]]] = {} 
        self.fig = None
        self.axes = {} # bucket_index -> ax
        self.outcomes_map = {} # title -> Outcome obj
        
    def _get_bucket_index(self, val: int) -> int:
        return val // self.group_size

    def fetch_current_data(self) -> List[Outcome]:
        """Scrape active markets matching query."""
        url = "https://gamma-api.polymarket.com/events"
        params = {"limit": 50, "closed": "false", "q": self.search_query}
        outcomes = []
        
        try:
            resp = requests.get(url, params=params).json()
            for event in resp:
                title = event.get('title', '')
                if "Elon" not in title: continue 
                
                markets = event.get('markets', [])
                for m in markets:
                    try:
                        prices = eval(m.get('outcomePrices', '["0", "0"]'))
                        price = float(prices[0])
                        outcomes.append(Outcome(m.get('groupItemTitle'), price, m['id']))
                    except: pass
        except Exception as e:
            logger.error(f"Fetch error: {e}")
            
        outcomes.sort(key=lambda x: x.sort_val)
        return outcomes

    def update(self, frame):
        outcomes = self.fetch_current_data()
        now = datetime.now()
        
        if not outcomes:
            print("No data found...")
            return

        print(f"[{now.time()}] Fetched {len(outcomes)} outcomes.")
        
        # 1. Update History
        active_buckets = set()
        for out in outcomes:
            if out.title not in self.history:
                self.history[out.title] = []
            self.history[out.title].append((now, out.price * 100))
            self.outcomes_map[out.title] = out
            
            # Determine bucket
            if out.sort_val != 9999:
                b_idx = self._get_bucket_index(out.sort_val)
                active_buckets.add(b_idx)

        # 2. Setup Subplots (only on first active frame or if buckets change?)
        # For simplicity, let's clear and redraw IF buckets changed significantly,
        # otherwise just clear axes.
        # Actually, standard FuncAnimation expects fixed axes.
        # We will assume a fixed number of potential buckets or just use one big figure.
        # Let's try to manage dynamic subplots.
        
        sorted_buckets = sorted(list(active_buckets))
        
        # Re-create figure if bucket count changes (expensive but needed)
        if len(self.axes) != len(sorted_buckets):
            plt.clf()
            self.fig = plt.gcf()
            # Create N subplots
            n = len(sorted_buckets)
            if n == 0: return
            
            self.axes = {}
            # Create subplots grid
            axs = self.fig.subplots(n, 1, sharex=True)
            if n == 1: axs = [axs]
            
            for i, b_idx in enumerate(sorted_buckets):
                self.axes[b_idx] = axs[i]
                
        # 3. Plot Data
        for b_idx, ax in self.axes.items():
            ax.clear()
            start = b_idx * self.group_size
            end = start + self.group_size - 1
            ax.set_title(f"Range: {start}-{end}")
            ax.set_ylim(0, 100)
            ax.grid(True, alpha=0.3)
            
            # Find outcomes in this bucket
            bucket_outcomes = [
                out for out in outcomes 
                if self._get_bucket_index(out.sort_val) == b_idx
            ]
            
            # Sort by price descending
            bucket_outcomes.sort(key=lambda x: x.price, reverse=True)
            
            for out in bucket_outcomes:
                times = [x[0] for x in self.history[out.title]]
                prices = [x[1] for x in self.history[out.title]]
                # Only plot tail to keep speed? No, full history needed for patterns.
                ax.plot(times, prices, label=f"{out.title} ({out.price*100:.1f}%)")
                
            ax.legend(loc='upper left', fontsize='small')

    def start(self):
        # 1. Check if running in Jupyter/Notebook
        is_notebook = False
        try:
            from IPython import get_ipython
            if get_ipython(): is_notebook = True
        except ImportError:
            pass

        # 2. Notebook Mode: Use explicit loop with clear_output
        if is_notebook:
            from IPython.display import display, clear_output
            import time
            
            print("Starting Live Graph in Notebook Mode...")
            self.fig = plt.figure(figsize=(12, 10))
            
            try:
                while True:
                    self.update(0) # Update data and axes
                    
                    # Force redraw
                    clear_output(wait=True)
                    display(self.fig)
                    
                    # Pause
                    time.sleep(5)
            except KeyboardInterrupt:
                print("Stopped.")
                
        # 3. Script Mode: Use FuncAnimation
        else:
            self.fig = plt.figure(figsize=(12, 10))
            ani = animation.FuncAnimation(self.fig, self.update, interval=5000)
            plt.tight_layout()
            plt.show()

if __name__ == "__main__":
    # Default to scanning for "Elon Tweets"
    graph = LivePolymarketGraph(search_query="Elon Tweets")
    graph.start()
