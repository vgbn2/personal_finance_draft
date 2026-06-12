import os
import json
import time
import cloudscraper
import tempfile
from markitdown import MarkItDown

def main():
    json_file = r"C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft\data\raw\telegram_exports\parsed_messages.json"
    output_dir = r"C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft\data\raw\telegram_exports\markdown_articles"
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    with open(json_file, 'r', encoding='utf-8') as f:
        messages = json.load(f)
        
    md = MarkItDown()
    scraper = cloudscraper.create_scraper() # Returns a CloudScraper instance
    
    # We will process a small batch to test
    batch = messages[:5]
    print(f"Processing {len(batch)} URLs out of {len(messages)}...")
    
    for msg in batch:
        url = msg.get('url')
        msg_id = msg.get('id')
        
        if url:
            print(f"[{msg_id}] Fetching: {url}")
            try:
                # Fetch HTML using cloudscraper to bypass 403
                response = scraper.get(url)
                response.raise_for_status() # Raise error if status is not 200
                
                # Save to a temporary file for markitdown
                with tempfile.NamedTemporaryFile(delete=False, suffix=".html") as temp_file:
                    temp_file.write(response.content)
                    temp_path = temp_file.name
                    
                # Convert the local HTML file
                result = md.convert(temp_path)
                
                # Clean up temp file
                os.remove(temp_path)
                
                # Save markdown content
                out_path = os.path.join(output_dir, f"{msg_id}.md")
                with open(out_path, 'w', encoding='utf-8') as out_f:
                    out_f.write(f"# Telegram Message ID: {msg_id}\n")
                    out_f.write(f"**Date:** {msg.get('date')}\n")
                    out_f.write(f"**Original Source:** {url}\n\n")
                    out_f.write(f"## Article Content\n\n")
                    out_f.write(result.text_content)
                    
                print(f"Saved: {out_path}")
                time.sleep(2) # be nice to the server
            except Exception as e:
                print(f"Failed to convert {url}: {e}")
        else:
            print(f"[{msg_id}] No URL found.")

if __name__ == '__main__':
    main()
