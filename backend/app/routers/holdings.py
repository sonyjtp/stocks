from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from typing import List
from ..database import get_db
from ..models import Transaction
from ..schemas import ConsolidatedReportItem, HoldingsItem
from ..cache import get_cached, set_cached

router = APIRouter(prefix="/api", tags=["holdings"])

@router.get("/report/consolidated", response_model=dict)
def get_consolidated_report(broker: str = "robinhood", db: Session = Depends(get_db)):
    """Get consolidated per-ticker report with holdings and P&L."""
    cache_key = f"consolidated:{broker}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    # Get all tickers traded
    tickers = db.query(Transaction.ticker).filter(
        Transaction.broker == broker,
        Transaction.ticker.isnot(None),
        Transaction.trans_code.in_(['Buy', 'Sell'])
    ).distinct().all()

    holdings_list = []
    report_items = []

    for (ticker,) in tickers:
        # Calculate shares bought/sold
        bought = db.query(func.sum(Transaction.quantity)).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == 'Buy'
        ).scalar() or Decimal('0')

        sold = db.query(func.sum(Transaction.quantity)).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == 'Sell'
        ).scalar() or Decimal('0')

        held = bought - sold

        # Calculate spent/received
        buy_amount = db.query(func.sum(Transaction.amount)).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == 'Buy'
        ).scalar() or Decimal('0')

        sell_amount = db.query(func.sum(Transaction.amount)).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == 'Sell'
        ).scalar() or Decimal('0')

        total_spent = -buy_amount  # Buy amounts are negative
        total_received = sell_amount

        # Calculate dividends
        dividends = db.query(func.sum(Transaction.amount)).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == 'CDIV'
        ).scalar() or Decimal('0')

        realized_pnl = total_received - total_spent

        avg_cost = total_spent / bought if bought > 0 else Decimal('0')

        holdings_list.append({
            "ticker": ticker,
            "shares_held": float(held),
            "avg_cost": float(avg_cost)
        })

        report_items.append({
            "ticker": ticker,
            "shares_bought": float(bought),
            "shares_sold": float(sold),
            "shares_held": float(held),
            "total_spent": float(total_spent),
            "total_received": float(total_received),
            "dividends": float(dividends),
            "realized_pnl": float(realized_pnl),
            "avg_cost": float(avg_cost)
        })

    result = {
        "holdings": holdings_list,
        "report": report_items
    }

    set_cached(cache_key, result, ttl=300)
    return result
