import os
import requests
import sys

# Force UTF-8 for Windows console
sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = r"c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance"
SUBDIRS = ["Computer_Science", "Math_Physics", "Signals_Systems"]

OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "gemma3:4b"

def query_ollama(prompt, system_prompt):
    data = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "stream": False,
        "options": {"num_predict": 2048, "temperature": 0.7}
    }
    try:
        response = requests.post(OLLAMA_URL, json=data)
        response.raise_for_status()
        result = response.json()
        return result.get("message", {}).get("content", "")
    except requests.exceptions.RequestException as e:
        print(f"Error querying Ollama: {e}")
        return ""

def generate_test_for_subject(subject_folder, subject_path):
    print(f"\nGeneraing Test for {subject_folder}...")
    
    # Read definitions
    def_path = os.path.join(subject_path, "Definitions.md")
    definitions = ""
    if os.path.exists(def_path):
        with open(def_path, 'r', encoding='utf-8') as f:
            definitions = f.read()
            
    # Read formulas
    form_path = os.path.join(subject_path, "Formulas.md")
    formulas = ""
    if os.path.exists(form_path):
        with open(form_path, 'r', encoding='utf-8') as f:
            formulas = f.read()
            
    if not definitions and not formulas:
        print(f"  [SKIP] No definitions or formulas found for {subject_folder}.")
        return

    # Cap input sizes if extremely large (to avoid context overflow)
    def_lines = definitions.split('\n')
    if len(def_lines) > 60:
        definitions = '\n'.join(def_lines[:60]) + "\n... (truncated)"
        
    form_lines = formulas.split('\n')
    if len(form_lines) > 30:
        formulas = '\n'.join(form_lines[:30]) + "\n... (truncated)"

    system_prompt = """You are an expert university professor creating a beautiful, comprehensive, and challenging assessment test for engineering and finance students. 
Your task is to create a test in rich Markdown format based ONLY on the provided definitions and formulas for the given subject.

Follow this exact structure:

# 🎓 {Subject} Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check
Create exactly 5 Multiple Choice Questions testing the provided definitions.
- Use bold text for the question.
- Provide 4 options (A, B, C, D) using blockquotes for readability.
- **Hide the answer** using a `<details><summary>Reveal Answer</summary>` tag immediately after the options. Include a brief explanation in the hidden section.

## Part II: Formula Application & Short Answer
Create 3 Short Answer Questions based on the formulas provided.
- Present the question clearly.
- Define a scenario where the student must use one of the provided formulas.
- Hide the step-by-step solution using a `<details><summary>Reveal Solution</summary>` block.

Format the output entirely in Markdown. DO NOT include any conversational filler (e.g., "Here is your test"). Start exactly with the level 1 header.
"""

    user_prompt = f"Subject: {subject_folder}\n\nDefinitions:\n{definitions}\n\nFormulas:\n{formulas}\n\nPlease generate the assessment now."
    
    response = query_ollama(user_prompt, system_prompt)
    if not response:
        print(f"  [!] Failed to generate test for {subject_folder}.")
        return

    out_path = os.path.join(subject_path, "Test.md")
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(response)
    print(f"  [SUCCESS] Saved test to {out_path}")

def main():
    print("Starting Subject Test Generator using local Ollama LLM...")
    
    test_count = 0
    for sd in SUBDIRS:
        sd_path = os.path.join(ROOT_DIR, sd)
        if not os.path.exists(sd_path):
            continue
            
        for subject_name in os.listdir(sd_path):
            subject_path = os.path.join(sd_path, subject_name)
            if not os.path.isdir(subject_path):
                continue
            
            # Skip old generic folders like "quizzes", "simulations", "tests"
            if subject_name in ["quizzes", "simulations", "tests"]:
                continue
                
            generate_test_for_subject(subject_name, subject_path)
            test_count += 1
            
    print(f"\nAssessment generation complete! Generated {test_count} tests.")

if __name__ == "__main__":
    main()
