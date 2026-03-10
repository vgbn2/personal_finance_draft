import threading
import time
import logging
import sys
from macro_pipeline import MacroDataPipeline, RegionConfig
from us_data import get_config as get_us_config
from eu_data import get_config as get_eu_config
from jp_data import get_config as get_jp_config
from cn_data import get_config as get_cn_config
from ca_data import get_config as get_ca_config
from au_data import get_config as get_au_config
from nz_data import get_config as get_nz_config
from ch_data import get_config as get_ch_config

# Setup logging to stdout
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("GlobalRunner")

def run_pipeline(config: RegionConfig):
    """Instantiates and runs a pipeline for a specific region."""
    try:
        pipeline = MacroDataPipeline(config)
        # Run initial extraction immediately so we have data on startup
        pipeline.run_fred_extraction()
        pipeline.export()
        # Enter continuous loop
        pipeline.run_continuously()
    except Exception as e:
        logger.error(f"Pipeline for {config.region_name} failed: {e}")

def main():
    # 1. Define Configurations for all regions
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

    # 2. Launch Threads
    threads = []
    logger.info(f"Launching {len(configs)} regional pipelines...")
    
    for config in configs:
        t = threading.Thread(target=run_pipeline, args=(config,), name=f"Thread-{config.region_name}")
        t.daemon = True # Allow script to exit if main thread dies (though we keep main alive)
        t.start()
        threads.append(t)
        time.sleep(0.5) # Stagger start slightly

    # 3. Keep Main Thread Alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down global runner...")
        sys.exit(0)

if __name__ == "__main__":
    main()