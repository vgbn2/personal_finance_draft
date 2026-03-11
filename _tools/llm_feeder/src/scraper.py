"""
LLM Feeder - Scraper Module
Fetches markdown files from The Odin Project GitHub and other sources
"""
import sys
import time
import base64
import json
from pathlib import Path
from typing import Generator, Optional
from dataclasses import dataclass

import requests
from rich.console import Console
from rich.progress import Progress, TaskID
from tqdm import tqdm

# Add parent to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import SOURCES, DATA_DIR, GITHUB_TOKEN

console = Console()


@dataclass
class ScrapedDocument:
    """Represents a scraped document with metadata"""
    source: str           # e.g., "odin", "mdn", "local"
    path: str             # Original file path or URL
    title: str            # Document title
    content: str          # Raw markdown/text content
    category: str         # e.g., "javascript", "react", "nodejs"
    

class GitHubScraper:
    """
    Scrapes markdown files from GitHub repositories using the REST API.
    Respects rate limits: 60 req/hr (unauthenticated) or 5000 req/hr (with token)
    """
    
    BASE_URL = "https://api.github.com"
    
    def __init__(self, token: Optional[str] = None):
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "LLM-Feeder/1.0"
        })
        if token:
            self.session.headers["Authorization"] = f"Bearer {token}"
            console.print("[green][OK] GitHub token configured (5000 req/hr limit)[/green]")
        else:
            console.print("[yellow]! No GitHub token - using unauthenticated (60 req/hr limit)[/yellow]")
        
        self.rate_limit_remaining = 60
        self.rate_limit_reset = 0
    
    def _check_rate_limit(self, response: requests.Response) -> None:
        """Update rate limit tracking from response headers"""
        self.rate_limit_remaining = int(response.headers.get("X-RateLimit-Remaining", 60))
        self.rate_limit_reset = int(response.headers.get("X-RateLimit-Reset", 0))
        
        if self.rate_limit_remaining < 5:
            wait_time = max(0, self.rate_limit_reset - time.time()) + 1
            console.print(f"[yellow]Rate limit low ({self.rate_limit_remaining}). Waiting {wait_time:.0f}s...[/yellow]")
            time.sleep(wait_time)
    
    def get_repo_contents(self, repo: str, path: str = "", branch: str = "main") -> list[dict]:
        """
        Get contents of a directory in a GitHub repository.
        
        Args:
            repo: Repository in format "owner/repo"
            path: Directory path within repo
            branch: Branch name
            
        Returns:
            List of content items (files and directories)
        """
        url = f"{self.BASE_URL}/repos/{repo}/contents/{path}"
        params = {"ref": branch}
        
        try:
            response = self.session.get(url, params=params, timeout=30)
            self._check_rate_limit(response)
            
            if response.status_code == 404:
                console.print(f"[red]Path not found: {repo}/{path}[/red]")
                return []
            
            response.raise_for_status()
            return response.json()
            
        except requests.RequestException as e:
            console.print(f"[red]Error fetching {path}: {e}[/red]")
            return []
    
    def get_file_content(self, repo: str, path: str, branch: str = "main") -> Optional[str]:
        """
        Get the content of a specific file.
        
        Args:
            repo: Repository in format "owner/repo"
            path: File path within repo
            branch: Branch name
            
        Returns:
            File content as string, or None if error
        """
        url = f"{self.BASE_URL}/repos/{repo}/contents/{path}"
        params = {"ref": branch}
        
        try:
            response = self.session.get(url, params=params, timeout=30)
            self._check_rate_limit(response)
            response.raise_for_status()
            
            data = response.json()
            
            # Content is base64 encoded
            if "content" in data:
                content = base64.b64decode(data["content"]).decode("utf-8")
                return content
            
            return None
            
        except requests.RequestException as e:
            console.print(f"[red]Error fetching file {path}: {e}[/red]")
            return None
    
    def scrape_directory_recursive(
        self, 
        repo: str, 
        path: str = "", 
        branch: str = "main",
        extensions: list[str] = [".md"]
    ) -> Generator[ScrapedDocument, None, None]:
        """
        Recursively scrape all matching files from a directory.
        
        Args:
            repo: Repository in format "owner/repo"
            path: Starting directory path
            branch: Branch name
            extensions: List of file extensions to include
            
        Yields:
            ScrapedDocument for each matching file
        """
        contents = self.get_repo_contents(repo, path, branch)
        
        for item in contents:
            if item["type"] == "dir":
                # Recursively process subdirectories
                yield from self.scrape_directory_recursive(
                    repo, item["path"], branch, extensions
                )
            elif item["type"] == "file":
                # Check if file matches extensions
                file_path = item["path"]
                if any(file_path.endswith(ext) for ext in extensions):
                    content = self.get_file_content(repo, file_path, branch)
                    if content:
                        # Extract category from path (e.g., "javascript/basics/lesson.md" -> "javascript")
                        parts = file_path.split("/")
                        category = parts[0] if len(parts) > 1 else "general"
                        
                        # Extract title from filename or first heading
                        title = Path(file_path).stem.replace("_", " ").replace("-", " ").title()
                        
                        yield ScrapedDocument(
                            source="odin",
                            path=file_path,
                            title=title,
                            content=content,
                            category=category
                        )


class LocalScraper:
    """
    Scrapes files from local directories (e.g., your own code repos).
    """
    
    def __init__(self, base_paths: list[str], extensions: list[str] = [".py", ".md"]):
        self.base_paths = [Path(p) for p in base_paths]
        self.extensions = extensions
    
    def scrape(self) -> Generator[ScrapedDocument, None, None]:
        """
        Scrape all matching files from configured local paths.
        
        Yields:
            ScrapedDocument for each matching file
        """
        for base_path in self.base_paths:
            if not base_path.exists():
                console.print(f"[yellow]Skipping non-existent path: {base_path}[/yellow]")
                continue
            
            for ext in self.extensions:
                for file_path in base_path.rglob(f"*{ext}"):
                    # Skip hidden files and common non-content directories
                    if any(part.startswith(".") for part in file_path.parts):
                        continue
                    if any(skip in str(file_path) for skip in ["__pycache__", "node_modules", ".git", "venv"]):
                        continue
                    
                    try:
                        content = file_path.read_text(encoding="utf-8")
                        
                        # Determine category from parent directory
                        category = base_path.name
                        
                        yield ScrapedDocument(
                            source="local",
                            path=str(file_path),
                            title=file_path.stem.replace("_", " ").replace("-", " ").title(),
                            content=content,
                            category=category
                        )
                    except Exception as e:
                        console.print(f"[red]Error reading {file_path}: {e}[/red]")


def save_document(doc: ScrapedDocument, output_dir: Path) -> Path:
    """
    Save a scraped document to the data directory.
    
    Args:
        doc: ScrapedDocument to save
        output_dir: Base output directory
        
    Returns:
        Path to saved file
    """
    # Create subdirectory for source and category
    target_dir = output_dir / doc.source / doc.category
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # Create safe filename
    safe_name = doc.title.lower().replace(" ", "_")[:50]
    filename = f"{safe_name}.md"
    filepath = target_dir / filename
    
    # Add metadata header
    metadata = f"""---
source: {doc.source}
path: {doc.path}
title: {doc.title}
category: {doc.category}
---

"""
    
    filepath.write_text(metadata + doc.content, encoding="utf-8")
    return filepath


def scrape_odin_project(limit: Optional[int] = None) -> list[Path]:
    """
    Scrape markdown files from The Odin Project curriculum.
    
    Args:
        limit: Maximum number of files to scrape (None = unlimited)
        
    Returns:
        List of paths to saved files
    """
    config = SOURCES["odin"]
    scraper = GitHubScraper(token=GITHUB_TOKEN)
    
    saved_files = []
    total = 0
    
    console.print(f"\n[bold blue][SCRAPE] Scraping The Odin Project Curriculum[/bold blue]")
    console.print(f"   Repository: {config['repo']}")
    console.print(f"   Paths: {', '.join(config['paths'])}\n")
    
    for path in config["paths"]:
        console.print(f"[cyan]> Scanning: {path}/[/cyan]")
        
        for doc in scraper.scrape_directory_recursive(
            repo=config["repo"],
            path=path,
            branch=config["branch"],
            extensions=config["extensions"]
        ):
            filepath = save_document(doc, DATA_DIR)
            saved_files.append(filepath)
            total += 1
            console.print(f"  [green]+[/green] {doc.title} ({doc.category})")
            
            if limit and total >= limit:
                console.print(f"\n[yellow]Reached limit of {limit} files[/yellow]")
                return saved_files
    
    console.print(f"\n[bold green][OK] Scraped {total} files from The Odin Project[/bold green]")
    return saved_files


def scrape_local(limit: Optional[int] = None) -> list[Path]:
    """
    Scrape files from local code directories.
    
    Args:
        limit: Maximum number of files to scrape (None = unlimited)
        
    Returns:
        List of paths to saved files
    """
    config = SOURCES["local"]
    scraper = LocalScraper(
        base_paths=config["paths"],
        extensions=config["extensions"]
    )
    
    saved_files = []
    total = 0
    
    console.print(f"\n[bold blue][SCRAPE] Scraping Local Code Repositories[/bold blue]")
    console.print(f"   Paths: {len(config['paths'])} directories\n")
    
    for doc in scraper.scrape():
        filepath = save_document(doc, DATA_DIR)
        saved_files.append(filepath)
        total += 1
        console.print(f"  [green]+[/green] {doc.title} ({doc.category})")
        
        if limit and total >= limit:
            console.print(f"\n[yellow]Reached limit of {limit} files[/yellow]")
            return saved_files
    
    console.print(f"\n[bold green][OK] Scraped {total} local files[/bold green]")
    return saved_files


def main():
    """CLI entry point for the scraper"""
    import argparse
    
    parser = argparse.ArgumentParser(description="LLM Feeder - Scrape technical documentation")
    parser.add_argument(
        "--source", 
        choices=["odin", "local", "all"], 
        default="odin",
        help="Data source to scrape"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of files to scrape"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run a quick test scrape (5 files)"
    )
    
    args = parser.parse_args()
    
    if args.test:
        args.limit = 5
    
    console.print("[bold]=== LLM Feeder - Scraper Module ===[/bold]")
    
    all_files = []
    
    if args.source in ["odin", "all"]:
        all_files.extend(scrape_odin_project(limit=args.limit))
    
    if args.source in ["local", "all"]:
        remaining = args.limit - len(all_files) if args.limit else None
        all_files.extend(scrape_local(limit=remaining))
    
    console.print(f"\n[bold]Summary:[/bold]")
    console.print(f"   Total files scraped: {len(all_files)}")
    console.print(f"   Output directory: {DATA_DIR}")
    
    return all_files


if __name__ == "__main__":
    main()
