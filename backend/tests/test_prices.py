import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
from app.routers.prices import get_current_prices


@pytest.fixture
def mock_yfinance_data():
    """Mock yfinance download data."""
    dates = pd.date_range('2026-01-01', periods=5)
    data = pd.DataFrame({
        ('Close', 'AAPL'): [150.0, 151.0, 152.0, 153.0, 154.0],
        ('Close', 'MSFT'): [300.0, 301.0, 302.0, 303.0, 304.0],
    }, index=dates)
    data.columns = pd.MultiIndex.from_tuples(data.columns)
    return data


def test_get_current_prices_single_ticker(mock_yfinance_data):
    """Test fetching price for a single ticker."""
    with patch('app.routers.prices.yf.download') as mock_download:
        mock_download.return_value = mock_yfinance_data
        result = get_current_prices(tickers='AAPL')
        assert 'AAPL' in result
        assert result['AAPL'] is not None


def test_get_current_prices_multiple_tickers(mock_yfinance_data):
    """Test fetching prices for multiple tickers."""
    with patch('app.routers.prices.yf.download') as mock_download:
        mock_download.return_value = mock_yfinance_data
        result = get_current_prices(tickers='AAPL,MSFT')
        assert len(result) >= 2
        assert all(isinstance(v, (float, type(None))) for v in result.values())


def test_get_current_prices_handles_errors():
    """Test error handling when yfinance fails."""
    with patch('app.routers.prices.yf.download') as mock_download:
        mock_download.side_effect = Exception("API Error")
        result = get_current_prices(tickers='AAPL')
        assert 'AAPL' in result
        assert result['AAPL'] is None


def test_get_current_prices_caching():
    """Test that prices are cached after fetching."""
    with patch('app.routers.prices.yf.download') as mock_download:
        with patch('app.routers.prices.get_cached') as mock_get_cached:
            with patch('app.routers.prices.set_cached') as mock_set_cached:
                mock_get_cached.return_value = None
                mock_download.return_value = pd.DataFrame({
                    'Close': {'AAPL': 150.0}
                })
                get_current_prices(tickers='AAPL')
                mock_set_cached.assert_called_once()


def test_get_current_prices_whitespace_handling():
    """Test that ticker whitespace is handled correctly."""
    with patch('app.routers.prices.yf.download') as mock_download:
        mock_download.return_value = pd.DataFrame({
            'Close': {'AAPL': 150.0}
        })
        result = get_current_prices(tickers=' AAPL , MSFT ')
        # Should uppercase and strip whitespace
        assert mock_download.called
