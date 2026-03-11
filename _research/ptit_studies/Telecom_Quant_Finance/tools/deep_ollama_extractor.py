import os
import sys
import re
import nbformat as nbf
from pypdf import PdfReader
from collections import defaultdict
import requests
import json
import time

# Force UTF-8 for Windows console
sys.stdout.reconfigure(encoding='utf-8')

# --- CONFIGURATION ---
ROOT_DIR = r"c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance"
SUBDIRS = ["Finance", "Math_Physics", "Computer_Science", "Signals_Systems"]
OLLAMA_URL = "http://localhost:11434/api/generate"
# Assuming gemma3:4b from screenshot, fallback to a standard name if needed
OLLAMA_MODEL = "gemma3:4b"  

MAX_PAGES_TO_READ = 9999 # Read all pages
WORDS_PER_CHUNK = 800

def query_ollama(prompt, system_prompt="You are an expert academic assistant.", max_retries=3):
    """Sends a request to the local Ollama instance."""
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "system": system_prompt,
        "stream": False,
        "options": {
            "temperature": 0.1, # Low temp for factual extraction
            "num_predict": 1024
        }
    }
    
    for attempt in range(max_retries):
        try:
            response = requests.post(OLLAMA_URL, json=payload, timeout=120)
            response.raise_for_status()
            return response.json().get("response", "").strip()
        except requests.exceptions.RequestException as e:
            print(f"    [!] Ollama connection error (Attempt {attempt+1}/{max_retries}): {e}")
            time.sleep(2)
            
    return "(Extraction Failed: Could not communicate with Ollama)"

def chunk_text(text, words_per_chunk=WORDS_PER_CHUNK):
    """Splits text into roughly equal word chunks."""
    words = text.split()
    for i in range(0, len(words), words_per_chunk):
        yield " ".join(words[i:i + words_per_chunk])

def extract_with_llm(text_chunk):
    """Prompts Ollama to extract glossary definitions and formulas from a text chunk."""
    system_prompt = """
    You are an expert academic extractor for Vietnamese university materials (Telecom/Math/Finance).
    Given the text chunk, extract TWO things ONLY:
    1. GLOSSARY: Definitions of key concepts explicitly stated in the text.
    2. FORMULAS: Any mathematical equations found, formatted strictly in LaTeX enclosed in $$. Include a brief 1-line explanation of variables if available.
    
    Respond STRICTLY in the following format:
    ---GLOSSARY---
    * **[Term]**: [Definition]
    ---FORMULAS---
    * **[Name of Formula]**: $$[LaTeX equation]$$ - [Explanation]
    
    If no definitions or formulas are found in the chunk, leave the section under the header empty. Do not invent information. Do not translate Vietnamese terms.
    """
    
    prompt = f"Extract from the following text chunk:\n\n{text_chunk}"
    
    return query_ollama(prompt, system_prompt)

def parse_llm_response(response_text):
    """Parses the structured output from Ollama into lists of strings."""
    glossary = []
    formulas = []
    
    current_section = None
    for line in response_text.split('\n'):
        line = line.strip()
        if not line: continue
        
        if "---GLOSSARY---" in line:
            current_section = "glossary"
            continue
        elif "---FORMULAS---" in line:
            current_section = "formulas"
            continue
            
        if line.startswith('*') or line.startswith('-'):
            clean_line = line.lstrip('*- ').strip()
            if current_section == "glossary" and clean_line:
                glossary.append(clean_line)
            elif current_section == "formulas" and clean_line:
                formulas.append(clean_line)
                
    return glossary, formulas

def process_pdf(pdf_path):
    """Reads PDF, chunks it, and extracts using LLM."""
    print(f"  -> Reading {os.path.basename(pdf_path)}...")
    all_glossary = []
    all_formulas = []
    full_text = ""
    
    try:
        reader = PdfReader(pdf_path)
        
        # 1. Read Text
        for i, page in enumerate(reader.pages):
            if i >= MAX_PAGES_TO_READ: break
            content = page.extract_text()
            if content: full_text += content + "\n"
            
        if not full_text.strip():
            print("     [Warning] No text extracted (scanned PDF?).")
            return [], []
            
        # 2. Chunk and Extract
        chunks = list(chunk_text(full_text))
        print(f"     [+] Text split into {len(chunks)} chunks. Processing with {OLLAMA_MODEL}...")
        
        for i, chunk in enumerate(chunks):
            print(f"       - Extrating from chunk {i+1}/{len(chunks)}...", end="", flush=True)
            llm_reply = extract_with_llm(chunk)
            g, f = parse_llm_response(llm_reply)
            all_glossary.extend(g)
            all_formulas.extend(f)
            print(f" Found {len(g)} definitions, {len(f)} formulas.")
            
    except Exception as e:
        print(f"    [!] Error processing PDF: {e}")
        
    return all_glossary, all_formulas

def normalize_name(filename):
    """Extracts base name (e.g., 'Toán_1_2013.pdf' -> 'Toán_1')"""
    name = os.path.splitext(filename)[0]
    name = re.sub(r'[\s-]*20\d{2}', '', name).strip()
    return name

def create_unified_notebook(base_name, file_groups, output_dir):
    """Coordinates extraction from multiple versions and builds final notebook."""
    nb = nbf.v4.new_notebook()
    
    versions = [os.path.basename(f) for f in file_groups]
    nb.cells.append(nbf.v4.new_markdown_cell(f"# Unified Summary: {base_name}\n\n**Processed Versions**: {', '.join(versions)}\n\n*Note: This summary was automatically generated by an LLM examining the text.*"))
    
    final_glossary = []
    final_formulas = []
    
    for file_path in file_groups:
        version_name = os.path.basename(file_path)
        g, f = map(list, process_pdf(file_path)) # ensure lists
        
        final_glossary.extend([f"- [{version_name}] {item}" for item in set(g) if item])
        final_formulas.extend([f"- [{version_name}] {item}" for item in set(f) if item])
        
    # Render Glossary
    if final_glossary:
        nb.cells.append(nbf.v4.new_markdown_cell("## 📖 Glossary\n\n" + "\n".join(set(final_glossary))))
    else:
        nb.cells.append(nbf.v4.new_markdown_cell("## 📖 Glossary\n*(No explicit definitions extracted)*"))

    # Render Formulas
    if final_formulas:
        nb.cells.append(nbf.v4.new_markdown_cell("## 🧮 Explicit Formulas\n\n" + "\n".join(set(final_formulas))))
    else:
        nb.cells.append(nbf.v4.new_markdown_cell("## 🧮 Explicit Formulas\n*(No mathematical equations extracted)*"))

    # Save
    out_path = os.path.join(output_dir, f"{base_name}_LLM_Summary.ipynb")
    with open(out_path, 'w', encoding='utf-8') as file:
        nbf.write(nb, file)
    print(f"  [SUCCESS] Saved LLM Notebook to: {out_path}\n")

def main():
    print(f"--- Starting LLM Deep Extraction using {OLLAMA_MODEL} ---\n")
    for subdir in SUBDIRS:
        dir_path = os.path.join(ROOT_DIR, subdir)
        if not os.path.exists(dir_path): continue
        
        print(f"\nScanning Directory: {subdir}")
        groups = defaultdict(list)
        files = [f for f in os.listdir(dir_path) if f.lower().endswith(".pdf")]
        
        for f in files:
            base = normalize_name(f)
            groups[base].append(os.path.join(dir_path, f))
            
        for base_name, file_paths in groups.items():
            create_unified_notebook(base_name, file_paths, dir_path)

if __name__ == "__main__":
    main()
