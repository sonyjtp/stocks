import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import patch, MagicMock

from app.parsers.robinhood_pdf import (
    parse_amount, parse_decimal, parse_date,
    extract_cusip, is_real_ticker, extract_ticker_from_text,
    _extract_transactions_from_text, _parse_new_format, _parse_2019_format,
    _build_transaction, batch_lookup_cusips, _cusip_cache,
)


# ---------------------------------------------------------------------------
# parse_amount
# ---------------------------------------------------------------------------

class TestParseAmount:
    def test_plain_positive(self):
        assert parse_amount("1500.00") == Decimal("1500.00")

    def test_empty_returns_zero(self):
        assert parse_amount("") == Decimal("0")

    def test_dash_returns_zero(self):
        assert parse_amount("-") == Decimal("0")

    def test_dollar_sign(self):
        assert parse_amount("$775.00") == Decimal("775.00")

    def test_comma(self):
        assert parse_amount("1,234.56") == Decimal("1234.56")

    def test_invalid_returns_zero(self):
        assert parse_amount("N/A") == Decimal("0")


# ---------------------------------------------------------------------------
# parse_decimal
# ---------------------------------------------------------------------------

class TestParseDecimal:
    def test_plain(self):
        assert parse_decimal("150.00") == Decimal("150.00")

    def test_empty_returns_none(self):
        assert parse_decimal("") is None

    def test_dash_returns_none(self):
        assert parse_decimal("-") is None

    def test_dollar_sign(self):
        assert parse_decimal("$150.00") == Decimal("150.00")

    def test_invalid_returns_none(self):
        assert parse_decimal("N/A") is None


# ---------------------------------------------------------------------------
# parse_date
# ---------------------------------------------------------------------------

class TestParseDate:
    def test_two_digit_year(self):
        assert parse_date("1/15/24") == date(2024, 1, 15)

    def test_four_digit_year(self):
        assert parse_date("12/31/2019") == date(2019, 12, 31)

    def test_empty_returns_none(self):
        assert parse_date("") is None

    def test_dash_returns_none(self):
        assert parse_date("-") is None

    def test_invalid_returns_none(self):
        assert parse_date("not-a-date") is None


# ---------------------------------------------------------------------------
# extract_cusip
# ---------------------------------------------------------------------------

class TestExtractCusip:
    def test_standard_format(self):
        assert extract_cusip("Apple CUSIP: 037833100") == "037833100"

    def test_space_separator(self):
        assert extract_cusip("CUSIP 037833100") == "037833100"

    def test_case_insensitive(self):
        assert extract_cusip("cusip: 037833100") == "037833100"

    def test_no_cusip_returns_none(self):
        assert extract_cusip("Apple Inc common stock") is None

    def test_embedded_in_longer_text(self):
        text = "Margin Buy  AMZN Amazon.com\nCUSIP: 023135106\n10 300.00 3000.00"
        assert extract_cusip(text) == "023135106"

    def test_alphanumeric_cusip(self):
        assert extract_cusip("CUSIP: 46267X108") == "46267X108"


# ---------------------------------------------------------------------------
# is_real_ticker
# ---------------------------------------------------------------------------

class TestIsRealTicker:
    def test_valid_1_char(self):
        assert is_real_ticker("F") is True

    def test_valid_4_chars(self):
        assert is_real_ticker("AAPL") is True

    def test_valid_5_chars(self):
        assert is_real_ticker("GOOGL") is True

    def test_too_long(self):
        assert is_real_ticker("TOOLNG") is False

    def test_empty(self):
        assert is_real_ticker("") is False

    def test_lowercase_rejected(self):
        assert is_real_ticker("aapl") is False

    def test_mixed_case_rejected(self):
        assert is_real_ticker("Aapl") is False

    def test_digits_rejected(self):
        assert is_real_ticker("AAP1") is False

    def test_none_rejected(self):
        assert is_real_ticker(None) is False


# ---------------------------------------------------------------------------
# extract_ticker_from_text
# ---------------------------------------------------------------------------

class TestExtractTickerFromText:
    def test_returns_ticker_from_description(self):
        assert extract_ticker_from_text("AAPL Apple Inc") == "AAPL"

    def test_company_name_only_returns_none(self):
        # "Apple" is 5 chars but lowercase after normalisation — actually "APPLE"
        # is 5 chars uppercase alpha, so it would pass is_real_ticker.
        # The skip list is the guard for common words.
        assert extract_ticker_from_text("Apple Inc Margin Buy") is None

    def test_skips_common_words(self):
        # AND, THE, INC etc. are in the skip set
        assert extract_ticker_from_text("INC AND THE CORP") is None

    def test_extracts_from_mixed_text(self):
        result = extract_ticker_from_text("MSFT Microsoft Corporation common stock")
        assert result == "MSFT"

    def test_none_when_no_real_ticker(self):
        assert extract_ticker_from_text("Margin Buy 12/31/2019") is None

    def test_empty_string(self):
        assert extract_ticker_from_text("") is None


# ---------------------------------------------------------------------------
# _build_transaction
# ---------------------------------------------------------------------------

class TestBuildTransaction:
    def _call(self, trans_type, desc="Apple Inc CUSIP: 037833100",
              qty=Decimal("10"), price=Decimal("150"), amount=Decimal("1500")):
        return _build_transaction(trans_type, date(2024, 1, 15), desc, qty, price, amount)

    def test_bought_sets_buy_code(self):
        tx = self._call("BOUGHT")
        assert tx["trans_code"] == "Buy"

    def test_bought_forces_negative_amount(self):
        tx = self._call("BOUGHT", amount=Decimal("1500"))
        assert tx["amount"] < 0

    def test_bought_already_negative_stays_negative(self):
        tx = self._call("BOUGHT", amount=Decimal("-1500"))
        assert tx["amount"] == Decimal("-1500")

    def test_sold_sets_sell_code(self):
        tx = self._call("SOLD")
        assert tx["trans_code"] == "Sell"

    def test_ach_sets_ach_code_no_ticker(self):
        tx = self._call("ACH", desc="ACH Deposit")
        assert tx["trans_code"] == "ACH"
        assert tx["ticker"] is None

    def test_cusip_extracted_for_buy(self):
        tx = self._call("BOUGHT", desc="Apple Inc CUSIP: 037833100")
        assert tx["_cusip"] == "037833100"

    def test_no_cusip_for_ach(self):
        tx = self._call("ACH", desc="ACH Deposit CUSIP: 037833100")
        assert tx["_cusip"] is None

    def test_broker_always_robinhood(self):
        tx = self._call("BOUGHT")
        assert tx["broker"] == "robinhood"

    def test_required_keys_present(self):
        tx = self._call("BOUGHT")
        for key in ("broker", "activity_date", "ticker", "description",
                    "trans_code", "quantity", "price", "amount", "_cusip"):
            assert key in tx


# ---------------------------------------------------------------------------
# _parse_new_format  (BOUGHT/SOLD/ACH lines)
# ---------------------------------------------------------------------------

class TestParseNewFormat:
    def test_buy_parses_correctly(self):
        tx = _parse_new_format("BOUGHT", "1/15/24", "AAPL Apple Inc 10 150.00 1500.00")
        assert tx is not None
        assert tx["trans_code"] == "Buy"
        assert tx["activity_date"] == date(2024, 1, 15)
        assert tx["amount"] == Decimal("-1500.00")

    def test_sell_positive_amount(self):
        tx = _parse_new_format("SOLD", "1/20/24", "AAPL Apple Inc 5 160.00 800.00")
        assert tx["trans_code"] == "Sell"
        assert tx["amount"] == Decimal("800.00")

    def test_ach_no_ticker(self):
        tx = _parse_new_format("ACH", "3/1/24", "Deposit 500.00")
        assert tx["trans_code"] == "ACH"
        assert tx["ticker"] is None

    def test_invalid_date_returns_none(self):
        tx = _parse_new_format("BOUGHT", "not-a-date", "AAPL 10 150 1500")
        assert tx is None

    def test_missing_numeric_parts_still_returns_tx(self):
        tx = _parse_new_format("BOUGHT", "1/15/24", "AAPL Apple Inc")
        assert tx is not None
        assert tx["amount"] == Decimal("0")


# ---------------------------------------------------------------------------
# _parse_2019_format  (Margin Buy/Sell lines)
# ---------------------------------------------------------------------------

class TestParse2019Format:
    def test_margin_buy(self):
        tx = _parse_2019_format("BOUGHT", "Amazon.com CUSIP: 023135106",
                                "12/15/2019", "10 1800.00 18000.00")
        assert tx is not None
        assert tx["trans_code"] == "Buy"
        assert tx["amount"] == Decimal("-18000.00")
        assert tx["_cusip"] == "023135106"

    def test_margin_sell(self):
        tx = _parse_2019_format("SOLD", "Amazon.com", "12/20/2019", "5 1900.00 9500.00")
        assert tx["trans_code"] == "Sell"
        assert tx["amount"] == Decimal("9500.00")

    def test_invalid_date_returns_none(self):
        tx = _parse_2019_format("BOUGHT", "Apple", "bad-date", "10 150 1500")
        assert tx is None

    def test_qty_and_price_parsed(self):
        tx = _parse_2019_format("BOUGHT", "Apple CUSIP: 037833100",
                                "3/15/2019", "10 150.00 1500.00")
        assert tx["quantity"] == Decimal("10")
        assert tx["price"] == Decimal("150.00")


# ---------------------------------------------------------------------------
# _extract_transactions_from_text
# ---------------------------------------------------------------------------

class TestExtractTransactionsFromText:
    def test_new_format_bought(self):
        text = "BOUGHT 1/15/24 AAPL Apple Inc 10 150.00 1500.00"
        txs = _extract_transactions_from_text(text)
        assert len(txs) == 1
        assert txs[0]["trans_code"] == "Buy"

    def test_new_format_sold(self):
        text = "SOLD 1/20/24 AAPL Apple Inc 5 160.00 800.00"
        txs = _extract_transactions_from_text(text)
        assert len(txs) == 1
        assert txs[0]["trans_code"] == "Sell"

    def test_new_format_ach(self):
        text = "ACH 3/1/24 Deposit 500.00"
        txs = _extract_transactions_from_text(text)
        assert len(txs) == 1
        assert txs[0]["trans_code"] == "ACH"

    def test_multiple_new_format_lines(self):
        text = (
            "BOUGHT 1/15/24 AAPL Apple Inc 10 150.00 1500.00\n"
            "SOLD 1/20/24 AAPL Apple Inc 5 160.00 800.00\n"
            "ACH 3/1/24 Deposit 500.00\n"
        )
        txs = _extract_transactions_from_text(text)
        assert len(txs) == 3

    def test_2019_format_margin_buy(self):
        text = (
            "Amazon.com\n"
            "Margin Buy 1 10/15/2019 10 1800.00 18000.00\n"
        )
        txs = _extract_transactions_from_text(text)
        assert len(txs) == 1
        assert txs[0]["trans_code"] == "Buy"

    def test_empty_text(self):
        assert _extract_transactions_from_text("") == []

    def test_irrelevant_lines_ignored(self):
        text = (
            "Robinhood Financial LLC\n"
            "Account Statement\n"
            "January 2024\n"
            "BOUGHT 1/15/24 AAPL Apple 10 150.00 1500.00\n"
        )
        txs = _extract_transactions_from_text(text)
        assert len(txs) == 1


# ---------------------------------------------------------------------------
# batch_lookup_cusips  (OpenFIGI mocked)
# ---------------------------------------------------------------------------

class TestBatchLookupCusips:
    def setup_method(self):
        _cusip_cache.clear()

    def test_returns_ticker_for_known_cusip(self):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.json.return_value = [
            {"data": [{"exchCode": "UW", "ticker": "AAPL"}]}
        ]
        with patch("app.parsers.robinhood_pdf.requests.post", return_value=mock_response):
            result = batch_lookup_cusips(["037833100"])
        assert result == {"037833100": "AAPL"}

    def test_prefers_us_exchange_codes(self):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.json.return_value = [
            {"data": [
                {"exchCode": "LN", "ticker": "AAPL.L"},
                {"exchCode": "UW", "ticker": "AAPL"},
            ]}
        ]
        with patch("app.parsers.robinhood_pdf.requests.post", return_value=mock_response):
            result = batch_lookup_cusips(["037833100"])
        assert result["037833100"] == "AAPL"

    def test_falls_back_to_first_entry_if_no_us_exchange(self):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.json.return_value = [
            {"data": [{"exchCode": "LN", "ticker": "AAPL.L"}]}
        ]
        with patch("app.parsers.robinhood_pdf.requests.post", return_value=mock_response):
            result = batch_lookup_cusips(["037833100"])
        assert result.get("037833100") == "AAPL.L"

    def test_unknown_cusip_not_in_result(self):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.json.return_value = [{"data": []}]
        with patch("app.parsers.robinhood_pdf.requests.post", return_value=mock_response):
            result = batch_lookup_cusips(["UNKNOWN00"])
        assert "UNKNOWN00" not in result

    def test_cached_cusip_not_re_fetched(self):
        _cusip_cache["037833100"] = "AAPL"
        with patch("app.parsers.robinhood_pdf.requests.post") as mock_post:
            result = batch_lookup_cusips(["037833100"])
            mock_post.assert_not_called()
        assert result["037833100"] == "AAPL"

    def test_api_error_handled_gracefully(self):
        with patch("app.parsers.robinhood_pdf.requests.post", side_effect=Exception("timeout")):
            result = batch_lookup_cusips(["037833100"])
        assert isinstance(result, dict)

    def test_non_ok_response_handled(self):
        mock_response = MagicMock()
        mock_response.ok = False
        with patch("app.parsers.robinhood_pdf.requests.post", return_value=mock_response):
            result = batch_lookup_cusips(["037833100"])
        assert isinstance(result, dict)
