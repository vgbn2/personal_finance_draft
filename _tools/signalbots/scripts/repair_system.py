
import os
import sys
import time
import socket
import logging
import subprocess
from pathlib import Path

# Try to import rich for beautiful output
try:
    from rich.console import Console
    from rich.logging import RichHandler
    console = Console()
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    class Console:
        def print(self, msg, style=None):
            # Strip tags roughly or just print
            print(msg.replace("[green]", "").replace("[/green]", "")
                  .replace("[red]", "").replace("[/red]", "")
                  .replace("[bold]", "").replace("[/bold]", "")
                  .replace("[yellow]", "").replace("[/yellow]", ""))
    console = Console()

# Configure Logging
if RICH_AVAILABLE:
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(console=console, markup=True)]
    )
else:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

log = logging.getLogger("repair_system")

# ══════════════════════════════════════════════════════════════
# Configuration
# ══════════════════════════════════════════════════════════════
ROOT_DIR = Path(__file__).parent.parent
REQUIRED_DIRS = ["logs", "models", "data", "ai/data/raw"]
DB_HOST = "localhost"
DB_PORT = 5432
ONNX_MODEL_PATH = "models/trade_scorer.onnx"
REQUIRED_MODULES = ["psycopg2", "torch", "onnxruntime", "zmq"]

def check_directories():
    console.print("\n[bold]1. Checking Directory Integrity...[/bold]")
    for d in REQUIRED_DIRS:
        path = ROOT_DIR / d
        if not path.exists():
            console.print(f"[yellow]  Folder missing: {d} — creating...[/yellow]")
            path.mkdir(parents=True, exist_ok=True)
            console.print(f"[green]  ✅ Created {d}[/green]")
        else:
            console.print(f"  ✅ {d} exists")

def check_database():
    console.print("\n[bold]2. Checking Database (TimescaleDB)...[/bold]")
    
    # 2a. Check Port
    if _is_port_open(DB_HOST, DB_PORT):
        console.print(f"[green]  ✅ Port {DB_PORT} is open (Database Ready)[/green]")
        return

    console.print(f"[red]  ❌ Port {DB_PORT} is closed![/red]")
    console.print("  Attempting to rescue via Docker...")

    # 2b. Docker Check
    try:
        # Check if container exists (running or stopped)
        res = subprocess.run(["docker", "ps", "-a", "--filter", "name=sentinel_db", "--format", "{{.Names}}"], 
                             capture_output=True, text=True, shell=True)
        
        if "sentinel_db" in res.stdout.strip():
            console.print("  Found stopped container 'sentinel_db'. Starting...")
            subprocess.run(["docker", "start", "sentinel_db"], check=True)
            _wait_for_db()
        else:
            console.print("[yellow]  ⚠️ No 'sentinel_db' container found.[/yellow]")
            console.print("[bold]  Run this command to create it:[/bold]")
            cmd = (
                "docker run -d --name sentinel_db -p 5432:5432 "
                "-e POSTGRES_PASSWORD=postgres "
                "timescale/timescaledb:latest-pg14"
            )
            console.print(f"\n  [cyan]{cmd}[/cyan]\n")
            
    except Exception as e:
        console.print(f"[red]  Docker interaction failed: {e}[/red]")
        console.print("  Ensure Docker Desktop is running.")

def _is_port_open(host, port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex((host, port)) == 0

def _wait_for_db(max_retries=5):
    console.print("  Waiting for DB to accept connections...")
    for i in range(max_retries):
        if _is_port_open(DB_HOST, DB_PORT):
            console.print(f"[green]  ✅ Database connected![/green]")
            return
        
        delay = 2**i
        console.print(f"  ... retry {i+1}/{max_retries} in {delay}s")
        time.sleep(delay)
    
    console.print(f"[red]  ❌ Database still unreachable.[/red]")

def check_ai_model():
    console.print("\n[bold]3. Checking AI Model...[/bold]")
    model_path = ROOT_DIR / ONNX_MODEL_PATH
    
    if model_path.exists():
        console.print(f"[green]  ✅ Model found at {ONNX_MODEL_PATH}[/green]")
        return

    console.print(f"[yellow]  ⚠️ Model missing at {ONNX_MODEL_PATH}[/yellow]")
    console.print("  Auto-generating Dummy Scorer...")
    
    try:
        import torch
        import torch.nn as nn
        import torch.onnx

        class DummyModel(nn.Module):
            def forward(self, x):
                batch_size = x.size(0)
                return torch.full((batch_size, 1), 0.5)

        model = DummyModel()
        dummy_input = torch.randn(1, 50, 4)
        
        model_path.parent.mkdir(parents=True, exist_ok=True)
        torch.onnx.export(
            model,
            dummy_input,
            str(model_path),
            input_names=["features"],
            output_names=["confidence"],
            dynamic_axes={"features": {0: "batch"}, "confidence": {0: "batch"}}
        )
        console.print(f"[green]  ✅ Created dummy ONNX model at {ONNX_MODEL_PATH}[/green]")
        
    except ImportError:
        console.print("[red]  ❌ Missing 'torch' — cannot generate model![/red]")
        console.print("  Run: pip install torch")
    except Exception as e:
        console.print(f"[red]  ❌ Generation failed: {e}[/red]")

def check_dependencies():
    console.print("\n[bold]4. Checking Python Dependencies...[/bold]")
    import importlib
    missing = []
    
    for mod in REQUIRED_MODULES:
        try:
            importlib.import_module(mod)
            console.print(f"  ✅ {mod} installed")
        except ImportError:
            console.print(f"[red]  ❌ Missing: {mod}[/red]")
            missing.append(mod)
            
    if missing:
        console.print("\n[yellow]  Attempting auto-install...[/yellow]")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install"] + missing)
            console.print("[green]  ✅ Installed missing packages[/green]")
        except:
            console.print("[red]  ❌ Auto-install failed. Please run pip install manually.[/red]")

if __name__ == "__main__":
    console.print("[bold cyan]========================================[/bold cyan]")
    console.print("[bold cyan]   Sentinel-MT5  System Repair Tool     [/bold cyan]")
    console.print("[bold cyan]========================================[/bold cyan]")
    
    check_directories()
    check_database()
    check_ai_model()
    check_dependencies()
    
    console.print("\n[bold green]System Check Complete using 'repair_system.py' [/bold green]")
