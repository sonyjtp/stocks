import csv
from datetime import datetime
from decimal import Decimal
from io import StringIO
from typing import List, Dict, Any

def parse_amount(amount_str: str) -> Decimal:
    """Convert Robinhood amount format to Decimal. Parentheses = negative."""
    if not amount_str or amount_str.strip() == '-':
        return Decimal('0')

    # Remove parentheses and convert to negative if enclosed
    is_negative = '(' in amount_str and ')' in amount_str
    cleaned = amount_str.replace('(', '').replace(')', '').replace('$', '').replace(',', '').strip()

    if not cleaned:
        return Decimal('0')

    value = Decimal(cleaned)
    return -value if is_negative else value

def parse_decimal(value_str: str) -> Decimal:
    """Convert numeric string to Decimal."""
    if not value_str or value_str.strip() == '-':
        return None
    cleaned = value_str.replace('$', '').replace(',', '').strip()
    if not cleaned:
        return None
    return Decimal(cleaned)

def parse_date(date_str: str) -> datetime.date:
    """Parse date string in M/D/YYYY format."""
    if not date_str or date_str.strip() == '-':
        return None
    return datetime.strptime(date_str.strip(), '%m/%d/%Y').date()

def parse_robinhood_csv(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse Robinhood CSV export and return list of transaction dicts.
    Handles multi-line CSV rows (CUSIP descriptions).
    """
    f = StringIO(csv_content)
    reader = csv.DictReader(f)
    transactions = []

    for row in reader:
        if not row.get('Activity Date'):
            continue

        trans = {
            'broker': 'robinhood',
            'activity_date': parse_date(row.get('Activity Date', '')),
            'process_date': parse_date(row.get('Process Date', '')),
            'settle_date': parse_date(row.get('Settle Date', '')),
            'ticker': row.get('Instrument', '').strip() or None,
            'description': row.get('Description', '').strip(),
            'trans_code': row.get('Trans Code', '').strip(),
            'quantity': parse_decimal(row.get('Quantity', '')),
            'price': parse_decimal(row.get('Price', '')),
            'amount': parse_amount(row.get('Amount', '0')),
        }
        transactions.append(trans)

    return transactions
