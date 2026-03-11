import sys
import sys
from engine_local import MacroDataPipeline, RegionConfig

def get_config():
    return RegionConfig(
        region_name="China",
        currency_pair="USD/CNY",
        currency_role="foreign",
        local_currency="CNY",
        target_hours_utc=[1, 2, 3],
        output_filename="cn_file",
        indicators={
            "China CPI YoY": {"code": "CHNCPIALLMINMEI", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "China PPI YoY": {"code": "CHNPPIALLMINMEI", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "China GDP YoY": {"code": "CHNGDPNQDSMEI", "transform": "yoy_index", "impact": "direct", "scale": 15.0, "periods": 4},
            "China PBOC Policy Rate": {"code": "IRSTCB01CNM156N", "transform": "rate", "impact": "direct", "scale": 40.0},
            "China 10Y Bond Yield": {"code": "INTGSBCNM193N", "transform": "rate", "impact": "direct", "scale": 20.0},
            "China FX Reserves": {"code": "TRESEGCNM052N", "transform": "mom_diff", "impact": "direct", "scale": 10.0},
        }
    )

def main():
    config = get_config()
    pipeline = MacroDataPipeline(config)
    pipeline.run_fred_extraction()
    pipeline.export()
    pipeline.run_continuously()

if __name__ == "__main__":
    main()