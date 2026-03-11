from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict

import urllib.error
import urllib.request

from .config import OLLAMA
from .models import DayEntry


def _build_prompt(entry: DayEntry) -> str:
    return (
        "You are a concise, supportive coach for a CS/engineering student. "
        "Given this day log, write:\n"
        "1) A short reflection (3-5 sentences) that normalizes struggle and highlights effort.\n"
        "2) 3 concrete, practical actions for tomorrow.\n\n"
        f"Date: {entry.date}\n"
        f"Day score: {entry.day_score}/100\n"
        f"Energy: {entry.energy}/5\n"
        f"Degree progress: {entry.degree_progress_pct:.1f}%\n\n"
        f"What they learned today:\n{entry.learned}\n\n"
        f"What they tried / attempted (even if failed):\n{entry.wins}\n\n"
        f"What felt hard or blocked them:\n{entry.struggles}\n\n"
        "Keep the tone grounded, specific, and actionable."
    )


def generate_ai_reflection(entry: DayEntry) -> str:
    """
    Call local Ollama to generate a reflection for this day.

    Uses the /api/generate endpoint:
      POST {base_url}/api/generate
      {\"model\": OLLAMA.model, \"prompt\": ..., \"stream\": false}
    """
    if not OLLAMA.enabled:
        raise RuntimeError("Ollama integration is disabled in config.")

    prompt = _build_prompt(entry)
    payload: Dict[str, Any] = {
        "model": OLLAMA.model,
        "prompt": prompt,
        "stream": False,
    }

    url = f"{OLLAMA.base_url}/api/generate"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read()
    except urllib.error.URLError as exc:  # noqa: TRY003
        raise RuntimeError(
            f"Could not reach Ollama at {OLLAMA.base_url}. Is the server running?"
        ) from exc

    try:
        parsed = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:  # noqa: TRY003
        raise RuntimeError("Unexpected response from Ollama (not JSON).") from exc

    text = parsed.get("response") or parsed.get("text")
    if not isinstance(text, str):
        raise RuntimeError("Unexpected response from Ollama (missing 'response').")

    # Trim for safety
    return text.strip()

