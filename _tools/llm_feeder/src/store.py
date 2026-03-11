"""
LLM Feeder - Store Module
ChromaDB vector storage for embeddings and semantic retrieval
"""
import sys
import json
from pathlib import Path
from typing import Optional
from dataclasses import asdict

from rich.console import Console
from rich.table import Table

# Add parent to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import DB_DIR, PROCESSED_DIR, EMBEDDING_MODEL, CHROMA_COLLECTION

console = Console()


class VectorStore:
    """
    ChromaDB-based vector store for Neural-Ready knowledge.
    Uses sentence-transformers for local embeddings (no API costs).
    """
    
    def __init__(self, collection_name: str = CHROMA_COLLECTION, persist_dir: Path = DB_DIR):
        import chromadb
        from chromadb.config import Settings
        
        self.persist_dir = persist_dir
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize ChromaDB with persistence
        self.client = chromadb.PersistentClient(
            path=str(persist_dir),
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Get or create collection with embedding function
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}  # Use cosine similarity
        )
        
        console.print(f"[green][OK] ChromaDB initialized at {persist_dir}[/green]")
        console.print(f"   Collection: {collection_name}")
        console.print(f"   Documents: {self.collection.count()}")
    
    def add_document(self, 
        doc_id: str,
        content: str,
        metadata: dict,
        embedding: Optional[list[float]] = None
    ) -> None:
        """
        Add a document to the vector store.
        
        Args:
            doc_id: Unique document identifier
            content: Text content to embed
            metadata: Document metadata (category, source, etc.)
        """
        # Ensure metadata values are strings (ChromaDB requirement)
        clean_metadata = {}
        for key, value in metadata.items():
            if isinstance(value, list):
                clean_metadata[key] = ", ".join(str(v) for v in value)
            else:
                clean_metadata[key] = str(value)
        
        if embedding:
            self.collection.add(
                ids=[doc_id],
                embeddings=[embedding],
                documents=[content],
                metadatas=[clean_metadata]
            )
        else:
            # Let ChromaDB handle embedding via default embedding function
            self.collection.add(
                ids=[doc_id],
                documents=[content],
                metadatas=[clean_metadata]
            )
    
    def add_from_json(self, json_path: Path) -> bool:
        """
        Add a document from a processed JSON file.
        
        Args:
            json_path: Path to JSON file with ProcessedChunk data
            
        Returns:
            True if successful
        """
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            
            # Create searchable content from the structured data
            content = f"""
Topic: {data.get('topic_name', '')}
Category: {data.get('category', '')}
Core Concept: {data.get('core_concept', '')}
Technical Details: {' '.join(data.get('technical_breakdown', []))}
Code: {data.get('snippet', '')}
Related: {' '.join(data.get('cross_references', []))}
"""
            
            # Use file path as unique ID
            doc_id = str(json_path.stem)
            
            self.add_document(
                doc_id=doc_id,
                content=content.strip(),
                metadata={
                    "topic_name": data.get("topic_name", ""),
                    "category": data.get("category", ""),
                    "source_file": data.get("source_file", ""),
                    "chunk_index": data.get("chunk_index", 0),
                    "cross_references": ", ".join(data.get("cross_references", []))
                }
            )
            return True
            
        except Exception as e:
            console.print(f"[red]Error adding {json_path}: {e}[/red]")
            return False
    
    def query(
        self, 
        query_text: str, 
        n_results: int = 5,
        category_filter: Optional[str] = None
    ) -> list[dict]:
        """
        Semantic search for relevant documents.
        
        Args:
            query_text: Search query
            n_results: Number of results to return
            category_filter: Optional filter by category (Front-End, Back-End, Full-Stack)
            
        Returns:
            List of matching documents with metadata
        """
        where_filter = None
        if category_filter:
            where_filter = {"category": category_filter}
        
        results = self.collection.query(
            query_texts=[query_text],
            n_results=n_results,
            where=where_filter,
            include=["documents", "metadatas", "distances"]
        )
        
        # Format results
        formatted = []
        for i in range(len(results["ids"][0])):
            formatted.append({
                "id": results["ids"][0][i],
                "content": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "similarity": 1 - results["distances"][0][i]  # Convert distance to similarity
            })
        
        return formatted
    
    def count(self) -> int:
        """Get total document count"""
        return self.collection.count()
    
    def clear(self) -> None:
        """Clear all documents from the collection"""
        # Get all IDs and delete
        all_ids = self.collection.get()["ids"]
        if all_ids:
            self.collection.delete(ids=all_ids)
        console.print("[yellow]Collection cleared[/yellow]")


def index_processed_documents(
    input_dir: Path = PROCESSED_DIR,
    db_dir: Path = DB_DIR,
    clear_existing: bool = False
) -> int:
    """
    Index all processed JSON documents into ChromaDB.
    
    Args:
        input_dir: Directory containing processed JSON files
        db_dir: ChromaDB storage directory
        clear_existing: If True, clear existing documents first
        
    Returns:
        Number of documents indexed
    """
    store = VectorStore(persist_dir=db_dir)
    
    if clear_existing:
        store.clear()
    
    console.print(f"\n[bold blue][INDEX] Indexing Documents to ChromaDB[/bold blue]")
    console.print(f"   Input: {input_dir}")
    console.print(f"   Database: {db_dir}\n")
    
    json_files = list(input_dir.rglob("*.json"))
    console.print(f"   Found {len(json_files)} processed documents\n")
    
    indexed = 0
    for json_file in json_files:
        if store.add_from_json(json_file):
            indexed += 1
            console.print(f"  [green]+[/green] {json_file.stem}")
    
    console.print(f"\n[bold green][OK] Indexed {indexed} documents[/bold green]")
    console.print(f"   Total in collection: {store.count()}")
    
    return indexed


def interactive_query(db_dir: Path = DB_DIR):
    """Run interactive query mode"""
    store = VectorStore(persist_dir=db_dir)
    
    console.print("\n[bold][QUERY] Interactive Query Mode[/bold]")
    console.print("   Type your query and press Enter. Type 'quit' to exit.\n")
    
    while True:
        try:
            query = input("[cyan]Query:[/cyan] ").strip()
            
            if query.lower() in ["quit", "exit", "q"]:
                break
            
            if not query:
                continue
            
            results = store.query(query, n_results=3)
            
            if not results:
                console.print("[yellow]No results found[/yellow]\n")
                continue
            
            # Display results in a table
            table = Table(title=f"Results for: {query}")
            table.add_column("Topic", style="cyan")
            table.add_column("Category", style="green")
            table.add_column("Similarity", style="yellow")
            
            for r in results:
                table.add_row(
                    r["metadata"].get("topic_name", "Unknown"),
                    r["metadata"].get("category", "Unknown"),
                    f"{r['similarity']:.2%}"
                )
            
            console.print(table)
            
            # Show first result details
            console.print(f"\n[bold]Top Result:[/bold]")
            console.print(results[0]["content"][:500] + "...\n")
            
        except KeyboardInterrupt:
            break
    
    console.print("\n[dim]Query session ended[/dim]")


def main():
    """CLI entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="LLM Feeder - ChromaDB Vector Store")
    parser.add_argument(
        "--add",
        type=str,
        help="Directory of processed JSON files to add"
    )
    parser.add_argument(
        "--query",
        type=str,
        help="Query string for semantic search"
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Start interactive query mode"
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear existing documents before adding"
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Show collection statistics"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run a test add and query"
    )
    
    args = parser.parse_args()
    
    console.print("[bold]=== LLM Feeder - Vector Store ===[/bold]")
    
    if args.test:
        # Test mode: add a sample document and query it
        store = VectorStore()
        store.add_document(
            doc_id="test_doc_1",
            content="JavaScript fetch() is used to make HTTP requests from the browser. It returns a Promise.",
            metadata={
                "topic_name": "Fetch API",
                "category": "Front-End",
                "cross_references": "Promise, HTTP, REST API"
            }
        )
        console.print("\n[green][OK] Added test document[/green]")
        
        results = store.query("How do I make HTTP requests?")
        console.print(f"\n[bold]Query Results:[/bold]")
        for r in results:
            console.print(f"  > {r['metadata']['topic_name']} ({r['similarity']:.2%})")
        return
    
    if args.add:
        index_processed_documents(
            input_dir=Path(args.add),
            clear_existing=args.clear
        )
    
    if args.query:
        store = VectorStore()
        results = store.query(args.query)
        
        console.print(f"\n[bold]Results for: {args.query}[/bold]\n")
        for r in results:
            console.print(f"[cyan]{r['metadata'].get('topic_name', 'Unknown')}[/cyan]")
            console.print(f"  Category: {r['metadata'].get('category', 'Unknown')}")
            console.print(f"  Similarity: {r['similarity']:.2%}")
            console.print(f"  {r['content'][:200]}...\n")
    
    if args.interactive:
        interactive_query()
    
    if args.stats:
        store = VectorStore()
        console.print(f"\n[bold]Collection Statistics:[/bold]")
        console.print(f"  Total documents: {store.count()}")


if __name__ == "__main__":
    main()
