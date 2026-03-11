# Architect Engine — Personal Usage Guide

## Getting Started

1.  **Launch the System**: Double-click `start_all.bat`
    *   This opens a **Dashboard** (browser) to visualize your grading/telemetry.
    *   This initializes the `chat.log` file.

2.  **Open a Terminal**:
    *   Navigate to this folder: `cd c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\architect_engine`

---

## How to Generate & Log

The engine works by **typing prompts**. Every time you generate code, it is:
1.  **Graded** (Complexity & Proficiency scores)
2.  **Logged** to `chat.log` (readable text file)
3.  **Saved** to the Database (for the dashboard)

### Command
```bash
python -m personal_ML.cli generate "Your prompt here"
```

### Checking the Log
Open `chat.log` in VS Code or Notepad. It updates automatically:
```text
[2024-05-20 14:30:00]
PROMPT: Create an async websocket handler
Constraints: 7
RESPONSE:
... (generated code) ...
--------------------------------------------------
```

---

## Grading Process (Telemetry)

The engine grades every session to track improvement. View these in the **Dashboard**.

### 1. Complexity Score (Is it engineered well?)
Based on:
*   **Constraints Used**: More rules applied = higher score.
*   **Conflicts Resolved**: Handling trade-offs = higher score.

### 2. Proficiency Score (Is it efficient?)
*   **Proficiency = Complexity / Errors**
*   High complexity with low errors means high proficiency.

---

## Troubleshooting

*   **"No module named streamlit"**: Run `pip install streamlit`
*   **"ImportError"**: Ensure you run commands from the *root* folder (`architect_engine`), NOT inside `personal_ML`.
    *   ✅ Correct: `python -m personal_ML.cli ...`
    *   ❌ Wrong: `cd personal_ML` then `python cli.py ...`

## Quick Commands
*   `python -m personal_ML.cli list-constraints` — See your rules
*   `python -m personal_ML.cli query "keyword"` — Find rules
*   `python -m personal_ML.cli history` — See past sessions
