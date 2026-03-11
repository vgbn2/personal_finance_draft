import os
import json

root = r'C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance'
report_path = os.path.join(root, 'Notebook_Report.md')

total_notebooks = 0
total_glossary = 0
total_formulas = 0

report_lines = [
    "# 📓 Generated Knowledge Notebooks Report",
    "",
    "| Subject Directory | Notebook Name | 📖 Glossary Terms | 🧮 Formulas |",
    "| :--- | :--- | :---: | :---: |"
]

for root_dir, dirs, files in os.walk(root):
    for f in files:
        if f.endswith('_LLM_Summary.ipynb'):
            subject = os.path.basename(root_dir)
            if subject == 'quizzes':
                subject = os.path.basename(os.path.dirname(root_dir))
            
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
                    
                    name_clean = f.replace('_LLM_Summary.ipynb', '')
                    report_lines.append(f"| {subject} | {name_clean} | {g_count} | {f_count} |")
                    
                    total_notebooks += 1
                    total_glossary += g_count
                    total_formulas += f_count
            except Exception as e:
                report_lines.append(f"| {subject} | {f} | ERROR | {e} |")

report_lines.append("")
report_lines.append("## 📊 Overall Totals")
report_lines.append(f"- **Total Notebooks Generated:** {total_notebooks}")
report_lines.append(f"- **Total Glossary Terms:** {total_glossary}")
report_lines.append(f"- **Total Formulas:** {total_formulas}")

with open(report_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(report_lines))

print(f"Report successfully saved to {report_path}")
