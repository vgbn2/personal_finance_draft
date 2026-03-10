
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List, Dict
import logging
import importlib
import os
import sys

# Add services to path so we can import configs dynamically
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from services.macro.engine import MacroDataPipeline

router = APIRouter(
    prefix="/api/macro",
    tags=["macro"]
)

logger = logging.getLogger("MacroRouter")

# Store pipelines in memory
pipelines = {}

def load_pipelines():
    """Dynamically loads all region configs from the services/macro/configs folder"""
    if pipelines: return
    
    config_dir = os.path.join(os.path.dirname(__file__), "../services/macro/configs")
    for filename in os.listdir(config_dir):
        if filename.endswith("_data.py"):
            module_name = filename[:-3]
            try:
                # Dynamic import
                module = importlib.import_module(f"services.macro.configs.{module_name}")
                if hasattr(module, "get_config"):
                    config = module.get_config()
                    pipelines[config.region_name] = MacroDataPipeline(config)
                    logger.info(f"Loaded Macro Pipeline: {config.region_name}")
            except Exception as e:
                logger.error(f"Failed to load {filename}: {e}")

@router.on_event("startup")
async def startup_event():
    load_pipelines()

@router.get("/matrix")
async def get_macro_matrix():
    """Returns the latest 'EdgeFinder' style generic scores for all regions."""
    matrix = []
    
    for region, pipeline in pipelines.items():
        # RUN FETCH if empty (Blocking for MVP, should be background in Prod)
        if not pipeline.results:
            try:
                pipeline.fetch_current_data()
            except Exception as e:
                logger.error(f"Fetch failed for {region}: {e}")
                continue
        
        # Aggregate Score
        # Simple Logic: Sum of Scores / Count
        total_score = 0
        currency = "USD"
        
        indicators = {}
        for item in pipeline.results:
            # We assume US_Score exists if US config
            # But specific configs have specific key names (e.g. USD_Score)
            # pipeline.config.local_currency
            key = f"{pipeline.config.local_currency}_Score"
            score = item.get(key, 0)
            total_score += score
            currency = pipeline.config.local_currency
            
            # Key Indicators for Table
            if "GDP" in item["Indicator"]: indicators["GDP"] = item
            if "CPI" in item["Indicator"]: indicators["CPI"] = item
            if "Rate" in item["Indicator"] or "Yield" in item["Indicator"]: 
                if "10Y" not in item["Indicator"]: # Prefer Policy Rate
                    indicators["Rate"] = item
            if "Unemployment" in item["Indicator"]: indicators["Unemp"] = item
            
        
        bias = "Neutral"
        if total_score > 5: bias = "Bullish"
        if total_score > 15: bias = "Very Bullish"
        if total_score < -5: bias = "Bearish"
        if total_score < -15: bias = "Very Bearish"

        matrix.append({
            "region": region,
            "currency": currency,
            "total_score": total_score,
            "bias": bias,
            "data": indicators
        })
        
    return matrix

@router.post("/refresh/{region}")
async def refresh_region(region: str, background_tasks: BackgroundTasks):
    """Triggers a background refresh for a specific region."""
    pipeline = pipelines.get(region)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Region not found")
    
    background_tasks.add_task(pipeline.fetch_current_data)
    return {"status": "Refresh started", "region": region}
