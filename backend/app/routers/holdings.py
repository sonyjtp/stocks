from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from typing import List
from ..database import get_db
from ..models import Transaction
from ..schemas import ConsolidatedReportItem, HoldingsItem
from ..cache import get_cached, set_cached
from ..logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter(prefix="/api", tags=["holdings"])

@router.get("/report/consolidated", response_model=dict)
def get_consolidated_report(broker: str = "robinhood", db: Session = Depends(get_db)):
    """Get consolidated per-ticker report with holdings and P&L."""
    cache_key = f"consolidated:{broker}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"Returning cached consolidated report for {broker}")
        return cached

    logger.debug(f"Generating consolidated report for {broker}")

    # Get all tickers traded
    tickers = db.query(Transaction.ticker).filter(
        Transaction.broker == broker,
        Transaction.ticker.isnot(None),
        Transaction.trans_code.in_(['Buy', 'Sell'])
    ).distinct().all()

    holdings_list = []
    report_items = []

    for (ticker,) in tickers:
        # Get all buy and sell transactions in chronological order (FIFO method)
        buys = db.query(Transaction.quantity, Transaction.amount, Transaction.activity_date).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == 'Buy',
            Transaction.quantity.isnot(None)
        ).order_by(Transaction.activity_date).all()

        sells = db.query(Transaction.quantity, Transaction.activity_date).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == 'Sell',
            Transaction.quantity.isnot(None)
        ).order_by(Transaction.activity_date).all()

        # Calculate totals (skip if no valid transactions)
        if not buys:
            continue

        bought = sum(b.quantity or 0 for b in buys)
        sold = sum(s.quantity or 0 for s in sells)
        held = bought - sold

        # Build list of buy lots with cost per share
        buy_lots = []
        for quantity, amount, date in buys:
            if quantity and quantity > 0:
                cost_per_share = (-amount) / quantity  # amount is negative
                buy_lots.append({
                    'quantity': quantity,
                    'cost_per_share': cost_per_share,
                    'remaining': quantity
                })

        # Process sells using FIFO (oldest purchases first)
        total_cost_of_sold = Decimal('0')
        for sell_qty, date in sells:
            if not sell_qty or sell_qty <= 0:
                continue
            remaining = sell_qty
            for lot in buy_lots:
                if remaining <= 0:
                    break
                if lot['remaining'] > 0:
                    sold_from_lot = min(remaining, lot['remaining'])
                    total_cost_of_sold += sold_from_lot * lot['cost_per_share']
                    lot['remaining'] -= sold_from_lot
                    remaining -= sold_from_lot

        cost_of_sold = total_cost_of_sold

        # Calculate total spent and received
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

        total_spent_all = -buy_amount
        total_received = sell_amount

        # Calculate average cost of HELD shares using FIFO
        cost_basis_held = Decimal('0')
        for lot in buy_lots:
            if lot['remaining'] > 0:
                cost_basis_held += lot['remaining'] * lot['cost_per_share']

        if held > 0:
            avg_cost = cost_basis_held / held
        else:
            avg_cost = Decimal('0')

        # Calculate dividends
        dividends = db.query(func.sum(Transaction.amount)).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == 'CDIV'
        ).scalar() or Decimal('0')

        realized_pnl = total_received + dividends - cost_of_sold

        holdings_list.append({
            "ticker": ticker,
            "shares_held": float(held),
            "avg_cost": float(avg_cost)
        })

        # Include in all-time performance if shares were bought (whether sold or still held)
        if bought > 0:
            # Total P&L includes both realized (from sold shares) and unrealized (from held shares)
            # Unrealized P&L = current_value_of_held - cost_basis_of_held
            # For stocks with no price (delisted), current_value = $0
            unrealized_pnl = (0 - cost_basis_held) if held > 0 else Decimal('0')
            total_pnl = realized_pnl + unrealized_pnl

            report_items.append({
                "ticker": ticker,
                "shares_bought": float(bought),
                "shares_sold": float(sold),
                "shares_held": float(held),
                "total_spent": float(total_spent_all),
                "total_received": float(total_received),
                "dividends": float(dividends),
                "realized_pnl": float(total_pnl),
                "avg_cost": float(avg_cost)
            })

    result = {
        "holdings": holdings_list,
        "report": report_items
    }

    # Only cache if we have data (prevent caching empty results from errors)
    if holdings_list:
        set_cached(cache_key, result, ttl=300)
        logger.info(f"Generated consolidated report: {len(holdings_list)} holdings, {len(report_items)} performance items - CACHED")
    else:
        logger.warning(f"No holdings data generated, not caching to prevent bad data")
        logger.info(f"Generated consolidated report: {len(holdings_list)} holdings, {len(report_items)} performance items")

    return result
