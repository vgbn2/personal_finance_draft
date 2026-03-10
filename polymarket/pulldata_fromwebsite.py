import requests
import re
import json

# ==========================================
# 🧠 DYNAMIC SLUG GENERATOR
# ==========================================
def text_to_slug(date_text):
    """
    Converts a date range string into a URL-friendly slug for easy identification.
    Example: "Jan 23 - Jan 30" -> "elon-musk-of-tweets-january-23-january-30"
    """
    month_map = {
        "Jan": "january", "Feb": "february", "Mar": "march", "Apr": "april",
        "May": "may", "Jun": "june", "Jul": "july", "Aug": "august",
        "Sep": "september", "Oct": "october", "Nov": "november", "Dec": "december"
    }
    
    clean = date_text.replace(" - ", "-").split("-")
    slug_parts = []
    
    for part in clean:
        parts = part.strip().split(" ") # e.g., ["Jan", "23"]
        if len(parts) == 2:
            m = month_map.get(parts[0], parts[0].lower())
            d = parts[1]
            slug_parts.append(f"{m}-{d}")
            
    if len(slug_parts) == 2:
        return f"elon-musk-of-tweets-{slug_parts[0]}-{slug_parts[1]}"
    return None

# ==========================================
# 🕵️ SIMPLE SCRAPER
# ==========================================
class SimpleScraper:
    """A class to scrape data using simple HTTP requests."""
    def __init__(self):
        self.url = "https://xtracker.polymarket.com/user/elonmusk"
        self.market_data = {} # Stores {slug: count}

    def scrape(self):
        """
        Uses the requests library to download the page content.
        Returns True on success, False on failure.
        """
        print(f"🌎 Making a simple HTTP request to {self.url}...")
        try:
            # A User-Agent is important to mimic a real browser
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            response = requests.get(self.url, headers=headers, timeout=10)
            response.raise_for_status() # Raises an error for bad responses (4xx or 5xx) 
            
            print("📄 Parsing page content...")
            self._process_text(response.text)
            return True
        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {e}")
            return False
        finally:
            print("✅ Request process finished.")

    def _process_text(self, text):
        """
        Parses the raw text from the page to find market dates and tweet counts.
        """
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        date_pattern = re.compile(r"([A-Z][a-z]{2} \d{1,2} - [A-Z][a-z]{2} \d{1,2})")
        
        current_markets = {}
        
        for i, line in enumerate(lines):
            match = date_pattern.search(line)
            if match:
                date_str = match.group(1) # e.g. "Jan 23 - Jan 30"
                slug = text_to_slug(date_str)
                
                # The tweet count is usually in the next few lines
                for j in range(1, 5):
                    if i + j < len(lines):
                        candidate = lines[i+j].replace(',', '')
                        if candidate.isdigit():
                            if slug:
                                current_markets[slug] = int(candidate)
                            break
        
        if current_markets:
            print(f"🔍 Found {len(current_markets)} active market(s).")
            self.market_data = current_markets
        else:
            # This is the key message if the simple approach fails
            print("\n⚠️  No market data was found in the page source.")
            print("   This likely means the website loads its data using JavaScript.")
            print("   A simple HTTP request cannot run JavaScript, so the complex (Selenium) method is necessary to scrape this site.")


def main():
    """Main function to run the scraper and print the data."""
    scraper = SimpleScraper()
    success = scraper.scrape()

    if success and scraper.market_data:
        print("\n--- SCRAPED DATA ---")
        print(json.dumps(scraper.market_data, indent=2))
        print("--------------------\n")

if __name__ == "__main__":
    main()