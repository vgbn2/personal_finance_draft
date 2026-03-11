"""
Simple Global Runner - One-Time Data Fetch

A simplified version that fetches data once for all regions.
Use this if you want a quick data snapshot without continuous monitoring.

Usage:
    python simple_runner.py
"""
import sys
import os
from pathlib import Path

# Add paths
project_root = Path(__file__).parent.parent / 'quant_terminal' / 'backend' / 'app'
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(Path(__file__).parent))

from services.macro.engine import MacroDataPipeline, RegionConfig
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Import region configs
from us_data import get_config as get_us_config
from eu_data import get_config as get_eu_config  
from jp_data import get_config as get_jp_config

def simple_fetch(config: RegionConfig):
    """Fetch data for one region synchronously."""
    print(f"Fetching {config.region_name}...", end=" ")
    try:
        pipeline = MacroDataPipeline(config=config, api_key=os.getenv('FRED_API_KEY'))
        # Note: fetch_current_data is async, so we need to handle that
        import asyncio
        data = asyncio.run(pipeline.fetch_current_data())
        print(f"✓ ({len(data)} indicators)")
        return data
    except Exception as e:
        print(f"✗ Error: {e}")
        return {}

if __name__ == "__main__":
    print("="*60)
    print("SIMPLE MACRO DATA RUNNER")
    print("="*60)
    
    configs = [
        get_us_config(),
        get_eu_config(),
        get_jp_config(),
    ]
    
    results = {}
    for config in configs:
        results[config.region_name] = simple_fetch(config)
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    for region, data in results.items():
        print(f"{region:15} → {len(data):2} indicators")
    print("="*60)
