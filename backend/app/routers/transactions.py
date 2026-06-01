from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import date
from typing import List
from ..database import get_db
from ..models import Transaction
from ..schemas import TransactionResponse
from ..cache import get_cached, set_cached

router = APIRouter(prefix="/api", tags=["transactions"])

@router.get("/transactions", response_model=List[TransactionResponse])
def get_transactions(
    broker: str = "robinhood",
    start: date = Query(None),
    end: date = Query(None),
    db: Session = Depends(get_db)
):
    """Get transaction history for a broker (Buy, Sell, CDIV only)."""
    # Cache key
    cache_key = f"transactions:{broker}:{start}:{end}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    query = db.query(Transaction).filter(
        Transaction.broker == broker,
        Transaction.trans_code.in_(['Buy', 'Sell', 'CDIV'])
    )

    if start:
        query = query.filter(Transaction.activity_date >= start)
    if end:
        query = query.filter(Transaction.activity_date <= end)

    results = query.order_by(Transaction.activity_date.desc()).all()

    # Cache for 5 minutes
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
    ])

    return results
