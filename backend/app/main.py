from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import upload, transactions, holdings, pnl, transfers

# Create database tables
Base.metadata.create_all(bind=engine)

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

@app.get("/")
def root():
    return {"message": "Stock Trading Tracker API"}

@app.get("/health")
def health():
    return {"status": "ok"}
