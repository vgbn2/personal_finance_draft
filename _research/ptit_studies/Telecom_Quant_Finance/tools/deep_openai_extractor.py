import os
import sys
import re
import nbformat as nbf
from pypdf import PdfReader
from collections import defaultdict
from openai import OpenAI
import time

# Force UTF-8 for Windows console
sys.stdout.reconfigure(encoding='utf-8')

# --- CONFIGURATION ---
ROOT_DIR = r"c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance"
SUBDIRS = ["Finance", "Math_Physics", "Computer_Science", "Signals_Systems"]

# =====================================================================
# YOUR OPENAI API KEY HERE
# =====================================================================
API_KEY = "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"

client = OpenAI(api_key=API_KEY)

# Use gpt-4o-mini for maximum speed and cost efficiency
MODEL_NAME = "gpt-4o-mini"

MAX_PAGES_TO_READ = 9999 # Read all pages
WORDS_PER_CHUNK = 2000

def query_openai(prompt, max_retries=3):
    """Sends a request to the OpenAI API with exponential backoff."""
    system_instruction = """
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
    
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": f"Extract from the following text chunk:\n\n{prompt}"}
                ],
                temperature=0.1,
            )
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            error_msg = str(e).lower()
            if "rate_limit" in error_msg or "429" in error_msg:
                wait_time = (attempt + 1) * 10
                print(f"    [!] OpenAI Rate Limit hit. Waiting {wait_time} seconds (Attempt {attempt+1}/{max_retries})...")
                time.sleep(wait_time)
            elif "insufficient_quota" in error_msg:
                print("    [CRITICAL] OpenAI Billing Quota Exceeded. Please check your account.")
                sys.exit(1)
            else:
                print(f"    [!] OpenAI API error: {e}")
                time.sleep(2)
            
    return "(Extraction Failed: Could not communicate with OpenAI API)"

def chunk_text(text, words_per_chunk=WORDS_PER_CHUNK):
    """Splits text into roughly equal word chunks."""
    words = text.split()
    for i in range(0, len(words), words_per_chunk):
        yield " ".join(words[i:i + words_per_chunk])

def parse_llm_response(response_text):
    """Parses the structured output into lists of strings."""
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
    """Reads PDF, chunks it, and extracts using OpenAI."""
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
        print(f"     [+] Text split into {len(chunks)} chunks. Processing with {MODEL_NAME}...")
        
        for i, chunk in enumerate(chunks):
            print(f"       - Extrating from chunk {i+1}/{len(chunks)}...", end="", flush=True)
            llm_reply = query_openai(chunk)
            g, f = parse_llm_response(llm_reply)
            all_glossary.extend(g)
            all_formulas.extend(f)
            print(f" Found {len(g)} definitions, {len(f)} formulas.")
            # OpenAI typically has much higher rate limits on paid tiers, no mandatory sleep needed here 
            # unless a 429 is explicitly thrown and caught by the retry logic.
            
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
    nb.cells.append(nbf.v4.new_markdown_cell(f"# Unified GPT Summary: {base_name}\n\n**Processed Versions**: {', '.join(versions)}\n\n*Note: This summary was automatically generated by GPT-4o-mini examining the full text.*"))
    
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
    out_path = os.path.join(output_dir, f"{base_name}_GPT_Summary.ipynb")
    with open(out_path, 'w', encoding='utf-8') as file:
        nbf.write(nb, file)
    print(f"  [SUCCESS] Saved GPT Notebook to: {out_path}\n")

def main():
    print(f"--- Starting ULTRA-FAST Deep Extraction using {MODEL_NAME} ---\n")
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
