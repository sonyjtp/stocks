import yfinance as yf
from fastapi import APIRouter, Query

from ..cache import get_cached, set_cached
from ..logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["analyst"])


@router.get("/analyst")
def get_analyst_data(tickers: str = Query(...)):
    """Get analyst consensus ratings and price targets. Caches for 1 hour."""
    cache_key = f"analyst:{tickers}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    result = {}

    for ticker in ticker_list:
        try:
            t = yf.Ticker(ticker)

            ratings = {}
            rec = t.recommendations
            if rec is not None and not rec.empty:
                latest = rec.iloc[0]
                ratings = {
                    "strong_buy": int(latest.get("strongBuy", 0)),
                    "buy": int(latest.get("buy", 0)),
                    "hold": int(latest.get("hold", 0)),
                    "sell": int(latest.get("sell", 0)),
                    "strong_sell": int(latest.get("strongSell", 0)),
                }

            price_target = {}
            apt = t.analyst_price_targets
            if apt:
                price_target = {
                    "current": apt.get("current"),
                    "low": apt.get("low"),
                    "mean": apt.get("mean"),
                    "median": apt.get("median"),
                    "high": apt.get("high"),
                }

            result[ticker] = {"ratings": ratings, "price_target": price_target}
        except Exception as e:
            logger.warning(f"Could not fetch analyst data for {ticker}: {e}")
            result[ticker] = {"ratings": {}, "price_target": {}}

    has_data = any(r["ratings"] or r["price_target"] for r in result.values())
    if has_data:
        set_cached(cache_key, result, ttl=3600)
    rated = sum(1 for r in result.values() if r["ratings"])
    logger.info(f"Analyst fetch: {rated}/{len(ticker_list)} tickers with ratings")
    return result
