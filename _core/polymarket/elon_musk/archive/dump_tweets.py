
import requests

def dump_tweets():
    url = "https://gamma-api.polymarket.com/events"
    params = {
        "limit": 50,
        "closed": "false",
        "q": "Tweets"
    }
    
    print("Fetching active 'Tweets' markets...")
    try:
        resp = requests.get(url, params=params).json()
        print(f"Found {len(resp)} events.")
        
        for event in resp:
            title = event.get('title', 'No Title')
            print(f"Checking: {title}")
            
            markets = event.get('markets', [])
            for m in markets:
                out = m.get('groupItemTitle', '')
                if "440" in out or "220" in out:
                    print(f"!!! FOUND MATCH !!!")
                    print(f"Event: {title}")
                    print(f"Slug: {event['slug']}")
                    print(f"Outcome: {out}")
                    return
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    dump_tweets()
