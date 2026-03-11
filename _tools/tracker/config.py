from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScoreConfig:
    min_score: int = 0
    max_score: int = 100
    min_energy: int = 1
    max_energy: int = 5
    min_degree_pct: float = 0.0
    max_degree_pct: float = 100.0


SCORES = ScoreConfig()


@dataclass(frozen=True)
class OllamaConfig:
    """
    Configuration for local Ollama AI integration.

    Make sure you have Ollama running locally and that you have
    pulled the model specified here, e.g.:
        ollama pull gemma3:44b
    """

    base_url: str = "http://127.0.0.1:11434"
    model: str = "gemma3:44b"
    enabled: bool = True


OLLAMA = OllamaConfig(
    base_url="http://127.0.0.1:11434",
    model="gemma3:44b",
    enabled=True,
)

