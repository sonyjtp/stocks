import yfinance as yf
from fastapi import APIRouter, Query

from ..cache import get_cached, set_cached
from ..logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["sector"])


@router.get("/sector")
def get_sector_info(tickers: str = Query(...)):
    """Get sector classification for tickers from Yahoo Finance. Caches for 24 hours."""
    logger.debug(f"→ get_sector_info(tickers={tickers!r})")
    cache_key = f"sector:{tickers}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"← get_sector_info: cache hit ({len(cached)} tickers)")
        return cached

    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    logger.debug(f"get_sector_info: cache miss — fetching sector for {len(ticker_list)} tickers")
    result = {}

    for ticker in ticker_list:
        try:
            info = yf.Ticker(ticker).info
            sector = info.get("sector") or "Other"
            result[ticker] = sector
            logger.debug(f"get_sector_info: {ticker} → {sector!r}")
        except Exception as e:
            logger.warning(f"get_sector_info: {ticker}: {e}")
            result[ticker] = "Other"

    has_known = any(v != "Other" for v in result.values())
    known = sum(1 for v in result.values() if v != "Other")
    if has_known:
        set_cached(cache_key, result, ttl=86400)
        logger.info(
            f"get_sector_info: {known}/{len(ticker_list)} tickers classified — cached (TTL 24h)"
        )
    else:
        logger.warning(f"get_sector_info: no sector resolved for any of {ticker_list}, not caching")
    logger.debug("← get_sector_info: done")
    return result
