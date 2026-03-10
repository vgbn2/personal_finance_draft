import sys
from macro_pipeline import MacroDataPipeline, RegionConfig

def get_config():
    return RegionConfig(
        region_name="Canada",
        currency_pair="USD/CAD",
        currency_role="foreign",
        local_currency="CAD",
        target_hours_utc=[12, 13, 14],
        output_filename="ca_file",
        indicators={
            "Canada CPI YoY": {"code": "CANCPIALLMINMEI", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Canada Core CPI YoY": {"code": "CANCPICORMINMEI", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Canada PPI YoY": {"code": "PITGCG01CAM156N", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Canada GDP YoY": {"code": "CANGDPNQDSMEI", "transform": "yoy_index", "impact": "direct", "scale": 15.0, "periods": 4},
            "Canada Wage Growth YoY": {"code": "LCIWTTTTCAM156S", "transform": "yoy_index", "impact": "direct", "scale": 20.0, "periods": 4},
            "Canada Unemployment": {"code": "LRHUTTTTCAM156S", "transform": "rate", "impact": "inverse", "scale": 20.0},
            "Canada Interest Rate": {"code": "IRSTCB01CAM156N", "transform": "rate", "impact": "direct", "scale": 40.0},
            "Canada 10Y Bond Yield": {"code": "IRLTLT01CAM156N", "transform": "rate", "impact": "direct", "scale": 20.0},
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