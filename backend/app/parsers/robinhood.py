import csv
from datetime import datetime, date
from decimal import Decimal
from io import StringIO
from typing import List, Dict, Any

from backend.app.logger import get_logger

logger = get_logger(__name__)

def parse_amount(amount_str: str) -> Decimal:
    """Convert Robinhood amount format to Decimal. Parentheses = negative."""
    if not amount_str or amount_str.strip() == '-':
        return Decimal('0')

    # Remove parentheses and convert to negative if enclosed
    is_negative = '(' in amount_str and ')' in amount_str
    cleaned = amount_str.replace('(', '').replace(')', '').replace('$', '').replace(',', '').strip()

    if not cleaned or cleaned == '.':
        return Decimal('0')

    try:
        value = Decimal(cleaned)
        return -value if is_negative else value
    except ValueError:
        logger.warning(f'Could not convert {amount_str} to Decimal.')
        return Decimal('0')

def parse_decimal(value_str: str) -> Decimal | None:
    """Convert numeric string to Decimal."""
    if not value_str or value_str.strip() == '-':
        return None
    cleaned = value_str.replace('$', '').replace(',', '').strip()
    if not cleaned or cleaned == '.':
        return None
    try:
        return Decimal(cleaned)
    except ValueError :
        logger.warning(f'Could not convert {value_str} to Decimal.')
        return None

def parse_date(date_str: str) -> date | None:
    """Parse date string in M/D/YY or M/D/YYYY format."""
    if not date_str or date_str.strip() == '-':
        return None
    try:
        # Try M/D/YYYY first, then M/D/YY
        date_str = date_str.strip()
        try:
            return datetime.strptime(date_str, '%m/%d/%Y').date()
        except ValueError:
            return datetime.strptime(date_str, '%m/%d/%y').date()
    except:
        return None

def _col(row: dict, *keys: str, default: str = '') -> str:
    """Return the value of the first matching column name found in the row."""
    for key in keys:
        if key in row and row[key] is not None:
            return row[key]
    return default

def parse_robinhood_csv(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse Robinhood CSV export and return list of transaction dicts.
    Accepts both the standard Robinhood export column names and common
    alternate names (e.g. Type/Ticker/Total instead of Trans Code/Instrument/Amount).
    """
    f = StringIO(csv_content)
    reader = csv.DictReader(f)
    transactions = []

    for row in reader:
        if not _col(row, 'Activity Date'):
            continue

        trans = {
            'broker': 'robinhood',
            'activity_date': parse_date(_col(row, 'Activity Date')),
            'process_date': parse_date(_col(row, 'Process Date')),
            'settle_date': parse_date(_col(row, 'Settle Date')),
            'ticker': _col(row, 'Instrument', 'Ticker').strip() or None,
            'description': _col(row, 'Description').strip(),
            'trans_code': _col(row, 'Trans Code', 'Type').strip(),
            'quantity': parse_decimal(_col(row, 'Quantity')),
            'price': parse_decimal(_col(row, 'Price')),
            'amount': parse_amount(_col(row, 'Amount', 'Total') or '0'),
        }
        transactions.append(trans)

    return transactions
