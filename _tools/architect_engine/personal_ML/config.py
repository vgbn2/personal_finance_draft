"""
Architect Engine — Configuration & Paths
All tuneable parameters live here.
"""

from pathlib import Path
import os

# ── Paths ──────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "architect.db"
CHROMA_DIR = DATA_DIR / "chroma"

# ── Embedding Model ───────────────────────────────────────
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

# ── Retrieval ─────────────────────────────────────────────
SIMILARITY_THRESHOLD = 0.72
TOP_K = 8

# ── LLM ───────────────────────────────────────────────────
LLM_MODE = os.getenv("ARCHITECT_LLM_MODE", "api")  # 'local' or 'api'
LOCAL_MODEL = os.getenv("ARCHITECT_LOCAL_MODEL", "deepseek-coder:6.7b")
API_MODEL = os.getenv("ARCHITECT_API_MODEL", "claude-sonnet-4-20250514")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# ── Complexity Scoring Weights ────────────────────────────
COMPLEXITY_WEIGHT_NODE = 1.0        # α
COMPLEXITY_WEIGHT_INTERFACE = 1.5   # β
COMPLEXITY_WEIGHT_DEPLOY = 2.0      # δ
PROFICIENCY_ERROR_WEIGHT = 0.5      # γ

# ── Constraint Domains ────────────────────────────────────
VALID_DOMAINS = [
    "concurrency",
    "risk",
    "data_structures",
    "typing",
    "performance",
    "memory",
    "testing",
    "architecture",
]
