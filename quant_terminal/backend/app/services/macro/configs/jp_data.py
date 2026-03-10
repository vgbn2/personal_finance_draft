import sys
from macro_pipeline import MacroDataPipeline, RegionConfig

def get_config():
    return RegionConfig(
        region_name="Japan",
        currency_pair="USD/JPY",
        currency_role="foreign",
        local_currency="JPY",
        target_hours_utc=[23, 0, 1, 2, 3], # Tokyo Session
        output_filename="japan_file",
        indicators={
            "Japan Real GDP YoY": {"code": "JPNRGDPEXP", "transform": "yoy_index", "impact": "direct", "scale": 15.0, "periods": 4},
            "Japan CPI YoY": {"code": "JPNCPIALLMINMEI", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Japan Core CPI YoY": {"code": "JPNCPICOREMINMEI", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Japan PPI YoY": {"code": "PITGCG01JPM156N", "transform": "yoy_index", "impact": "direct", "scale": 15.0},
            "Japan Wage Growth YoY": {"code": "LCITTTTTJPM156S", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Japan Unemployment Rate": {"code": "LRHUTTTTJPM156S", "transform": "rate", "impact": "inverse", "scale": 20.0},
            "Japan BOJ Policy Rate": {"code": "IRSTCB01JPM156N", "transform": "rate", "impact": "direct", "scale": 40.0},
            "Japan 10Y Bond Yield": {"code": "IRLTLT01JPM156N", "transform": "rate", "impact": "direct", "scale": 20.0},
            "Japan Industrial Production": {"code": "JPNPROINDMISMEI", "transform": "yoy_index", "impact": "direct", "scale": 10.0},
            "Japan Retail Sales YoY": {"code": "SLRTTO01JPM156S", "transform": "yoy_index", "impact": "direct", "scale": 10.0},
            "Japan Exports YoY": {"code": "XTEXVA01JPM667S", "transform": "yoy_index", "impact": "direct", "scale": 10.0},
            "Japan Tankan Large Mfg Index": {"code": "JPNBSCICP02", "transform": "rate", "impact": "direct", "scale": 5.0},
            "Japan Consumer Confidence": {"code": "CSCICP03JPM665S", "transform": "rate", "impact": "direct", "scale": 5.0},
        }
    )

def main():
    config = get_config()
    pipeline = MacroDataPipeline(config)
    pipeline.run_fred_extraction()
    pipeline.export()
    pipeline.run_continuously()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
