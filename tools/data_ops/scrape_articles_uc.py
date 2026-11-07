import os
import json
import time
import undetected_chromedriver as uc
from markitdown import MarkItDown
import tempfile

def main():
    json_file = r"C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft\data\raw\telegram_exports\parsed_messages.json"
    output_dir = r"C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft\data\raw\telegram_exports\full_articles_md"
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    with open(json_file, 'r', encoding='utf-8') as f:
        messages = json.load(f)
        
    md = MarkItDown()
    
    options = uc.ChromeOptions()
    options.headless = False
    # Removed --headless argument to prevent renderer crash
    
    # Pre-launch a single driver instance to reuse for speed
    print("Launching stealth browser...")
    try:
        driver = uc.Chrome(options=options, version_main=148)
    except Exception as e:
        print(f"Failed to launch Chrome: {e}")
        return

    # Filter to only messages with URLs
    valid_msgs = [m for m in messages if m.get('url')]
    total = len(valid_msgs)
    
    print(f"Total articles to fetch: {total}")
    
    # For now, let's fetch the first 100 to show the capability
    batch = valid_msgs[:100]
    
    count = 0
    for msg in batch:
        count += 1
        url = msg.get('url')
        msg_id = msg.get('id')
        out_path = os.path.join(output_dir, f"{msg_id}.md")
        
        # Skip if already downloaded
        if os.path.exists(out_path):
            print(f"[{count}/{total}] Skipping {msg_id}, already exists.")
            continue
            
        print(f"[{count}/{total}] Fetching {msg_id}: {url}")
        try:
            driver.get(url)
            
            # Simple check for cloudflare wait
            if "Just a moment..." in driver.title or "Cloudflare" in driver.title:
                time.sleep(8)
            else:
                time.sleep(2) # Give it a bit to load DOM
                
            html_content = driver.page_source
            
            # Convert
            with tempfile.NamedTemporaryFile(delete=False, suffix=".html", mode="w", encoding="utf-8") as temp_file:
                temp_file.write(html_content)
                temp_path = temp_file.name
                
            try:
                result = md.convert(temp_path)
                os.remove(temp_path)
                
                with open(out_path, 'w', encoding='utf-8') as out_f:
                    out_f.write(f"# Telegram Message ID: {msg_id}\n")
                    out_f.write(f"**Date:** {msg.get('date')}\n")
                    out_f.write(f"**Original Source:** {url}\n\n")
                    out_f.write(f"## Article Content\n\n")
                    out_f.write(result.text_content)
                    
            except Exception as e:
                print(f"Error converting to Markdown: {e}")
                
        except Exception as e:
            print(f"Error fetching page: {e}")
            
    try:
        driver.quit()
    except:
        pass
        
if __name__ == '__main__':
    main()
