"""
Database definitions for Macro-Economic Platform.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, create_engine, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime
import os

Base = declarative_base()

class Country(Base):
    __tablename__ = "countries"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)  # e.g., 'US', 'CN'
    name = Column(String)
    
class Indicator(Base):
    __tablename__ = "indicators"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)  # e.g., 'GDP', 'CPI'
    name = Column(String)
    frequency = Column(String) # 'M', 'Q', 'D'
    source = Column(String) # 'FRED', 'WB'

class Observation(Base):
    __tablename__ = "observations"
    id = Column(Integer, primary_key=True, index=True)
    country_id = Column(Integer, ForeignKey("countries.id"))
    indicator_id = Column(Integer, ForeignKey("indicators.id"))
    date = Column(DateTime, index=True)
    value = Column(Float)
    
    # Computed fields
    z_score_60m = Column(Float, nullable=True) # Z-Score relative to 60-month window
    
    __table_args__ = (UniqueConstraint('country_id', 'indicator_id', 'date', name='_country_indicator_date_uc'),)

class GradingThreshold(Base):
    __tablename__ = "grading_thresholds"
    id = Column(Integer, primary_key=True)
    name = Column(String) # 'Overheated', 'Neutral', 'Recessionary'
    min_z = Column(Float)
    max_z = Column(Float)

class CompositeScore(Base):
    __tablename__ = "composite_scores"
    id = Column(Integer, primary_key=True)
    country_id = Column(Integer, ForeignKey("countries.id"))
    date = Column(DateTime)
    bias_score = Column(Float) # Weighted Sum
    health_grade = Column(String) # A, B, C, D, F
    
    __table_args__ = (UniqueConstraint('country_id', 'date', name='_country_date_score_uc'),)

# Database Connection
# Defaults to SQLite for local dev, can be overridden by DATABASE_URL env var
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./macro_data.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
    
if __name__ == "__main__":
    print("Initializing Database...")
    init_db()
    print("Database Initialized.")
