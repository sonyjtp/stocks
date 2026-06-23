from enum import Enum


class TC(str, Enum):
    BUY = "Buy"
    SELL = "Sell"
    CDIV = "CDIV"
    SPL = "SPL"
    SPR = "SPR"
    SCXL = "SCXL"
    CONV = "CONV"
    ACH = "ACH"
    DCF = "DCF"
    INT = "INT"
    GOLD = "GOLD"
    MINT = "MINT"
    SLIP = "SLIP"
    DTAX = "DTAX"


# All ways shares enter a portfolio (buys, DRIP, splits, conversions, recalls)
ACQUISITION_CODES = frozenset({TC.BUY, TC.CDIV, TC.SPL, TC.SPR, TC.SCXL, TC.CONV})

# Acquisitions that carry a cost basis (used in FIFO P&L — CDIV handled separately)
PNL_ACQUISITION_CODES = frozenset({TC.BUY, TC.CONV, TC.SPL, TC.SPR})

# Buy and Sell trades
TRADE_CODES = frozenset({TC.BUY, TC.SELL})

# All cash-movement codes shown on the Transfers page
TRANSFER_CODES = frozenset({TC.ACH, TC.DCF, TC.INT, TC.GOLD, TC.MINT, TC.SLIP, TC.DTAX})

# Cash deposits and withdrawals
DEPOSIT_CODES = frozenset({TC.ACH, TC.DCF})

# Interest-credit codes shown on Transfers page
INTEREST_CODES = frozenset({TC.MINT, TC.SLIP})

# Income codes counted in P&L (excludes MINT which is a margin fee, not income)
INCOME_CODES = frozenset({TC.INT, TC.SLIP})

# Fee codes
FEE_CODES = frozenset({TC.GOLD, TC.MINT})
