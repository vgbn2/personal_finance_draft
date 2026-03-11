import os
import json
import requests
import hashlib
import re
import sys
from collections import defaultdict

# Force UTF-8 for Windows console
sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = r"c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance"
SUBDIRS = ["Finance", "Math_Physics", "Computer_Science", "Signals_Systems"]
CHECKPOINT_FILE = os.path.join(ROOT_DIR, "_extraction_checkpoint.json")

OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "gemma3:4b"

def get_file_hash(filepath):
    return hashlib.md5(filepath.encode()).hexdigest()[:12]

def query_ollama(prompt, system_prompt):
    data = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "stream": False,
        "options": {"num_predict": 2048}
    }
    try:
        response = requests.post(OLLAMA_URL, json=data)
        response.raise_for_status()
        result = response.json()
        return result.get("message", {}).get("content", "")
    except requests.exceptions.RequestException as e:
        print(f"Error querying Ollama: {e}")
        return ""

def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {"completed_files": [], "partial_results": {}}

def generate_quiz_for_subject(subject, glossary, formulas):
    print(f"\nGenerating Quiz for {subject}...")
    
    # Take a sample if too large to fit in context window
    sample_glossary = glossary[:30] if len(glossary) > 30 else glossary
    sample_formulas = formulas[:15] if len(formulas) > 15 else formulas
    
    if not sample_glossary and not sample_formulas:
        print(f"  [SKIP] Not enough data for {subject}.")
        return

    system_prompt = """You are an expert university professor creating a beautiful, comprehensive, and challenging quiz for engineering and finance students. 
You will be provided with a list of extracted definitions and formulas.
Your task is to create a quiz in rich Markdown format. Follow this exact structure:

# 🎓 {Subject} Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check
Create 5 Multiple Choice Questions testing the provided definitions.
- Use bold text for the question.
- Provide 4 options (A, B, C, D) using blockquotes for readability.
- **Hide the answer** using a `<details><summary>Reveal Answer</summary>` tag immediately after the options. Include a brief explanation in the hidden section.

## Part II: Formula Application & Short Answer
Create 3 Short Answer Questions based on the formulas provided.
- Present the question clearly.
- Provide step-by-step guidance in a hidden `<details>` block.

## Part III: Practical Exercise
Create 1 or 2 practical exercises or coding challenges based on the concepts. This should require the student to apply a concept or formula in a realistic scenario.
- Define a clear scenario or problem statement.
- Ask the student to calculate a result or write a pseudo-code snippet.
- Hide the solution and explanation using a `<details>` tag.

Format the output entirely in Markdown. Do not include any conversational filler. Give it a highly polished, aesthetic look.
"""

    prompt = f"Subject: {subject}\n\nDefinitions:\n" + "\n".join(sample_glossary) + "\n\nFormulas:\n" + "\n".join(sample_formulas) + "\n\nGenerate the assessment."
    
    response = query_ollama(prompt, system_prompt)
    if not response:
        print(f"  [!] Failed to generate quiz for {subject}.")
        return

    out_dir = os.path.join(ROOT_DIR, subject, "quizzes")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "Generated_Quiz_1.md")
    
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(response)
    print(f"  [SUCCESS] Saved quiz to {out_path}")

def main():
    checkpoint = load_checkpoint()
    partials = checkpoint.get("partial_results", {})
    
    for subdir in SUBDIRS:
        dir_path = os.path.join(ROOT_DIR, subdir)
        if not os.path.exists(dir_path):
            continue
            
        files = [f for f in os.listdir(dir_path) if f.lower().endswith(".pdf")]
        
        subject_glossary = []
        subject_formulas = []
        
        for f in files:
            full_path = os.path.join(dir_path, f)
            file_hash = get_file_hash(full_path)
            
            if file_hash in partials:
                subject_glossary.extend(partials[file_hash].get("glossary", []))
                subject_formulas.extend(partials[file_hash].get("formulas", []))
        
        # Deduplicate
        unique_g = list(set([item for item in subject_glossary if item]))
        unique_f = list(set([item for item in subject_formulas if item]))
        
        if unique_g or unique_f:
            generate_quiz_for_subject(subdir, unique_g, unique_f)

if __name__ == "__main__":
    print("Starting Quiz Generator...")
    main()
    print("All quizzes generated.")
