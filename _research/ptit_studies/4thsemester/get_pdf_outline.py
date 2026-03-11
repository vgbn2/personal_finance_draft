import PyPDF2
import json

def get_outline(pdf_path):
    outline_items = []
    try:
        with open(pdf_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            outline = reader.outline
            
            def parse_outline(outline_list, level=0):
                for item in outline_list:
                    if isinstance(item, list):
                        parse_outline(item, level + 1)
                    else:
                        title = getattr(item, 'title', str(item))
                        outline_items.append("  " * level + title)
            
            if outline:
                parse_outline(outline)
            else:
                return "No outline found."
    except Exception as e:
        return str(e)
    return "\n".join(outline_items)

print(get_outline("Kỹ thuật số - 2013.pdf"))
