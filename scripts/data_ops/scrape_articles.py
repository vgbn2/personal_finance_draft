import os
import json
import time
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
from markitdown import MarkItDown
import tempfile

def fetch_mql5_article(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        try:
            print(f"Fetching {url}...")
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            
            # Simple check if cloudflare challenged
            if "Just a moment..." in page.title() or "Cloudflare" in page.title():
                print("Cloudflare detected, waiting...")
                page.wait_for_timeout(5000)
                
            content = page.content()
            browser.close()
            return content
        except Exception as e:
            print(f"Error fetching page: {e}")
            browser.close()
            return None

def main():
    json_file = r"C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft\data\raw\telegram_exports\parsed_messages.json"
    output_dir = r"C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft\data\raw\telegram_exports\full_articles_md"
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    with open(json_file, 'r', encoding='utf-8') as f:
        messages = json.load(f)
        
    md = MarkItDown()
    
    batch = messages[:2]
    
    for msg in batch:
        url = msg.get('url')
        msg_id = msg.get('id')
        
        if url:
            html_content = fetch_mql5_article(url)
            if html_content:
                # Save temp HTML and convert to Markdown
                with tempfile.NamedTemporaryFile(delete=False, suffix=".html", mode="w", encoding="utf-8") as temp_file:
                    temp_file.write(html_content)
                    temp_path = temp_file.name
                    
                try:
                    result = md.convert(temp_path)
                    os.remove(temp_path)
                    
                    out_path = os.path.join(output_dir, f"{msg_id}.md")
                    with open(out_path, 'w', encoding='utf-8') as out_f:
                        out_f.write(f"# Telegram Message ID: {msg_id}\n")
                        out_f.write(f"**Date:** {msg.get('date')}\n")
                        out_f.write(f"**Original Source:** {url}\n\n")
                        out_f.write(f"## Article Content\n\n")
                        out_f.write(result.text_content)
                        
                    print(f"Saved: {out_path}")
                except Exception as e:
                    print(f"Error converting to Markdown: {e}")
            
if __name__ == '__main__':
    main()
