import sys
import sys
from engine_local import MacroDataPipeline, RegionConfig

def get_config():
    return RegionConfig(
        region_name="Australia",
        currency_pair="AUD/USD",
        currency_role="foreign",
        local_currency="AUD",
        target_hours_utc=[0, 1, 2],
        output_filename="au_file",
        indicators={
            "Australia CPI YoY": {"code": "AUSCPIALLMINMEI", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Australia PPI YoY": {"code": "PITGCG01AUM156N", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Australia GDP YoY": {"code": "AUSGDPNQDSMEI", "transform": "yoy_index", "impact": "direct", "scale": 15.0, "periods": 4},
            "Australia Wage Growth YoY": {"code": "LCIWTTTTAUQ661S", "transform": "yoy_index", "impact": "direct", "scale": 20.0, "periods": 4},
            "Australia Unemployment": {"code": "LRHUTTTTAUM156S", "transform": "rate", "impact": "inverse", "scale": 20.0},
            "Australia Interest Rate": {"code": "IRSTCB01AUM156N", "transform": "rate", "impact": "direct", "scale": 40.0},
            "Australia 10Y Bond Yield": {"code": "IRLTLT01AUM156N", "transform": "rate", "impact": "direct", "scale": 20.0},
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