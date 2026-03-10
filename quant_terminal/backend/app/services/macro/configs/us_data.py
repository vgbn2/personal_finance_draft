import sys
from macro_pipeline import MacroDataPipeline, RegionConfig

def get_config():
    return RegionConfig(
        region_name="United States",
        currency_pair="USD",
        currency_role="domestic",
        local_currency="USD",
        target_hours_utc=[12, 13, 14, 15], # NY Morning
        output_filename="us_economic_data",
        indicators={
            "GDP Growth QoQ": {"code": "A191RL1Q225SBEA", "transform": "rate", "impact": "direct", "scale": 20.0},
            "CPI YoY": {"code": "CPIAUCSL", "transform": "yoy_index", "impact": "direct", "scale": 30.0},
            "PPI YoY": {"code": "PPIACO", "transform": "yoy_index", "impact": "direct", "scale": 30.0},
            "Core PCE YoY": {"code": "PCEPILFE", "transform": "yoy_index", "impact": "direct", "scale": 30.0},
            "Wage Growth YoY": {"code": "CES0500000003", "transform": "yoy_index", "impact": "direct", "scale": 30.0},
            "Unemployment Rate": {"code": "UNRATE", "transform": "rate", "impact": "inverse", "scale": 20.0},
            "Initial Jobless Claims": {"code": "ICSA", "transform": "rate", "impact": "inverse", "scale": 0.0005},
            "Job Openings (JOLTS)": {"code": "JTSJOL", "transform": "level", "impact": "direct", "scale": 0.05},
            "Nonfarm Payrolls": {"code": "PAYEMS", "transform": "mom_diff", "impact": "direct", "scale": 0.05},
            "Fed Funds Rate": {"code": "FEDFUNDS", "transform": "rate", "impact": "direct", "scale": 40.0},
            "10Y Treasury Yield": {"code": "DGS10", "transform": "rate", "impact": "direct", "scale": 20.0},
            "10Y-2Y Yield Spread": {"code": "T10Y2Y", "transform": "rate", "impact": "direct", "scale": 20.0},
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
