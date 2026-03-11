"""
LLM Feeder Configuration
API keys, source URLs, and processing settings
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# ===== PATHS =====
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
PROCESSED_DIR = BASE_DIR / "processed"
DB_DIR = BASE_DIR / "db"

# Create directories if they don't exist
DATA_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)
DB_DIR.mkdir(exist_ok=True)

# ===== API CONFIGURATION =====
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")  # Optional: for higher rate limits
OLLAMA_ENDPOINT = os.getenv("OLLAMA_ENDPOINT", "http://localhost:11434")

# ===== SCRAPING TARGETS =====
SOURCES = {
    "odin": {
        "type": "github",
        "repo": "TheOdinProject/curriculum",
        "branch": "main",
        "paths": [
            "foundations",
            "intermediate_html_css",
            "javascript",
            "react",
            "nodejs",
            "ruby",
            "rails"
        ],
        "extensions": [".md"]
    },
    "mdn": {
        "type": "web",
        "base_url": "https://developer.mozilla.org/en-US/docs/Learn",
        "sections": [
            "HTML",
            "CSS", 
            "JavaScript",
            "Server-side"
        ]
    },
    "local": {
        "type": "local",
        "paths": [
            str(BASE_DIR.parent / "awesome_quant"),
            str(BASE_DIR.parent / "polymarket"),
            str(BASE_DIR.parent / "macroe")
        ],
        "extensions": [".py", ".md"]
    }
}

# ===== PROCESSING SETTINGS =====
CHUNK_SIZE = 1000       # Tokens per chunk
CHUNK_OVERLAP = 200     # Token overlap between chunks
LLM_MODEL = "ollama/gemma3:4b"  # or "ollama/llama2" for local

# ===== EMBEDDING SETTINGS =====
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # Free, local model
CHROMA_COLLECTION = "fullstack_knowledge"

# ===== SYSTEM PROMPT =====
SYSTEM_PROMPT = """# ROLE
You are a Senior Full-Stack Architect and Data Synthesis Engine. Your goal is to ingest raw technical data and convert it into a "Neural-Ready" knowledge base for future retrieval.

# PROCESSING INSTRUCTIONS
1. **Context Mapping:** Identify if the data belongs to Front-End (UI/UX, Client-side logic) or Back-End (Server, Database, API).
2. **Code Extraction:** Isolate all code snippets. Ensure they are syntactically correct and commented.
3. **Information Density:** Strip away "noise" (ads, navigation links, repetitive headers). Retain only technical definitions, logic flows, and implementation steps.
4. **Relational Linking:** If the data mentions a Front-End concept (e.g., `fetch()`), automatically link it to its Back-End counterpart (e.g., REST API endpoints or CORS headers).

# OUTPUT STRUCTURE
Generate the output in the following format:
---
## [Topic Name]
- **Category:** [Front-End/Back-End/Full-Stack]
- **Core Concept:** [3-sentence executive summary]
- **Technical Breakdown:** [Key bullet points]
- **Snippet:** [Language-specific code block]
- **Cross-Reference:** [Related technical concepts for the RAG graph]
---
"""
