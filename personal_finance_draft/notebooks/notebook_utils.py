from __future__ import annotations

from pathlib import Path
import json
import subprocess
import sys


def repo_root(start: Path | str | None = None) -> Path:
    path = Path(start or Path.cwd()).resolve()
    if path.name == "notebooks":
        return path.parent
    return path


def install_notebook_path(start: Path | str | None = None) -> Path:
    root = repo_root(start)
    notebooks_dir = root / "notebooks"
    if str(notebooks_dir) not in sys.path:
        sys.path.insert(0, str(notebooks_dir))
    return root


def load_json(path: Path | str, default=None):
    path = Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def load_text(path: Path | str, default: str = "") -> str:
    path = Path(path)
    if not path.exists():
        return default
    return path.read_text(encoding="utf-8")


def run_cli(root: Path | str, args: list[str], timeout: int = 120) -> dict:
    root = Path(root)
    cmd = ["node", str(root / "backend" / "cli" / "sovereign_cli.js"), *args, "--json"]
    proc = subprocess.run(cmd, cwd=root, text=True, capture_output=True, timeout=timeout)
    payload = {}
    if proc.stdout.strip():
        try:
            payload = json.loads(proc.stdout.splitlines()[-1])
        except Exception:
            payload = {"raw_stdout": proc.stdout[-1000:]}
    return {
        "returncode": proc.returncode,
        "payload": payload,
        "stderr": proc.stderr[-1000:],
    }


def print_verdict(title: str, ok: bool, reasons: list[str], next_step: str | None = None) -> None:
    status = "PASS" if ok else "BLOCKED"
    print(f"{status}: {title}")
    for reason in reasons:
        print(f"- {reason}")
    if next_step:
        print(f"- next: {next_step}")
