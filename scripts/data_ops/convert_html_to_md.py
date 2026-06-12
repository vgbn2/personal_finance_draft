import os
import glob
from markitdown import MarkItDown

def main():
    export_dir = r"C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft\data\raw\telegram_exports"
    html_files = glob.glob(os.path.join(export_dir, "*.html"))
    output_dir = os.path.join(export_dir, "markdown_exports")
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    md = MarkItDown()
    
    for html_file in html_files:
        print(f"Converting {html_file}...")
        try:
            result = md.convert(html_file)
            
            # Save markdown content
            base_name = os.path.basename(html_file).replace('.html', '.md')
            out_path = os.path.join(output_dir, base_name)
            
            with open(out_path, 'w', encoding='utf-8') as out_f:
                out_f.write(result.text_content)
                
            print(f"Saved: {out_path}")
        except Exception as e:
            print(f"Failed to convert {html_file}: {e}")

if __name__ == '__main__':
    main()
