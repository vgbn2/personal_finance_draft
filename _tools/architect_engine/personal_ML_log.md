# Personal ML Component Log
Timestamp: 2026-02-20

## Directory Structure
Root: `personal_ML/`

```
personal_ML/
├── __init__.py
├── cli.py
├── config.py
├── dashboard.py
├── db/
│   ├── schema.py
│   └── vector_store.py
├── generator/
│   ├── llm.py
│   └── prompt_builder.py
├── retrieval/
│   └── engine.py
└── telemetry/
    └── scorer.py
```

## File Contents
### personal_ML/config.py
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


### personal_ML/cli.py

"""
Architect Engine — CLI Entry Point

Commands:
    architect init              Initialize database and seed constraints
    architect add-constraint    Add a new engineering constraint
    architect list-constraints  List all stored constraints
    architect query             Search constraints by prompt
    architect generate          (Phase 4) Generate code with constraints
    architect history           View session history
"""

from __future__ import annotations

import os
import sys

import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text

from . import config

# Force UTF-8 output on Windows
if sys.platform == 'win32':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from .db.schema import ArchitectDB
from .db.vector_store import ConstraintVectorStore
from .retrieval.engine import HybridRetriever

console = Console()


@click.group()
@click.version_option(version="0.1.0", prog_name="architect")
def cli():
    """Personal Architect Engine — Constraint-aware code generation."""
    pass


# ── Init ─────────────────────────────────────────────────

@cli.command()
def init():
    """Initialize the database and seed starter constraints."""
    console.print("\n[bold cyan]Architect Engine — Initialization[/bold cyan]\n")

    # Step 1: SQLite
    console.print("[dim]Creating SQLite schema...[/dim]")
    db = ArchitectDB()
    db.init_schema()
    console.print("  [green]OK[/green] Database created at [dim]{0}[/dim]".format(db.db_path))

    # Step 2: Seed constraints
    count = db.seed_starter_constraints()
    console.print(f"  [green]OK[/green] Seeded {count} starter constraints")

    # Step 3: ChromaDB
    console.print("[dim]Initializing vector store...[/dim]")
    vs = ConstraintVectorStore()
    vs.connect()

    # Sync all constraints to vector store
    all_constraints = db.list_constraints()
    vs.sync_from_db(all_constraints)
    console.print(f"  [green]OK[/green] Vector store: {vs.count} constraints indexed")

    db.close()

    console.print("\n[bold green]>> Initialization complete![/bold green]\n")
    console.print("[dim]Next: architect list-constraints[/dim]\n")


# ── List Constraints ─────────────────────────────────────

@cli.command("list-constraints")
@click.option("--domain", "-d", default=None, help="Filter by domain")
@click.option("--all", "show_all", is_flag=True, help="Include deprecated")
def list_constraints(domain, show_all):
    """List all stored engineering constraints."""
    db = ArchitectDB()
    db.connect()
    constraints = db.list_constraints(domain=domain, include_deprecated=show_all)
    db.close()

    if not constraints:
        console.print("[yellow]No constraints found.[/yellow]")
        return

    table = Table(
        title="Engineering Constraints",
        show_lines=True,
        border_style="dim",
    )
    table.add_column("ID", style="cyan", width=6)
    table.add_column("Domain", style="magenta", width=16)
    table.add_column("Rule", style="white", max_width=60)
    table.add_column("P", justify="right", style="yellow", width=4)

    for c in constraints:
        deprecated = " [dim red](deprecated)[/]" if c.get("deprecated_at") else ""
        table.add_row(
            c["id"],
            c["domain"],
            c["rule_text"] + deprecated,
            str(c["precedence"]),
        )

    console.print(table)
    console.print(f"\n[dim]{len(constraints)} constraint(s) total[/dim]\n")


# ── Add Constraint ───────────────────────────────────────

@cli.command("add-constraint")
@click.option("--id", "cid", required=True, help="Constraint ID (e.g. C011)")
@click.option("--domain", "-d", required=True,
              type=click.Choice(config.VALID_DOMAINS), help="Domain tag")
@click.option("--rule", "-r", required=True, help="The constraint rule text")
@click.option("--rationale", default="", help="Why this rule exists")
@click.option("--precedence", "-p", default=50, type=int, help="Priority 1-100")
def add_constraint(cid, domain, rule, rationale, precedence):
    """Add a new engineering constraint."""
    # Save to SQLite
    db = ArchitectDB()
    db.connect()
    db.add_constraint(cid, domain, rule, rationale, precedence)
    db.close()

    # Save to vector store
    vs = ConstraintVectorStore()
    vs.connect()
    vs.add_constraint(cid, rule, domain, rationale, precedence)

    console.print(f"\n[green]OK[/green] Constraint [cyan]{cid}[/cyan] added to [{domain}]\n")


# ── Deprecate Constraint ─────────────────────────────────

@cli.command("deprecate-constraint")
@click.argument("constraint_id")
def deprecate_constraint(constraint_id):
    """Deprecate a constraint (soft delete)."""
    db = ArchitectDB()
    db.connect()
    success = db.deprecate_constraint(constraint_id)
    db.close()

    if success:
        # Also remove from vector store
        vs = ConstraintVectorStore()
        vs.connect()
        vs.delete_constraint(constraint_id)
        console.print(f"\n[green]OK[/green] Constraint [cyan]{constraint_id}[/cyan] deprecated\n")
    else:
        console.print(f"\n[red]FAIL[/red] Constraint {constraint_id} not found\n")


# -- Update Constraint -----------------------------------------

@cli.command("update-constraint")
@click.argument("constraint_id")
@click.option("--rule", "-r", default=None, help="New rule text")
@click.option("--rationale", default=None, help="New rationale")
@click.option("--precedence", "-p", default=None, type=int, help="New precedence")
@click.option("--domain", "-d", default=None,
              type=click.Choice(config.VALID_DOMAINS), help="New domain")
@click.option("--reason", default="", help="Why this change was made")
def update_constraint(constraint_id, rule, rationale, precedence, domain, reason):
    """Update a constraint with version history."""
    db = ArchitectDB()
    db.connect()
    try:
        new_ver = db.update_constraint(
            constraint_id, rule_text=rule, rationale=rationale,
            precedence=precedence, domain=domain, change_reason=reason,
        )
        # Re-sync to vector store
        updated = db.get_constraint(constraint_id)
        db.close()

        vs = ConstraintVectorStore()
        vs.connect()
        vs.add_constraint(
            updated["id"], updated["rule_text"], updated["domain"],
            updated.get("rationale", ""), updated["precedence"], new_ver,
        )
        console.print(
            f"\n[green]OK[/green] Constraint [cyan]{constraint_id}[/cyan] "
            f"updated to v{new_ver}\n"
        )
    except ValueError as e:
        db.close()
        console.print(f"\n[red]FAIL[/red] {e}\n")


# -- Constraint History ----------------------------------------

@cli.command("constraint-history")
@click.argument("constraint_id")
def constraint_history(constraint_id):
    """View version history for a constraint."""
    db = ArchitectDB()
    db.connect()
    current = db.get_constraint(constraint_id)
    history = db.get_constraint_history(constraint_id)
    db.close()

    if not current:
        console.print(f"[red]Constraint {constraint_id} not found[/red]")
        return

    console.print(f"\n[bold cyan]{constraint_id}[/bold cyan] (current v{current['version']})")
    console.print(f"  [{current['domain']}] {current['rule_text']}\n")

    if history:
        table = Table(title="Version History", border_style="dim")
        table.add_column("Ver", style="yellow", width=4)
        table.add_column("Rule", max_width=50)
        table.add_column("Reason", style="dim", max_width=30)
        table.add_column("Changed", style="dim", width=20)

        for h in history:
            table.add_row(
                f"v{h['version']}",
                h["rule_text"],
                h.get("change_reason", ""),
                h.get("changed_at", ""),
            )
        console.print(table)
    else:
        console.print("[dim]No version history (original version)[/dim]")


# ── Query Constraints ────────────────────────────────────

@cli.command("query")
@click.argument("prompt")
@click.option("--top-k", "-k", default=config.TOP_K, help="Max results")
@click.option("--threshold", "-t", default=config.SIMILARITY_THRESHOLD,
              help="Min similarity score")
@click.option("--domain", "-d", default=None, help="Filter by domain")
def query_constraints(prompt, top_k, threshold, domain):
    """Search constraints relevant to a prompt (hybrid BM25 + vector)."""
    retriever = HybridRetriever()
    retriever.connect()
    results = retriever.search(prompt, top_k=top_k, threshold=threshold, domain_filter=domain)

    if not results:
        console.print("[yellow]No constraints matched above threshold.[/yellow]")
        return

    table = Table(title=f"Constraints for: '{prompt[:50]}...'", show_lines=True)
    table.add_column("ID", style="cyan", width=6)
    table.add_column("Domain", style="magenta", width=14)
    table.add_column("Rule", style="white", max_width=45)
    table.add_column("Final", justify="right", style="green", width=6)
    table.add_column("Vec#", justify="right", style="dim", width=5)
    table.add_column("BM#", justify="right", style="dim", width=5)
    table.add_column("P", justify="right", style="yellow", width=4)

    for c in results:
        table.add_row(
            c["id"],
            c["domain"],
            c["rule_text"],
            f"{c['final_score']:.4f}",
            str(c.get("vector_rank", "-")),
            str(c.get("bm25_rank", "-")),
            str(c["precedence"]),
        )

    console.print(table)


# ── Session History ──────────────────────────────────────

@cli.command("history")
@click.option("--limit", "-n", default=20, help="Number of sessions to show")
def session_history(limit):
    """View past generation sessions."""
    db = ArchitectDB()
    db.connect()
    sessions = db.get_sessions(limit=limit)
    db.close()

    if not sessions:
        console.print("[yellow]No sessions recorded yet.[/yellow]")
        return

    table = Table(title="Generation Sessions", border_style="dim")
    table.add_column("ID", style="cyan", width=10)
    table.add_column("Time", style="dim", width=20)
    table.add_column("Domain", style="magenta", width=14)
    table.add_column("Goal", max_width=40)
    table.add_column("Corrections", justify="right", width=6)

    for s in sessions:
        table.add_row(
            s["id"],
            s.get("timestamp", ""),
            s["domain"],
            s.get("goal_summary", "")[:38],
            str(s.get("correction_cycles", 0)),
        )

    console.print(table)


# -- Generate (Full Pipeline) ----------------------------------

@cli.command()
@click.argument("prompt")
@click.option("--domain", "-d", default=None, help="Domain hint")
@click.option("--mode", "-m", default=None,
              type=click.Choice(["local", "api"]), help="LLM mode")
@click.option("--show-prompt", is_flag=True, help="Show augmented prompt")
def generate(prompt, domain, mode, show_prompt):
    """Generate code with constraint-aware augmentation."""
    from .generator.prompt_builder import build_generation_context
    from .generator.llm import LLMClient, LLMInferenceError

    console.print("\n[bold cyan]Architect Engine -- Generate[/bold cyan]\n")

    # Step 1: Retrieve constraints and build augmented prompt
    console.print("[dim]Retrieving constraints...[/dim]")
    retriever = HybridRetriever()
    retriever.connect()

    db = ArchitectDB()
    db.connect()
    session_id = db.create_session(
        domain=domain or "general",
        prompt_text=prompt,
        goal_summary=prompt[:100],
    )

    ctx = build_generation_context(prompt, retriever, session_id=session_id)
    n_constraints = len(ctx["constraints"])
    n_conflicts = len(ctx["conflicts"])

    console.print(f"  [green]OK[/green] {n_constraints} constraints retrieved")
    if ctx["domains"]:
        domain_str = ", ".join(f"{d}({s:.1f})" for d, s in ctx["domains"][:3])
        console.print(f"  [dim]Domains: {domain_str}[/dim]")
    if n_conflicts:
        console.print(f"  [yellow]WARNING[/yellow] {n_conflicts} conflicts detected")

    if show_prompt:
        console.print(Panel(ctx["augmented_prompt"], title="Augmented Prompt", border_style="dim"))

    # Step 2: Call LLM
    console.print("[dim]Generating...[/dim]")
    try:
        llm = LLMClient(mode=mode)
        result = llm.generate(
            system_prompt=ctx["augmented_prompt"],
            user_prompt=prompt,
        )
    except LLMInferenceError as e:
        console.print(f"\n[red]LLM Error:[/red] {e}\n")
        db.close()
        return

    # Step 3: Display output
    console.print(Panel(
        result["text"],
        title=f"Generated ({result['model']})",
        border_style="green",
    ))
    console.print(
        f"[dim]{result['prompt_tokens']} prompt tokens | "
        f"{result['output_tokens']} output tokens | "
        f"{result['latency_ms']}ms[/dim]\n"
    )

    # Step 4: Log session
    import json
    constraint_ids = [c["id"] for c in ctx["constraints"]]
    db.update_session(
        session_id,
        prompt_tokens=result["prompt_tokens"],
        output_tokens=result["output_tokens"],
        constraints_applied=json.dumps(constraint_ids),
        output_hash=result["output_hash"],
    )

    # Compute and record metrics
    node_count = n_constraints
    interface_count = n_conflicts
    complexity = (
        config.COMPLEXITY_WEIGHT_NODE * node_count
        + config.COMPLEXITY_WEIGHT_INTERFACE * interface_count
    )
    error_rate = 0.0
    proficiency = complexity / (1 + config.PROFICIENCY_ERROR_WEIGHT * error_rate)

    db.record_metrics(
        session_id=session_id,
        complexity_score=complexity,
        proficiency_score=proficiency,
        node_count=node_count,
        interface_count=interface_count,
        error_rate=error_rate,
    )
    db.close()

    console.print(f"[dim]Session {session_id} logged.[/dim]\n")


if __name__ == "__main__":
    cli()

### personal_ML/dashboard.py

"""
Architect Engine -- Streamlit Dashboard

Visualizes engineering telemetry: complexity trends, constraint usage,
domain breakdown, and session history.

Launch:
    streamlit run architect_engine/dashboard.py
"""

from __future__ import annotations

import streamlit as st
import json
from datetime import datetime

# Must be first Streamlit call
st.set_page_config(
    page_title="Architect Engine -- Telemetry",
    page_icon="*",
    layout="wide",
)

# Import after page config to avoid reload issues
from architect_engine import config
from architect_engine.db.schema import ArchitectDB
from architect_engine.telemetry.scorer import TelemetryScorer


@st.cache_resource
def get_db():
    db = ArchitectDB()
    db.connect()
    return db


def main():
    st.title("Architect Engine -- Engineering Telemetry")
    st.caption("Tracking complexity, proficiency, and constraint adoption")

    db = get_db()
    scorer = TelemetryScorer(db)
    scorer.connect()

    # ── Sidebar ───────────────────────────────────────────
    with st.sidebar:
        st.header("Filters")
        limit = st.slider("Session limit", 10, 200, 50)
        st.divider()
        st.markdown("**Scoring Weights**")
        st.markdown(f"- Node (alpha): {config.COMPLEXITY_WEIGHT_NODE}")
        st.markdown(f"- Interface (beta): {config.COMPLEXITY_WEIGHT_INTERFACE}")
        st.markdown(f"- Deploy (delta): {config.COMPLEXITY_WEIGHT_DEPLOY}")
        st.markdown(f"- Error (gamma): {config.PROFICIENCY_ERROR_WEIGHT}")

    # ── Metrics Overview ──────────────────────────────────
    trend = scorer.get_trend(limit=limit)

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Sessions", trend["total_sessions"])
    with col2:
        st.metric(
            "Avg Complexity",
            f"{trend['avg_complexity']:.2f}",
            f"{trend['complexity_trend']:+.2f}" if trend["complexity_trend"] else None,
        )
    with col3:
        st.metric("Avg Proficiency", f"{trend['avg_proficiency']:.2f}")
    with col4:
        n_constraints = len(db.list_constraints())
        st.metric("Active Constraints", n_constraints)

    st.divider()

    # ── Charts ────────────────────────────────────────────
    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader("Complexity Over Sessions")
        metrics = db.get_metrics_history(limit=limit)
        if metrics:
            chart_data = {
                "Complexity": [m["complexity_score"] for m in reversed(metrics)],
                "Proficiency": [m["proficiency_score"] for m in reversed(metrics)],
            }
            st.line_chart(chart_data)
        else:
            st.info("No session data yet. Run `architect generate` to start tracking.")

    with col_right:
        st.subheader("Domain Breakdown")
        if trend["domain_breakdown"]:
            domain_data = trend["domain_breakdown"]
            st.bar_chart(domain_data)
        else:
            st.info("No domain data yet.")

    st.divider()

    # ── Constraint Usage ──────────────────────────────────
    st.subheader("Constraint Usage")
    usage = scorer.get_constraint_usage()
    if usage:
        for u in usage:
            cid = u["constraint_id"]
            constraint = db.get_constraint(cid)
            rule = constraint["rule_text"] if constraint else "Unknown"
            applied = u["applied_count"]
            overridden = u["overridden_count"]
            total = u["times_applied"]

            col_id, col_rule, col_bar = st.columns([1, 4, 2])
            with col_id:
                st.code(cid)
            with col_rule:
                st.markdown(rule)
            with col_bar:
                st.progress(applied / total if total > 0 else 0,
                           text=f"{applied}/{total} applied")
    else:
        st.info("No constraint usage data. Constraints are tracked when `architect generate` is used.")

    st.divider()

    # ── Session History Table ─────────────────────────────
    st.subheader("Recent Sessions")
    sessions = db.get_sessions(limit=limit)
    if sessions:
        rows = []
        for s in sessions:
            constraints_applied = s.get("constraints_applied", "[]")
            try:
                c_list = json.loads(constraints_applied) if constraints_applied else []
            except (json.JSONDecodeError, TypeError):
                c_list = []

            rows.append({
                "ID": s["id"],
                "Time": s.get("timestamp", ""),
                "Domain": s["domain"],
                "Goal": (s.get("goal_summary", "") or "")[:60],
                "Constraints": len(c_list),
                "Corrections": s.get("correction_cycles", 0),
                "Tokens": (s.get("prompt_tokens", 0) or 0) + (s.get("output_tokens", 0) or 0),
            })
        st.dataframe(rows, use_container_width=True)
    else:
        st.info("No sessions yet.")

    # ── Active Constraints ────────────────────────────────
    with st.expander("Active Constraints", expanded=False):
        constraints = db.list_constraints()
        if constraints:
            rows = []
            for c in constraints:
                rows.append({
                    "ID": c["id"],
                    "V": c["version"],
                    "Domain": c["domain"],
                    "Rule": c["rule_text"],
                    "Precedence": c["precedence"],
                })
            st.dataframe(rows, use_container_width=True)


if __name__ == "__main__":
    main()

### personal_ML/db/schema.py

"""
Architect Engine — SQLite Schema & Initialization

Tables:
  - constraints: Engineering rules with versioning and precedence
  - sessions: Generation session logs
  - architectural_components: Technology nodes per session
  - progress_metrics: Complexity/proficiency scores per session
"""

import sqlite3
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

from .. import config


# ── Starter Constraint Library ────────────────────────────

STARTER_CONSTRAINTS: List[Dict[str, Any]] = [
    {
        "id": "C001",
        "domain": "data_structures",
        "rule_text": "Use collections.deque(maxlen=N) for all fixed-size history buffers",
        "rationale": "O(1) append/pop vs O(n) list slicing",
        "precedence": 70,
    },
    {
        "id": "C002",
        "domain": "concurrency",
        "rule_text": "All asyncio coroutines require explicit asyncio.timeout() wrappers",
        "rationale": "Prevents silent hangs in production event loops",
        "precedence": 90,
    },
    {
        "id": "C003",
        "domain": "concurrency",
        "rule_text": "ZeroMQ sockets must use SNDTIMEO/RCVTIMEO to prevent deadlocks",
        "rationale": "Unbounded blocking on ZMQ sockets causes cascading timeouts",
        "precedence": 85,
    },
    {
        "id": "C004",
        "domain": "risk",
        "rule_text": "All position-sizing functions must accept max_bankroll_fraction parameter with default 0.02",
        "rationale": "Hard risk ceiling enforcement — never risk >2% of bankroll per trade",
        "precedence": 95,
    },
    {
        "id": "C005",
        "domain": "risk",
        "rule_text": "All Kelly criterion implementations must include half-Kelly conservative mode",
        "rationale": "Full Kelly is theoretically optimal but practically volatile; half-Kelly reduces variance by ~50%",
        "precedence": 90,
    },
    {
        "id": "C006",
        "domain": "typing",
        "rule_text": "Full type hints mandatory on all function signatures; use typing.TypeVar for generics",
        "rationale": "Static analysis compatibility with mypy/pyright; catches type errors before runtime",
        "precedence": 80,
    },
    {
        "id": "C007",
        "domain": "performance",
        "rule_text": "No non-vectorized loops over arrays >1000 elements; use NumPy/Pandas vectorized operations",
        "rationale": "Python loops over large arrays are 100-1000x slower than vectorized equivalents",
        "precedence": 75,
    },
    {
        "id": "C008",
        "domain": "memory",
        "rule_text": "WebSocket managers must implement explicit connection cleanup on disconnect",
        "rationale": "Leaked WebSocket connections cause file descriptor exhaustion under sustained load",
        "precedence": 85,
    },
    {
        "id": "C009",
        "domain": "testing",
        "rule_text": "All pure functions require at least one property-based test using Hypothesis",
        "rationale": "Property-based tests find edge cases that example-based tests miss",
        "precedence": 70,
    },
    {
        "id": "C010",
        "domain": "architecture",
        "rule_text": "Database connection pools must specify max_connections explicitly",
        "rationale": "Default pool sizes cause connection starvation under concurrent load",
        "precedence": 80,
    },
]


class ArchitectDB:
    """SQLite database for constraints, sessions, and telemetry."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or config.DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn: Optional[sqlite3.Connection] = None

    def connect(self) -> sqlite3.Connection:
        """Open (or return existing) connection."""
        if self._conn is None:
            self._conn = sqlite3.connect(str(self.db_path))
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        return self._conn

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    # ── Schema Creation ──────────────────────────────────

    def init_schema(self):
        """Create all tables idempotently."""
        conn = self.connect()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS constraints (
                id TEXT PRIMARY KEY,
                version INTEGER NOT NULL DEFAULT 1,
                domain TEXT NOT NULL,
                rule_text TEXT NOT NULL,
                rationale TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                deprecated_at TIMESTAMP,
                precedence INTEGER DEFAULT 50
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                domain TEXT NOT NULL,
                goal_summary TEXT,
                prompt_text TEXT NOT NULL,
                prompt_tokens INTEGER,
                output_tokens INTEGER,
                correction_cycles INTEGER DEFAULT 0,
                constraints_applied TEXT,
                output_hash TEXT
            );

            CREATE TABLE IF NOT EXISTS architectural_components (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT REFERENCES sessions(id),
                component_type TEXT NOT NULL,
                component_name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS progress_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT REFERENCES sessions(id),
                complexity_score REAL,
                proficiency_score REAL,
                node_count INTEGER,
                interface_count INTEGER,
                error_rate REAL,
                computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS constraint_lineage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT REFERENCES sessions(id),
                constraint_id TEXT REFERENCES constraints(id),
                similarity_score REAL,
                was_applied INTEGER DEFAULT 1,
                override_reason TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_constraints_domain
                ON constraints(domain);
            CREATE INDEX IF NOT EXISTS idx_sessions_timestamp
                ON sessions(timestamp);
            CREATE INDEX IF NOT EXISTS idx_sessions_domain
                ON sessions(domain);
            CREATE INDEX IF NOT EXISTS idx_lineage_session
                ON constraint_lineage(session_id);

            CREATE TABLE IF NOT EXISTS constraint_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                constraint_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                domain TEXT NOT NULL,
                rule_text TEXT NOT NULL,
                rationale TEXT,
                precedence INTEGER,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                change_reason TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_versions_constraint
                ON constraint_versions(constraint_id);
        """)
        conn.commit()

    # ── Constraint CRUD ──────────────────────────────────

    def add_constraint(
        self,
        constraint_id: str,
        domain: str,
        rule_text: str,
        rationale: str = "",
        precedence: int = 50,
    ) -> str:
        """Insert a new constraint. Returns the ID."""
        conn = self.connect()
        conn.execute(
            """INSERT OR REPLACE INTO constraints
               (id, domain, rule_text, rationale, precedence)
               VALUES (?, ?, ?, ?, ?)""",
            (constraint_id, domain, rule_text, rationale, precedence),
        )
        conn.commit()
        return constraint_id

    def get_constraint(self, constraint_id: str) -> Optional[Dict[str, Any]]:
        conn = self.connect()
        row = conn.execute(
            "SELECT * FROM constraints WHERE id = ?", (constraint_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_constraints(
        self, domain: Optional[str] = None, include_deprecated: bool = False
    ) -> List[Dict[str, Any]]:
        conn = self.connect()
        query = "SELECT * FROM constraints"
        params: list = []
        conditions = []

        if domain:
            conditions.append("domain = ?")
            params.append(domain)
        if not include_deprecated:
            conditions.append("deprecated_at IS NULL")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY precedence DESC, domain, id"
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def update_constraint(
        self,
        constraint_id: str,
        rule_text: Optional[str] = None,
        rationale: Optional[str] = None,
        precedence: Optional[int] = None,
        domain: Optional[str] = None,
        change_reason: str = "",
    ) -> int:
        """
        Update a constraint with version history.
        Archives the old version, increments version number, applies changes.
        Returns the new version number.
        """
        conn = self.connect()
        old = self.get_constraint(constraint_id)
        if not old:
            raise ValueError(f"Constraint {constraint_id} not found")

        old_version = old["version"]

        # Archive old version
        conn.execute(
            """INSERT INTO constraint_versions
               (constraint_id, version, domain, rule_text, rationale, precedence, change_reason)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (constraint_id, old_version, old["domain"], old["rule_text"],
             old.get("rationale", ""), old["precedence"], change_reason),
        )

        # Apply updates
        new_version = old_version + 1
        updates = {"version": new_version}
        if rule_text is not None:
            updates["rule_text"] = rule_text
        if rationale is not None:
            updates["rationale"] = rationale
        if precedence is not None:
            updates["precedence"] = precedence
        if domain is not None:
            updates["domain"] = domain

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [constraint_id]
        conn.execute(
            f"UPDATE constraints SET {set_clause} WHERE id = ?", values
        )
        conn.commit()
        return new_version

    def get_constraint_history(self, constraint_id: str) -> List[Dict[str, Any]]:
        """Get version history for a constraint."""
        conn = self.connect()
        rows = conn.execute(
            """SELECT * FROM constraint_versions
               WHERE constraint_id = ?
               ORDER BY version DESC""",
            (constraint_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def deprecate_constraint(self, constraint_id: str) -> bool:
        conn = self.connect()
        cursor = conn.execute(
            "UPDATE constraints SET deprecated_at = ? WHERE id = ?",
            (datetime.now().isoformat(), constraint_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    # ── Session CRUD ─────────────────────────────────────

    def create_session(
        self,
        domain: str,
        prompt_text: str,
        goal_summary: str = "",
    ) -> str:
        session_id = str(uuid.uuid4())[:8]
        conn = self.connect()
        conn.execute(
            """INSERT INTO sessions (id, domain, prompt_text, goal_summary)
               VALUES (?, ?, ?, ?)""",
            (session_id, domain, prompt_text, goal_summary),
        )
        conn.commit()
        return session_id

    def update_session(self, session_id: str, **kwargs):
        conn = self.connect()
        set_clauses = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values()) + [session_id]
        conn.execute(
            f"UPDATE sessions SET {set_clauses} WHERE id = ?", values
        )
        conn.commit()

    def get_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        conn = self.connect()
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Lineage ──────────────────────────────────────────

    def record_lineage(
        self,
        session_id: str,
        constraint_id: str,
        similarity_score: float,
        was_applied: bool = True,
        override_reason: str = "",
    ):
        conn = self.connect()
        conn.execute(
            """INSERT INTO constraint_lineage
               (session_id, constraint_id, similarity_score, was_applied, override_reason)
               VALUES (?, ?, ?, ?, ?)""",
            (session_id, constraint_id, similarity_score, int(was_applied), override_reason),
        )
        conn.commit()

    # ── Metrics ──────────────────────────────────────────

    def record_metrics(
        self,
        session_id: str,
        complexity_score: float,
        proficiency_score: float,
        node_count: int,
        interface_count: int,
        error_rate: float,
    ):
        conn = self.connect()
        conn.execute(
            """INSERT INTO progress_metrics
               (session_id, complexity_score, proficiency_score,
                node_count, interface_count, error_rate)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (session_id, complexity_score, proficiency_score,
             node_count, interface_count, error_rate),
        )
        conn.commit()

    def get_metrics_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        conn = self.connect()
        rows = conn.execute(
            """SELECT pm.*, s.domain, s.goal_summary
               FROM progress_metrics pm
               JOIN sessions s ON pm.session_id = s.id
               ORDER BY pm.computed_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Seeding ──────────────────────────────────────────

    def seed_starter_constraints(self) -> int:
        """Load the starter constraint library. Returns count inserted."""
        count = 0
        for c in STARTER_CONSTRAINTS:
            existing = self.get_constraint(c["id"])
            if not existing:
                self.add_constraint(
                    constraint_id=c["id"],
                    domain=c["domain"],
                    rule_text=c["rule_text"],
                    rationale=c.get("rationale", ""),
                    precedence=c.get("precedence", 50),
                )
                count += 1
        return count

### personal_ML/db/vector_store.py

"""
Architect Engine — ChromaDB Vector Store

Wraps ChromaDB for semantic search over engineering constraints.
Uses sentence-transformers for local embedding generation.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Any

from .. import config

logger = logging.getLogger(__name__)


class ConstraintVectorStore:
    """
    ChromaDB-backed vector store for constraint retrieval.

    Each constraint is stored as a single document with metadata
    (domain, precedence, version). Queries return the top-K
    most semantically similar constraints above the threshold.
    """

    COLLECTION_NAME = "engineering_constraints"

    def __init__(self, persist_dir: Optional[str] = None):
        self._persist_dir = persist_dir or str(config.CHROMA_DIR)
        self._client = None
        self._collection = None

    def connect(self):
        """Initialize ChromaDB client and collection."""
        import chromadb
        from chromadb.utils import embedding_functions

        config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)

        self._client = chromadb.PersistentClient(path=self._persist_dir)

        # Use sentence-transformers for local embeddings
        ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=config.EMBEDDING_MODEL
        )

        self._collection = self._client.get_or_create_collection(
            name=self.COLLECTION_NAME,
            embedding_function=ef,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "ChromaDB connected: %d constraints in store",
            self._collection.count(),
        )

    @property
    def count(self) -> int:
        return self._collection.count() if self._collection else 0

    # ── Add / Update ─────────────────────────────────────

    def add_constraint(
        self,
        constraint_id: str,
        rule_text: str,
        domain: str,
        rationale: str = "",
        precedence: int = 50,
        version: int = 1,
    ):
        """Add or update a constraint in the vector store."""
        if self._collection is None:
            raise RuntimeError("Call connect() first")

        # Combine rule + rationale for richer embedding
        document = f"[{domain.upper()}] {rule_text}"
        if rationale:
            document += f" — Rationale: {rationale}"

        self._collection.upsert(
            ids=[constraint_id],
            documents=[document],
            metadatas=[{
                "domain": domain,
                "precedence": precedence,
                "version": version,
                "rule_text": rule_text,
                "rationale": rationale,
            }],
        )

    def delete_constraint(self, constraint_id: str):
        """Remove a constraint from the store."""
        if self._collection:
            self._collection.delete(ids=[constraint_id])

    # ── Query ────────────────────────────────────────────

    def query(
        self,
        prompt: str,
        top_k: int = config.TOP_K,
        threshold: float = config.SIMILARITY_THRESHOLD,
        domain_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve constraints relevant to a prompt.

        Returns list of dicts with keys:
          id, rule_text, domain, precedence, similarity, rationale
        """
        if self._collection is None:
            raise RuntimeError("Call connect() first")

        where_filter = {"domain": domain_filter} if domain_filter else None

        results = self._collection.query(
            query_texts=[prompt],
            n_results=min(top_k, self._collection.count() or top_k),
            where=where_filter,
            include=["metadatas", "distances", "documents"],
        )

        constraints = []
        if not results["ids"] or not results["ids"][0]:
            return constraints

        for i, cid in enumerate(results["ids"][0]):
            # ChromaDB returns distances (lower = more similar for cosine)
            # Convert to similarity: similarity = 1 - distance
            distance = results["distances"][0][i]
            similarity = 1.0 - distance

            if similarity < threshold:
                continue

            meta = results["metadatas"][0][i]
            constraints.append({
                "id": cid,
                "rule_text": meta.get("rule_text", ""),
                "domain": meta.get("domain", ""),
                "precedence": meta.get("precedence", 50),
                "rationale": meta.get("rationale", ""),
                "similarity": round(similarity, 4),
            })

        # Sort by precedence (descending), then similarity
        constraints.sort(key=lambda c: (-c["precedence"], -c["similarity"]))
        return constraints

    # ── Bulk Operations ──────────────────────────────────

    def sync_from_db(self, db_constraints: List[Dict[str, Any]]):
        """
        Sync all constraints from SQLite into ChromaDB.
        Used during initialization or after bulk imports.
        """
        for c in db_constraints:
            self.add_constraint(
                constraint_id=c["id"],
                rule_text=c["rule_text"],
                domain=c["domain"],
                rationale=c.get("rationale", ""),
                precedence=c.get("precedence", 50),
                version=c.get("version", 1),
            )
        logger.info("Synced %d constraints to vector store", len(db_constraints))

    def get_all(self) -> List[Dict[str, Any]]:
        """Return all stored constraints with metadata."""
        if not self._collection or self._collection.count() == 0:
            return []

        results = self._collection.get(
            include=["metadatas", "documents"],
        )

        items = []
        for i, cid in enumerate(results["ids"]):
            meta = results["metadatas"][i]
            items.append({
                "id": cid,
                "rule_text": meta.get("rule_text", ""),
                "domain": meta.get("domain", ""),
                "precedence": meta.get("precedence", 50),
                "rationale": meta.get("rationale", ""),
            })
        return items

### personal_ML/generator/llm.py

"""
Architect Engine -- LLM Inference Layer

Supports two modes:
  - Local: Ollama (codellama, deepseek-coder)
  - API: Anthropic Claude via REST

Selected via ARCHITECT_LLM_MODE environment variable.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Dict, Optional, Any

from .. import config

logger = logging.getLogger(__name__)


class LLMInferenceError(Exception):
    """Raised when LLM inference fails."""
    pass


class LLMClient:
    """
    Unified LLM client supporting local (Ollama) and API (Anthropic) modes.
    """

    def __init__(self, mode: Optional[str] = None):
        self.mode = mode or config.LLM_MODE

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> Dict[str, Any]:
        """
        Generate a response from the LLM.

        Returns dict with:
            text: str            -- generated text
            model: str           -- model used
            prompt_tokens: int   -- input token estimate
            output_tokens: int   -- output token estimate
            latency_ms: int      -- inference time
            output_hash: str     -- SHA256 of output for dedup
        """
        start = time.time()

        if self.mode == "local":
            result = self._generate_local(system_prompt, user_prompt, max_tokens, temperature)
        elif self.mode == "api":
            result = self._generate_api(system_prompt, user_prompt, max_tokens, temperature)
        else:
            raise LLMInferenceError(f"Unknown LLM mode: {self.mode}")

        elapsed_ms = int((time.time() - start) * 1000)
        result["latency_ms"] = elapsed_ms
        result["output_hash"] = hashlib.sha256(result["text"].encode()).hexdigest()

        logger.info(
            "LLM [%s] generated %d tokens in %dms",
            result["model"], result["output_tokens"], elapsed_ms,
        )
        return result

    def _generate_local(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> Dict[str, Any]:
        """Generate via Ollama REST API (localhost:11434)."""
        import httpx

        model = config.LOCAL_MODEL
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
            },
        }

        try:
            resp = httpx.post(
                "http://localhost:11434/api/chat",
                json=payload,
                timeout=120.0,
            )
            resp.raise_for_status()
            data = resp.json()

            text = data.get("message", {}).get("content", "")
            return {
                "text": text,
                "model": model,
                "prompt_tokens": data.get("prompt_eval_count", 0),
                "output_tokens": data.get("eval_count", 0),
            }
        except httpx.ConnectError:
            raise LLMInferenceError(
                "Cannot connect to Ollama at localhost:11434. "
                "Is Ollama running? Try: ollama serve"
            )
        except Exception as e:
            raise LLMInferenceError(f"Ollama error: {e}")

    def _generate_api(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> Dict[str, Any]:
        """Generate via Anthropic Claude API."""
        import httpx

        api_key = config.ANTHROPIC_API_KEY
        if not api_key:
            raise LLMInferenceError(
                "ANTHROPIC_API_KEY not set. Either:\n"
                "  1. Set ANTHROPIC_API_KEY environment variable\n"
                "  2. Switch to local mode: ARCHITECT_LLM_MODE=local"
            )

        model = config.API_MODEL
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_prompt},
            ],
        }

        try:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                json=payload,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                timeout=60.0,
            )
            resp.raise_for_status()
            data = resp.json()

            # Extract text from content blocks
            text_parts = []
            for block in data.get("content", []):
                if block.get("type") == "text":
                    text_parts.append(block["text"])

            text = "\n".join(text_parts)
            usage = data.get("usage", {})

            return {
                "text": text,
                "model": model,
                "prompt_tokens": usage.get("input_tokens", 0),
                "output_tokens": usage.get("output_tokens", 0),
            }
        except httpx.HTTPStatusError as e:
            raise LLMInferenceError(f"Anthropic API error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise LLMInferenceError(f"Anthropic error: {e}")

### personal_ML/generator/prompt_builder.py

"""
Architect Engine -- Prompt Augmentation Pipeline

Analyzes user prompts to classify domain, retrieves relevant constraints,
detects conflicts, and builds an augmented system prompt for the LLM.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Any, Tuple

from .. import config
from ..retrieval.engine import HybridRetriever

logger = logging.getLogger(__name__)

# Domain keywords for fast classification (fallback when LLM isn't needed)
DOMAIN_KEYWORDS: Dict[str, List[str]] = {
    "concurrency": [
        "async", "await", "asyncio", "threading", "multiprocessing",
        "coroutine", "zmq", "zeromq", "concurrent", "parallel", "lock",
        "semaphore", "queue", "event_loop", "task", "gather",
    ],
    "risk": [
        "position", "bankroll", "kelly", "sizing", "risk", "drawdown",
        "stop_loss", "take_profit", "portfolio", "exposure", "leverage",
        "hedge", "pnl", "profit", "loss",
    ],
    "data_structures": [
        "deque", "list", "dict", "set", "array", "buffer", "queue",
        "stack", "tree", "graph", "heap", "hash", "linked_list",
        "collections", "history", "ring_buffer",
    ],
    "typing": [
        "type", "hint", "annotation", "TypeVar", "Generic", "Protocol",
        "Optional", "Union", "Literal", "mypy", "pyright", "cast",
        "override", "abstract", "interface",
    ],
    "performance": [
        "numpy", "pandas", "vectorize", "numba", "cython", "loop",
        "optimize", "profile", "benchmark", "cache", "memoize",
        "batch", "bulk", "parallel", "simd",
    ],
    "memory": [
        "websocket", "connection", "socket", "leak", "cleanup",
        "gc", "garbage", "reference", "weak_ref", "pool",
        "file_descriptor", "resource", "close", "dispose",
    ],
    "testing": [
        "test", "pytest", "unittest", "hypothesis", "property",
        "fixture", "mock", "stub", "assert", "coverage", "tdd",
        "integration", "unit", "e2e",
    ],
    "architecture": [
        "database", "connection_pool", "migration", "schema",
        "microservice", "api", "rest", "grpc", "queue", "broker",
        "container", "docker", "kubernetes", "deploy",
    ],
}


def classify_domains(prompt: str) -> List[Tuple[str, float]]:
    """
    Classify prompt into domains with confidence scores.
    Returns sorted list of (domain, score) tuples.
    """
    prompt_lower = prompt.lower()
    tokens = set(prompt_lower.replace("_", " ").split())

    scores: Dict[str, float] = {}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        # Count keyword hits
        hits = sum(1 for kw in keywords if kw in prompt_lower)
        # Also check token-level matches
        token_hits = len(tokens.intersection(set(keywords)))
        score = hits + (token_hits * 0.5)
        if score > 0:
            scores[domain] = score

    # Normalize to [0, 1]
    if scores:
        max_score = max(scores.values())
        scores = {d: s / max_score for d, s in scores.items()}

    return sorted(scores.items(), key=lambda x: -x[1])


def detect_conflicts(constraints: List[Dict[str, Any]]) -> List[Tuple[Dict, Dict, str]]:
    """
    Detect potential conflicts between retrieved constraints.
    Returns list of (constraint_a, constraint_b, conflict_description).
    """
    conflicts = []
    for i, a in enumerate(constraints):
        for b in constraints[i + 1:]:
            # Same domain, different precedence -- potential override
            if a["domain"] == b["domain"] and a["precedence"] != b["precedence"]:
                # Check for contradictory keywords
                a_words = set(a["rule_text"].lower().split())
                b_words = set(b["rule_text"].lower().split())
                negation_words = {"no", "not", "never", "avoid", "without", "don't"}
                a_has_neg = bool(a_words & negation_words)
                b_has_neg = bool(b_words & negation_words)

                if a_has_neg != b_has_neg:
                    winner = a if a["precedence"] > b["precedence"] else b
                    conflicts.append((
                        a, b,
                        f"Potential contradiction in [{a['domain']}]. "
                        f"{winner['id']} (P={winner['precedence']}) takes precedence."
                    ))

    return conflicts


def build_augmented_prompt(
    user_prompt: str,
    constraints: List[Dict[str, Any]],
    conflicts: Optional[List[Tuple[Dict, Dict, str]]] = None,
) -> str:
    """
    Build the augmented system prompt with retrieved constraints injected.

    Format:
        [System context with constraints]
        ---
        [User's original prompt]
    """
    # Header
    parts = [
        "You are a senior software engineer following strict engineering constraints.",
        "The following constraints MUST be applied to your code generation:",
        "",
    ]

    # Group constraints by domain
    by_domain: Dict[str, List[Dict]] = {}
    for c in constraints:
        by_domain.setdefault(c["domain"], []).append(c)

    for domain, domain_constraints in sorted(by_domain.items()):
        parts.append(f"## {domain.upper()}")
        for c in sorted(domain_constraints, key=lambda x: -x["precedence"]):
            parts.append(f"  [{c['id']}] (P={c['precedence']}) {c['rule_text']}")
            if c.get("rationale"):
                parts.append(f"    Rationale: {c['rationale']}")
        parts.append("")

    # Conflict warnings
    if conflicts:
        parts.append("## CONFLICT WARNINGS")
        for a, b, desc in conflicts:
            parts.append(f"  ! {desc}")
        parts.append("")

    # Separator
    parts.append("---")
    parts.append("")
    parts.append("USER REQUEST:")
    parts.append(user_prompt)

    return "\n".join(parts)


def build_generation_context(
    user_prompt: str,
    retriever: HybridRetriever,
    top_k: int = config.TOP_K,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full pipeline: classify -> retrieve -> detect conflicts -> augment.

    Returns dict with:
        augmented_prompt: str
        domains: list of classified domains
        constraints: list of retrieved constraints
        conflicts: list of detected conflicts
    """
    # Step 1: Classify domains
    domains = classify_domains(user_prompt)
    primary_domain = domains[0][0] if domains else None

    logger.info("Classified domains: %s", domains[:3])

    # Step 2: Retrieve constraints (hybrid search)
    if session_id:
        constraints = retriever.search_with_lineage(
            user_prompt, session_id, top_k=top_k
        )
    else:
        constraints = retriever.search(user_prompt, top_k=top_k)

    logger.info("Retrieved %d constraints", len(constraints))

    # Step 3: Detect conflicts
    conflicts = detect_conflicts(constraints)
    if conflicts:
        logger.warning("%d constraint conflicts detected", len(conflicts))

    # Step 4: Build augmented prompt
    augmented = build_augmented_prompt(user_prompt, constraints, conflicts)

    return {
        "augmented_prompt": augmented,
        "domains": domains,
        "constraints": constraints,
        "conflicts": conflicts,
        "primary_domain": primary_domain,
    }

### personal_ML/retrieval/engine.py

"""
Architect Engine — Hybrid Retrieval Engine

Combines BM25 keyword scoring with ChromaDB vector similarity
for robust constraint retrieval. The hybrid approach ensures both
semantic understanding AND keyword-dense rules are surfaced.

Pipeline:
  1. Vector search (ChromaDB) → semantic similarity
  2. BM25 search (rank_bm25) → keyword relevance
  3. Reciprocal Rank Fusion → merge both rankings
  4. Precedence re-ranking → business priority
  5. Threshold gate → only high-confidence results
"""

from __future__ import annotations

import math
import logging
from typing import Dict, List, Optional, Any, Tuple

from rank_bm25 import BM25Okapi

from .. import config
from ..db.schema import ArchitectDB
from ..db.vector_store import ConstraintVectorStore

logger = logging.getLogger(__name__)


class HybridRetriever:
    """
    Hybrid BM25 + Vector search over the constraint store.

    Uses Reciprocal Rank Fusion (RRF) to combine rankings from
    vector similarity search and BM25 keyword search, then
    re-ranks by precedence.
    """

    # RRF constant (standard value from the original paper)
    RRF_K = 60

    def __init__(
        self,
        db: Optional[ArchitectDB] = None,
        vector_store: Optional[ConstraintVectorStore] = None,
        vector_weight: float = 0.6,
        bm25_weight: float = 0.4,
    ):
        self.db = db or ArchitectDB()
        self.vs = vector_store or ConstraintVectorStore()
        self.vector_weight = vector_weight
        self.bm25_weight = bm25_weight

        # BM25 corpus (loaded on first query)
        self._bm25: Optional[BM25Okapi] = None
        self._bm25_constraints: List[Dict[str, Any]] = []

    def connect(self):
        """Initialize both stores."""
        self.db.connect()
        self.vs.connect()

    def _build_bm25_index(self):
        """Build BM25 index from all active constraints."""
        constraints = self.db.list_constraints(include_deprecated=False)
        self._bm25_constraints = constraints

        # Tokenize: combine rule_text + rationale for richer matching
        corpus = []
        for c in constraints:
            text = f"{c['rule_text']} {c.get('rationale', '')}"
            tokens = text.lower().split()
            corpus.append(tokens)

        if corpus:
            self._bm25 = BM25Okapi(corpus)
        else:
            self._bm25 = None

        logger.debug("BM25 index built with %d documents", len(corpus))

    def _vector_search(
        self,
        query: str,
        top_k: int,
        domain_filter: Optional[str],
    ) -> List[Tuple[str, float]]:
        """
        Vector similarity search.
        Returns list of (constraint_id, similarity_score).
        """
        results = self.vs.query(
            prompt=query,
            top_k=top_k,
            threshold=0.0,  # Don't threshold here; we threshold after fusion
            domain_filter=domain_filter,
        )
        return [(r["id"], r["similarity"]) for r in results]

    def _bm25_search(
        self,
        query: str,
        top_k: int,
        domain_filter: Optional[str],
    ) -> List[Tuple[str, float]]:
        """
        BM25 keyword search.
        Returns list of (constraint_id, bm25_score).
        """
        if self._bm25 is None:
            self._build_bm25_index()

        if self._bm25 is None or not self._bm25_constraints:
            return []

        tokens = query.lower().split()
        scores = self._bm25.get_scores(tokens)

        # Pair with constraint IDs and filter by domain
        scored = []
        for i, score in enumerate(scores):
            c = self._bm25_constraints[i]
            if domain_filter and c["domain"] != domain_filter:
                continue
            if score > 0:
                scored.append((c["id"], float(score)))

        # Sort by score descending and take top-k
        scored.sort(key=lambda x: -x[1])
        return scored[:top_k]

    def _reciprocal_rank_fusion(
        self,
        vector_results: List[Tuple[str, float]],
        bm25_results: List[Tuple[str, float]],
    ) -> Dict[str, float]:
        """
        Merge two ranked lists using Reciprocal Rank Fusion.

        RRF_score(d) = w_v / (k + rank_v(d)) + w_b / (k + rank_b(d))

        Items appearing in only one list still get partial credit.
        """
        scores: Dict[str, float] = {}
        k = self.RRF_K

        # Vector ranking contribution
        for rank, (cid, _sim) in enumerate(vector_results, start=1):
            scores[cid] = scores.get(cid, 0.0) + self.vector_weight / (k + rank)

        # BM25 ranking contribution
        for rank, (cid, _score) in enumerate(bm25_results, start=1):
            scores[cid] = scores.get(cid, 0.0) + self.bm25_weight / (k + rank)

        return scores

    def search(
        self,
        query: str,
        top_k: int = config.TOP_K,
        threshold: float = 0.0,
        domain_filter: Optional[str] = None,
        precedence_boost: float = 0.3,
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search: vector + BM25 with RRF fusion and precedence re-ranking.

        Args:
            query: The user prompt or search text
            top_k: Maximum results to return
            threshold: Minimum RRF score (0.0 = no threshold)
            domain_filter: Optional domain to filter by
            precedence_boost: How much to boost high-precedence constraints

        Returns:
            List of constraint dicts with 'rrf_score', 'vector_rank',
            'bm25_rank', and 'final_score' fields.
        """
        # Rebuild BM25 index (cheap for <1000 docs)
        self._build_bm25_index()

        # Run both searches
        vec_results = self._vector_search(query, top_k * 2, domain_filter)
        bm25_results = self._bm25_search(query, top_k * 2, domain_filter)

        # Fuse rankings
        rrf_scores = self._reciprocal_rank_fusion(vec_results, bm25_results)

        if not rrf_scores:
            return []

        # Build rank lookup for provenance
        vec_rank = {cid: rank for rank, (cid, _) in enumerate(vec_results, 1)}
        bm25_rank = {cid: rank for rank, (cid, _) in enumerate(bm25_results, 1)}

        # Get full constraint data and compute final scores
        results = []
        for cid, rrf_score in rrf_scores.items():
            constraint = self.db.get_constraint(cid)
            if not constraint or constraint.get("deprecated_at"):
                continue

            # Precedence boost: normalize precedence to [0, 1] and add weighted boost
            prec_normalized = constraint["precedence"] / 100.0
            final_score = rrf_score + (precedence_boost * prec_normalized * rrf_score)

            results.append({
                **constraint,
                "rrf_score": round(rrf_score, 6),
                "final_score": round(final_score, 6),
                "vector_rank": vec_rank.get(cid),
                "bm25_rank": bm25_rank.get(cid),
            })

        # Sort by final_score descending
        results.sort(key=lambda r: -r["final_score"])

        # Apply threshold
        if threshold > 0:
            results = [r for r in results if r["final_score"] >= threshold]

        return results[:top_k]

    def search_with_lineage(
        self,
        query: str,
        session_id: str,
        top_k: int = config.TOP_K,
        threshold: float = 0.0,
        domain_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search and record constraint lineage for audit trail.
        Same as search() but also logs which constraints were retrieved.
        """
        results = self.search(query, top_k, threshold, domain_filter)

        for r in results:
            self.db.record_lineage(
                session_id=session_id,
                constraint_id=r["id"],
                similarity_score=r["final_score"],
                was_applied=True,
            )

        return results

### personal_ML/telemetry/scorer.py

"""
Architect Engine -- Telemetry Scoring

Implements the complexity/proficiency scoring algorithm:

  Complexity(S) = alpha*N + beta*I + delta*D
  Proficiency(S) = Complexity(S) / (1 + gamma * error_rate)

Where:
  N = node count (components used)
  I = interface count (cross-component interactions)
  D = deployment complexity (estimated)
  error_rate = corrections / total_generations
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

from .. import config
from ..db.schema import ArchitectDB

logger = logging.getLogger(__name__)


class TelemetryScorer:
    """
    Computes and tracks engineering complexity and proficiency scores.
    """

    def __init__(self, db: Optional[ArchitectDB] = None):
        self.db = db or ArchitectDB()

    def connect(self):
        self.db.connect()

    def compute_complexity(
        self,
        node_count: int,
        interface_count: int,
        deploy_complexity: float = 0.0,
    ) -> float:
        """
        Compute complexity score for a session.

        C = alpha*N + beta*I + delta*D
        """
        return (
            config.COMPLEXITY_WEIGHT_NODE * node_count
            + config.COMPLEXITY_WEIGHT_INTERFACE * interface_count
            + config.COMPLEXITY_WEIGHT_DEPLOY * deploy_complexity
        )

    def compute_proficiency(
        self,
        complexity: float,
        error_rate: float,
    ) -> float:
        """
        Compute proficiency score.

        P = C / (1 + gamma * error_rate)
        """
        return complexity / (1 + config.PROFICIENCY_ERROR_WEIGHT * error_rate)

    def get_trend(self, limit: int = 50) -> Dict[str, Any]:
        """
        Compute trend statistics from recent sessions.

        Returns:
            avg_complexity, avg_proficiency, total_sessions,
            complexity_trend (slope), domain_breakdown
        """
        metrics = self.db.get_metrics_history(limit=limit)
        if not metrics:
            return {
                "avg_complexity": 0.0,
                "avg_proficiency": 0.0,
                "total_sessions": 0,
                "complexity_trend": 0.0,
                "domain_breakdown": {},
            }

        complexities = [m["complexity_score"] for m in metrics]
        proficiencies = [m["proficiency_score"] for m in metrics]

        # Simple linear trend via first-last difference
        if len(complexities) >= 2:
            trend = (complexities[0] - complexities[-1]) / len(complexities)
        else:
            trend = 0.0

        # Domain breakdown
        domain_counts: Dict[str, int] = {}
        for m in metrics:
            d = m.get("domain", "unknown")
            domain_counts[d] = domain_counts.get(d, 0) + 1

        return {
            "avg_complexity": sum(complexities) / len(complexities),
            "avg_proficiency": sum(proficiencies) / len(proficiencies),
            "total_sessions": len(metrics),
            "complexity_trend": trend,
            "domain_breakdown": domain_counts,
        }

    def get_constraint_usage(self) -> List[Dict[str, Any]]:
        """
        Get aggregate constraint usage statistics from lineage data.
        """
        conn = self.db.connect()
        rows = conn.execute("""
            SELECT
                constraint_id,
                COUNT(*) as times_applied,
                AVG(similarity_score) as avg_similarity,
                SUM(CASE WHEN was_applied = 1 THEN 1 ELSE 0 END) as applied_count,
                SUM(CASE WHEN was_applied = 0 THEN 1 ELSE 0 END) as overridden_count
            FROM constraint_lineage
            GROUP BY constraint_id
            ORDER BY times_applied DESC
        """).fetchall()
        return [dict(r) for r in rows]
