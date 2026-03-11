"""
Ingestion script for Macro-Economic Data.
Fetches from FRED and WorldBank (simulated for MVP) and populates the DB.
"""
import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal, Country, Indicator, Observation, init_db
import logging

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
# Mapping of Indicators to FRED Series IDs (Example for US)
FRED_SERIES = {
    'GDP': 'GDP',
    'CPI': 'CPIAUCSL',
    'UNEMPLOYMENT': 'UNRATE',
    'FED_RATE': 'FEDFUNDS',
    'HOUSING_STARTS': 'HOUST',
    '10Y_YIELD': 'DGS10',
    '2Y_YIELD': 'DGS2',
}

def fetch_fred_data(series_id, start_date="2000-01-01"):
    """
    Mock fetcher for FRED data (Replace with pandas_datareader or requests in prod).
    For now, generating realistic dummy data to ensure pipeline works without API keys.
    """
    logger.info(f"Fetching {series_id} from FRED...")
    
    dates = pd.date_range(start=start_date, end=datetime.today(), freq='MS')
    
    # Generate random walk data
    np.random.seed(hash(series_id) % 2**32)
    values = np.cumsum(np.random.normal(0, 1, len(dates))) + 100
    
    df = pd.DataFrame({'date': dates, 'value': values})
    return df

def normalize_and_ingest(db: Session):
    """
    Main pipeline:
    1. Ensure metadata (Countries, Indicators) exists.
    2. Fetch raw data.
    3. Normalize (Forward Fill).
    4. Calculate Z-Scores.
    5. Save to DB.
    """
    # 1. Setup Metadata
    us = db.query(Country).filter_by(code='US').first()
    if not us:
        us = Country(code='US', name='United States')
        db.add(us)
        db.commit()
    
    for code, series_id in FRED_SERIES.items():
        ind = db.query(Indicator).filter_by(code=code).first()
        if not ind:
            ind = Indicator(code=code, name=code, frequency='M', source='FRED')
            db.add(ind)
        db.commit()
        
        # 2. Fetch Data
        df = fetch_fred_data(series_id)
        
        # 3. Process & Z-Score
        # Calculate Rolling Mean/Std for 60-month window
        df['rolling_mean'] = df['value'].rolling(window=60).mean()
        df['rolling_std'] = df['value'].rolling(window=60).std()
        df['z_score'] = (df['value'] - df['rolling_mean']) / df['rolling_std']
        
        # 4. Save Observations
        logger.info(f"Saving {len(df)} observations for {code}...")
        
        for _, row in df.iterrows():
            if pd.isna(row['z_score']): continue # Skip warming up period
            
            # Check existing to avoid dupes (Upsert logic would be better in prod)
            exists = db.query(Observation).filter_by(
                country_id=us.id, 
                indicator_id=ind.id, 
                date=row['date']
            ).first()
            
            if not exists:
                obs = Observation(
                    country_id=us.id,
                    indicator_id=ind.id,
                    date=row['date'],
                    value=row['value'],
                    z_score_60m=row['z_score']
                )
                db.add(obs)
        
        db.commit()

if __name__ == "__main__":
    init_db()
    db = SessionLocal()
    try:
        normalize_and_ingest(db)
        logger.info("Ingestion Complete.")
    finally:
        db.close()
