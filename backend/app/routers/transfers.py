from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from decimal import Decimal
from typing import List
from ..database import get_db
from ..models import Transaction
from ..schemas import TransactionResponse, TransfersSummary
from ..cache import get_cached, set_cached

router = APIRouter(prefix="/api", tags=["transfers"])

@router.get("/transfers", response_model=List[TransactionResponse])
def get_transfers(
    broker: str = "robinhood",
    start: date = Query(None),
    end: date = Query(None),
    db: Session = Depends(get_db)
):
    """Get ACH, interest, and fee transactions."""
    cache_key = f"transfers:{broker}:{start}:{end}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    query = db.query(Transaction).filter(
        Transaction.broker == broker,
        Transaction.trans_code.in_(['ACH', 'INT', 'GOLD', 'MINT'])
    )

    if start:
        query = query.filter(Transaction.activity_date >= start)
    if end:
        query = query.filter(Transaction.activity_date <= end)

    results = query.order_by(Transaction.activity_date.desc()).all()

    set_cached(cache_key, [
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
    ], ttl=300)

    return results

@router.get("/report/transfers", response_model=TransfersSummary)
def get_transfers_summary(
    broker: str = "robinhood",
    start: date = Query(None),
    end: date = Query(None),
    db: Session = Depends(get_db)
):
    """Get transfers and fees summary."""
    cache_key = f"transfers_summary:{broker}:{start}:{end}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    # ACH deposits (positive amounts)
    ach_deposits = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker,
        Transaction.trans_code == 'ACH',
        Transaction.amount > 0
    )
    if start:
        ach_deposits = ach_deposits.filter(Transaction.activity_date >= start)
    if end:
        ach_deposits = ach_deposits.filter(Transaction.activity_date <= end)
    ach_deposits = ach_deposits.scalar() or Decimal('0')

    # ACH withdrawals (negative amounts)
    ach_withdrawals = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker,
        Transaction.trans_code == 'ACH',
        Transaction.amount < 0
    )
    if start:
        ach_withdrawals = ach_withdrawals.filter(Transaction.activity_date >= start)
    if end:
        ach_withdrawals = ach_withdrawals.filter(Transaction.activity_date <= end)
    ach_withdrawals = ach_withdrawals.scalar() or Decimal('0')
    ach_withdrawals = -ach_withdrawals  # Convert negative to positive

    # Interest earned
    interest = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker,
        Transaction.trans_code == 'INT'
    )
    if start:
        interest = interest.filter(Transaction.activity_date >= start)
    if end:
        interest = interest.filter(Transaction.activity_date <= end)
    interest = interest.scalar() or Decimal('0')

    # Fees paid (GOLD + MINT, which are negative)
    fees = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker,
        Transaction.trans_code.in_(['GOLD', 'MINT'])
    )
    if start:
        fees = fees.filter(Transaction.activity_date >= start)
    if end:
        fees = fees.filter(Transaction.activity_date <= end)
    fees = fees.scalar() or Decimal('0')
    fees = -fees  # Convert negative to positive

    result = TransfersSummary(
        ach_deposits=float(ach_deposits),
        ach_withdrawals=float(ach_withdrawals),
        interest_earned=float(interest),
        fees_paid=float(fees)
    )

    set_cached(cache_key, result.model_dump(), ttl=300)
    return result
