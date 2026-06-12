import os
import json
import time
from DrissionPage import ChromiumPage, ChromiumOptions
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
    
    # Configure DrissionPage
    co = ChromiumOptions()
    co.incognito()
    co.headless(False) # Keep visible to ensure CF passes
    
    page = ChromiumPage(co)
    
    valid_msgs = [m for m in messages if m.get('url')]
    total = len(valid_msgs)
    
    print(f"Total articles to fetch: {total}")
    
    count = 0
    for msg in valid_msgs:
        count += 1
        url = msg.get('url')
        msg_id = msg.get('id')
        out_path = os.path.join(output_dir, f"{msg_id}.md")
        
        # Skip if already downloaded
        if os.path.exists(out_path):
            # Also check if it's not a 403 error inside
            with open(out_path, 'r', encoding='utf-8') as f:
                content = f.read()
            if "Access to www.mql5.com was denied" not in content and "HTTP ERROR 403" not in content:
                print(f"[{count}/{total}] Skipping {msg_id}, already successfully downloaded.")
                continue
            
        print(f"[{count}/{total}] Fetching {msg_id}: {url}")
        try:
            page.get(url)
            
            # Basic cloudflare check
            if "Just a moment..." in page.title or "Cloudflare" in page.title:
                time.sleep(8)
            else:
                time.sleep(2)
                
            html_content = page.html
            
            if "Access to www.mql5.com was denied" in html_content:
                print("Hit Cloudflare block again, pausing for 30s...")
                time.sleep(30)
                continue
                
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
        page.quit()
    except:
        pass
        
if __name__ == '__main__':
    main()
