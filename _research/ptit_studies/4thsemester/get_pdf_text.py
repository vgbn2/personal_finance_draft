import PyPDF2
import json

def extract_text(pdf_path, start_page=0, end_page=15):
    text = ""
    try:
        with open(pdf_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            num_pages = len(reader.pages)
            end_page = min(end_page, num_pages)
            for i in range(start_page, end_page):
                page = reader.pages[i]
                text += f"\n--- Page {i} ---\n"
                text += page.extract_text() or ""
    except Exception as e:
        return str(e)
    return text

with open("pdf_text.txt", "w", encoding="utf-8") as out:
    out.write(extract_text("Kỹ thuật số - 2013.pdf", 0, 15))
print("Done")
