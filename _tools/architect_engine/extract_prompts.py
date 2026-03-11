"""
Prompt & Conversation Extractor
================================
Scans Antigravity brain directories to extract all available
conversation metadata, artifact summaries, task items, and goals.

Outputs: architect_engine/data/all_conversations.json

Usage:
    python extract_prompts.py
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────
BRAIN_DIR = Path(os.path.expanduser("~")) / ".gemini" / "antigravity" / "brain"
OUTPUT_PATH = Path(__file__).parent / "data" / "all_conversations.json"


def parse_metadata(meta_path: Path) -> dict:
    """Read an artifact metadata JSON file."""
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def parse_task_md(task_path: Path) -> list:
    """Extract task items from a task.md file."""
    items = []
    try:
        text = task_path.read_text(encoding="utf-8", errors="replace")
        # Match checkbox items: - [x], - [ ], - [/]
        for m in re.finditer(r"- \[([ x/!])\] (.+?)(?:\s*<!--.*?-->)?$", text, re.MULTILINE):
            status_char = m.group(1)
            status = {"x": "done", " ": "todo", "/": "in_progress", "!": "blocked"}.get(status_char, "unknown")
            items.append({"status": status, "text": m.group(2).strip()})
    except Exception:
        pass
    return items


def parse_impl_plan(plan_path: Path) -> dict:
    """Extract goal and key sections from implementation_plan.md."""
    result = {"goal": "", "sections": []}
    try:
        text = plan_path.read_text(encoding="utf-8", errors="replace")
        # Get first heading as goal
        h1 = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        if h1:
            result["goal"] = h1.group(1).strip()
        # Get all ## headings as sections
        for h2 in re.finditer(r"^##\s+(.+)$", text, re.MULTILINE):
            result["sections"].append(h2.group(1).strip())
    except Exception:
        pass
    return result


def parse_walkthrough(walk_path: Path) -> str:
    """Extract summary from walkthrough.md."""
    try:
        text = walk_path.read_text(encoding="utf-8", errors="replace")
        # First paragraph after the title
        lines = [l.strip() for l in text.split("\n") if l.strip() and not l.startswith("#")]
        return " ".join(lines[:3])  # First 3 non-empty, non-heading lines
    except Exception:
        return ""


def extract_conversation(conv_dir: Path) -> dict:
    """Extract all available data from a single conversation directory."""
    conv_id = conv_dir.name
    if conv_id == "tempmediaStorage":
        return None

    record = {
        "id": conv_id,
        "created": None,
        "artifacts": [],
        "tasks": [],
        "plan": None,
        "walkthrough_summary": "",
    }

    # Scan all files in the conversation directory
    earliest_date = None

    for f in conv_dir.iterdir():
        if f.name.endswith(".metadata.json"):
            meta = parse_metadata(f)
            artifact_name = f.name.replace(".metadata.json", "")
            artifact_type = meta.get("artifactType", "unknown")
            summary = meta.get("summary", "")
            updated = meta.get("updatedAt", "")

            # Track earliest date
            if updated:
                try:
                    dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                    if earliest_date is None or dt < earliest_date:
                        earliest_date = dt
                except Exception:
                    pass

            record["artifacts"].append({
                "name": artifact_name,
                "type": artifact_type,
                "summary": summary,
                "updated": updated,
            })

    # Parse task.md
    task_path = conv_dir / "task.md"
    if task_path.exists():
        record["tasks"] = parse_task_md(task_path)

    # Parse implementation_plan.md
    plan_path = conv_dir / "implementation_plan.md"
    if plan_path.exists():
        record["plan"] = parse_impl_plan(plan_path)

    # Parse walkthrough.md
    walk_path = conv_dir / "walkthrough.md"
    if walk_path.exists():
        record["walkthrough_summary"] = parse_walkthrough(walk_path)

    # Use filesystem creation time as fallback
    if earliest_date:
        record["created"] = earliest_date.strftime("%Y-%m-%d %H:%M")
    else:
        try:
            ct = os.path.getctime(str(conv_dir))
            record["created"] = datetime.fromtimestamp(ct).strftime("%Y-%m-%d %H:%M")
        except Exception:
            record["created"] = "unknown"

    # Skip empty conversations
    if not record["artifacts"] and not record["tasks"]:
        return None

    return record


def main():
    print(f"🔍 Scanning: {BRAIN_DIR}")

    if not BRAIN_DIR.exists():
        print(f"❌ Brain directory not found: {BRAIN_DIR}")
        return

    conversations = []
    skipped = 0

    for entry in sorted(BRAIN_DIR.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name == "tempmediaStorage":
            skipped += 1
            continue

        record = extract_conversation(entry)
        if record:
            conversations.append(record)
        else:
            skipped += 1

    # Sort by date
    conversations.sort(key=lambda c: c.get("created") or "z")

    # Compute stats
    total_tasks = sum(len(c["tasks"]) for c in conversations)
    completed_tasks = sum(1 for c in conversations for t in c["tasks"] if t["status"] == "done")
    total_artifacts = sum(len(c["artifacts"]) for c in conversations)

    output = {
        "extracted_at": datetime.now().isoformat(),
        "stats": {
            "total_conversations": len(conversations),
            "skipped": skipped,
            "total_task_items": total_tasks,
            "completed_task_items": completed_tasks,
            "completion_rate": f"{completed_tasks / total_tasks * 100:.1f}%" if total_tasks > 0 else "0%",
            "total_artifacts": total_artifacts,
        },
        "conversations": conversations,
    }

    # Write output
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Extracted {len(conversations)} conversations")
    print(f"   📋 {total_tasks} task items ({completed_tasks} done)")
    print(f"   📦 {total_artifacts} artifacts")
    print(f"   💾 Saved to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
