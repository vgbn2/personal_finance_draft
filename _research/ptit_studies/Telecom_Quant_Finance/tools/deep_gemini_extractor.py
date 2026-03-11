import os
import sys
import re
import nbformat as nbf
from pypdf import PdfReader
from collections import defaultdict
import google.generativeai as genai
import time

# Force UTF-8 for Windows console
sys.stdout.reconfigure(encoding='utf-8')

# --- CONFIGURATION ---
ROOT_DIR = r"c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance"
SUBDIRS = ["Finance", "Math_Physics", "Computer_Science", "Signals_Systems"]

# =====================================================================
# YOUR GEMINI API KEY HERE
# Get one for free at: https://aistudio.google.com/app/apikey
# =====================================================================
API_KEY = "AIzaSyBhw1NADdmMFFxi2DQIGiApwBQZM8NoRUU"

if API_KEY == "INSERT_YOUR_API_KEY_HERE":
    print("ERROR: You must insert your Gemini API key into the script on line 19!")
    sys.exit(1)

genai.configure(api_key=API_KEY)

# Use gemini-2.5-pro for highest public quality available
MODEL_NAME = "gemini-2.5-pro"  
try:
    model = genai.GenerativeModel(MODEL_NAME)
except Exception as e:
    print(f"Error initializing Gemini: {e}")
    sys.exit(1)

MAX_PAGES_TO_READ = 9999 # Read all pages
WORDS_PER_CHUNK = 2000   # Gemini can handle much larger chunks than local models

def query_gemini(prompt, max_retries=3):
    """Sends a request to the Gemini API with exponential backoff for rate limits."""
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
    
    full_prompt = f"{system_instruction}\n\n--- TEXT CHUNK ---\n{prompt}"
    
    for attempt in range(max_retries):
        try:
            # Generate content, setting low temperature for factual extraction
            response = model.generate_content(
                full_prompt,
                generation_config=genai.types.GenerationConfig(temperature=0.1)
            )
            return response.text.strip()
            
        except Exception as e:
            error_msg = str(e).lower()
            if "quota" in error_msg or "rate limit" in error_msg or "429" in error_msg:
                wait_time = (attempt + 1) * 20 # Exponential backoff starting at 20s
                print(f"    [!] Gemini API Rate Limit hit. Waiting {wait_time} seconds (Attempt {attempt+1}/{max_retries})...")
                time.sleep(wait_time)
            else:
                print(f"    [!] Gemini API error: {e}")
                time.sleep(2)
            
    return "(Extraction Failed: Could not communicate with Gemini API or hit rate limit)"

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
    """Reads PDF, chunks it, and extracts using Gemini."""
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
            llm_reply = query_gemini(chunk)
            g, f = parse_llm_response(llm_reply)
            all_glossary.extend(g)
            all_formulas.extend(f)
            print(f" Found {len(g)} definitions, {len(f)} formulas.")
            
            # CRITICAL: Prevent hitting the free tier limit of ~15 Requests Per Minute
            # Sleep for 5 seconds between chunks
            time.sleep(5)
            
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
    nb.cells.append(nbf.v4.new_markdown_cell(f"# Unified LLM Summary: {base_name}\n\n**Processed Versions**: {', '.join(versions)}\n\n*Note: This summary was automatically generated by the Gemini API examining the full text.*"))
    
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
    out_path = os.path.join(output_dir, f"{base_name}_Gemini_Summary.ipynb")
    with open(out_path, 'w', encoding='utf-8') as file:
        nbf.write(nb, file)
    print(f"  [SUCCESS] Saved Gemini Notebook to: {out_path}\n")

def main():
    print(f"--- Starting FAST Deep Extraction using {MODEL_NAME} ---\n")
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
