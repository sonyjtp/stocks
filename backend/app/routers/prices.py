import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Query

from ..cache import get_cached, set_cached
from ..logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["prices"])


@router.get("/prices")
def get_current_prices(tickers: str = Query(...)):
    """Get current prices for multiple tickers from YahooFinance.
    Caches results for 5 minutes.

    Args:
        tickers: Comma-separated list of tickers (e.g., "AAPL,MSFT,GOOGL")

    Returns:
        Dictionary with ticker as key and current price as value
    """
    logger.debug(f"→ get_current_prices(tickers={tickers!r})")
    cache_key = f"prices:{tickers}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"← get_current_prices: cache hit ({len(cached)} tickers)")
        return cached

    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    logger.debug(
        f"get_current_prices: cache miss — downloading {len(ticker_list)} tickers via yfinance"
        + (
            f": {', '.join(ticker_list[:8])}{'...' if len(ticker_list) > 8 else ''}"
            if len(ticker_list) <= 8
            else ""
        )
    )
    prices = {}

    try:
        # Fetch all tickers at once for efficiency
        data = yf.download(ticker_list, period="1d", progress=False)

        close_col = data["Close"]
        for ticker in ticker_list:
            try:
                col = close_col[ticker] if isinstance(close_col, pd.DataFrame) else close_col
                close_price = col.iloc[-1] if len(col) > 0 else None
                prices[ticker] = (
                    float(close_price)
                    if close_price is not None and not pd.isna(close_price)
                    else None
                )
            except Exception as e:
                logger.warning(f"get_current_prices: {ticker}: {e}")
                prices[ticker] = None
    except Exception as e:
        logger.error(f"get_current_prices: yfinance download failed: {e}", exc_info=True)
        prices = {t: None for t in ticker_list}

    successful = sum(1 for p in prices.values() if p is not None)
    failed = [t for t, p in prices.items() if p is None]
    logger.info(
        f"get_current_prices: {successful}/{len(ticker_list)} prices fetched"
        + (f" — no data for: {', '.join(failed)}" if failed else "")
    )

    if successful > 0:
        set_cached(cache_key, prices, ttl=300)
        logger.debug(f"← get_current_prices: cached {successful} prices (TTL 5 min)")
    else:
        logger.warning("get_current_prices: all tickers returned null — not caching")

    return prices


@router.get("/prices/change")
def get_price_changes(tickers: str = Query(...)):
    """Get 5-trading-day price change % for multiple tickers. Caches for 5 minutes."""
    logger.debug(f"→ get_price_changes(tickers={tickers!r})")
    cache_key = f"price_change:{tickers}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"← get_price_changes: cache hit ({len(cached)} tickers)")
        return cached
    logger.debug("get_price_changes: cache miss — downloading 5d history")

    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    changes = {}

    try:
        data = yf.download(ticker_list, period="5d", interval="1d", progress=False)

        close_col = data["Close"]
        for ticker in ticker_list:
            try:
                col = close_col[ticker] if isinstance(close_col, pd.DataFrame) else close_col
                closes = col.dropna()
                if len(closes) >= 2:
                    changes[ticker] = float(
                        (closes.iloc[-1] - closes.iloc[0]) / closes.iloc[0] * 100
                    )
                else:
                    changes[ticker] = None
            except Exception as e:
                logger.warning(f"get_price_changes: {ticker}: {e}")
                changes[ticker] = None
    except Exception as e:
        logger.error(f"get_price_changes: yfinance download failed: {e}", exc_info=True)
        changes = {t: None for t in ticker_list}

    successful = sum(1 for v in changes.values() if v is not None)
    logger.info(f"get_price_changes: {successful}/{len(ticker_list)} 5d changes computed")
    if successful > 0:
        set_cached(cache_key, changes, ttl=300)
        logger.debug("← get_price_changes: cached (TTL 5 min)")
    else:
        logger.warning("get_price_changes: no valid changes — not caching")

    return changes


@router.get("/prices/history")
def get_price_history(ticker: str = Query(...), period: str = Query("1mo")):
    """Get daily close history for a single ticker. Caches for 1 hour."""
    ticker = ticker.strip().upper()
    logger.debug(f"→ get_price_history(ticker={ticker!r}, period={period!r})")
    cache_key = f"history:{ticker}:{period}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"← get_price_history: cache hit ({len(cached)} points)")
        return cached

    PERIOD_CONFIG = {
        "1d": {
            "yf_period": "1d",
            "interval": "5m",
            "ttl": 300,
            "fmt": lambda ts: ts.strftime("%H:%M"),
        },
        "1w": {
            "yf_period": "5d",
            "interval": "1d",
            "ttl": 1800,
            "fmt": lambda ts: ts.strftime("%a"),
        },
        "1mo": {
            "yf_period": "1mo",
            "interval": "1d",
            "ttl": 3600,
            "fmt": lambda ts: ts.strftime("%y-%m-%d"),
        },
        "3mo": {
            "yf_period": "3mo",
            "interval": "1d",
            "ttl": 3600,
            "fmt": lambda ts: ts.strftime("%y-%m-%d"),
        },
        "6mo": {
            "yf_period": "6mo",
            "interval": "1d",
            "ttl": 3600,
            "fmt": lambda ts: ts.strftime("%y-%m-%d"),
        },
        "1y": {
            "yf_period": "1y",
            "interval": "1d",
            "ttl": 3600,
            "fmt": lambda ts: ts.strftime("%y-%m-%d"),
        },
        "2y": {
            "yf_period": "2y",
            "interval": "1d",
            "ttl": 3600,
            "fmt": lambda ts: ts.strftime("%y-%m-%d"),
        },
    }
    cfg = PERIOD_CONFIG.get(period, PERIOD_CONFIG["1mo"])

    try:
        data = yf.download(
            ticker, period=cfg["yf_period"], interval=cfg["interval"], progress=False
        )
        close_col = data["Close"]
        col = close_col[ticker] if isinstance(close_col, pd.DataFrame) else close_col
        result = [
            {"date": cfg["fmt"](ts), "close": round(float(price), 4)}
            for ts, price in col.items()
            if not pd.isna(price)
        ]
    except Exception as e:
        logger.warning(f"get_price_history: {ticker}: {e}")
        result = []

    if result:
        set_cached(cache_key, result, ttl=cfg["ttl"])
        logger.info(
            f"get_price_history: {ticker} {period} — {len(result)} points"
            f" — cached (TTL {cfg['ttl']}s)"
        )
    else:
        logger.warning(f"get_price_history: no data for {ticker} ({period})")
    logger.debug("← get_price_history: done")
    return result


@router.get("/news")
def get_ticker_news(tickers: str = Query(...)):
    """Get recent news for high-volatility tickers. Caches for 30 minutes."""
    logger.debug(f"→ get_ticker_news(tickers={tickers!r})")
    cache_key = f"news:{tickers}"
    cached = get_cached(cache_key)
    if cached:
        total_cached = sum(len(v) for v in cached.values())
        logger.debug(f"← get_ticker_news: cache hit ({total_cached} articles)")
        return cached
    logger.debug("get_ticker_news: cache miss — fetching from yfinance")

    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    result = {}

    for ticker in ticker_list:
        try:
            raw_news = yf.Ticker(ticker).news or []
            items = []
            for item in raw_news[:3]:
                c = item.get("content", {})
                pub_date = c.get("pubDate", "")
                items.append(
                    {
                        "title": c.get("title", ""),
                        "summary": c.get("summary", ""),
                        "publisher": c.get("provider", {}).get("displayName", ""),
                        "link": c.get("canonicalUrl", {}).get("url", ""),
                        "published_at": pub_date,
                    }
                )
            result[ticker] = items
        except Exception as e:
            logger.warning(f"get_ticker_news: {ticker}: {e}")
            result[ticker] = []

    total = sum(len(v) for v in result.values())
    if any(result.values()):
        set_cached(cache_key, result, ttl=1800)
        logger.info(
            f"get_ticker_news: {total} articles for {len(ticker_list)} tickers"
            " — cached (TTL 30 min)"
        )
    else:
        logger.warning(f"get_ticker_news: no articles found for any of {ticker_list}, not caching")
    logger.debug("← get_ticker_news: done")
    return result
