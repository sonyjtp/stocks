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
    cache_key = f"prices:{tickers}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"Returning cached prices for {len(tickers.split(','))} tickers")
        return cached

    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    logger.debug(
        f"Fetching prices for {len(ticker_list)} tickers: {', '.join(ticker_list[:5])}"
        + ("..." if len(ticker_list) > 5 else "")
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
                logger.warning(f"Could not get price for {ticker}: {e}")
                prices[ticker] = None
    except Exception as e:
        logger.error(f"Error fetching prices: {e}", exc_info=True)
        prices = {t: None for t in ticker_list}

    successful = sum(1 for p in prices.values() if p is not None)
    logger.info(f"Price fetch complete: {successful}/{len(ticker_list)} successful")

    # Only cache if we got at least some valid prices (prevent caching all-None data)
    if successful > 0:
        set_cached(cache_key, prices, ttl=300)
        label = ticker_list[0] if len(ticker_list) == 1 else f"{len(ticker_list)} tickers"
        logger.debug(f"Cached prices for {label}")
    else:
        logger.warning("No valid prices fetched, not caching to prevent bad data")

    return prices


@router.get("/prices/change")
def get_price_changes(tickers: str = Query(...)):
    """Get 5-trading-day price change % for multiple tickers. Caches for 5 minutes."""
    cache_key = f"price_change:{tickers}"
    cached = get_cached(cache_key)
    if cached:
        return cached

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
                logger.warning(f"Could not get price change for {ticker}: {e}")
                changes[ticker] = None
    except Exception as e:
        logger.error(f"Error fetching price changes: {e}", exc_info=True)
        changes = {t: None for t in ticker_list}

    successful = sum(1 for v in changes.values() if v is not None)
    logger.info(f"Price change fetch: {successful}/{len(ticker_list)} successful")
    if successful > 0:
        set_cached(cache_key, changes, ttl=300)

    return changes


@router.get("/news")
def get_ticker_news(tickers: str = Query(...)):
    """Get recent news for high-volatility tickers. Caches for 30 minutes."""
    cache_key = f"news:{tickers}"
    cached = get_cached(cache_key)
    if cached:
        return cached

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
            logger.warning(f"Could not fetch news for {ticker}: {e}")
            result[ticker] = []

    if any(result.values()):
        set_cached(cache_key, result, ttl=1800)
    total = sum(len(v) for v in result.values())
    logger.info(f"News fetch: {total} articles for {len(ticker_list)} tickers")
    return result
