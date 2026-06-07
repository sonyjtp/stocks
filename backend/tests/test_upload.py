import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import patch, MagicMock
from sqlalchemy.orm import Session
from app.routers.upload import upload_csv


@pytest.fixture
def mock_csv_content():
    """Mock CSV file content."""
    return b"""Activity Date,Process Date,Settle Date,Symbol,Description,Trans Code,Quantity,Price,Amount
1/15/2024,1/15/2024,1/17/2024,AAPL,Apple Inc,Buy,10,$150.00,-$1500.00
1/20/2024,1/20/2024,1/22/2024,AAPL,Apple Inc,Sell,5,$155.00,$775.00
2/1/2024,2/1/2024,2/3/2024,MSFT,Microsoft Corp,Buy,8,$300.00,-$2400.00"""


@pytest.fixture
def mock_upload_file(mock_csv_content):
    """Mock UploadFile object."""
    file = MagicMock()
    file.filename = "test.csv"
    file.read = MagicMock(return_value=mock_csv_content)
    return file


@pytest.fixture
def mock_db():
    """Mock database session."""
    return MagicMock(spec=Session)


@pytest.mark.asyncio
async def test_upload_csv_success(mock_upload_file, mock_db):
    """Test successful CSV upload."""
    with patch('app.routers.upload.parse_robinhood_csv') as mock_parse:
        with patch('app.routers.upload.invalidate_cache'):
            mock_parse.return_value = [
                {
                    'broker': 'robinhood',
                    'activity_date': date(2024, 1, 15),
                    'ticker': 'AAPL',
                    'description': 'Apple Inc',
                    'trans_code': 'Buy',
                    'quantity': Decimal('10'),
                    'price': Decimal('150.00'),
                    'amount': Decimal('-1500.00'),
                }
            ]
            mock_db.query.return_value.filter.return_value.first.return_value = None

            result = await upload_csv(file=mock_upload_file, db=mock_db)
            assert result['rows_inserted'] > 0


@pytest.mark.asyncio
async def test_upload_csv_duplicate_detection(mock_upload_file, mock_db):
    """Test that duplicates within CSV are detected."""
    with patch('app.routers.upload.parse_robinhood_csv') as mock_parse:
        with patch('app.routers.upload.invalidate_cache'):
            # Same transaction twice
            transaction = {
                'broker': 'robinhood',
                'activity_date': date(2024, 1, 15),
                'ticker': 'AAPL',
                'description': 'Apple Inc',
                'trans_code': 'Buy',
                'quantity': Decimal('10'),
                'price': Decimal('150.00'),
                'amount': Decimal('-1500.00'),
            }
            mock_parse.return_value = [transaction, transaction]
            mock_db.query.return_value.filter.return_value.first.return_value = None

            result = await upload_csv(file=mock_upload_file, db=mock_db)
            assert len(result['duplicates']) == 1


@pytest.mark.asyncio
async def test_upload_csv_db_duplicate_detection(mock_upload_file, mock_db):
    """Test that DB duplicates are detected and returned."""
    with patch('app.routers.upload.parse_robinhood_csv') as mock_parse:
        with patch('app.routers.upload.invalidate_cache'):
            transaction = {
                'broker': 'robinhood',
                'activity_date': date(2024, 1, 15),
                'ticker': 'AAPL',
                'description': 'Apple Inc',
                'trans_code': 'Buy',
                'quantity': Decimal('10'),
                'price': Decimal('150.00'),
                'amount': Decimal('-1500.00'),
            }
            mock_parse.return_value = [transaction]
            # Transaction already exists in DB
            mock_db.query.return_value.filter.return_value.first.return_value = MagicMock()

            result = await upload_csv(file=mock_upload_file, db=mock_db)
            assert len(result['db_duplicates']) == 1
            assert result['rows_inserted'] == 0
