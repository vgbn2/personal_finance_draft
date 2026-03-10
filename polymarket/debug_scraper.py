import sys
import time
# Force utf-8 output
sys.stdout.reconfigure(encoding='utf-8')

from selenium import webdriver
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.common.by import By

options = EdgeOptions()
options.add_argument("--headless=new")
options.add_argument("--disable-gpu")
options.add_argument("--log-level=3")

print("Launching...")
driver = webdriver.Edge(options=options)
try:
    print("Navigating...")
    driver.get("https://xtracker.polymarket.com/user/elonmusk")
    time.sleep(10)
    print("Page Title:", driver.title)
    
    body = driver.find_element(By.TAG_NAME, "body").text
    print("\n--- BODY TEXT ---")
    print(body[:1000])
    print("-----------------\n")
    
    # Dump full html
    with open("page_dump.html", "w", encoding="utf-8") as f:
        f.write(driver.page_source)
    print("Saved page_dump.html")
    
except Exception as e:
    print(f"Error: {e}")
finally:
    driver.quit()
