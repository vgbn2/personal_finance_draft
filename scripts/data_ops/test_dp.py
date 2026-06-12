from DrissionPage import ChromiumPage, ChromiumOptions
import time

def test_fetch():
    co = ChromiumOptions()
    co.incognito()
    co.headless(False) # show browser
    
    page = ChromiumPage(co)
    url = "https://www.mql5.com/en/code/46630"
    print(f"Fetching {url}")
    page.get(url)
    
    time.sleep(5)
    
    if "Cloudflare" in page.title or "Just a moment..." in page.title:
        print("Cloudflare detected, waiting...")
        time.sleep(10)
        
    print(f"Title: {page.title}")
    print(f"Content Length: {len(page.html)}")
    if len(page.html) > 0:
        print(page.html[:200])
        
    page.quit()

if __name__ == "__main__":
    test_fetch()
