import requests
import json

HEADERS = {'User-Agent': 'Mozilla/5.0'}

def debug_search():
    potential_hosts = [
        "https://clob.polymarket.com", 
        "https://gamma-api.polymarket.com", 
        "https://polymarket.com", 
        "https://api.polymarket.com", 
        "https://data-api.polymarket.com",
        "https://strapi-matic.poly.market"
    ]
    
    print("--- CONNECTIVITY DEBUG ---")
    for host in potential_hosts:
        print(f"Testing: {host}")
        try:
            resp = requests.get(host, headers=HEADERS, timeout=3)
            print(f"  [SUCCESS] Status: {resp.status_code}")
        except Exception as e:
            print(f"  [FAILED] {type(e).__name__}: {e}")

if __name__ == "__main__":
    debug_search()
