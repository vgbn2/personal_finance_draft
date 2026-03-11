import os
import sys
import socket
import importlib.util
import subprocess
from pathlib import Path

def check_dirs():
    print("\n[1] Check Directories...")
    required = ["logs", "models", "data", "snapshots"]
    all_ok = True
    for d in required:
        p = Path(d)
        if p.exists() and p.is_dir():
            print(f"  [OK] {d}/ exists")
        else:
            print(f"  [MISSING] {d}/ MISSING")
            all_ok = False
    return all_ok

def check_db():
    print("\n[2] Check Database (Port 5432)...")
    try:
        sock = socket.create_connection(("localhost", 5432), timeout=2)
        sock.close()
        print("  [OK] Port 5432 Open")
        return True
    except:
        print("  [FAIL] Port 5432 Closed (Is TimescaleDB running?)")
        return False

def check_deps():
    print("\n[3] Check Dependencies...")
    required = ["MetaTrader5", "discord", "pandas", "numpy", "torch", "onnxscript"]
    all_ok = True
    for pkg in required:
        if importlib.util.find_spec(pkg):
            print(f"  [OK] {pkg} installed")
        else:
            print(f"  [MISSING] {pkg} MISSING")
            all_ok = False
    return all_ok

def check_orphans():
    print("\n[4] Check Application State...")
    # Check for sentinel process
    # This is tricky without a PID file, but we can check if python is running sentinel.py
    # For now, just skip port check since ZMQ is gone.
    print("  [INFO] ZMQ Check skipped (Architecture Unified)")
    return True

def main():
    print("   Sentinel-MT5 Health Check   ")
    print("=================================")
    
    d = check_dirs()
    db = check_db()
    dep = check_deps()
    orp = check_orphans()
    
    print("\n=================================")
    if d and db and dep and orp:
        print("[PASS] SYSTEM READY")
        sys.exit(0)
    else:
        print("[FAIL] SYSTEM ISSUES DETECTED")
        sys.exit(1)

if __name__ == "__main__":
    main()
