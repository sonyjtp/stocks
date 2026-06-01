from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from decimal import Decimal
from ..database import get_db
from ..models import Transaction
from ..schemas import PnLSummary
from ..cache import get_cached, set_cached

router = APIRouter(prefix="/api", tags=["pnl"])

@router.get("/report/pnl", response_model=PnLSummary)
def get_pnl_summary(
    broker: str = "robinhood",
    start: date = Query(None),
    end: date = Query(None),
    db: Session = Depends(get_db)
):
    """Get P&L summary with gross and net figures."""
    cache_key = f"pnl:{broker}:{start}:{end}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    query = db.query(Transaction).filter(Transaction.broker == broker)

    if start:
        query = query.filter(Transaction.activity_date >= start)
    if end:
        query = query.filter(Transaction.activity_date <= end)

    # Total invested (sum of all buy amounts, which are negative)
    buy_total = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker,
        Transaction.trans_code == 'Buy'
    )
    if start:
        buy_total = buy_total.filter(Transaction.activity_date >= start)
    if end:
        buy_total = buy_total.filter(Transaction.activity_date <= end)
    buy_total = buy_total.scalar() or Decimal('0')

    total_invested = -buy_total

    # Total received (sum of all sell amounts, which are positive)
    sell_total = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker,
        Transaction.trans_code == 'Sell'
    )
    if start:
        sell_total = sell_total.filter(Transaction.activity_date >= start)
    if end:
        sell_total = sell_total.filter(Transaction.activity_date <= end)
    sell_total = sell_total.scalar() or Decimal('0')

    total_received = sell_total

    # Realized P&L from trades
    realized_pnl = total_received - total_invested

    # Dividends earned
    dividends = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker,
        Transaction.trans_code == 'CDIV'
    )
    if start:
        dividends = dividends.filter(Transaction.activity_date >= start)
    if end:
        dividends = dividends.filter(Transaction.activity_date <= end)
    dividends = dividends.scalar() or Decimal('0')

    # Total fees (GOLD subscription + MINT margin interest)
    fees = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker,
        Transaction.trans_code.in_(['GOLD', 'MINT'])
    )
    if start:
        fees = fees.filter(Transaction.activity_date >= start)
    if end:
        fees = fees.filter(Transaction.activity_date <= end)
    fees_sum = fees.scalar() or Decimal('0')
    fees = -fees_sum  # Fees are negative, convert to positive for display

    # Net P&L = realized_pnl + dividends - fees
    net_pnl = realized_pnl + dividends - fees

    result = PnLSummary(
        total_invested=float(total_invested),
        total_received=float(total_received),
        realized_pnl=float(realized_pnl),
        dividends=float(dividends),
        fees=float(fees),
        net_pnl=float(net_pnl)
    )

    set_cached(cache_key, result.model_dump(), ttl=300)
    return result
