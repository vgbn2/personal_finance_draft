"""
Quick verification script to ensure demo_notebook can run.
Run this first to check your environment.
"""
import sys
from pathlib import Path

print("=" * 60)
print("DEMO NOTEBOOK PRE-FLIGHT CHECK")
print("=" * 60)

# Check 1: Python Version
print(f"\nOK Python Version: {sys.version}")
if sys.version_info < (3, 10):
    print("WARNING: Python 3.10+ recommended")

# Check 2: Required Modules
required = {
    'pandas': 'Data analysis',
    'rich': 'Terminal formatting',
    'aiohttp': 'Async HTTP client',
    'dotenv': 'Environment variables',
}

missing = []
for module, desc in required.items():
    try:
        __import__(module if module != 'dotenv' else 'dotenv')
        print(f"OK {module:15} - {desc}")
    except ImportError:
        print(f"XX {module:15} - {desc} (MISSING)")
        missing.append(module)

# Check 3: Refactored Modules
macroe_path = Path(__file__).parent
sys.path.insert(0, str(macroe_path))

try:
    from currency_strength_meter_refactored import CurrencyStrengthMeter
    print(f"\nOK currency_strength_meter_refactored.py found")
except ImportError as e:
    print(f"\nXX currency_strength_meter_refactored.py NOT FOUND")
    print(f"   Error: {e}")

try:
    from polymarket_client import PolymarketClient
    print(f"OK polymarket_client.py found")
except ImportError as e:
    print(f"XX polymarket_client.py NOT FOUND")
    print(f"   Error: {e}")

# Check 4: Data Files
csv_files = [
    'us_economic_data.csv',
    'eu_file.csv',
    'japan_file.csv',
]

available_data = sum(1 for f in csv_files if (macroe_path / f).exists())
print(f"\nOK CSV Data Files: {available_data}/{len(csv_files)} found")
if available_data == 0:
    print("  INFO: Run global_runner.py to generate data")

# Check 5: Credentials
env_file = macroe_path / '.env'
if env_file.exists():
    print(f"OK .env file exists (Polymarket demo will work)")
else:
    print(f"INFO: No .env file (Polymarket cells will be skipped)")

# Summary
print("\n" + "=" * 60)
if missing:
    print(f"WARNING: Install missing: pip install {' '.join(missing)}")
else:
    print("SUCCESS: ALL CHECKS PASSED - Notebook ready to run!")
print("=" * 60)
