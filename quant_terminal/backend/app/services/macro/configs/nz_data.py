import sys
from macro_pipeline import MacroDataPipeline, RegionConfig

def get_config():
    return RegionConfig(
        region_name="New Zealand",
        currency_pair="NZD/USD",
        currency_role="foreign",
        local_currency="NZD",
        target_hours_utc=[21, 22, 23],
        output_filename="nz_file",
        indicators={
            "New Zealand CPI YoY": {"code": "NZLCPIALLMINMEI", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "New Zealand PPI YoY": {"code": "PITGCG01NZM156N", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "New Zealand GDP YoY": {"code": "NZLGDPNQDSMEI", "transform": "yoy_index", "impact": "direct", "scale": 15.0, "periods": 4},
            "New Zealand Wage Growth YoY": {"code": "LCIWTTTTNZQ661S", "transform": "yoy_index", "impact": "direct", "scale": 20.0, "periods": 4},
            "New Zealand Unemployment": {"code": "LRHUTTTTNZM156S", "transform": "rate", "impact": "inverse", "scale": 20.0},
            "New Zealand Interest Rate": {"code": "IRSTCB01NZM156N", "transform": "rate", "impact": "direct", "scale": 40.0},
            "New Zealand 10Y Bond Yield": {"code": "IRLTLT01NZM156N", "transform": "rate", "impact": "direct", "scale": 20.0},
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