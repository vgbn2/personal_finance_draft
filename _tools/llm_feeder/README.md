# LLM Feeder - Neural-Ready Knowledge Base System

A Python pipeline that scrapes technical documentation, processes it through an LLM, and stores embeddings in ChromaDB for RAG retrieval.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Set up environment (optional - for OpenAI)
cp .env.example .env
# Edit .env to add your OPENAI_API_KEY

# Run the full pipeline (scrape 10 files from The Odin Project)
python main.py run --source odin --limit 10

# Query the knowledge base
python main.py query "What is fetch()?"

# Interactive mode
python main.py interactive
```

## Architecture

```
/llm_feeder
├── data/               # Raw scraped markdown files
├── processed/          # Neural-Ready formatted documents
├── db/                 # ChromaDB vector database
├── src/
│   ├── scraper.py      # GitHub API + local file scraping
│   ├── processor.py    # Chunking + LLM prompt application
│   └── store.py        # ChromaDB embeddings + retrieval
├── config.py           # Settings and System Prompt
├── main.py             # CLI entry point
└── requirements.txt
```

## Pipeline Stages

### 1. Scrape
```bash
python src/scraper.py --source odin --limit 20
python src/scraper.py --source local
```

### 2. Process
```bash
python src/processor.py --input data/ --output processed/
python src/processor.py --ollama  # Use local Ollama
```

### 3. Store
```bash
python src/store.py --add processed/
python src/store.py --query "REST API"
python src/store.py --interactive
```

## Data Sources

| Source | Type | Target |
|--------|------|--------|
| The Odin Project | GitHub | Full-stack curriculum |
| MDN Web Docs | Web | JavaScript, HTML, CSS |
| Local repos | Files | Your own code patterns |

## Configuration

Edit `config.py` to:
- Add/remove scraping targets
- Change chunk sizes
- Switch LLM models
- Modify the System Prompt

## Requirements

- Python 3.10+
- OpenAI API key (or local Ollama)
- ~500MB disk space for embeddings
