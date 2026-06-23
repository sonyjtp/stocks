from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..cache import CACHE_TTL_SHORT, get_cached, invalidate_cache, set_cached
from ..database import get_db
from ..models import TC, Transaction, TransactionResponse

router = APIRouter(prefix="/api", tags=["transactions"])


@router.get("/transactions", response_model=List[TransactionResponse])
def get_transactions(
    broker: str = "robinhood",
    start: date = Query(None),
    end: date = Query(None),
    ticker: str = Query(None),
    trans_code: str = Query(None),
    db: Session = Depends(get_db),
):
    """Get transaction history for a broker (Buy, Sell, CDIV only)."""
    # Cache key
    cache_key = f"transactions:{broker}:{start}:{end}:{ticker}:{trans_code}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    query = db.query(Transaction).filter(
        Transaction.broker == broker,
        Transaction.trans_code.in_([TC.BUY, TC.SELL, TC.CDIV, TC.CONV, TC.SPL]),
    )

    if start:
        query = query.filter(Transaction.activity_date >= start)
    if end:
        query = query.filter(Transaction.activity_date <= end)
    if ticker:
        query = query.filter(Transaction.ticker == ticker)
    if trans_code:
        query = query.filter(Transaction.trans_code == trans_code)

    results = query.order_by(Transaction.activity_date.desc()).all()

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

    return results


class TransactionUpdate(BaseModel):
    activity_date: str
    ticker: Optional[str] = None
    description: str
    trans_code: str
    quantity: Optional[float] = None
    price: Optional[float] = None
    amount: float


class BulkDeleteRequest(BaseModel):
    ids: List[int]


@router.delete("/transactions", status_code=204)
def bulk_delete_transactions(request: BulkDeleteRequest, db: Session = Depends(get_db)):
    if not request.ids:
        return
    db.query(Transaction).filter(Transaction.id.in_(request.ids)).delete(synchronize_session=False)
    db.commit()
    invalidate_cache()


@router.delete("/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
    invalidate_cache()


@router.put("/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(transaction_id: int, body: TransactionUpdate, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    from datetime import datetime

    def parse_d(s):
        if not s:
            return None
        try:
            return datetime.strptime(s, "%Y-%m-%d").date()
        except Exception:
            return None

    tx.activity_date = parse_d(body.activity_date) or tx.activity_date
    tx.process_date = parse_d(body.activity_date) or tx.process_date
    tx.settle_date = parse_d(body.activity_date) or tx.settle_date
    tx.ticker = body.ticker.strip().upper() if body.ticker else None
    tx.description = body.description
    tx.trans_code = body.trans_code
    tx.quantity = Decimal(str(body.quantity)) if body.quantity is not None else None
    tx.price = Decimal(str(body.price)) if body.price is not None else None
    tx.amount = Decimal(str(body.amount))

    db.commit()
    db.refresh(tx)
    invalidate_cache()
    return tx
