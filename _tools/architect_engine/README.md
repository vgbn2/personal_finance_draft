# Architect Engine

**Personal Architect Engine** — A local-first system that encodes your engineering design philosophy, risk constraints, and coding standards into an automated code generation pipeline.

> _"Your engineering heuristics, queryable and enforceable."_

---

## What It Does

```
You type:   "Write an async websocket reconnect handler with exponential backoff"

Engine:     1. Classifies domains → memory(1.0), concurrency(0.6)
            2. Retrieves constraints → C008 (WebSocket cleanup), C002 (asyncio timeout), ...
            3. Augments prompt → Injects constraints into system context
            4. Generates code → LLM produces constraint-aware output
            5. Logs session → Tracks complexity, proficiency, constraint lineage
```

Instead of manually remembering to add timeouts, cleanup handlers, type hints, and risk guards — the engine **automatically retrieves and enforces** your stored engineering constraints.

---

## Architecture

```
                          +------------------+
                          |     CLI (Click)  |
                          +--------+---------+
                                   |
                    +--------------+--------------+
                    |                             |
            +-------v--------+          +---------v---------+
            | Hybrid Retriever|          | Prompt Builder    |
            | (BM25 + Vector) |          | (Domain Classify) |
            +---+--------+---+          | (Conflict Detect) |
                |        |              +--------+----------+
         +------v--+  +--v------+               |
         | ChromaDB |  |  BM25  |        +------v------+
         | (384-dim)|  |(Okapi) |        | LLM Client  |
         +----------+  +--------+        +--+-------+--+
                                            |       |
                                     +------v-+ +---v--------+
                                     | Ollama | | Anthropic  |
                                     | (local)| | (API)      |
                                     +--------+ +------------+
                          +------------------+
                          |    SQLite DB     |
                          | (6 tables, WAL)  |
                          +--------+---------+
                                   |
                          +--------v---------+
                          | Telemetry Scorer  |
                          | + Streamlit Dash  |
                          +------------------+
```

---

## Quick Start

### 1. Install

```bash
cd architect_engine
pip install -e .
```

### 2. Initialize

```bash
architect init
```

Creates SQLite database (6 tables), seeds 10 starter engineering constraints, downloads the `all-MiniLM-L6-v2` embedding model (first run only), and indexes constraints into ChromaDB.

### 3. Explore Constraints

```bash
# List all constraints (Rich table sorted by precedence)
architect list-constraints

# Filter by domain
architect list-constraints -d risk

# Semantic search
architect query "async websocket handler" --threshold 0
```

### 4. Generate Code

```bash
# With Anthropic API
set ANTHROPIC_API_KEY=sk-ant-your-key-here
architect generate "Write an async websocket reconnect handler with exponential backoff"

# With local Ollama
set ARCHITECT_LLM_MODE=local
architect generate "Build a position sizing calculator with Kelly criterion"

# Show the augmented prompt (for debugging)
architect generate "your prompt" --show-prompt
```

### 5. View Telemetry

```bash
# CLI session history
architect history

# Streamlit dashboard
streamlit run architect_engine/dashboard.py
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `architect init` | Initialize database and seed constraints |
| `architect list-constraints` | List all constraints (filterable by domain) |
| `architect add-constraint` | Add a new engineering constraint |
| `architect update-constraint` | Update constraint with version history |
| `architect deprecate-constraint` | Soft-delete a constraint |
| `architect constraint-history` | View version history for a constraint |
| `architect query` | Hybrid search for relevant constraints |
| `architect generate` | Full constraint-aware code generation |
| `architect history` | View past generation sessions |

---

## Constraint Management

### Adding Constraints

```bash
architect add-constraint \
  --id C011 \
  --domain concurrency \
  --rule "All database operations must use connection pooling with explicit pool_size" \
  --rationale "Prevents connection exhaustion under concurrent load" \
  --precedence 85
```

### Updating with Version History

```bash
architect update-constraint C001 \
  --rule "Use collections.deque(maxlen=N); prefer SimpleQueue for thread-safety" \
  --reason "Added thread-safety guidance"

# Check version history
architect constraint-history C001
```

### Supported Domains

`concurrency` | `risk` | `data_structures` | `typing` | `performance` | `memory` | `testing` | `architecture`

---

## How Retrieval Works

The engine uses **Reciprocal Rank Fusion (RRF)** to combine two search strategies:

| Strategy | What It Catches | When It Shines |
|----------|----------------|----------------|
| **Vector Search** (ChromaDB) | Semantic meaning | "exponential backoff" matches "timeout handling" |
| **BM25** (rank-bm25) | Keyword overlap | "asyncio.timeout()" matches exactly |

```
RRF_score(d) = w_vector/(k + rank_vector) + w_bm25/(k + rank_bm25)
Final_score  = RRF_score * (1 + boost * precedence/100)
```

High-precedence constraints (risk rules at P=95) get boosted above lower ones.

---

## Telemetry Scoring

Each generation session is scored:

```
Complexity(S)  = alpha * nodes + beta * interfaces + delta * deploy_complexity
Proficiency(S) = Complexity / (1 + gamma * error_rate)
```

| Weight | Symbol | Default | Meaning |
|--------|--------|---------|---------|
| Node | alpha | 1.0 | Number of constraints applied |
| Interface | beta | 1.5 | Cross-component interactions |
| Deploy | delta | 2.0 | Deployment complexity |
| Error | gamma | 0.5 | Error rate penalty |

The Streamlit dashboard tracks these scores over time, showing growth trends and domain breakdown.

---

## Configuration

All tuneable parameters live in `config.py`:

| Parameter | Env Variable | Default |
|-----------|-------------|---------|
| LLM Mode | `ARCHITECT_LLM_MODE` | `api` |
| Local Model | `ARCHITECT_LOCAL_MODEL` | `deepseek-coder:6.7b` |
| API Model | `ARCHITECT_API_MODEL` | `claude-sonnet-4-20250514` |
| API Key | `ANTHROPIC_API_KEY` | (none) |
| Similarity Threshold | — | `0.72` |
| Top-K Results | — | `8` |

---

## Project Structure

```
architect_engine/
  pyproject.toml
  README.md
  architect_engine/
    __init__.py
    config.py                    # All tuneable parameters
    cli.py                       # 10 Click commands
    dashboard.py                 # Streamlit telemetry UI
    db/
      schema.py                  # SQLite: 6 tables + CRUD + versioning
      vector_store.py            # ChromaDB wrapper (all-MiniLM-L6-v2)
    retrieval/
      engine.py                  # Hybrid BM25 + vector with RRF fusion
    generator/
      prompt_builder.py          # Domain classifier + augmented prompt
      llm.py                     # Ollama + Anthropic dual-mode inference
    telemetry/
      scorer.py                  # Complexity/proficiency scoring
  tests/
    test_engine.py               # End-to-end test suite
  data/
    architect.db                 # SQLite database (generated)
    chroma/                      # ChromaDB persistent store (generated)
```

---

## Testing

```bash
pip install pytest
python -m pytest tests/ -v
```

---

## Starter Constraints

The engine ships with 10 battle-tested constraints:

| ID | Domain | Precedence | Rule |
|----|--------|-----------|------|
| C004 | risk | 95 | Position-sizing must accept max_bankroll_fraction (default 0.02) |
| C002 | concurrency | 90 | asyncio coroutines require explicit timeout() wrappers |
| C005 | risk | 90 | Kelly criterion must include half-Kelly conservative mode |
| C003 | concurrency | 85 | ZeroMQ sockets must use SNDTIMEO/RCVTIMEO |
| C008 | memory | 85 | WebSocket managers must implement cleanup on disconnect |
| C010 | architecture | 80 | DB connection pools must specify max_connections |
| C006 | typing | 80 | Full type hints mandatory on all function signatures |
| C007 | performance | 75 | No non-vectorized loops over arrays >1000 elements |
| C001 | data_structures | 70 | Use deque(maxlen=N) for fixed-size history buffers |
| C009 | testing | 70 | Pure functions require property-based tests (Hypothesis) |

---

## License

MIT
