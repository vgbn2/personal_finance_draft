
import requests
import json

def dump_all_elon():
    url = "https://gamma-api.polymarket.com/events"
    params = {
        "limit": 100,
        "closed": "false",
        "q": "Elon"
    }
    
    print("Fetching ALL active 'Elon' markets...")
    try:
        resp = requests.get(url, params=params).json()
        print(f"Found {len(resp)} events.")
        
        for event in resp:
            title = event.get('title', 'No Title')
            markets = event.get('markets', [])
            
            # Check for the magic numbers in outcomes
            has_bucket = False
            for m in markets:
                if "440" in m.get('groupItemTitle', ''):
                    has_bucket = True
                    break
            
            if has_bucket or "Tweet" in title:
                print(f"\n🎯 POTENTIAL MATCH: {title} (ID: {event['id']})")
                print(f"Slug: {event['slug']}")
                for m in markets:
                    print(f"   - {m.get('groupItemTitle')} (ID: {m['id']})")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    dump_all_elon()
