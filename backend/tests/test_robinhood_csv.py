from datetime import date
from decimal import Decimal

from app.parsers.robinhood import parse_amount, parse_date, parse_decimal, parse_robinhood_csv

_HEADER = (
    "Activity Date,Process Date,Settle Date,"
    "Instrument,Description,Trans Code,Quantity,Price,Amount\n"
)

# ---------------------------------------------------------------------------
# parse_amount
# ---------------------------------------------------------------------------


class TestParseAmount:
    def test_plain_positive(self):
        assert parse_amount("1500.00") == Decimal("1500.00")

    def test_dollar_sign(self):
        assert parse_amount("$1,500.00") == Decimal("1500.00")

    def test_negative_parentheses(self):
        assert parse_amount("($1,500.00)") == Decimal("-1500.00")

    def test_negative_plain_parentheses(self):
        assert parse_amount("(500)") == Decimal("-500")

    def test_empty_string(self):
        assert parse_amount("") == Decimal("0")

    def test_dash(self):
        assert parse_amount("-") == Decimal("0")

    def test_none_like_blank(self):
        assert parse_amount("   ") == Decimal("0")

    def test_with_commas(self):
        assert parse_amount("10,000.50") == Decimal("10000.50")

    def test_zero(self):
        assert parse_amount("0") == Decimal("0")

    def test_invalid_returns_zero(self):
        assert parse_amount("abc") == Decimal("0")


# ---------------------------------------------------------------------------
# parse_decimal
# ---------------------------------------------------------------------------


class TestParseDecimal:
    def test_plain_number(self):
        assert parse_decimal("150.00") == Decimal("150.00")

    def test_dollar_sign(self):
        assert parse_decimal("$150.00") == Decimal("150.00")

    def test_comma(self):
        assert parse_decimal("1,500.00") == Decimal("1500.00")

    def test_empty_returns_none(self):
        assert parse_decimal("") is None

    def test_dash_returns_none(self):
        assert parse_decimal("-") is None

    def test_dot_only_returns_none(self):
        assert parse_decimal(".") is None

    def test_invalid_returns_none(self):
        assert parse_decimal("abc") is None

    def test_integer(self):
        assert parse_decimal("10") == Decimal("10")

    def test_fractional(self):
        assert parse_decimal("0.021439") == Decimal("0.021439")


# ---------------------------------------------------------------------------
# parse_date
# ---------------------------------------------------------------------------


class TestParseDate:
    def test_m_d_yyyy(self):
        assert parse_date("1/15/2024") == date(2024, 1, 15)

    def test_mm_dd_yyyy(self):
        assert parse_date("12/31/2023") == date(2023, 12, 31)

    def test_m_d_yy(self):
        assert parse_date("1/15/24") == date(2024, 1, 15)

    def test_empty_returns_none(self):
        assert parse_date("") is None

    def test_dash_returns_none(self):
        assert parse_date("-") is None

    def test_invalid_returns_none(self):
        assert parse_date("not-a-date") is None

    def test_whitespace_stripped(self):
        assert parse_date("  1/15/2024  ") == date(2024, 1, 15)


# ---------------------------------------------------------------------------
# parse_robinhood_csv
# ---------------------------------------------------------------------------

SAMPLE_CSV = """\
Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
1/15/2024,1/15/2024,1/17/2024,AAPL,Apple Inc,Buy,10,$150.00,($1500.00)
1/20/2024,1/20/2024,1/22/2024,AAPL,Apple Inc,Sell,5,$160.00,$800.00
2/1/2024,2/1/2024,2/3/2024,,Cash Dividend AAPL,CDIV,,,$9.00
3/1/2024,3/1/2024,3/1/2024,,ACH Deposit,ACH,,,$500.00
"""


class TestParseRobinhoodCsv:
    def test_returns_list(self):
        result = parse_robinhood_csv(SAMPLE_CSV)
        assert isinstance(result, list)

    def test_correct_count(self):
        result = parse_robinhood_csv(SAMPLE_CSV)
        assert len(result) == 4

    def test_buy_transaction(self):
        result = parse_robinhood_csv(SAMPLE_CSV)
        buy = next(t for t in result if t["trans_code"] == "Buy")
        assert buy["ticker"] == "AAPL"
        assert buy["quantity"] == Decimal("10")
        assert buy["price"] == Decimal("150.00")
        assert buy["amount"] == Decimal("-1500.00")
        assert buy["activity_date"] == date(2024, 1, 15)
        assert buy["broker"] == "robinhood"

    def test_sell_transaction(self):
        result = parse_robinhood_csv(SAMPLE_CSV)
        sell = next(t for t in result if t["trans_code"] == "Sell")
        assert sell["amount"] == Decimal("800.00")
        assert sell["quantity"] == Decimal("5")

    def test_dividend_no_ticker(self):
        result = parse_robinhood_csv(SAMPLE_CSV)
        div = next(t for t in result if t["trans_code"] == "CDIV")
        assert div["ticker"] is None
        assert div["amount"] == Decimal("9.00")

    def test_ach_transaction(self):
        result = parse_robinhood_csv(SAMPLE_CSV)
        ach = next(t for t in result if t["trans_code"] == "ACH")
        assert ach["ticker"] is None
        assert ach["amount"] == Decimal("500.00")

    def test_empty_activity_date_skipped(self):
        result = parse_robinhood_csv(_HEADER + ",,,AAPL,Apple,Buy,1,$100,-$100\n")
        assert len(result) == 0

    def test_empty_csv_returns_empty_list(self):
        result = parse_robinhood_csv(_HEADER)
        assert result == []

    def test_all_required_keys_present(self):
        result = parse_robinhood_csv(SAMPLE_CSV)
        required = {
            "broker",
            "activity_date",
            "process_date",
            "settle_date",
            "ticker",
            "description",
            "trans_code",
            "quantity",
            "price",
            "amount",
        }
        for tx in result:
            assert required.issubset(tx.keys())

    def test_fractional_shares(self):
        row = "8/14/2020,8/14/2020,8/16/2020,AAPL,Apple Inc,Buy,0.021439,$458.97,($9.84)\n"
        csv = _HEADER + row
        result = parse_robinhood_csv(csv)
        assert len(result) == 1
        assert result[0]["quantity"] == Decimal("0.021439")
