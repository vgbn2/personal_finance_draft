import sys
import sys
from engine_local import MacroDataPipeline, RegionConfig

def get_config():
    return RegionConfig(
        region_name="Euro Area",
        currency_pair="EUR/USD",
        currency_role="foreign",
        local_currency="EUR",
        target_hours_utc=[7, 8, 9, 10], # London Session
        output_filename="eu_file",
        indicators={
            "Euro Area HICP YoY": {"code": "CP0000EZ19M086NEST", "transform": "yoy_index", "impact": "direct", "scale": 30.0},
            "Euro Area Core HICP YoY": {"code": "CPHPTT01EZ19M086NEST", "transform": "yoy_index", "impact": "direct", "scale": 30.0},
            "Euro Area PPI YoY": {"code": "PITGCG01EZ19M086NEST", "transform": "yoy_index", "impact": "direct", "scale": 20.0},
            "Euro Area Unemployment": {"code": "LRHUTTTTEZ19M156S", "transform": "rate", "impact": "inverse", "scale": 20.0},
            "Euro Area Wage Growth YoY": {"code": "LCIWTTTTEZ19S", "transform": "yoy_index", "impact": "direct", "scale": 20.0, "periods": 4},
            "Euro Area GDP YoY": {"code": "CLVMNACSCAB1GQEA19", "transform": "yoy_index", "impact": "direct", "scale": 20.0, "periods": 4},
            "ECB Deposit Facility Rate": {"code": "ECBDFR", "transform": "rate", "impact": "direct", "scale": 40.0},
            "Euro Area 10Y Yield": {"code": "IRLTLT01EZM156N", "transform": "rate", "impact": "direct", "scale": 20.0},
            "Industrial Production YoY": {"code": "PRMNTO01EZ19M086NEST", "transform": "yoy_index", "impact": "direct", "scale": 10.0},
            "Retail Trade Volume YoY": {"code": "SLRTTO01EZ19M086NEST", "transform": "yoy_index", "impact": "direct", "scale": 10.0},
            "Economic Sentiment": {"code": "BSCICP03EZM665S", "transform": "rate", "impact": "direct", "scale": 5.0},
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
