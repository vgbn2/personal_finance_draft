import os
import json
import requests
import hashlib
import nbformat as nbf
import re
import sys

# Force UTF-8 for Windows console
sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = r"c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance"
CHECKPOINT_FILE = os.path.join(ROOT_DIR, "_extraction_checkpoint.json")

OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "gemma3:4b"

# Subdirectories mapping
SUBJECT_MAP = {
    "Kỹ thuật theo dõi, giám sát an toàn mạng": "Computer_Science",
    "Lập trình mạng": "Computer_Science",
    "Mạng cảm biến": "Computer_Science",
    "Mạng máy tính và internet": "Computer_Science",
    "Thuật toán và ứng dụng": "Computer_Science",
    "Kỹ thuật Vi xử lý": "Signals_Systems",
    "Truyền thông nội bộ trong tổ chức": "Signals_Systems",
    "Truyền thông số": "Signals_Systems",
    "Bài giảng Thống kê doanh nghiệp": "Math_Physics",
    "Giải tích hàm một biến số (Giải tích 1)": "Math_Physics",
    "Giải tích hàm nhiều biến số (Giải tích 2)": "Math_Physics",
    "Thống kê doanh nghiệp": "Math_Physics",
    "Toán kỹ thuật": "Math_Physics",
    "Toán rời rạc 1": "Math_Physics",
    "Toán rời rạc 2": "Math_Physics"
}

def query_ollama(prompt, system_prompt):
    data = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "stream": False,
        "options": {"num_predict": 2048, "temperature": 0.3}
    }
    try:
        response = requests.post(OLLAMA_URL, json=data)
        response.raise_for_status()
        result = response.json()
        return result.get("message", {}).get("content", "")
    except requests.exceptions.RequestException as e:
        print(f"Error querying Ollama: {e}")
        return ""

def generate_quant_simulation(concept_text):
    system_prompt = """You are a Senior Quantitative Analyst at an elite hedge fund.
You are given an abstract mathematical, computer science, or signal processing concept/formula.
Your goal is to apply this concept to a Quantitative Finance scenario and write an executable Python simulation.

Follow this exact structure for your response, outputting ONLY Markdown:

### 1. Theoretical Concept
[A 2-sentence explanation of what the original concept is]

### 2. Quant Finance Application
[A 3-sentence explanation of how this concept relates to quantitative finance, algotrading, market making, risk management, or asset pricing]

### 3. Python Simulation
[Write a clean, executable Python script using clear types and variables. It must use numpy, pandas, or matplotlib to simulate the scenario above. Print or plot the result clearly.]
```python
# Your python code here
```
"""
    prompt = f"Develop a Quant Finance simulation based on this theoretical concept or formula:\n{concept_text}"
    return query_ollama(prompt, system_prompt)

def extract_python_code(markdown_text):
    pattern = r'```python\n(.*?)\n```'
    match = re.search(pattern, markdown_text, re.DOTALL)
    if match:
        return match.group(1)
    return None

def create_notebook(concept, markdown_content, python_code, out_path):
    nb = nbf.v4.new_notebook()
    
    # Strip python code from markdown to separate them nicely
    markdown_only = re.sub(r'```python\n.*?\n```', '', markdown_content, flags=re.DOTALL).strip()
    
    cells = [
        nbf.v4.new_markdown_cell(f"# Quant Finance Simulation: {concept[:50]}..."),
        nbf.v4.new_markdown_cell(markdown_only)
    ]
    
    if python_code:
        cells.append(nbf.v4.new_code_cell(python_code))
        
    nb.cells = cells
    
    with open(out_path, 'w', encoding='utf-8') as f:
        nbf.write(nb, f)

def main():
    if not os.path.exists(CHECKPOINT_FILE):
        print("Checkpoint file not found.")
        return
        
    with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
        checkpoint = json.load(f)
        
    partials = checkpoint.get("partial_results", {})
    completed_files = checkpoint.get("completed_files", [])
    
    # We will sample 2 from each main subdirectory to avoid spamming
    subject_formulas = {sub: [] for sub in set(SUBJECT_MAP.values())}
    subject_formulas["Uncategorized"] = []
    
    for file_name in completed_files:
        base_name = os.path.basename(file_name).replace('.pdf', '')
        subject = SUBJECT_MAP.get(base_name, "Uncategorized")
        
        # Find the hash for this file
        file_hash = None
        for k, v in metadata_hash_map(completed_files, partials).items():
            if k == file_name:
                 file_hash = v
                 break
                 
    # A simpler way: just iterate over partials and assign a round-robin subject if we can't map it properly.
    # Alternatively build lists per subject
    pass

def sanitize_filename(name):
    return re.sub(r'[\/:*?"<>|]', '', name)[:50].strip()

def main():
    print("Finding generated summary notebooks...")
    all_targets = []
    
    for root_dir, dirs, files in os.walk(ROOT_DIR):
        for f in files:
            if f.endswith('_LLM_Summary.ipynb'):
                path = os.path.join(root_dir, f)
                try:
                    with open(path, 'r', encoding='utf-8') as file:
                        nb = json.load(file)
                        for cell in nb.get('cells', []):
                            if cell.get('cell_type') == 'markdown':
                                source_lines = cell.get('source', [])
                                if isinstance(source_lines, list):
                                    source = ''.join(source_lines)
                                else:
                                    source = source_lines
                                
                                if '## 🧮 Formulas' in source:
                                    lines = source.split('\n')
                                    for line in lines:
                                        line = line.strip()
                                        if line.startswith('- ') and ('$$' in line or 'Calculation' in line or 'Theorem' in line or 'Filter' in line or 'Transform' in line):
                                            all_targets.append(line[2:].strip())
                except Exception as e:
                    print(f"Failed to read {f}: {e}")
                    
    if not all_targets:
        print("No suitable formulas found in notebooks.")
        return
        
    # Deduplicate
    all_targets = list(set(all_targets))
    
    print(f"Found {len(all_targets)} high-potential formulas. Generating practical simulations for a subset...")
    
    import random
    random.seed(42) # for reproducibility if wanted, or just shuffle
    random.shuffle(all_targets)
    
    sample_size = min(6, len(all_targets))
    sample_targets = all_targets[:sample_size]
    
    # For organization, we'll map them to relevant dirs
    for i, formula in enumerate(sample_targets):
        print(f"\n[{i+1}/{sample_size}] Simulating: {formula[:50]}...")
        
        # Assign to a relevant subject folder based on keywords
        subject = "Math_Physics"
        if "Filter" in formula or "Signal" in formula or "Nyquist" in formula or "Transform" in formula:
            subject = "Signals_Systems"
        elif "TDM" in formula or "Tốc độ" in formula or "Channel" in formula:
            subject = "Computer_Science"
            
        out_dir = os.path.join(ROOT_DIR, subject, "simulations")
        os.makedirs(out_dir, exist_ok=True)
        
        response_md = generate_quant_simulation(formula)
        if not response_md:
            print("  [!] Failed to generate.")
            continue
            
        py_code = extract_python_code(response_md)
        safe_name = f"Simulation_{i+1}.ipynb"
        out_path = os.path.join(out_dir, safe_name)
        
        create_notebook(formula, response_md, py_code, out_path)
        print(f"  [SUCCESS] Organized and saved to {subject}/simulations/{safe_name}")

if __name__ == "__main__":
    print("Starting Quant Finance Simulation Generator...")
    main()
