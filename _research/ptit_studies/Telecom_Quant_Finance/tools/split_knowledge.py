import os
import json
import sys

# Force UTF-8 encoding for Windows
sys.stdout.reconfigure(encoding='utf-8')

ROOT = r"c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance"
SUBDIRS = ["Computer_Science", "Math_Physics", "Signals_Systems"]

def extract_content(nb_path):
    definitions = []
    formulas = []
    
    try:
        with open(nb_path, 'r', encoding='utf-8') as f:
            nb = json.load(f)
            
        current_section = None
        
        for cell in nb.get('cells', []):
            if cell.get('cell_type') == 'markdown':
                # Join source lines
                source = cell.get('source', [])
                if isinstance(source, list):
                    source = ''.join(source)
                
                # Determine sections based on headers
                if '📖 Glossary' in source or '## Glossary' in source or '## 📖' in source:
                    current_section = 'glossary'
                elif '🧮 Formulas' in source or '## Formulas' in source or '## 🧮' in source:
                    current_section = 'formulas'
                elif source.startswith('#'):
                    # If it's a different major header, we might stop parsing glossaries/formulas 
                    # unless it's the expected headers.
                    # But often the whole cell is the glossary.
                    pass
                
                # The cell itself might contain the entire list, or they might be spread out
                lines = source.split('\n')
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                        
                    # Ignore the header lines themselves
                    if line.startswith('#'):
                        if 'Glossary' in line or '📖' in line:
                            current_section = 'glossary'
                        elif 'Formulas' in line or '🧮' in line:
                            current_section = 'formulas'
                        continue
                        
                    # Only grab bullet points
                    if line.startswith('- ') or line.startswith('* '):
                        if current_section == 'glossary':
                            definitions.append(line)
                        elif current_section == 'formulas':
                            formulas.append(line)
                            
    except Exception as e:
        print(f"Error reading notebook {nb_path}: {e}")
        
    return definitions, formulas

def main():
    print("Starting knowledge separation process...\n")
    processed_count = 0
    total_defs = 0
    total_forms = 0
    
    for sd in SUBDIRS:
        sd_path = os.path.join(ROOT, sd)
        if not os.path.exists(sd_path):
            continue
            
        for subject_folder in os.listdir(sd_path):
            subject_path = os.path.join(sd_path, subject_folder)
            if not os.path.isdir(subject_path):
                continue
                
            nb_path = os.path.join(subject_path, "Summary.ipynb")
            if not os.path.exists(nb_path):
                continue
                
            print(f"Processing: {sd}/{subject_folder}")
            
            definitions, formulas = extract_content(nb_path)
            
            if definitions:
                def_path = os.path.join(subject_path, "Definitions.md")
                with open(def_path, 'w', encoding='utf-8') as f:
                    f.write(f"# 📖 Definitions for {subject_folder}\n\n")
                    # Clean up: remove the '- ' from the beginning if we want to format it nicer, 
                    # but keeping it as a list is good too.
                    f.write('\n\n'.join(definitions))
                print(f"  ✓ Saved {len(definitions)} definitions -> Definitions.md")
                total_defs += len(definitions)
                
            if formulas:
                form_path = os.path.join(subject_path, "Formulas.md")
                with open(form_path, 'w', encoding='utf-8') as f:
                    f.write(f"# 🧮 Formulas for {subject_folder}\n\n")
                    f.write('\n\n'.join(formulas))
                print(f"  ✓ Saved {len(formulas)} formulas -> Formulas.md")
                total_forms += len(formulas)
                
            if definitions or formulas:
                processed_count += 1
                
    print("\n" + "="*50)
    print("SEPARATION COMPLETE")
    print("="*50)
    print(f"Subjects processed: {processed_count}")
    print(f"Total definitions separated: {total_defs}")
    print(f"Total formulas separated: {total_forms}")

if __name__ == "__main__":
    main()
