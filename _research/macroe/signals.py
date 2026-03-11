"""
Signal Generation Logic.
Calculates Bias Scores (Composite Health) from Observations.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import SessionLocal, Observation, CompositeScore, Country, Indicator, init_db
import pandas as pd
import logging

logger = logging.getLogger(__name__)

# --- WEIGHTS ---
# PRD Spec: GDP=0.3, CPI=0.4 (Negative correlation for CPI usually), etc.
WEIGHTS = {
    'GDP': 0.30,
    'HOUSING_STARTS': 0.20,
    'UNEMPLOYMENT': -0.20, # Lower is better
    'CPI': -0.30,          # Lower is better (usually)
}

def calculate_bias_scores(db: Session):
    """
    Aggregates Z-Scores into a single 'Bias Score' per date.
    Formula: Sum(Weight * Z_Score)
    """
    logger.info("Calculating Bias Scores...")
    
    # Get all countries
    countries = db.query(Country).all()
    
    for country in countries:
        # Get latest date with data
        latest_date = db.query(func.max(Observation.date)).filter_by(country_id=country.id).scalar()
        if not latest_date: continue
        
        # We will calculate for the last 12 months for this demo
        start_date = latest_date - pd.DateOffset(months=12)
        
        # Fetch all observations in range
        obs = db.query(Observation).join(Indicator).filter(
            Observation.country_id == country.id,
            Observation.date >= start_date
        ).all()
        
        # Group by Date
        data_by_date = {}
        for o in obs:
            if o.date not in data_by_date: data_by_date[o.date] = []
            indicator_code = db.query(Indicator.code).filter_by(id=o.indicator_id).scalar()
            data_by_date[o.date].append({
                'code': indicator_code,
                'z': o.z_score_60m
            })
            
        # Compute Score
        for date, items in data_by_date.items():
            score = 0.0
            total_weight = 0.0
            
            for item in items:
                w = WEIGHTS.get(item['code'], 0)
                if w != 0:
                    score += item['z'] * w
                    total_weight += abs(w)
            
            if total_weight > 0:
                final_score = score # Raw weighted sum
                
                # Grade
                grade = 'C'
                if final_score > 1.0: grade = 'B'
                if final_score > 2.0: grade = 'A'
                if final_score < -1.0: grade = 'D'
                if final_score < -2.0: grade = 'F'
                
                # Upsert Composite Score
                exists = db.query(CompositeScore).filter_by(country_id=country.id, date=date).first()
                if not exists:
                    cs = CompositeScore(
                        country_id=country.id,
                        date=date,
                        bias_score=final_score,
                        health_grade=grade
                    )
                    db.add(cs)
        
        db.commit()

if __name__ == "__main__":
    db = SessionLocal()
    try:
        calculate_bias_scores(db)
        logger.info("Signal Generation Complete.")
    finally:
        db.close()
