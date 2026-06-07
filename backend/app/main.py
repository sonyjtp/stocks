from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import upload, transactions, holdings, pnl, transfers, prices
from .logger import setup_logger

logger = setup_logger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)
logger.info("Database tables initialized")

app = FastAPI(title="Stock Trading Tracker API")

# CORS middleware for frontend at localhost:5174
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload.router)
app.include_router(transactions.router)
app.include_router(holdings.router)
app.include_router(pnl.router)
app.include_router(transfers.router)
app.include_router(prices.router)

@app.on_event("startup")
async def startup_event():
    logger.info("=== Stock Trading Tracker API Starting ===")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("=== Stock Trading Tracker API Shutting Down ===")

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
