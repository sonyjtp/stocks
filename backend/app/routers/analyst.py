import yfinance as yf
from fastapi import APIRouter, Query

from ..cache import get_cached, set_cached
from ..logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["analyst"])


@router.get("/analyst")
def get_analyst_data(tickers: str = Query(...)):
    """Get analyst consensus ratings and price targets. Caches for 1 hour."""
    logger.debug(f"→ get_analyst_data(tickers={tickers!r})")
    cache_key = f"analyst:{tickers}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"← get_analyst_data: cache hit ({len(cached)} tickers)")
        return cached
    logger.debug("get_analyst_data: cache miss — fetching from yfinance")

    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    result = {}

    for ticker in ticker_list:
        try:
            t = yf.Ticker(ticker)

            ratings = {}
            rec = t.recommendations
            if rec is not None and not rec.empty:
                period = rec.iloc[0].get("period", "?")
                logger.debug(
                    f"get_analyst_data: {ticker}: {len(rec)} recommendation rows,"
                    f" using most recent (period={period!r})"
                )
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
            logger.warning(f"get_analyst_data: {ticker}: {e}")
            result[ticker] = {"ratings": {}, "price_target": {}}

    has_data = any(r["ratings"] or r["price_target"] for r in result.values())
    rated = sum(1 for r in result.values() if r["ratings"])
    with_targets = sum(1 for r in result.values() if r["price_target"])
    if has_data:
        set_cached(cache_key, result, ttl=3600)
        logger.info(
            f"get_analyst_data: {rated}/{len(ticker_list)} with ratings,"
            f" {with_targets} with price targets — cached (TTL 1h)"
        )
    else:
        logger.warning(f"get_analyst_data: no analyst data for any of {ticker_list}, not caching")
    logger.debug("← get_analyst_data: done")
    return result
