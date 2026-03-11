"""
Hybrid Ollama Extractor v3 — Production-Grade PDF Knowledge Extraction
======================================================================
8-Layer filtering pipeline:
  1. Chapter Blacklist (skip TOC, references, preface)
  2. Regex Signal Keywords (fast academic term detection)
  3. Math Symbol Density (detect formula-rich chunks)
  4. Semantic Embedding Fallback (catches paraphrased content)
  5. JSON-Enforced LLM Output (structured, parseable responses)
  6. Post-Processing Blacklist (kills junk like "None", single-letter vars)
  7. Self-Grading Audit Pass (LLM prunes its own excess)
  8. Fuzzy Deduplication (merges near-duplicate entries at notebook level)

Performance features:
  - Async parallel chunk processing (configurable concurrency)
  - Paragraph-aware smart chunking
  - LaTeX syntax validation
  - Incremental notebook writes (crash recovery)
  - Rich progress display with ETA
  - JSON checkpoint system for pause/resume
"""

import os
import sys
import re
import json
import hashlib
import asyncio
import nbformat as nbf
from pypdf import PdfReader
from collections import defaultdict
import requests
import time

# Rich progress (graceful fallback)
try:
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn, TimeRemainingColumn
    from rich.panel import Panel
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

# Async HTTP
try:
    import aiohttp
    ASYNC_AVAILABLE = True
except ImportError:
    ASYNC_AVAILABLE = False

# Semantic Embeddings (lazy loaded — only if needed)
_EMBEDDER = None
_GOLDEN_EMBEDDINGS = None
SEMANTIC_AVAILABLE = False
try:
    from sentence_transformers import SentenceTransformer, util
    SEMANTIC_AVAILABLE = True
except ImportError:
    pass

# Force UTF-8 for Windows console
sys.stdout.reconfigure(encoding='utf-8')

# =====================================================================
# CONFIGURATION
# =====================================================================
ROOT_DIR = r"c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\ptit_studies\Telecom_Quant_Finance"
SUBDIRS = ["Finance", "Math_Physics", "Computer_Science", "Signals_Systems"]
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "gemma3:4b"

MAX_PAGES_TO_READ = 9999
WORDS_PER_CHUNK = 500
CONCURRENT_REQUESTS = 2  # Async concurrency (tune for your hardware)

CHECKPOINT_FILE = os.path.join(ROOT_DIR, "_extraction_checkpoint.json")

# Console
console = Console() if RICH_AVAILABLE else None

def cprint(msg, style=None):
    """Print with rich if available, else plain print."""
    if console and style:
        console.print(msg, style=style)
    elif console:
        console.print(msg)
    else:
        print(msg)

# =====================================================================
# [1] CHAPTER BLACKLIST — Skip useless sections before any processing
# =====================================================================
CHAPTER_BLACKLIST = re.compile(
    r"(?i)"
    r"mục\s*lục|"
    r"tài\s*liệu\s*tham\s*khảo|"
    r"lời\s*nói\s*đầu|"
    r"lời\s*mở\s*đầu|"
    r"phụ\s*lục|"
    r"danh\s*mục|"
    r"bảng\s*chú\s*giải|"
    r"table\s*of\s*contents|"
    r"references|"
    r"bibliography|"
    r"appendix"
)

def is_blacklisted_chapter(text_chunk):
    """Returns True if chunk belongs to a useless section."""
    return CHAPTER_BLACKLIST.search(text_chunk[:150].lower()) is not None

# =====================================================================
# [2] REGEX SIGNAL KEYWORDS — Fast academic content detection
# =====================================================================
SIGNAL_KEYWORDS = [
    r"[Đđ]ịnh\s*nghĩa", r"[Kk]hái\s*niệm", r"[Cc]ông\s*thức",
    r"[Đđ]ịnh\s*lý", r"[Hh]ệ\s*quả", r"[Bb]ổ\s*đề",
    r"[Tt]iên\s*đề", r"[Pp]hương\s*trình", r"[Cc]hứng\s*minh",
    r"[Gg]iả\s*thiết", r"[Tt]ính\s*chất", r"[Qq]uy\s*tắc",
    r"[Dd]efinition", r"[Tt]heorem", r"[Ff]ormula",
    r"[Ee]quation", r"[Pp]roposition", r"[Ll]emma",
    r"\$\$", r"\\frac\{", r"\\sum", r"\\int", r"\\lim", r"\\sqrt",
    r"[=≈≠≤≥±∑∫∏√∞Δ]",
]
SIGNAL_PATTERN = re.compile("|".join(SIGNAL_KEYWORDS), re.IGNORECASE)

# =====================================================================
# [3] MATH SYMBOL DENSITY CHECK
# =====================================================================
MATH_SYMBOL_THRESHOLD = 3
MATH_SYMBOLS_PATTERN = re.compile(r"[=≈≠≤≥±∑∫∏√∞Δ(){}^_/\\]")

# =====================================================================
# [4] SEMANTIC EMBEDDING FALLBACK — Catches paraphrased academic content
# =====================================================================
GOLDEN_REFERENCES = [
    "Định nghĩa hình thức của khái niệm toán học",
    "Định lý và chứng minh trong giải tích",
    "Công thức tích phân và đạo hàm",
    "Formal definition of mathematical concept",
    "Theorem statement with proof",
    "Equation for signal processing",
]

def get_embedder():
    """Lazy-load the multilingual sentence transformer."""
    global _EMBEDDER, _GOLDEN_EMBEDDINGS
    if _EMBEDDER is None and SEMANTIC_AVAILABLE:
        cprint("  [INIT] Loading semantic model (one-time)...", "dim")
        _EMBEDDER = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
        _GOLDEN_EMBEDDINGS = _EMBEDDER.encode(GOLDEN_REFERENCES, convert_to_tensor=True)
    return _EMBEDDER, _GOLDEN_EMBEDDINGS

def is_chunk_semantically_relevant(text_chunk, threshold=0.35):
    """Semantic similarity check against golden academic references."""
    embedder, golden = get_embedder()
    if embedder is None:
        return False
    chunk_emb = embedder.encode(text_chunk[:1000], convert_to_tensor=True)
    similarities = util.cos_sim(chunk_emb, golden)
    return float(similarities.max()) >= threshold

# =====================================================================
# COMBINED PRE-FILTER (Layers 1-4)
# =====================================================================
def is_chunk_relevant(text_chunk):
    """Multi-layer pre-filter: blacklist -> regex -> math density -> semantic."""
    if is_blacklisted_chapter(text_chunk):
        return False
    if SIGNAL_PATTERN.search(text_chunk):
        return True
    math_hits = len(MATH_SYMBOLS_PATTERN.findall(text_chunk))
    if math_hits >= MATH_SYMBOL_THRESHOLD:
        return True
    # Semantic fallback (slower but catches edge cases)
    if SEMANTIC_AVAILABLE:
        return is_chunk_semantically_relevant(text_chunk)
    return False

# =====================================================================
# [6] POST-PROCESSING BLACKLIST — Kill junk entries automatically
# =====================================================================
JUNK_PATTERNS = [
    r"^None$", r"^N/A$", r"^\(None\)$", r"^Không có\b",
    r"^No formulas?\s*(found|in|were)", r"^\(No\b",
    r"^\(Extraction Failed\)", r"^\(Not explicitly",
    r"^This formula appears without context",
    r"^\d+$", r"^.{0,4}\*\*$",
]
JUNK_REGEX = re.compile("|".join(JUNK_PATTERNS), re.IGNORECASE)
MIN_ENTRY_LENGTH = 15

def is_junk_entry(entry):
    """Returns True if an extracted entry is noise/junk."""
    if not entry or len(entry) < MIN_ENTRY_LENGTH:
        return True
    if JUNK_REGEX.search(entry):
        return True
    if re.match(r'^[a-zA-Z0-9_]{1,3}\*?\*?:', entry):
        return True
    return False

# =====================================================================
# [REFINEMENT 5] LATEX VALIDATION
# =====================================================================
def is_valid_latex(formula_entry):
    """Basic LaTeX validation — rejects malformed formulas."""
    latex_match = re.search(r'\$\$(.+?)\$\$', formula_entry, re.DOTALL)
    if not latex_match:
        return False
    latex = latex_match.group(1)
    if latex.count('{') != latex.count('}'):
        return False
    if not re.search(r'[=+\-*/^_\\]', latex):
        return False
    return True

def clean_entries(entries, validate_latex=False):
    """Filter junk entries, optionally validate LaTeX for formulas."""
    result = []
    for e in entries:
        if is_junk_entry(e):
            continue
        if validate_latex and '$$' in e and not is_valid_latex(e):
            continue
        result.append(e)
    return result

# =====================================================================
# CHECKPOINT SYSTEM
# =====================================================================
def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                cprint(f"  [RESUME] Loaded checkpoint with {len(data.get('completed_files', []))} completed files.", "green")
                return data
        except Exception:
            pass
    return {"completed_files": [], "partial_results": {}}

def save_checkpoint(checkpoint):
    with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)

def get_file_hash(filepath):
    return hashlib.md5(filepath.encode()).hexdigest()[:12]

# =====================================================================
# [4] SMART PARAGRAPH-AWARE CHUNKING
# =====================================================================
def chunk_text_smart(text, target_words=WORDS_PER_CHUNK):
    """Chunk by paragraphs, merging small ones to hit target size."""
    paragraphs = re.split(r'\n\s*\n', text)
    current_chunk = []
    current_words = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        para_words = len(para.split())

        if current_words + para_words > target_words * 1.2 and current_chunk:
            yield " ".join(current_chunk)
            current_chunk = [para]
            current_words = para_words
        else:
            current_chunk.append(para)
            current_words += para_words

    if current_chunk:
        yield " ".join(current_chunk)

# =====================================================================
# [5] JSON-ENFORCED LLM OUTPUT — Structured, parseable responses
# =====================================================================
EXTRACT_SYSTEM_PROMPT = """You are an academic extractor for Vietnamese university materials (Telecom/Math/Finance).
Be EXTREMELY STRICT. Extract ONLY core, foundational items for a cheat sheet.

Extract:
1. glossary: Max 2 formal foundational definitions per chunk. Ignore examples, minor metrics, passing variables.
2. formulas: Max 2 named theorems/structural equations. MUST contain integrals, derivatives, summations, or matrices. Ignore basic arithmetic (x=y+1).

Respond ONLY with valid JSON:
{"glossary": [{"term": "...", "definition": "..."}], "formulas": [{"name": "...", "latex": "...", "explanation": "..."}]}

If nothing found: {"glossary": [], "formulas": []}"""

AUDIT_SYSTEM_PROMPT = """You are a ruthless quality-control editor. Review the extracted items.
Keep MAXIMUM 3 definitions and 3 formulas. DELETE anything that is not a core concept or a named theorem.
Respond ONLY with valid JSON:
{"glossary": [{"term": "...", "definition": "..."}], "formulas": [{"name": "...", "latex": "...", "explanation": "..."}]}"""

def query_ollama_sync(prompt, system_prompt, json_mode=True, max_retries=3):
    """Synchronous Ollama query with optional JSON mode."""
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "system": system_prompt,
        "stream": False,
        "options": {"temperature": 0.05, "num_predict": 400}
    }
    if json_mode:
        payload["format"] = "json"

    for attempt in range(max_retries):
        try:
            response = requests.post(OLLAMA_URL, json=payload, timeout=180)
            response.raise_for_status()
            return response.json().get("response", "{}").strip()
        except requests.exceptions.RequestException as e:
            print(f"\n    [!] Ollama error (Attempt {attempt+1}/{max_retries}): {e}")
            time.sleep(3)
    return "{}"

def parse_json_response(raw_json):
    """Parse JSON LLM response into glossary and formula lists."""
    try:
        parsed = json.loads(raw_json)
        glossary = [
            f"**{g['term']}**: {g['definition']}"
            for g in parsed.get("glossary", [])
            if isinstance(g, dict) and g.get("term") and g.get("definition")
        ]
        formulas = [
            f"**{f['name']}**: $${f['latex']}$$ - {f['explanation']}"
            for f in parsed.get("formulas", [])
            if isinstance(f, dict) and f.get("name") and f.get("latex")
        ]
        return glossary, formulas
    except (json.JSONDecodeError, KeyError, TypeError):
        return [], []

def extract_chunk_sync(chunk):
    """Extract from a single chunk using JSON mode (sync fallback)."""
    raw = query_ollama_sync(f"Extract from:\n\n{chunk}", EXTRACT_SYSTEM_PROMPT)
    g, f = parse_json_response(raw)
    g = clean_entries(g)
    f = clean_entries(f, validate_latex=True)

    # Self-grade if too noisy
    if len(g) > 3 or len(f) > 3:
        audit_input = json.dumps({"glossary": g, "formulas": f})
        raw2 = query_ollama_sync(f"Prune:\n{audit_input}", AUDIT_SYSTEM_PROMPT)
        g, f = parse_json_response(raw2)
        g = clean_entries(g)
        f = clean_entries(f, validate_latex=True)

    return g, f

# =====================================================================
# [3] ASYNC PARALLEL CHUNK PROCESSING
# =====================================================================
async def query_ollama_async(session, prompt, system_prompt, semaphore):
    """Async Ollama query with concurrency control."""
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "system": system_prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.05, "num_predict": 400}
    }
    async with semaphore:
        try:
            async with session.post(
                OLLAMA_URL, json=payload,
                timeout=aiohttp.ClientTimeout(total=180)
            ) as resp:
                result = await resp.json()
                await asyncio.sleep(0.5)  # Cooling between requests
                return result.get("response", "{}")
        except Exception:
            return "{}"

async def process_chunks_async(relevant_chunks, checkpoint, file_hash, tracker):
    """Process multiple chunks with controlled async concurrency."""
    semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
    all_glossary, all_formulas = [], []

    total = len(relevant_chunks)

    async with aiohttp.ClientSession() as session:
        # Process in batches for checkpoint saving and progress display
        batch_size = CONCURRENT_REQUESTS
        for batch_start in range(0, total, batch_size):
            batch = relevant_chunks[batch_start:batch_start + batch_size]
            batch_start_time = time.time()

            tasks = []
            for chunk_num, chunk in batch:
                prompt = f"Extract from:\n\n{chunk}"
                tasks.append(query_ollama_async(session, prompt, EXTRACT_SYSTEM_PROMPT, semaphore))

            results = await asyncio.gather(*tasks)

            for raw in results:
                g, f = parse_json_response(raw)
                g = clean_entries(g)
                f = clean_entries(f, validate_latex=True)

                # Self-grade if needed (sync for audit — rare path)
                if len(g) > 3 or len(f) > 3:
                    audit_input = json.dumps({"glossary": g, "formulas": f})
                    raw2 = query_ollama_sync(f"Prune:\n{audit_input}", AUDIT_SYSTEM_PROMPT)
                    g, f = parse_json_response(raw2)
                    g = clean_entries(g)
                    f = clean_entries(f, validate_latex=True)

                all_glossary.extend(g)
                all_formulas.extend(f)

            elapsed = time.time() - batch_start_time
            processed = min(batch_start + batch_size, total)
            tracker.record(elapsed / len(batch))
            remaining = total - processed
            eta = tracker.eta(remaining)

            cprint(f"       Batch {processed}/{total} — {sum(len(b) for b in [all_glossary])}d/{sum(len(b) for b in [all_formulas])}f total [ETA: {eta}]")

            # Save checkpoint every batch
            checkpoint["partial_results"][file_hash] = {
                "glossary": all_glossary,
                "formulas": all_formulas
            }
            save_checkpoint(checkpoint)

    return all_glossary, all_formulas

# =====================================================================
# [8] FUZZY DEDUPLICATION
# =====================================================================
def extract_key(entry):
    """Extracts the key term from an entry."""
    match = re.match(r'\*?\*?\s*\[?[^\]]*\]?\s*\*?\*?\s*([^*:]+)', entry)
    if match:
        return match.group(1).strip().lower()
    return entry[:30].strip().lower()

def deduplicate_entries(entries):
    """Removes near-duplicate entries based on normalized key terms."""
    seen_keys = {}
    unique = []
    for entry in entries:
        key = extract_key(entry)
        norm_key = re.sub(r'[\s\-_(),.;:]+', '', key)
        if norm_key and norm_key not in seen_keys:
            seen_keys[norm_key] = True
            unique.append(entry)
    return unique

# =====================================================================
# PROGRESS TRACKER
# =====================================================================
class ProgressTracker:
    def __init__(self):
        self.times = []

    def record(self, elapsed):
        self.times.append(elapsed)

    def eta(self, remaining_chunks):
        if not self.times:
            return "calculating..."
        avg = sum(self.times[-20:]) / len(self.times[-20:])
        secs = avg * remaining_chunks
        if secs < 60:
            return f"{secs:.0f}s"
        elif secs < 3600:
            return f"{secs/60:.1f}min"
        else:
            return f"{secs/3600:.1f}h"

# =====================================================================
# PDF PROCESSING (All Layers Active)
# =====================================================================
def process_pdf(pdf_path, checkpoint, tracker):
    """Reads PDF, smart-chunks, pre-filters, and extracts via LLM."""
    file_hash = get_file_hash(pdf_path)
    basename = os.path.basename(pdf_path)

    if file_hash in checkpoint.get("partial_results", {}):
        cached = checkpoint["partial_results"][file_hash]
        cprint(f"  -> [CACHE] {basename} ({len(cached['glossary'])}d, {len(cached['formulas'])}f)", "dim")
        return cached["glossary"], cached["formulas"]

    cprint(f"  -> Reading {basename}...", "bold")
    full_text = ""

    try:
        reader = PdfReader(pdf_path)
        for i, page in enumerate(reader.pages):
            if i >= MAX_PAGES_TO_READ:
                break
            content = page.extract_text()
            if content:
                full_text += content + "\n"

        if not full_text.strip():
            cprint("     [Warning] No text extracted (scanned PDF?).", "yellow")
            return [], []

        # Smart paragraph-aware chunking
        chunks = list(chunk_text_smart(full_text))
        relevant_chunks = [(i, c) for i, c in enumerate(chunks) if is_chunk_relevant(c)]
        skipped = len(chunks) - len(relevant_chunks)

        cprint(f"     [+] {len(chunks)} chunks -> {len(relevant_chunks)} relevant (skipped {skipped})")
        cprint(f"     [+] Efficiency: {len(relevant_chunks)/max(len(chunks),1)*100:.0f}% sent to LLM")

        # Choose async or sync processing
        if ASYNC_AVAILABLE and len(relevant_chunks) > 3:
            cprint(f"     [+] Using ASYNC mode (concurrency={CONCURRENT_REQUESTS})", "cyan")
            all_glossary, all_formulas = asyncio.run(
                process_chunks_async(relevant_chunks, checkpoint, file_hash, tracker)
            )
        else:
            # Sync fallback with rich progress
            all_glossary, all_formulas = [], []

            if RICH_AVAILABLE:
                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    BarColumn(),
                    TextColumn("{task.completed}/{task.total}"),
                    TimeElapsedColumn(),
                    TimeRemainingColumn(),
                    console=console,
                ) as progress:
                    task = progress.add_task(f"Extracting {basename[:30]}...", total=len(relevant_chunks))

                    for idx, (chunk_num, chunk) in enumerate(relevant_chunks):
                        chunk_start = time.time()
                        g, f = extract_chunk_sync(chunk)
                        all_glossary.extend(g)
                        all_formulas.extend(f)
                        elapsed = time.time() - chunk_start
                        tracker.record(elapsed)
                        progress.advance(task)
                        time.sleep(1.0)

                        if (idx + 1) % 5 == 0:
                            checkpoint["partial_results"][file_hash] = {
                                "glossary": all_glossary, "formulas": all_formulas
                            }
                            save_checkpoint(checkpoint)
            else:
                for idx, (chunk_num, chunk) in enumerate(relevant_chunks):
                    chunk_start = time.time()
                    remaining = len(relevant_chunks) - idx
                    eta_str = tracker.eta(remaining)
                    print(f"       - #{idx+1}/{len(relevant_chunks)} [ETA: {eta_str}]...", end="", flush=True)

                    g, f = extract_chunk_sync(chunk)
                    all_glossary.extend(g)
                    all_formulas.extend(f)

                    elapsed = time.time() - chunk_start
                    tracker.record(elapsed)
                    print(f" {len(g)}d/{len(f)}f ({elapsed:.1f}s)")
                    time.sleep(1.0)

                    if (idx + 1) % 5 == 0:
                        checkpoint["partial_results"][file_hash] = {
                            "glossary": all_glossary, "formulas": all_formulas
                        }
                        save_checkpoint(checkpoint)

        # Cache final results
        checkpoint["partial_results"][file_hash] = {
            "glossary": all_glossary,
            "formulas": all_formulas
        }
        save_checkpoint(checkpoint)

        cprint(f"     [DONE] {basename}: {len(all_glossary)} definitions, {len(all_formulas)} formulas", "green")
        return all_glossary, all_formulas

    except Exception as e:
        cprint(f"    [!] Error processing PDF: {e}", "red")
        return [], []

# =====================================================================
# [6] INCREMENTAL NOTEBOOK GENERATION (with Deduplication)
# =====================================================================
def normalize_name(filename):
    name = os.path.splitext(filename)[0]
    name = re.sub(r'[\s-]*20\d{2}', '', name).strip()
    return name

def create_unified_notebook(base_name, file_groups, output_dir, checkpoint, tracker):
    """Incremental notebook writes with fuzzy deduplication."""
    out_path = os.path.join(output_dir, f"{base_name}_LLM_Summary.ipynb")

    # Initialize or load existing notebook for crash recovery
    if os.path.exists(out_path):
        try:
            with open(out_path, 'r', encoding='utf-8') as f:
                nb = nbf.read(f, as_version=4)
        except Exception:
            nb = nbf.v4.new_notebook()
    else:
        nb = nbf.v4.new_notebook()

    versions = [os.path.basename(f) for f in file_groups]
    nb.cells = [nbf.v4.new_markdown_cell(
        f"# Unified Summary: {base_name}\n\n"
        f"**Processed Versions**: {', '.join(versions)}\n\n"
        f"*Generated by Hybrid Extractor v3 — 8-layer pipeline*"
    )]

    raw_glossary, raw_formulas = [], []

    for file_path in file_groups:
        version_name = os.path.basename(file_path)
        g, f = process_pdf(file_path, checkpoint, tracker)

        raw_glossary.extend([f"- [{version_name}] {item}" for item in g if item])
        raw_formulas.extend([f"- [{version_name}] {item}" for item in f if item])

        # Incremental save after each file
        final_g = deduplicate_entries(raw_glossary)
        final_f = deduplicate_entries(raw_formulas)

        # Rebuild cells
        cells = [nb.cells[0]]  # Keep header
        if final_g:
            cells.append(nbf.v4.new_markdown_cell("## 📖 Glossary\n\n" + "\n".join(final_g)))
        else:
            cells.append(nbf.v4.new_markdown_cell("## 📖 Glossary\n*(No definitions extracted)*"))

        if final_f:
            cells.append(nbf.v4.new_markdown_cell("## 🧮 Formulas\n\n" + "\n".join(final_f)))
        else:
            cells.append(nbf.v4.new_markdown_cell("## 🧮 Formulas\n*(No formulas extracted)*"))

        nb.cells = cells
        with open(out_path, 'w', encoding='utf-8') as file:
            nbf.write(nb, file)

    # Final dedup stats
    final_g = deduplicate_entries(raw_glossary)
    final_f = deduplicate_entries(raw_formulas)
    cprint(f"     [DEDUP] Glossary: {len(raw_glossary)}->{len(final_g)} | Formulas: {len(raw_formulas)}->{len(final_f)}", "cyan")
    cprint(f"  [SUCCESS] {out_path}", "bold green")

# =====================================================================
# MAIN
# =====================================================================
def main():
    checkpoint = load_checkpoint()
    tracker = ProgressTracker()

    header = f"""
╔══════════════════════════════════════════════════════════════╗
║  Hybrid Deep Extractor v3 — {OLLAMA_MODEL:<20}            ║
║  Chunk: {WORDS_PER_CHUNK}w | Tokens: 400 | Concurrency: {CONCURRENT_REQUESTS}          ║
║  Layers: ChapterSkip + Regex + MathDensity + Semantic       ║
║          + JSON Mode + Blacklist + SelfAudit + Dedup        ║
║  Features: Async | SmartChunk | LaTeX Valid | Incremental   ║
╚══════════════════════════════════════════════════════════════╝"""

    if RICH_AVAILABLE:
        console.print(Panel(header.strip(), title="[bold cyan]Extraction Engine[/bold cyan]", border_style="cyan"))
    else:
        print(header)

    cprint(f"  Semantic Filter: {'✓ Available' if SEMANTIC_AVAILABLE else '✗ Disabled (install sentence-transformers)'}")
    cprint(f"  Async Mode:      {'✓ Available' if ASYNC_AVAILABLE else '✗ Disabled (install aiohttp)'}")
    cprint(f"  Rich Display:    {'✓ Available' if RICH_AVAILABLE else '✗ Disabled (install rich)'}")
    print()

    for subdir in SUBDIRS:
        dir_path = os.path.join(ROOT_DIR, subdir)
        if not os.path.exists(dir_path):
            continue

        cprint(f"\n{'='*60}", "bold")
        cprint(f"Scanning: {subdir}", "bold")
        cprint(f"{'='*60}", "bold")

        groups = defaultdict(list)
        files = [f for f in os.listdir(dir_path) if f.lower().endswith(".pdf")]

        for f in files:
            base = normalize_name(f)
            groups[base].append(os.path.join(dir_path, f))

        for base_name, file_paths in groups.items():
            if base_name in checkpoint.get("completed_files", []):
                cprint(f"  [SKIP] {base_name}", "dim")
                continue

            create_unified_notebook(base_name, file_paths, dir_path, checkpoint, tracker)

            checkpoint["completed_files"].append(base_name)
            save_checkpoint(checkpoint)

    cprint(f"\n{'='*60}", "bold green")
    cprint("ALL DONE! All notebooks saved.", "bold green")
    cprint(f"{'='*60}", "bold green")

    if os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)
        cprint("Checkpoint file cleaned up.", "dim")

if __name__ == "__main__":
    main()
