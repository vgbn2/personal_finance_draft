import sys
from macro_pipeline import MacroDataPipeline, RegionConfig

def get_config():
    return RegionConfig(
        region_name="Switzerland",
        currency_pair="USD/CHF",
        currency_role="foreign",
        local_currency="CHF",
        target_hours_utc=[7, 8, 9],
        output_filename="ch_file",
        indicators={
            "Switzerland CPI YoY": {"code": "CHECPIALLMINMEI", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Switzerland PPI YoY": {"code": "PITGCG01CHM156N", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Switzerland GDP YoY": {"code": "CHEGDPNQDSMEI", "transform": "yoy_index", "impact": "direct", "scale": 15.0, "periods": 4},
            "Switzerland Unemployment": {"code": "LRHUTTTTCHM156S", "transform": "rate", "impact": "inverse", "scale": 20.0},
            "Switzerland Interest Rate": {"code": "IRSTCB01CHM156N", "transform": "rate", "impact": "direct", "scale": 40.0},
            "Switzerland 10Y Bond Yield": {"code": "IRLTLT01CHM156N", "transform": "rate", "impact": "direct", "scale": 20.0},
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