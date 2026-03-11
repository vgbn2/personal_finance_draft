"""
LLM Feeder - Main Entry Point
Orchestrates the full pipeline: Scrape -> Process -> Store
"""
import sys
import argparse
from pathlib import Path

from rich.console import Console
from rich.panel import Panel

# Ensure src is in path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from config import DATA_DIR, PROCESSED_DIR, DB_DIR
from src.scraper import scrape_odin_project, scrape_local
from src.processor import process_directory
from src.store import index_processed_documents, interactive_query, VectorStore

console = Console()


def run_full_pipeline(
    source: str = "odin",
    limit: int = None,
    use_ollama: bool = False,
    skip_scrape: bool = False,
    skip_process: bool = False,
    skip_store: bool = False
):
    """
    Run the complete ingestion pipeline.
    
    Args:
        source: Data source ("odin", "local", "all")
        limit: Max files to process at each stage
        use_ollama: Use local Ollama instead of OpenAI
        skip_scrape: Skip scraping stage
        skip_process: Skip processing stage
        skip_store: Skip storage stage
    """
    console.print(Panel.fit(
        "[bold blue]LLM Feeder Pipeline[/bold blue]\n"
        "Neural-Ready Knowledge Base Generator",
        border_style="blue"
    ))
    
    # Stage 1: Scrape
    if not skip_scrape:
        console.print("\n[bold]=== STAGE 1: SCRAPING ===[/bold]\n")
        
        if source in ["odin", "all"]:
            scrape_odin_project(limit=limit)
        
        if source in ["local", "all"]:
            scrape_local(limit=limit)
    else:
        console.print("\n[yellow][SKIP] Skipping scrape stage[/yellow]")
    
    # Stage 2: Process
    if not skip_process:
        console.print("\n[bold]=== STAGE 2: PROCESSING ===[/bold]\n")
        process_directory(
            input_dir=DATA_DIR,
            output_dir=PROCESSED_DIR,
            use_ollama=use_ollama,
            limit=limit
        )
    else:
        console.print("\n[yellow][SKIP] Skipping process stage[/yellow]")
    
    # Stage 3: Store
    if not skip_store:
        console.print("\n[bold]=== STAGE 3: STORING ===[/bold]\n")
        index_processed_documents(
            input_dir=PROCESSED_DIR,
            db_dir=DB_DIR
        )
    else:
        console.print("\n[yellow][SKIP] Skipping store stage[/yellow]")
    
    # Summary
    console.print("\n[bold green][OK] Pipeline Complete![/bold green]")
    store = VectorStore()
    console.print(f"\n[bold]Knowledge Base Stats:[/bold]")
    console.print(f"   Documents indexed: {store.count()}")
    console.print(f"   Database location: {DB_DIR}")
    console.print(f"\n[dim]Run 'python main.py query \"your question\"' to search[/dim]")


def main():
    parser = argparse.ArgumentParser(
        description="LLM Feeder - Neural-Ready Knowledge Base Generator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py run --source odin --limit 10    # Scrape 10 files from Odin Project
  python main.py run --source local              # Scrape your local repos
  python main.py run --skip-scrape               # Only process and store existing data
  python main.py query "What is fetch()?"        # Search the knowledge base
  python main.py interactive                     # Start interactive query mode
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Run pipeline
    run_parser = subparsers.add_parser("run", help="Run the ingestion pipeline")
    run_parser.add_argument("--source", choices=["odin", "local", "all"], default="odin")
    run_parser.add_argument("--limit", type=int, help="Max files per stage")
    run_parser.add_argument("--ollama", action="store_true", help="Use local Ollama")
    run_parser.add_argument("--skip-scrape", action="store_true")
    run_parser.add_argument("--skip-process", action="store_true")
    run_parser.add_argument("--skip-store", action="store_true")
    
    # Query
    query_parser = subparsers.add_parser("query", help="Query the knowledge base")
    query_parser.add_argument("text", type=str, help="Query text")
    query_parser.add_argument("-n", type=int, default=5, help="Number of results")
    query_parser.add_argument("--category", type=str, help="Filter by category")
    
    # Interactive
    subparsers.add_parser("interactive", help="Interactive query mode")
    
    # Stats
    subparsers.add_parser("stats", help="Show knowledge base statistics")
    
    args = parser.parse_args()
    
    if args.command == "run":
        run_full_pipeline(
            source=args.source,
            limit=args.limit,
            use_ollama=args.ollama,
            skip_scrape=args.skip_scrape,
            skip_process=args.skip_process,
            skip_store=args.skip_store
        )
    
    elif args.command == "query":
        store = VectorStore()
        results = store.query(args.text, n_results=args.n, category_filter=args.category)
        
        console.print(f"\n[bold][SEARCH] Results for: {args.text}[/bold]\n")
        for i, r in enumerate(results, 1):
            console.print(f"[cyan]{i}. {r['metadata'].get('topic_name', 'Unknown')}[/cyan]")
            console.print(f"   Category: {r['metadata'].get('category', 'Unknown')}")
            console.print(f"   Similarity: {r['similarity']:.2%}")
            console.print(f"   {r['content'][:300]}...\n")
    
    elif args.command == "interactive":
        interactive_query()
    
    elif args.command == "stats":
        store = VectorStore()
        console.print(f"\n[bold]Knowledge Base Statistics[/bold]")
        console.print(f"   Total documents: {store.count()}")
        console.print(f"   Database path: {DB_DIR}")
        console.print(f"   Data directory: {DATA_DIR}")
        console.print(f"   Processed directory: {PROCESSED_DIR}")
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
