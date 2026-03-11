# Tracker

Local **life tracker** desktop app to log daily progress, attempts (even when they feel like failures), and degree completion percentage.

## Features

- Daily entry with:
  - What you learned today
  - What you tried / attempted (even if it failed)
  - What felt hard or blocked you
  - Day score (0–100)
  - Energy (1–5)
  - Degree completion percentage
- Optional AI reflection using **local Ollama**:
  - Click a button to generate a short reflection and concrete suggestions for tomorrow
- History of recent days in a sidebar
- Simple stats:
  - Average day score over the last 7 days
  - Degree percentage and change over the last 30 days

## How to run

From the repo root:

```bash
cd tracker
python -m tracker.main
```

Or on Windows, from the repo root:

```bash
cd tracker
python -m tracker.main
```

The app stores its SQLite database in `tracker/tracker.db`.

## AI integration (Ollama)

- Make sure **Ollama** is installed and running, and that you have pulled a model, for example:

  ```bash
  ollama pull llama3
  ollama serve
  ```

- By default the app will call:
  - Base URL: `http://127.0.0.1:11434`
  - Model: `llama3`

You can change these in `tracker/config.py` (`OLLAMA` settings). In the GUI, fill out your day and click **"Generate AI reflection"** to get a locally generated reflection and suggestions that are stored with the day.

## Jarvius CLI assistant

There is also a simple CLI assistant that uses your existing `tracker.db` and local Ollama model:

```bash
cd tracker
python -m tracker.jarvius
```

From there you can:

- Get a **summary of the last few days** and a suggested focus for today (from your local model).
- Let Jarvius **offer to launch tools** like VS Code or `start_tracker.bat` as a gatekeeper to your coding session. It will **always ask for confirmation** and never makes system changes on its own.

