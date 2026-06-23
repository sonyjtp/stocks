from unittest.mock import MagicMock, patch

from app.routers.sector import get_sector_info


def _mock_ticker(sector):
    mock = MagicMock()
    mock.info = {"sector": sector} if sector else {}
    return mock


class TestGetSectorInfo:
    def test_returns_sector_for_single_ticker(self):
        with patch("app.routers.sector.get_cached", return_value=None):
            with patch("app.routers.sector.yf.Ticker", return_value=_mock_ticker("Technology")):
                result = get_sector_info(tickers="AAPL")
                assert result["AAPL"] == "Technology"

    def test_missing_sector_defaults_to_other(self):
        """ETFs and funds often have no sector field."""
        with patch("app.routers.sector.get_cached", return_value=None):
            with patch("app.routers.sector.yf.Ticker", return_value=_mock_ticker(None)):
                result = get_sector_info(tickers="SPY")
                assert result["SPY"] == "Other"

    def test_multiple_tickers_different_sectors(self):
        sector_map = {"AAPL": "Technology", "JNJ": "Healthcare"}
        with patch("app.routers.sector.get_cached", return_value=None):
            with patch("app.routers.sector.yf.Ticker") as mock_cls:
                mock_cls.side_effect = lambda t: _mock_ticker(sector_map.get(t))
                result = get_sector_info(tickers="AAPL,JNJ")
                assert result["AAPL"] == "Technology"
                assert result["JNJ"] == "Healthcare"

    def test_handles_exception_per_ticker(self):
        with patch("app.routers.sector.get_cached", return_value=None):
            with patch("app.routers.sector.yf.Ticker", side_effect=Exception("API down")):
                result = get_sector_info(tickers="AAPL")
                assert result["AAPL"] == "Other"

    def test_partial_exception_still_returns_others(self):
        """One ticker failing should not block the rest."""
        call_count = [0]

        def flaky(t):
            call_count[0] += 1
            if call_count[0] == 1:
                raise Exception("rate limit")
            return _mock_ticker("Healthcare")

        with patch("app.routers.sector.get_cached", return_value=None):
            with patch("app.routers.sector.yf.Ticker", side_effect=flaky):
                result = get_sector_info(tickers="AAPL,JNJ")
                assert result["AAPL"] == "Other"
                assert result["JNJ"] == "Healthcare"

    def test_uses_cache(self):
        cached = {"AAPL": "Technology"}
        with patch("app.routers.sector.get_cached", return_value=cached):
            result = get_sector_info(tickers="AAPL")
            assert result["AAPL"] == "Technology"

    def test_populates_cache_with_24h_ttl(self):
        with patch("app.routers.sector.get_cached", return_value=None):
            with patch("app.routers.sector.yf.Ticker", return_value=_mock_ticker("Technology")):
                with patch("app.routers.sector.set_cached") as mock_set:
                    get_sector_info(tickers="AAPL")
                    mock_set.assert_called_once()
                    ttl = mock_set.call_args[1].get("ttl") or mock_set.call_args[0][2]
                    assert ttl == 86400

    def test_all_other_not_cached(self):
        """If every ticker returns Other (e.g. all ETFs), skip caching."""
        with patch("app.routers.sector.get_cached", return_value=None):
            with patch("app.routers.sector.yf.Ticker", return_value=_mock_ticker(None)):
                with patch("app.routers.sector.set_cached") as mock_set:
                    get_sector_info(tickers="SPY,QQQ")
                    mock_set.assert_not_called()

    def test_strips_whitespace_and_uppercases(self):
        with patch("app.routers.sector.get_cached", return_value=None):
            with patch("app.routers.sector.yf.Ticker") as mock_cls:
                mock_cls.return_value = _mock_ticker("Technology")
                result = get_sector_info(tickers=" aapl ")
                assert "AAPL" in result
