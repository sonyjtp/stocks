from datetime import date
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..cache import CACHE_TTL_SHORT, get_cached, set_cached
from ..database import get_db
from ..logger import get_logger
from ..models import (
    DEPOSIT_CODES,
    INTEREST_CODES,
    TC,
    TRANSFER_CODES,
    Transaction,
    TransactionResponse,
    TransfersSummary,
)

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["transfers"])


@router.get("/transfers", response_model=List[TransactionResponse])
def get_transfers(
    broker: str = "robinhood",
    start: date = Query(None),
    end: date = Query(None),
    db: Session = Depends(get_db),
):
    """Get ACH, interest, and fee transactions."""
    logger.debug(f"→ get_transfers(broker={broker!r}, start={start}, end={end})")
    cache_key = f"transfers:{broker}:{start}:{end}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"← get_transfers: cache hit ({len(cached)} rows)")
        return cached
    logger.debug("get_transfers: cache miss — querying database")

    query = db.query(Transaction).filter(
        Transaction.broker == broker,
        Transaction.trans_code.in_(TRANSFER_CODES),
    )

    if start:
        query = query.filter(Transaction.activity_date >= start)
    if end:
        query = query.filter(Transaction.activity_date <= end)

    results = query.order_by(Transaction.activity_date.desc()).all()
    logger.info(f"get_transfers: {len(results)} transfer rows for broker={broker!r}")

    set_cached(
        cache_key,
        [
            {
                "id": t.id,
                "broker": t.broker,
                "activity_date": t.activity_date,
                "process_date": t.process_date,
                "settle_date": t.settle_date,
                "ticker": t.ticker,
                "description": t.description,
                "trans_code": t.trans_code,
                "quantity": float(t.quantity) if t.quantity else None,
                "price": float(t.price) if t.price else None,
                "amount": float(t.amount),
            }
            for t in results
        ],
        ttl=CACHE_TTL_SHORT,
    )
    logger.debug("← get_transfers: cached and returning")
    return results


@router.get("/report/transfers", response_model=TransfersSummary)
def get_transfers_summary(
    broker: str = "robinhood",
    start: date = Query(None),
    end: date = Query(None),
    db: Session = Depends(get_db),
):
    """Get transfers and fees summary."""
    logger.debug(f"→ get_transfers_summary(broker={broker!r}, start={start}, end={end})")
    cache_key = f"transfers_summary:{broker}:{start}:{end}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug("← get_transfers_summary: cache hit")
        return cached
    logger.debug("get_transfers_summary: cache miss — computing")

    # ACH / DCF deposits (positive amounts)
    ach_deposits = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker,
        Transaction.trans_code.in_(DEPOSIT_CODES),
        Transaction.amount > 0,
    )
    if start:
        ach_deposits = ach_deposits.filter(Transaction.activity_date >= start)
    if end:
        ach_deposits = ach_deposits.filter(Transaction.activity_date <= end)
    ach_deposits = ach_deposits.scalar() or Decimal("0")

    # ACH / DCF withdrawals (negative amounts)
    ach_withdrawals = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker,
        Transaction.trans_code.in_(DEPOSIT_CODES),
        Transaction.amount < 0,
    )
    if start:
        ach_withdrawals = ach_withdrawals.filter(Transaction.activity_date >= start)
    if end:
        ach_withdrawals = ach_withdrawals.filter(Transaction.activity_date <= end)
    ach_withdrawals = ach_withdrawals.scalar() or Decimal("0")
    ach_withdrawals = -ach_withdrawals  # Convert negative to positive

    # Interest earned: INT (positive) + MINT/SLIP (Robinhood stores negative, negate to get credit)
    int_sum = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker, Transaction.trans_code == TC.INT
    )
    if start:
        int_sum = int_sum.filter(Transaction.activity_date >= start)
    if end:
        int_sum = int_sum.filter(Transaction.activity_date <= end)
    int_sum = int_sum.scalar() or Decimal("0")

    mint_slip_sum = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker, Transaction.trans_code.in_(INTEREST_CODES)
    )
    if start:
        mint_slip_sum = mint_slip_sum.filter(Transaction.activity_date >= start)
    if end:
        mint_slip_sum = mint_slip_sum.filter(Transaction.activity_date <= end)
    mint_slip_sum = mint_slip_sum.scalar() or Decimal("0")
    interest = int_sum + abs(mint_slip_sum)

    # Fees paid: GOLD only (negative amounts)
    fees = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker, Transaction.trans_code == TC.GOLD
    )
    if start:
        fees = fees.filter(Transaction.activity_date >= start)
    if end:
        fees = fees.filter(Transaction.activity_date <= end)
    fees = fees.scalar() or Decimal("0")
    fees = -fees  # Convert negative to positive

    result = TransfersSummary(
        ach_deposits=float(ach_deposits),
        ach_withdrawals=float(ach_withdrawals),
        interest_earned=float(interest),
        fees_paid=float(fees),
    )

    set_cached(cache_key, result.model_dump(), ttl=CACHE_TTL_SHORT)
    logger.info(
        f"get_transfers_summary: deposits=${ach_deposits:.2f}, withdrawals=${ach_withdrawals:.2f}, "
        f"interest=${interest:.2f}, fees=${fees:.2f} — cached"
    )
    return result
