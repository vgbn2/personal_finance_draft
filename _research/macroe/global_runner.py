"""
Global Runner - Standalone Version

Fetches macroeconomic data for all configured regions using the local standalone engine.
This avoids import path corruption issues by keeping everything within the `macroe` folder.
"""
import asyncio
import sys
import os
import logging
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv

# Import LOCAL engine (bypassing corrupted services.macro path)
from engine_local import MacroDataPipeline, RegionConfig

# Import LOCAL region configurations
from us_data import get_config as get_us_config
from eu_data import get_config as get_eu_config
from jp_data import get_config as get_jp_config
from cn_data import get_config as get_cn_config
from ca_data import get_config as get_ca_config
from au_data import get_config as get_au_config
from nz_data import get_config as get_nz_config
from ch_data import get_config as get_ch_config

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("GlobalRunner")

# Load environment variables
load_dotenv()

async def fetch_region_data(config: RegionConfig, api_key: str = None) -> tuple[str, Dict[str, Any]]:
    """
    Fetch data for a single region asynchronously.
    """
    try:
        pipeline = MacroDataPipeline(config=config, api_key=api_key)
        # Run blocking sync method in a separate thread
        data = await asyncio.to_thread(pipeline.fetch_current_data)
        logger.info(f"OK - Fetched {len(data)} indicators for {config.region_name}")
        return config.region_name, data
    except Exception as e:
        logger.error(f"ERROR - Failed to fetch data for {config.region_name}: {e}")
        return config.region_name, {}

async def fetch_all_regions(configs: List[RegionConfig]) -> Dict[str, Dict[str, Any]]:
    """
    Fetch data for all regions in parallel.
    """
    api_key = os.getenv('FRED_API_KEY')
    
    if not api_key:
        logger.warning("WARNING: FRED_API_KEY not found. Using mock data.")
    
    logger.info(f"LAUNCHING fetchers for {len(configs)} regions...")
    
    # Fetch all regions in parallel
    tasks = [fetch_region_data(config, api_key) for config in configs]
    results = await asyncio.gather(*tasks)
    
    logger.info(f"DONE - Completed fetching data for {len(results)} regions")
    
    return dict(results)

def main():
    """Main entry point."""
    print("="*60)
    print("GLOBAL RUNNER (STANDALONE MODE)")
    print("="*60)
    
    # Define all region configurations
    configs = [
        get_us_config(),
        get_eu_config(),
        get_jp_config(),
        get_ca_config(),
        get_au_config(),
        get_nz_config(),
        get_cn_config(),
        get_ch_config()
    ]
    
    logger.info(f"Configured regions: {', '.join(c.region_name for c in configs)}")
    
    # Run async fetch
    try:
        all_data = asyncio.run(fetch_all_regions(configs))
        
        # Display summary
        print("\n" + "="*60)
        print("MACRO DATA SUMMARY")
        print("="*60)
        for region, data in all_data.items():
            print(f"{region:15} -> {len(data):2} indicators")
        print("="*60)
        
        return all_data
        
    except KeyboardInterrupt:
        logger.info("STOPPING - Shutting down global runner...")
        sys.exit(0)
    except Exception as e:
        logger.error(f"FATAL - Error: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()