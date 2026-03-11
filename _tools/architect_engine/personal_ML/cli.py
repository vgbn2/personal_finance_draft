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
from datetime import datetime

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

    # Step 5: Append to chat log file (User Request)
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_file = "chat.log"
    
    # Log Prompt
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}]\nPROMPT: {prompt}\nConstraints: {n_constraints}\n")

    # Step 2: Call LLM
    console.print("[dim]Generating...[/dim]")
    try:
        llm = LLMClient(mode=mode)
        result = llm.generate(
            system_prompt=ctx["augmented_prompt"],
            user_prompt=prompt,
        )
        response_text = result["text"]
    except LLMInferenceError as e:
        console.print(f"\n[red]LLM Error:[/red] {e}\n")
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"ERROR: {e}\n{'-'*60}\n")
        db.close()
        return

    # Log Response
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(f"RESPONSE:\n{response_text}\n{'-'*60}\n")

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

    # Step 4: Log session to DB and JSONL
    import json
    from datetime import datetime
    
    # Save prompt to JSONL log
    log_path = config.DATA_DIR / "prompts.jsonl"
    with open(log_path, "a", encoding="utf-8") as f:
        log_entry = {
            "session_id": session_id,
            "timestamp": datetime.now().isoformat(),
            "domain": domain or "general",
            "prompt": prompt,
            "model": result["model"]
        }
        f.write(json.dumps(log_entry) + "\n")

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

    console.print(f"[dim]Session {session_id} logged to DB and chat.log[/dim]\n")


if __name__ == "__main__":
    cli()
