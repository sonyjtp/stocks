from fastapi import APIRouter, Query
import yfinance as yf
import pandas as pd
from ..cache import get_cached, set_cached
from ..logger import setup_logger

logger = setup_logger(__name__)
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
    logger.debug(f"Fetching prices for {len(ticker_list)} tickers: {', '.join(ticker_list[:5])}" + ("..." if len(ticker_list) > 5 else ""))
    prices = {}

    try:
        # Fetch all tickers at once for efficiency
        data = yf.download(ticker_list, period="1d", progress=False)

        if len(ticker_list) == 1:
            # Single ticker: get the last close price
            close_price = data['Close'].iloc[-1] if len(data) > 0 else None
            prices[ticker_list[0]] = float(close_price) if close_price is not None else None
        else:
            # Multiple tickers: iterate through each
            for ticker in ticker_list:
                try:
                    close_price = data['Close'][ticker].iloc[-1]
                    prices[ticker] = float(close_price) if not pd.isna(close_price) else None
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
        logger.debug(f"Cached prices for {ticker_list[0] if len(ticker_list) == 1 else f'{len(ticker_list)} tickers'}")
    else:
        logger.warning(f"No valid prices fetched, not caching to prevent bad data")

    return prices
