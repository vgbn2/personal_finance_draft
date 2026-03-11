import os
import json

root = r'C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance'
total_notebooks = 0
total_glossary = 0
total_formulas = 0

print(f"{'Notebook Name':<45} | {'Glossary':<10} | {'Formulas':<10}")
print('-' * 70)

for root_dir, dirs, files in os.walk(root):
    for f in files:
        if f.endswith('_LLM_Summary.ipynb'):
            path = os.path.join(root_dir, f)
            try:
                with open(path, 'r', encoding='utf-8') as file:
                    nb = json.load(file)
                    cells = nb.get('cells', [])
                    g_count = 0
                    f_count = 0
                    for cell in cells:
                        if cell.get('cell_type') == 'markdown':
                            source = ''.join(cell.get('source', []))
                            if '## 📖 Glossary' in source:
                                g_count = source.count('- [')
                            elif '## 🧮 Formulas' in source:
                                f_count = source.count('- [')
                    
                    print(f"{f[:43]:<45} | {g_count:<10} | {f_count:<10}")
                    total_notebooks += 1
                    total_glossary += g_count
                    total_formulas += f_count
            except Exception as e:
                print(f"{f[:43]:<45} | ERROR: {e}")

print('-' * 70)
print(f"Total Notebooks: {total_notebooks} | Total Glossary: {total_glossary} | Total Formulas: {total_formulas}")
