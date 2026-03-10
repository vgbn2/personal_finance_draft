
from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from contextlib import asynccontextmanager
import logging
import os

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("QuantTerminal")

# Templates
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Quant Terminal Engine Starting...")
    yield
    logger.info("🛑 Quant Terminal Engine Shutting Down...")

app = FastAPI(
    title="Quant Terminal API",
    description="Backend for Multi-Market Algorithmic Trading",
    version="0.1.0",
    lifespan=lifespan
)

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
