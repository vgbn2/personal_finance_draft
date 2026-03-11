"""
LLM Feeder - Processor Module
Chunks documents and applies the System Prompt via LLM API
"""
import sys
import json
import re
from pathlib import Path
from typing import Optional, Generator
from dataclasses import dataclass, asdict

from rich.console import Console
from rich.progress import Progress

# Add parent to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import (
    SYSTEM_PROMPT, CHUNK_SIZE, CHUNK_OVERLAP, 
    LLM_MODEL, OPENAI_API_KEY, OLLAMA_ENDPOINT,
    DATA_DIR, PROCESSED_DIR
)

console = Console()


@dataclass
class ProcessedChunk:
    """Represents a processed document chunk in Neural-Ready format"""
    topic_name: str
    category: str            # Front-End, Back-End, Full-Stack
    core_concept: str        # 3-sentence summary
    technical_breakdown: list[str]  # Key bullet points
    snippet: str             # Code block
    cross_references: list[str]  # Related concepts
    
    # Metadata
    source_file: str
    chunk_index: int
    

def count_tokens(text: str) -> int:
    """
    Approximate token count (rough estimate: 4 chars per token).
    For production, use tiktoken for exact counts.
    """
    return len(text) // 4


def chunk_document(content: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Split a document into overlapping chunks.
    
    Args:
        content: Document text
        chunk_size: Target tokens per chunk
        overlap: Token overlap between chunks
        
    Returns:
        List of text chunks
    """
    # Split by double newlines (paragraphs) to keep logical units together
    paragraphs = re.split(r'\n\n+', content)
    
    chunks = []
    current_chunk = []
    current_tokens = 0
    
    for para in paragraphs:
        para_tokens = count_tokens(para)
        
        # If this paragraph alone exceeds chunk size, split it further
        if para_tokens > chunk_size:
            # Save current chunk if not empty
            if current_chunk:
                chunks.append("\n\n".join(current_chunk))
                current_chunk = []
                current_tokens = 0
            
            # Split large paragraph by sentences
            sentences = re.split(r'(?<=[.!?])\s+', para)
            for sentence in sentences:
                sent_tokens = count_tokens(sentence)
                if current_tokens + sent_tokens > chunk_size and current_chunk:
                    chunks.append("\n\n".join(current_chunk))
                    # Keep overlap from previous chunk
                    overlap_text = current_chunk[-1] if current_chunk else ""
                    current_chunk = [overlap_text, sentence] if overlap_text else [sentence]
                    current_tokens = count_tokens(" ".join(current_chunk))
                else:
                    current_chunk.append(sentence)
                    current_tokens += sent_tokens
        else:
            # Normal case: add paragraph to current chunk
            if current_tokens + para_tokens > chunk_size and current_chunk:
                chunks.append("\n\n".join(current_chunk))
                # Keep last paragraph for overlap
                overlap_text = current_chunk[-1] if current_chunk else ""
                current_chunk = [overlap_text, para] if overlap_text else [para]
                current_tokens = count_tokens(" ".join(current_chunk))
            else:
                current_chunk.append(para)
                current_tokens += para_tokens
    
    # Don't forget the last chunk
    if current_chunk:
        chunks.append("\n\n".join(current_chunk))
    
    return chunks


class LLMProcessor:
    """
    Processes document chunks through an LLM to create Neural-Ready format.
    Supports OpenAI API and local Ollama.
    """
    
    def __init__(self, use_ollama: bool = False, model: str = LLM_MODEL):
        self.use_ollama = use_ollama
        self.model = model
        
        if use_ollama:
            console.print(f"[cyan]Using Ollama at {OLLAMA_ENDPOINT}[/cyan]")
        else:
            if not OPENAI_API_KEY:
                console.print("[yellow]! No OpenAI API key - falling back to Ollama[/yellow]")
                self.use_ollama = True
            else:
                console.print(f"[green][OK] Using OpenAI ({model})[/green]")
    
    def process_chunk(self, chunk: str, source_file: str, chunk_index: int) -> Optional[ProcessedChunk]:
        """
        Process a single chunk through the LLM.
        
        Args:
            chunk: Raw text chunk
            source_file: Original source file path
            chunk_index: Index of this chunk in the document
            
        Returns:
            ProcessedChunk or None if processing failed
        """
        prompt = f"""Analyze this technical content and output in the exact JSON format below.

INPUT:
{chunk}

OUTPUT FORMAT (strict JSON):
{{
    "topic_name": "Descriptive topic title",
    "category": "Front-End" or "Back-End" or "Full-Stack",
    "core_concept": "3-sentence executive summary of the key concept",
    "technical_breakdown": ["Key point 1", "Key point 2", "Key point 3"],
    "snippet": "```language\\ncode example if present\\n```",
    "cross_references": ["Related concept 1", "Related concept 2"]
}}

Rules:
- If no code is present, set snippet to empty string
- Category must be exactly one of: Front-End, Back-End, Full-Stack
- technical_breakdown should have 2-5 bullet points
- cross_references should list related technical concepts mentioned or implied
"""
        
        try:
            if self.use_ollama:
                response = self._call_ollama(prompt)
            else:
                response = self._call_openai(prompt)
            
            # Parse JSON response
            if response:
                data = self._extract_json(response)
                if data:
                    return ProcessedChunk(
                        topic_name=data.get("topic_name", "Unknown"),
                        category=data.get("category", "Full-Stack"),
                        core_concept=data.get("core_concept", ""),
                        technical_breakdown=data.get("technical_breakdown", []),
                        snippet=data.get("snippet", ""),
                        cross_references=data.get("cross_references", []),
                        source_file=source_file,
                        chunk_index=chunk_index
                    )
        except Exception as e:
            console.print(f"[red]Error processing chunk: {e}[/red]")
        
        return None
    
    def _call_openai(self, prompt: str) -> Optional[str]:
        """Call OpenAI API"""
        import openai
        
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1500
        )
        
        return response.choices[0].message.content
    
    def _call_ollama(self, prompt: str) -> Optional[str]:
        """Call local Ollama API"""
        import requests
        
        response = requests.post(
            f"{OLLAMA_ENDPOINT}/api/generate",
            json={
                "model": self.model.replace("ollama/", ""),
                "prompt": f"{SYSTEM_PROMPT}\n\n{prompt}",
                "stream": False,
                "options": {"temperature": 0.3}
            },
            timeout=120
        )
        
        if response.status_code == 200:
            return response.json().get("response", "")
        return None
    
    def _extract_json(self, text: str) -> Optional[dict]:
        """Extract JSON from LLM response (handles markdown code blocks)"""
        # Try to find JSON in code block
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        
        # Try to parse the whole response as JSON
        try:
            # Find the first { and last }
            start = text.find('{')
            end = text.rfind('}') + 1
            if start != -1 and end > start:
                return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
        
        return None


def save_processed_chunk(chunk: ProcessedChunk, output_dir: Path) -> Path:
    """
    Save a processed chunk as a markdown file.
    
    Args:
        chunk: ProcessedChunk to save
        output_dir: Output directory
        
    Returns:
        Path to saved file
    """
    # Create category subdirectory
    category_dir = output_dir / chunk.category.lower().replace("-", "_")
    category_dir.mkdir(parents=True, exist_ok=True)
    
    # Create filename
    safe_name = re.sub(r'[^\w\s-]', '', chunk.topic_name.lower())
    safe_name = re.sub(r'[\s]+', '_', safe_name)[:50]
    filename = f"{safe_name}_{chunk.chunk_index}.md"
    filepath = category_dir / filename
    
    # Format as markdown
    content = f"""---
## {chunk.topic_name}
- **Category:** {chunk.category}
- **Core Concept:** {chunk.core_concept}
- **Technical Breakdown:**
{chr(10).join(f'  - {point}' for point in chunk.technical_breakdown)}
- **Snippet:**
{chunk.snippet if chunk.snippet else '_No code snippet_'}
- **Cross-Reference:** {', '.join(chunk.cross_references)}
---

_Source: {chunk.source_file} (chunk {chunk.chunk_index})_
"""
    
    filepath.write_text(content, encoding="utf-8")
    
    # Also save as JSON for embeddings
    json_path = filepath.with_suffix(".json")
    json_path.write_text(json.dumps(asdict(chunk), indent=2), encoding="utf-8")
    
    return filepath


def process_directory(
    input_dir: Path = DATA_DIR,
    output_dir: Path = PROCESSED_DIR,
    use_ollama: bool = False,
    limit: Optional[int] = None
) -> list[Path]:
    """
    Process all documents in a directory.
    
    Args:
        input_dir: Directory containing raw documents
        output_dir: Directory for processed output
        use_ollama: Use local Ollama instead of OpenAI
        limit: Maximum chunks to process (for testing)
        
    Returns:
        List of paths to processed files
    """
    processor = LLMProcessor(use_ollama=use_ollama)
    saved_files = []
    total_chunks = 0
    
    console.print(f"\n[bold blue][PROCESS] Processing Documents[/bold blue]")
    console.print(f"   Input: {input_dir}")
    console.print(f"   Output: {output_dir}\n")
    
    # Find all markdown files
    md_files = list(input_dir.rglob("*.md"))
    console.print(f"   Found {len(md_files)} documents to process\n")
    
    for md_file in md_files:
        try:
            content = md_file.read_text(encoding="utf-8")
            chunks = chunk_document(content)
            
            console.print(f"[cyan]> {md_file.name}[/cyan] ({len(chunks)} chunks)")
            
            for i, chunk_text in enumerate(chunks):
                result = processor.process_chunk(
                    chunk=chunk_text,
                    source_file=str(md_file),
                    chunk_index=i
                )
                
                if result:
                    filepath = save_processed_chunk(result, output_dir)
                    saved_files.append(filepath)
                    total_chunks += 1
                    console.print(f"  [green]+[/green] {result.topic_name}")
                
                if limit and total_chunks >= limit:
                    console.print(f"\n[yellow]Reached limit of {limit} chunks[/yellow]")
                    return saved_files
                    
        except Exception as e:
            console.print(f"[red]Error processing {md_file}: {e}[/red]")
    
    console.print(f"\n[bold green][OK] Processed {total_chunks} chunks from {len(md_files)} documents[/bold green]")
    return saved_files


def main():
    """CLI entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="LLM Feeder - Process documents to Neural-Ready format")
    parser.add_argument(
        "--input",
        type=str,
        default=str(DATA_DIR),
        help="Input directory with raw documents"
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(PROCESSED_DIR),
        help="Output directory for processed documents"
    )
    parser.add_argument(
        "--ollama",
        action="store_true",
        help="Use local Ollama instead of OpenAI"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum chunks to process"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run a quick test (3 chunks)"
    )
    
    args = parser.parse_args()
    
    if args.test:
        args.limit = 3
    
    console.print("[bold]=== LLM Feeder - Processor Module ===[/bold]")
    
    process_directory(
        input_dir=Path(args.input),
        output_dir=Path(args.output),
        use_ollama=args.ollama,
        limit=args.limit
    )


if __name__ == "__main__":
    main()
