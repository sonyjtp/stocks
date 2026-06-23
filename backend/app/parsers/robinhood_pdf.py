import re
import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

import pdfplumber
import requests
from pydantic import ValidationError

from ..logger import get_logger
from ..models import TC, TRADE_CODES, TransactionCreate

logger = get_logger(__name__)

# In-process cache so repeated uploads don't re-query the same CUSIPs
_cusip_cache: Dict[str, Optional[str]] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_amount(s: str) -> Decimal:
    if not s or s.strip() in ["-", ""]:
        return Decimal("0")
    try:
        return Decimal(s.replace("$", "").replace(",", "").strip())
    except Exception:
        return Decimal("0")


def parse_decimal(s: str) -> Optional[Decimal]:
    if not s or s.strip() in ["-", ""]:
        return None
    try:
        return Decimal(s.replace("$", "").replace(",", "").strip())
    except Exception:
        return None


def parse_date(s: str) -> Optional[date]:
    if not s or s.strip() == "-":
        return None
    s = s.strip()
    for fmt in ("%m/%d/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def extract_cusip(text: str) -> Optional[str]:
    """Pull a 9-char CUSIP out of description text."""
    m = re.search(r"CUSIP[:\s]+([A-Z0-9]{9})", text, re.IGNORECASE)
    return m.group(1).upper() if m else None


def is_real_ticker(text: str) -> bool:
    """True if text looks like an exchange ticker (1-5 uppercase letters)."""
    return bool(text) and 1 <= len(text) <= 5 and text.isalpha() and text.isupper()


def extract_ticker_from_text(text: str) -> Optional[str]:
    """
    Return a real ticker if one is embedded in the description text.
    Skips known non-ticker words. Returns None if only a company name is found.
    """
    skip = {
        "M",
        "C",
        "D",
        "A",
        "B",
        "AND",
        "OF",
        "THE",
        "IN",
        "AT",
        "COMMON",
        "STOCK",
        "CORP",
        "CORPORATION",
        "INC",
        "INCORPORATED",
        "LLC",
        "LP",
        "LTD",
        "LIMITED",
        "CO",
        "COMPANY",
        "UNITS",
        "PARTNERSHIP",
        "CLASS",
        "MARGIN",
        "UNSOLICITED",
        "CUSIP",
        "ADR",
        "DEPOSIT",
        "FEE",
        "ACH",
        "GOLD",
    }
    for word in text.split():
        clean = word.replace(".", "").replace(",", "").strip()
        if clean and is_real_ticker(clean) and clean not in skip:
            return clean
    return None


# ---------------------------------------------------------------------------
# OpenFIGI CUSIP → ticker lookup
# ---------------------------------------------------------------------------


def batch_lookup_cusips(cusips: List[str]) -> Dict[str, str]:
    """
    Look up ticker symbols for a list of CUSIPs via the OpenFIGI API.
    Caches results so the same CUSIP is never looked up twice.
    Returns {cusip: ticker} for those that resolved.
    """
    to_fetch = [c for c in cusips if c not in _cusip_cache]

    if to_fetch:
        batch_size = 100
        for batch_start in range(0, len(to_fetch), batch_size):
            batch = to_fetch[batch_start : batch_start + batch_size]
            payload = [{"idType": "ID_CUSIP", "idValue": c} for c in batch]
            try:
                resp = requests.post(
                    "https://api.openfigi.com/v3/mapping",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=15,
                )
                if resp.ok:
                    for j, item in enumerate(resp.json()):
                        cusip = batch[j]
                        ticker = None
                        if item.get("data"):
                            # Prefer US equity exchange codes
                            for entry in item["data"]:
                                if entry.get("exchCode") in ("US", "UW", "UN", "UA", "UR", "UQ"):
                                    ticker = entry.get("ticker")
                                    break
                            if not ticker:
                                ticker = item["data"][0].get("ticker")
                        _cusip_cache[cusip] = ticker  # cache even if None
            except Exception:
                pass

            if batch_start + batch_size < len(to_fetch):
                time.sleep(0.4)  # stay under the free-tier rate limit

    return {c: _cusip_cache[c] for c in cusips if _cusip_cache.get(c)}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def parse_robinhood_pdf(pdf_path: str) -> List[TransactionCreate]:
    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = "\n".join((page.extract_text() or "") for page in pdf.pages)
    except Exception as e:
        raise ValueError(f"Failed to open PDF: {e}")

    transactions = _extract_transactions_from_text(full_text)

    # -----------------------------------------------------------------------
    # CUSIP → ticker resolution for any transaction that still lacks a real ticker
    # -----------------------------------------------------------------------
    cusips_needed = list(
        {
            tx["_cusip"]
            for tx in transactions
            if tx.get("_cusip") and not is_real_ticker(tx.get("ticker") or "")
        }
    )

    if cusips_needed:
        ticker_map = batch_lookup_cusips(cusips_needed)
        for tx in transactions:
            cusip = tx.get("_cusip")
            if cusip and not is_real_ticker(tx.get("ticker") or ""):
                tx["ticker"] = ticker_map.get(cusip)  # None if not found

    # Strip the internal helper field and convert to Pydantic models
    result = []
    for tx in transactions:
        tx.pop("_cusip", None)
        try:
            result.append(TransactionCreate(**tx))
        except ValidationError as e:
            logger.warning(f"Skipping malformed PDF transaction: {e}")

    return result


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------


def _extract_transactions_from_text(text: str) -> List[Dict[str, Any]]:
    transactions = []
    lines = text.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i].strip()
        i += 1

        # ── New format: "BOUGHT/SOLD/ACH  MM/DD/YY  ..." ──────────────────
        m = re.match(r"^(BOUGHT|SOLD|ACH)\s+(\d{1,2}/\d{1,2}/\d{2})\s+(.+)$", line)
        if m:
            trans_type, date_str, rest = m.groups()
            activity_date = parse_date(date_str)
            if activity_date:
                tx = _parse_new_format(trans_type, date_str, rest)
                if tx:
                    transactions.append(tx)
            continue

        # ── 2019 format: company-name line, then "Margin Buy/Sell ..." ─────
        if line and not re.match(r"^\d", line) and i < len(lines):
            next_line = lines[i].strip()
            m2 = re.match(
                r"^(Margin\s+Buy|Margin\s+Sell|ACH\s+Deposit|Gold\s+Fee|.*?Buy|.*?Sell)"
                r"\s+.*?(\d{1,2}/\d{1,2}/\d{4}|\d{1,2}/\d{1,2}/\d{2})\s+(.*)$",
                next_line,
                re.IGNORECASE,
            )
            if m2:
                type_str, date_str, numeric_part = m2.groups()
                activity_date = parse_date(date_str)
                if activity_date:
                    # Include CUSIP line if it follows
                    description = line
                    if i + 1 < len(lines):
                        after = lines[i + 1].strip()
                        if after and not re.match(r"^(Margin|ACH|Gold)", after, re.IGNORECASE):
                            description += " " + after

                    if "Buy" in type_str:
                        trans_type = "BOUGHT"
                    elif "Sell" in type_str:
                        trans_type = "SOLD"
                    elif "ACH" in type_str:
                        trans_type = "ACH"
                    else:
                        trans_type = "GOLD"

                    tx = _parse_2019_format(trans_type, description, date_str, numeric_part)
                    if tx:
                        transactions.append(tx)
                    i += 1
                    continue

    return transactions


# ---------------------------------------------------------------------------
# Per-format parsers
# ---------------------------------------------------------------------------


def _parse_new_format(trans_type: str, date_str: str, rest: str) -> Optional[Dict[str, Any]]:
    activity_date = parse_date(date_str)
    if not activity_date:
        return None

    parts = rest.split()
    description_parts, numeric_parts = [], []

    for part in parts:
        if re.match(r"^\$?[\d,.]+$", part):
            numeric_parts.append(part)
        else:
            if numeric_parts:
                break
            description_parts.append(part)

    description = " ".join(description_parts)
    amount = parse_amount(numeric_parts[-1]) if numeric_parts else Decimal("0")
    price = parse_decimal(numeric_parts[-2]) if len(numeric_parts) >= 2 else None
    qty = parse_decimal(numeric_parts[-3]) if len(numeric_parts) >= 3 else None

    return _build_transaction(trans_type, activity_date, description, qty, price, amount)


def _parse_2019_format(
    trans_type: str, description: str, date_str: str, numeric_line: str
) -> Optional[Dict[str, Any]]:
    activity_date = parse_date(date_str)
    if not activity_date:
        return None

    numeric_values = [p for p in numeric_line.split() if re.match(r"^\$?[\d,.]+$", p)]
    amount = parse_amount(numeric_values[-1]) if numeric_values else Decimal("0")
    price = parse_decimal(numeric_values[-2]) if len(numeric_values) >= 2 else None
    qty = parse_decimal(numeric_values[-3]) if len(numeric_values) >= 3 else None

    return _build_transaction(trans_type, activity_date, description, qty, price, amount)


def _build_transaction(
    trans_type: str,
    activity_date,
    description: str,
    qty,
    price,
    amount: Decimal,
) -> Dict[str, Any]:
    # Determine trans_code and sign of amount
    if trans_type == "BOUGHT":
        trans_code = TC.BUY
        if amount > 0:
            amount = -amount
        ticker = extract_ticker_from_text(description)
    elif trans_type == "SOLD":
        trans_code = TC.SELL
        ticker = extract_ticker_from_text(description)
    elif trans_type == "ACH":
        trans_code = TC.ACH
        ticker = None
    else:
        trans_code = trans_type  # GOLD, MINT, etc.
        ticker = None

    cusip = extract_cusip(description) if trans_code in TRADE_CODES else None

    return {
        "broker": "robinhood",
        "activity_date": activity_date,
        "process_date": None,
        "settle_date": None,
        "ticker": ticker,
        "description": description,
        "trans_code": trans_code,
        "quantity": qty,
        "price": price,
        "amount": amount,
        "_cusip": cusip,  # internal; stripped before returning
    }
