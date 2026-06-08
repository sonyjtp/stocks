from unittest.mock import patch

import pandas as pd
import pytest

from app.routers.prices import get_current_prices


def _single_ticker_df(price=154.0):
    """yfinance returns a simple Close Series for a single ticker."""
    dates = pd.date_range("2026-01-01", periods=5)
    return pd.DataFrame({"Close": [150.0, 151.0, 152.0, 153.0, price]}, index=dates)


def _multi_ticker_df():
    """yfinance returns a MultiIndex DataFrame for multiple tickers."""
    dates = pd.date_range("2026-01-01", periods=5)
    data = pd.DataFrame(
        {
            ("Close", "AAPL"): [150.0, 151.0, 152.0, 153.0, 154.0],
            ("Close", "MSFT"): [300.0, 301.0, 302.0, 303.0, 304.0],
        },
        index=dates,
    )
    data.columns = pd.MultiIndex.from_tuples(data.columns)
    return data


def test_get_current_prices_single_ticker():
    with patch("app.routers.prices.yf.download") as mock_download:
        mock_download.return_value = _single_ticker_df()
        result = get_current_prices(tickers="AAPL")
        assert "AAPL" in result
        assert result["AAPL"] == pytest.approx(154.0)


def test_get_current_prices_multiple_tickers():
    with patch("app.routers.prices.yf.download") as mock_download:
        mock_download.return_value = _multi_ticker_df()
        result = get_current_prices(tickers="AAPL,MSFT")
        assert "AAPL" in result and "MSFT" in result
        assert all(isinstance(v, (float, type(None))) for v in result.values())


def test_get_current_prices_handles_download_exception():
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.download") as mock_download:
            mock_download.side_effect = Exception("API Error")
            result = get_current_prices(tickers="AAPL")
            assert result["AAPL"] is None


def test_get_current_prices_uses_cache():
    with patch("app.routers.prices.get_cached") as mock_get:
        mock_get.return_value = {"AAPL": 150.0}
        result = get_current_prices(tickers="AAPL")
        assert result["AAPL"] == pytest.approx(150.0)


def test_get_current_prices_populates_cache():
    with patch("app.routers.prices.yf.download") as mock_download:
        with patch("app.routers.prices.get_cached") as mock_get:
            with patch("app.routers.prices.set_cached") as mock_set:
                mock_get.return_value = None
                mock_download.return_value = _single_ticker_df()
                get_current_prices(tickers="AAPL")
                mock_set.assert_called_once()


def test_get_current_prices_no_valid_prices_not_cached():
    """When all prices are None, set_cached should NOT be called."""
    with patch("app.routers.prices.yf.download") as mock_download:
        with patch("app.routers.prices.get_cached") as mock_get:
            with patch("app.routers.prices.set_cached") as mock_set:
                mock_get.return_value = None
                mock_download.side_effect = Exception("fail")
                get_current_prices(tickers="AAPL")
                mock_set.assert_not_called()


def test_get_current_prices_strips_whitespace():
    with patch("app.routers.prices.yf.download") as mock_download:
        mock_download.return_value = _single_ticker_df()
        get_current_prices(tickers=" AAPL ")
        args = mock_download.call_args[0][0]
        assert args == ["AAPL"]
