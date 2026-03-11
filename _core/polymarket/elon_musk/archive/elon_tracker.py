"""
ELON TRACKER SERVICE (Source of Truth)
Resolution Source: https://xtracker.polymarket.com/user/elonmusk

RUN THIS SCRIPT IN A SEPARATE TERMINAL.
It will scrape the count every 60s and save it to 'elon_stats.json'.
"""

import sys
import time
import re
import json
import os
from datetime import datetime

# WIN FIX
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except: pass

REFRESH_INTERVAL = 300 # Seconds

class ElonTracker:
    def __init__(self):
        self.url = "https://xtracker.polymarket.com/user/elonmusk"
        self.driver = None

    def start_browser(self):
        try:
            from selenium import webdriver
            from selenium.webdriver.edge.options import Options as EdgeOptions
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            from selenium.webdriver.common.by import By
            
            options = EdgeOptions()
            options.add_argument("--headless=new")
            options.add_argument("--disable-gpu")
            options.add_argument("--log-level=3")
            options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

            print("🚀 Launching Tracker (Edge Headless)...")
            self.driver = webdriver.Edge(options=options)
            return True
        except ImportError:
            print("❌ Error: Selenium not installed. Run 'pip install selenium'")
            return False
        except Exception as e:
            print(f"❌ Browser Error: {e}")
            return False

    def get_official_count(self):
        if not self.driver: 
            if not self.start_browser(): return None

        print(f"📡 Fetching XTracker...", end="\r")
        try:
            from selenium.webdriver.common.by import By
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC

            self.driver.get(self.url)
            
            # Wait for any body content
            WebDriverWait(self.driver, 25).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            
            time.sleep(5) # Hydration buffer
            text = self.driver.find_element(By.TAG_NAME, "body").text
            
            # Parse
            date_pattern = re.compile(r"([A-Z][a-z]+ \d{1,2}(?:, \d{4})? - [A-Z][a-z]+ \d{1,2}(?:, \d{4})?)")
            
            found_data = []
            lines = [l.strip() for l in text.split('\n') if l.strip()]
            
            for i, line in enumerate(lines):
                if date_pattern.search(line):
                    for j in range(1, 5):
                        if i+j >= len(lines): break
                        candidate = lines[i+j].replace(',', '')
                        if candidate.isdigit():
                            found_data.append({'range': line, 'count': int(candidate)})
                            break
            
            if not found_data:
                print(f"⚠️  No data matched inside text (Length: {len(text)}).")
            else:
                print(f"✅ Found {len(found_data)} records.     ")

            return found_data

        except Exception as e:
            print(f"⚠️ Scraping Failed: {e}")
            return None

    def close(self):
        if self.driver: self.driver.quit()

def save_to_json(data):
    if not data: return
    payload = {
        "timestamp": time.time(),
        "last_updated_human": datetime.now().strftime("%H:%M:%S"),
        "data": data
    }
    try:
        with open("elon_stats.json", "w") as f:
            json.dump(payload, f, indent=2)
        print(f"💾 Saved to elon_stats.json")
    except Exception as e:
        print(f"❌ Save Error: {e}")

def main():
    tracker = ElonTracker()
    try:
        while True:
            t_start = time.time()
            data = tracker.get_official_count()
            
            if data:
                print("-" * 50)
                for item in data:
                     print(f"📅 {item['range']:<30} 👉 {item['count']}")
                save_to_json(data)
            
            print("-" * 50)
            
            # Sleep remainder
            elapsed = time.time() - t_start
            sleep_time = max(1, REFRESH_INTERVAL - elapsed)
            
            for i in range(int(sleep_time), 0, -1):
                print(f"💤 Refreshing in {i}s...", end="\r")
                time.sleep(1)
            print(" " * 30, end="\r")
                
    except KeyboardInterrupt:
        print("\n🛑 Stopping...")
    finally:
        tracker.close()

if __name__ == "__main__":
    main()
