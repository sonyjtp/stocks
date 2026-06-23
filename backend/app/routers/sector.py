import yfinance as yf
from fastapi import APIRouter, Query

from ..cache import get_cached, set_cached
from ..logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["sector"])


@router.get("/sector")
def get_sector_info(tickers: str = Query(...)):
    """Get sector classification for tickers from Yahoo Finance. Caches for 24 hours."""
    cache_key = f"sector:{tickers}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    result = {}

    for ticker in ticker_list:
        try:
            info = yf.Ticker(ticker).info
            sector = info.get("sector") or "Other"
            result[ticker] = sector
        except Exception as e:
            logger.warning(f"Could not fetch sector for {ticker}: {e}")
            result[ticker] = "Other"

    has_known = any(v != "Other" for v in result.values())
    if has_known:
        set_cached(cache_key, result, ttl=86400)
    known = sum(1 for v in result.values() if v != "Other")
    logger.info(f"Sector fetch: {known}/{len(ticker_list)} tickers with known sector")
    return result
