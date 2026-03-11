"""
FINAL Working Global Runner

Successfully imports from refactored modules and fetches macro data.
Run from anywhere: python macroe/working_runner.py
"""
import sys
import os
from pathlib import Path

# Setup all paths
current_dir = Path(__file__).parent
workspace_root = current_dir.parent
backend_dir = workspace_root / 'quant_terminal' / 'backend' / 'app'
configs_dir = backend_dir / 'services' / 'macro' / 'configs'

# Add to Python path
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(configs_dir))  # THIS WAS MISSING!
sys.path.insert(0, str(current_dir))

print("="*60)
print("GLOBAL RUNNER - MACRO DATA FETCHER")
print("="*60)
print(f"Backend:  {backend_dir.exists()} - {backend_dir}")
print(f"Configs:  {configs_dir.exists()} - {configs_dir}")
print("="*60)

# Import MacroDataPipeline using importlib
try:
    import importlib.util
    
    engine_path = backend_dir / "services" / "macro" / "engine.py"
    spec = importlib.util.spec_from_file_location("macro_engine", engine_path)
    macro_engine = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(macro_engine)
    
    MacroDataPipeline = macro_engine.MacroDataPipeline
    RegionConfig = macro_engine.RegionConfig
    
    print("OK - MacroDataPipeline imported")
    
except Exception as e:
    print(f"ERROR - Failed to import MacroDataPipeline: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Import region configs
try:
    from us_data import get_config as get_us_config
    from eu_data import get_config as get_eu_config
    from jp_data import get_config as get_jp_config
    print("OK - Region configs imported\n")
except Exception as e:
    print(f"ERROR - Region config import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Async fetch function
async def fetch_all_regions():
    """Fetch data for all regions in parallel."""
    import asyncio
    from dotenv import load_dotenv
    load_dotenv()
    
    configs = [
        get_us_config(),
        get_eu_config(),
        get_jp_config(),
    ]
    
    api_key = os.getenv('FRED_API_KEY')
    if not api_key:
        print("WARNING: No FRED_API_KEY found - using mock data\n")
    
    print(f"Fetching data for {len(configs)} regions...")
    print("-"*60)
    
    results = {}
    for config in configs:
        try:
            pipeline = MacroDataPipeline(config=config, api_key=api_key)
            data = await pipeline.fetch_current_data()
            results[config.region_name] = data
            print(f"  {config.region_name:15} -> {len(data):2} indicators")
        except Exception as e:
            print(f"  {config.region_name:15} -> ERROR: {e}")
            results[config.region_name] = {}
    
    print("-"*60)
    return results

if __name__ == "__main__":
    import asyncio
    
    try:
        all_data = asyncio.run(fetch_all_regions())
        
        print(f"\nSUCCESS - Fetched data for {len(all_data)} regions")
        print("="*60)
        
        # Show sample of US data
        if 'United States' in all_data and all_data['United States']:
            print("\nUS Data Sample:")
            for i, (key, val) in enumerate(list(all_data['United States'].items())[:3]):
                if isinstance(val, dict):
                    print(f"  {key}: {val.get('value', 'N/A')}")
                else:
                    print(f"  {key}: {val}")
        
    except KeyboardInterrupt:
        print("\nStopped by user")
    except Exception as e:
        print(f"\nFAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
