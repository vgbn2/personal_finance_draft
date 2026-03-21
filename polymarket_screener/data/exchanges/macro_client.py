import os
import requests
import pandas as pd
from typing import Optional, Dict

class MacroClient:
    """
    Client for fetching Macroeconomic indicators (like Interest Rates, CPI, Treasury Yields).
    Using Federal Reserve Economic Data (FRED) API as standard.
    """
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("FRED_API_KEY")
        self.base_url = "https://api.stlouisfed.org/fred/series/observations"

    def fetch_indicator(self, series_id: str = "DFF", limit: int = 30) -> pd.DataFrame:
        """
        Fetches an economic indicator.
        Example series_ids: 
        - 'DFF' (Federal Funds Effective Rate)
        - 'DGS10' (10-Year Treasury Constant Maturity Rate)
        - 'CPIAUCSL' (Consumer Price Index)
        """
        if not self.api_key:
            print("Warning: FRED_API_KEY not set. Cannot fetch Macro data. Returning empty.")
            return pd.DataFrame()

        params = {
            "series_id": series_id,
            "api_key": self.api_key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": limit
        }
        
        try:
            response = requests.get(self.base_url, params=params)
            response.raise_for_status()
            data = response.json().get('observations', [])
            
            df = pd.DataFrame(data)
            if df.empty:
                return df
                
            df['date'] = pd.to_datetime(df['date'])
            df['value'] = pd.to_numeric(df['value'], errors='coerce')
            # Sort chronologically
            df = df.sort_values('date').reset_index(drop=True)
            return df[['date', 'value']]
            
        except Exception as e:
            print(f"Error fetching Macro data for {series_id}: {e}")
            return pd.DataFrame()

if __name__ == "__main__":
    client = MacroClient(api_key="DEMO_KEY") # Not a real key, just testing structure
    print("Testing Macro Data fetch (requires real API key to succeed)...")
    # print(client.fetch_indicator("DFF", limit=5)) 
