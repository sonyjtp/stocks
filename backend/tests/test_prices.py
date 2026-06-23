from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from app.routers.prices import get_current_prices, get_price_changes, get_ticker_news


def _single_ticker_df(price=154.0):
    """yfinance older-style: single ticker returns a simple Close Series column."""
    dates = pd.date_range("2026-01-01", periods=5)
    return pd.DataFrame({"Close": [150.0, 151.0, 152.0, 153.0, price]}, index=dates)


def _single_ticker_df_new_format(ticker="AAPL", price=154.0):
    """yfinance newer-style (>=0.2.38): single ticker still returns MultiIndex columns."""
    dates = pd.date_range("2026-01-01", periods=5)
    data = pd.DataFrame(
        {("Close", ticker): [150.0, 151.0, 152.0, 153.0, price]},
        index=dates,
    )
    data.columns = pd.MultiIndex.from_tuples(data.columns)
    return data


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


def test_get_current_prices_single_ticker_new_yfinance_format():
    """Newer yfinance returns a DataFrame column even for single-ticker downloads."""
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.download") as mock_download:
            mock_download.return_value = _single_ticker_df_new_format("AAPL", 154.0)
            result = get_current_prices(tickers="AAPL")
            assert result["AAPL"] == pytest.approx(154.0)


def test_get_current_prices_strips_whitespace():
    with patch("app.routers.prices.yf.download") as mock_download:
        mock_download.return_value = _single_ticker_df()
        get_current_prices(tickers=" AAPL ")
        args = mock_download.call_args[0][0]
        assert args == ["AAPL"]


# ---------------------------------------------------------------------------
# get_price_changes
# ---------------------------------------------------------------------------

# _single_ticker_df: first close=150.0, last close=154.0 → (154-150)/150*100 = 2.667%
_EXPECTED_SINGLE_CHANGE = (154.0 - 150.0) / 150.0 * 100  # ≈ 2.667
_EXPECTED_AAPL_CHANGE = (154.0 - 150.0) / 150.0 * 100  # ≈ 2.667
_EXPECTED_MSFT_CHANGE = (304.0 - 300.0) / 300.0 * 100  # ≈ 1.333


def test_get_price_changes_single_ticker():
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.download") as mock_download:
            mock_download.return_value = _single_ticker_df()
            result = get_price_changes(tickers="AAPL")
            assert "AAPL" in result
            assert result["AAPL"] == pytest.approx(_EXPECTED_SINGLE_CHANGE)


def test_get_price_changes_multiple_tickers():
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.download") as mock_download:
            mock_download.return_value = _multi_ticker_df()
            result = get_price_changes(tickers="AAPL,MSFT")
            assert result["AAPL"] == pytest.approx(_EXPECTED_AAPL_CHANGE)
            assert result["MSFT"] == pytest.approx(_EXPECTED_MSFT_CHANGE)


def test_get_price_changes_handles_download_exception():
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.download") as mock_download:
            mock_download.side_effect = Exception("API Error")
            result = get_price_changes(tickers="AAPL")
            assert result["AAPL"] is None


def test_get_price_changes_uses_cache():
    with patch("app.routers.prices.get_cached") as mock_get:
        mock_get.return_value = {"AAPL": 2.5}
        result = get_price_changes(tickers="AAPL")
        assert result["AAPL"] == pytest.approx(2.5)


def test_get_price_changes_populates_cache():
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.download") as mock_download:
            with patch("app.routers.prices.set_cached") as mock_set:
                mock_download.return_value = _single_ticker_df()
                get_price_changes(tickers="AAPL")
                mock_set.assert_called_once()


def test_get_price_changes_no_valid_data_not_cached():
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.download") as mock_download:
            with patch("app.routers.prices.set_cached") as mock_set:
                mock_download.side_effect = Exception("fail")
                get_price_changes(tickers="AAPL")
                mock_set.assert_not_called()


def test_get_price_changes_insufficient_data_returns_none():
    """Fewer than 2 data points → can't compute a change."""
    dates = pd.date_range("2026-01-01", periods=1)
    single_row = pd.DataFrame({"Close": [154.0]}, index=dates)
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.download") as mock_download:
            mock_download.return_value = single_row
            result = get_price_changes(tickers="AAPL")
            assert result["AAPL"] is None


# ---------------------------------------------------------------------------
# get_ticker_news
# ---------------------------------------------------------------------------


def _news_item(
    title="Test Article",
    publisher="Reuters",
    url="https://example.com/article",
    pub_date="2026-06-22T12:00:00Z",
    summary="A test summary",
):
    return {
        "content": {
            "title": title,
            "summary": summary,
            "pubDate": pub_date,
            "canonicalUrl": {"url": url},
            "provider": {"displayName": publisher},
        }
    }


def _mock_ticker(news_items):
    mock = MagicMock()
    mock.news = news_items
    return mock


def test_get_ticker_news_returns_parsed_fields():
    item = _news_item(
        title="AAPL surges",
        publisher="Reuters",
        url="https://example.com/1",
        pub_date="2026-06-22T10:00:00Z",
    )
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.Ticker", return_value=_mock_ticker([item])):
            result = get_ticker_news(tickers="AAPL")
            assert len(result["AAPL"]) == 1
            article = result["AAPL"][0]
            assert article["title"] == "AAPL surges"
            assert article["publisher"] == "Reuters"
            assert article["link"] == "https://example.com/1"
            assert article["published_at"] == "2026-06-22T10:00:00Z"


def test_get_ticker_news_limits_to_three_articles():
    items = [_news_item(title=f"Article {i}") for i in range(5)]
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.Ticker", return_value=_mock_ticker(items)):
            result = get_ticker_news(tickers="AAPL")
            assert len(result["AAPL"]) == 3


def test_get_ticker_news_multiple_tickers():
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.Ticker") as mock_ticker_cls:
            mock_ticker_cls.side_effect = lambda t: _mock_ticker([_news_item(title=f"{t} news")])
            result = get_ticker_news(tickers="AAPL,MSFT")
            assert "AAPL" in result and "MSFT" in result
            assert result["AAPL"][0]["title"] == "AAPL news"
            assert result["MSFT"][0]["title"] == "MSFT news"


def test_get_ticker_news_handles_exception_per_ticker():
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.Ticker", side_effect=Exception("API down")):
            result = get_ticker_news(tickers="AAPL")
            assert result["AAPL"] == []


def test_get_ticker_news_uses_cache():
    cached = {
        "AAPL": [
            {"title": "Cached", "publisher": "X", "link": "", "published_at": "", "summary": ""}
        ]
    }
    with patch("app.routers.prices.get_cached", return_value=cached):
        result = get_ticker_news(tickers="AAPL")
        assert result["AAPL"][0]["title"] == "Cached"


def test_get_ticker_news_populates_cache_with_30min_ttl():
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.Ticker", return_value=_mock_ticker([_news_item()])):
            with patch("app.routers.prices.set_cached") as mock_set:
                get_ticker_news(tickers="AAPL")
                mock_set.assert_called_once()
                _, _, kwargs = mock_set.mock_calls[0]
                assert mock_set.call_args[1].get("ttl") == 1800 or mock_set.call_args[0][2] == 1800


def test_get_ticker_news_no_articles_not_cached():
    with patch("app.routers.prices.get_cached", return_value=None):
        with patch("app.routers.prices.yf.Ticker", return_value=_mock_ticker([])):
            with patch("app.routers.prices.set_cached") as mock_set:
                get_ticker_news(tickers="AAPL")
                mock_set.assert_not_called()
