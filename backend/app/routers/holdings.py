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

        # Calculate cost basis for all buys and proceeds from all sells
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

        total_spent_all = -buy_amount  # Buy amounts are negative
        total_received = sell_amount

        # For all-time performance: only count realized trades (sold portion)
        # Cost basis of sold shares = (total buy cost) * (sold / bought)
        if bought > 0:
            cost_per_share = total_spent_all / bought
            cost_of_sold = cost_per_share * sold
        else:
            cost_of_sold = Decimal('0')

        realized_pnl = total_received - cost_of_sold

        # Average cost per share (for all buys)
        avg_cost = total_spent_all / bought if bought > 0 else Decimal('0')

        # Calculate dividends
        dividends = db.query(func.sum(Transaction.amount)).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == 'CDIV'
        ).scalar() or Decimal('0')

        holdings_list.append({
            "ticker": ticker,
            "shares_held": float(held),
            "avg_cost": float(avg_cost)
        })

        # Only include in all-time performance if shares were actually sold (realized trades)
        if sold > 0:
            report_items.append({
                "ticker": ticker,
                "shares_bought": float(bought),
                "shares_sold": float(sold),
                "shares_held": float(held),
                "total_spent": float(total_spent_all),
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
