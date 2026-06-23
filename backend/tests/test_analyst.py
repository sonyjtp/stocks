from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from app.routers.analyst import get_analyst_data


def _mock_ticker(recommendations=None, analyst_price_targets=None):
    mock = MagicMock()
    mock.recommendations = recommendations
    mock.analyst_price_targets = analyst_price_targets or {}
    return mock


def _recommendations_df(strong_buy=10, buy=20, hold=8, sell=2, strong_sell=1):
    return pd.DataFrame(
        [
            {
                "period": "0m",
                "strongBuy": strong_buy,
                "buy": buy,
                "hold": hold,
                "sell": sell,
                "strongSell": strong_sell,
            },
            {"period": "-1m", "strongBuy": 9, "buy": 19, "hold": 9, "sell": 2, "strongSell": 1},
        ]
    )


_PRICE_TARGETS = {"current": 295.0, "low": 200.0, "mean": 320.0, "median": 315.0, "high": 410.0}


class TestGetAnalystData:
    def test_returns_ratings_for_single_ticker(self):
        with patch("app.routers.analyst.get_cached", return_value=None):
            with patch(
                "app.routers.analyst.yf.Ticker",
                return_value=_mock_ticker(
                    recommendations=_recommendations_df(),
                    analyst_price_targets=_PRICE_TARGETS,
                ),
            ):
                result = get_analyst_data(tickers="AAPL")
                assert "AAPL" in result
                ratings = result["AAPL"]["ratings"]
                assert ratings["strong_buy"] == 10
                assert ratings["buy"] == 20
                assert ratings["hold"] == 8
                assert ratings["sell"] == 2
                assert ratings["strong_sell"] == 1

    def test_uses_most_recent_recommendations_row(self):
        """iloc[0] should be the current-month row (period=0m)."""
        with patch("app.routers.analyst.get_cached", return_value=None):
            with patch(
                "app.routers.analyst.yf.Ticker",
                return_value=_mock_ticker(
                    recommendations=_recommendations_df(strong_buy=99),
                ),
            ):
                result = get_analyst_data(tickers="AAPL")
                assert result["AAPL"]["ratings"]["strong_buy"] == 99

    def test_returns_price_targets(self):
        with patch("app.routers.analyst.get_cached", return_value=None):
            with patch(
                "app.routers.analyst.yf.Ticker",
                return_value=_mock_ticker(
                    recommendations=_recommendations_df(),
                    analyst_price_targets=_PRICE_TARGETS,
                ),
            ):
                result = get_analyst_data(tickers="AAPL")
                pt = result["AAPL"]["price_target"]
                assert pt["mean"] == pytest.approx(320.0)
                assert pt["low"] == pytest.approx(200.0)
                assert pt["high"] == pytest.approx(410.0)

    def test_multiple_tickers(self):
        with patch("app.routers.analyst.get_cached", return_value=None):
            with patch("app.routers.analyst.yf.Ticker") as mock_cls:
                mock_cls.side_effect = lambda t: _mock_ticker(
                    recommendations=_recommendations_df(),
                    analyst_price_targets=_PRICE_TARGETS,
                )
                result = get_analyst_data(tickers="AAPL,MSFT")
                assert "AAPL" in result and "MSFT" in result

    def test_handles_exception_per_ticker(self):
        with patch("app.routers.analyst.get_cached", return_value=None):
            with patch("app.routers.analyst.yf.Ticker", side_effect=Exception("API down")):
                result = get_analyst_data(tickers="AAPL")
                assert result["AAPL"]["ratings"] == {}
                assert result["AAPL"]["price_target"] == {}

    def test_empty_recommendations_returns_empty_ratings(self):
        with patch("app.routers.analyst.get_cached", return_value=None):
            with patch(
                "app.routers.analyst.yf.Ticker",
                return_value=_mock_ticker(
                    recommendations=pd.DataFrame(),
                ),
            ):
                result = get_analyst_data(tickers="AAPL")
                assert result["AAPL"]["ratings"] == {}

    def test_uses_cache(self):
        cached = {"AAPL": {"ratings": {"buy": 5}, "price_target": {"mean": 300.0}}}
        with patch("app.routers.analyst.get_cached", return_value=cached):
            result = get_analyst_data(tickers="AAPL")
            assert result["AAPL"]["ratings"]["buy"] == 5

    def test_populates_cache_with_1hour_ttl(self):
        with patch("app.routers.analyst.get_cached", return_value=None):
            with patch(
                "app.routers.analyst.yf.Ticker",
                return_value=_mock_ticker(
                    recommendations=_recommendations_df(),
                    analyst_price_targets=_PRICE_TARGETS,
                ),
            ):
                with patch("app.routers.analyst.set_cached") as mock_set:
                    get_analyst_data(tickers="AAPL")
                    mock_set.assert_called_once()
                    ttl = mock_set.call_args[1].get("ttl") or mock_set.call_args[0][2]
                    assert ttl == 3600

    def test_no_data_not_cached(self):
        with patch("app.routers.analyst.get_cached", return_value=None):
            with patch(
                "app.routers.analyst.yf.Ticker",
                return_value=_mock_ticker(
                    recommendations=pd.DataFrame(),
                    analyst_price_targets={},
                ),
            ):
                with patch("app.routers.analyst.set_cached") as mock_set:
                    get_analyst_data(tickers="AAPL")
                    mock_set.assert_not_called()
