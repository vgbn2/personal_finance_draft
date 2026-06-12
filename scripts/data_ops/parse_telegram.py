import os
import glob
import json
from bs4 import BeautifulSoup

def parse_html(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')
    
    messages = []
    
    for message_div in soup.find_all('div', class_='message default clearfix'):
        msg_id = message_div.get('id', '')
        
        # Get date
        date_div = message_div.find('div', class_='pull_right date details')
        date_str = date_div.get('title', '') if date_div else ''
        
        # Get image
        image_path = None
        photo_a = message_div.find('a', class_='photo_wrap')
        if photo_a and photo_a.get('href'):
            image_path = photo_a.get('href')
            
        # Get article URL and text
        article_url = None
        text_div = message_div.find('div', class_='text')
        text = ''
        if text_div:
            # Check for links inside text
            links = text_div.find_all('a')
            for link in links:
                if link.get_text(strip=True).lower() == 'read more':
                    article_url = link.get('href')
                    link.extract() # Remove the "Read More" link from text
            
            for br in text_div.find_all('br'):
                br.replace_with('\n')
            
            text = text_div.get_text(separator=' ', strip=True)
            # clean up trailing '...'
            if text.endswith('...'):
                text = text[:-3].strip()
            
        if text or image_path or article_url:
            messages.append({
                'id': msg_id,
                'date': date_str,
                'text': text,
                'image': image_path,
                'url': article_url
            })
            
    return messages

def main():
    export_dir = r"C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft\data\raw\telegram_exports"
    html_files = glob.glob(os.path.join(export_dir, "*.html"))
    
    all_messages = []
    for f in html_files:
        print(f"Parsing {f}...")
        msgs = parse_html(f)
        all_messages.extend(msgs)
        
    out_file = r"C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft\data\raw\telegram_exports\parsed_messages.json"
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(all_messages, f, indent=4, ensure_ascii=False)
        
    print(f"Total messages parsed: {len(all_messages)}")
    print(f"Saved to {out_file}")

if __name__ == "__main__":
    main()