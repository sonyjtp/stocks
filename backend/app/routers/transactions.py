from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..cache import CACHE_TTL_SHORT, get_cached, invalidate_cache, set_cached
from ..database import get_db
from ..logger import get_logger
from ..models import TC, Transaction, TransactionResponse

logger = get_logger(__name__)
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
    logger.debug(
        f"→ get_transactions(broker={broker!r}, start={start}, end={end},"
        f" ticker={ticker!r}, trans_code={trans_code!r})"
    )
    cache_key = f"transactions:{broker}:{start}:{end}:{ticker}:{trans_code}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"← get_transactions: cache hit ({len(cached)} rows)")
        return cached

    logger.debug("get_transactions: cache miss — querying database")
    query = db.query(Transaction).filter(
        Transaction.broker == broker,
        Transaction.trans_code.in_([TC.BUY, TC.SELL, TC.CDIV, TC.CONV, TC.SPL]),
    )

    if start:
        query = query.filter(Transaction.activity_date >= start)
        logger.debug(f"get_transactions: filtering start >= {start}")
    if end:
        query = query.filter(Transaction.activity_date <= end)
        logger.debug(f"get_transactions: filtering end <= {end}")
    if ticker:
        query = query.filter(Transaction.ticker == ticker)
        logger.debug(f"get_transactions: filtering ticker={ticker!r}")
    if trans_code:
        query = query.filter(Transaction.trans_code == trans_code)
        logger.debug(f"get_transactions: filtering trans_code={trans_code!r}")

    results = query.order_by(Transaction.activity_date.desc()).all()
    ticker_suffix = f", ticker={ticker}" if ticker else ""
    logger.info(f"get_transactions: {len(results)} rows for broker={broker!r}{ticker_suffix}")

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
    logger.debug(f"→ bulk_delete_transactions(ids={request.ids})")
    if not request.ids:
        logger.debug("← bulk_delete_transactions: empty id list, nothing to delete")
        return
    deleted = (
        db.query(Transaction)
        .filter(Transaction.id.in_(request.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    invalidate_cache()
    logger.info(f"bulk_delete_transactions: deleted {deleted} rows, cache invalidated")


@router.delete("/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    logger.debug(f"→ delete_transaction(id={transaction_id})")
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        logger.warning(f"delete_transaction: id={transaction_id} not found")
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
    invalidate_cache()
    logger.info(f"delete_transaction: id={transaction_id} deleted, cache invalidated")


@router.put("/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(transaction_id: int, body: TransactionUpdate, db: Session = Depends(get_db)):
    logger.debug(
        f"→ update_transaction(id={transaction_id},"
        f" ticker={body.ticker!r}, trans_code={body.trans_code!r})"
    )
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        logger.warning(f"update_transaction: id={transaction_id} not found")
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
    logger.info(
        f"update_transaction: id={transaction_id} updated"
        f" (ticker={tx.ticker}, trans_code={tx.trans_code}), cache invalidated"
    )
    return tx
