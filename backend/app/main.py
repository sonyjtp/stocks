import os
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import upload, transactions, holdings, pnl, transfers, prices, settings
from .logger import get_logger

# Load environment variables from .env.local (development) or .env (production)
env_path = Path(__file__).parent.parent.parent / ".env.local"
if not env_path.exists():
    env_path = Path(__file__).parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

logger = get_logger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)
logger.info("Database tables initialized")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=== Stock Trading Tracker API Starting ===")
    yield
    logger.info("=== Stock Trading Tracker API Shutting Down ===")

app = FastAPI(
    title=os.getenv("API_TITLE", "Stock Trading Tracker API"),
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# CORS middleware - get allowed origins from environment
allowed_origins = [
    os.getenv("FRONTEND_URL_1", "http://localhost:5174"),
    os.getenv("FRONTEND_URL_2", "http://localhost:3000"),
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=os.getenv("CORS_CREDENTIALS", "true").lower() == "true",
    allow_methods=[m.strip() for m in os.getenv("ALLOW_METHODS", "*").split(",")],
    allow_headers=[h.strip() for h in os.getenv("ALLOW_HEADERS", "*").split(",")],
)

# Include routers
app.include_router(upload.router)
app.include_router(transactions.router)
app.include_router(holdings.router)
app.include_router(pnl.router)
app.include_router(transfers.router)
app.include_router(prices.router)
app.include_router(settings.router)

@app.get("/")
def root():
    logger.debug("Root endpoint called")
    return {"message": "Stock Trading Tracker API"}

@app.get("/health")
def health():
    logger.debug("Health check endpoint called")
    return {"status": "ok"}

@app.post("/admin/clear-cache")
def clear_cache():
    """Emergency endpoint to clear all cached data if needed."""
    from .cache import invalidate_cache
    invalidate_cache()
    logger.warning("Cache cleared via admin endpoint")
    return {"message": "Cache cleared"}
