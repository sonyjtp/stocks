from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from typing import List
from ..database import get_db
from ..models import Transaction
from ..schemas import ConsolidatedReportItem, HoldingsItem
from ..cache import get_cached, set_cached
from ..logger import get_logger

logger = get_logger(__name__)
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
        # All share acquisitions in chronological order:
        # Buy, CDIV (DRIP reinvestment), SPL/SPR (stock split), SCXL (share recall), CONV (conversion)
        acquisitions = db.query(
            Transaction.quantity, Transaction.amount, Transaction.activity_date, Transaction.trans_code
        ).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code.in_(['Buy', 'CDIV', 'SPL', 'SPR', 'SCXL', 'CONV']),
            Transaction.quantity.isnot(None),
            Transaction.quantity > 0
        ).order_by(Transaction.activity_date).all()

        sells = db.query(Transaction.quantity, Transaction.activity_date).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == 'Sell',
            Transaction.quantity.isnot(None)
        ).order_by(Transaction.activity_date).all()

        if not acquisitions:
            continue

        # Build buy lots and tally bought shares, handling each acquisition type
        bought = Decimal('0')
        buy_lots = []
        for quantity, amount, date, trans_code in acquisitions:
            qty = Decimal(str(quantity))
            amt = Decimal(str(amount)) if amount else Decimal('0')

            if trans_code == 'Buy':
                cost_per_share = (-amt) / qty
                buy_lots.append({'quantity': qty, 'cost_per_share': cost_per_share, 'remaining': qty})
                bought += qty
            elif trans_code == 'CDIV':
                # DRIP: dividend amount (positive) is the cost basis of the reinvested shares
                cost_per_share = amt / qty
                buy_lots.append({'quantity': qty, 'cost_per_share': cost_per_share, 'remaining': qty})
                bought += qty
            elif trans_code == 'SCXL':
                # Share recall (e.g. stock-lending close): negative amount = cost to reacquire
                cost_per_share = abs(amt) / qty if qty else Decimal('0')
                buy_lots.append({'quantity': qty, 'cost_per_share': cost_per_share, 'remaining': qty})
                bought += qty
            elif trans_code == 'CONV':
                # Broker conversion: original cost unknown, use $0
                buy_lots.append({'quantity': qty, 'cost_per_share': Decimal('0'), 'remaining': qty})
                bought += qty
            elif trans_code in ('SPL', 'SPR'):
                # Stock split: redistribute cost across all lots, no new cash outlay
                total_before = sum(lot['remaining'] for lot in buy_lots)
                if total_before > 0:
                    ratio = (total_before + qty) / total_before
                    for lot in buy_lots:
                        lot['quantity'] *= ratio
                        lot['remaining'] *= ratio
                        lot['cost_per_share'] /= ratio
                else:
                    buy_lots.append({'quantity': qty, 'cost_per_share': Decimal('0'), 'remaining': qty})
                bought += qty

        sold = sum(Decimal(str(s.quantity)) for s in sells if s.quantity)
        held = bought - sold

        # Process sells using FIFO (oldest purchases first)
        total_cost_of_sold = Decimal('0')
        for sell_qty, date in sells:
            if not sell_qty or sell_qty <= 0:
                continue
            remaining = Decimal(str(sell_qty))
            for lot in buy_lots:
                if remaining <= 0:
                    break
                if lot['remaining'] > 0:
                    sold_from_lot = min(remaining, lot['remaining'])
                    total_cost_of_sold += sold_from_lot * lot['cost_per_share']
                    lot['remaining'] -= sold_from_lot
                    remaining -= sold_from_lot

        cost_of_sold = total_cost_of_sold

        # Calculate total spent (cash out-of-pocket for Buy only, not DRIP)
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
            report_items.append({
                "ticker": ticker,
                "shares_bought": float(bought),
                "shares_sold": float(sold),
                "shares_held": float(held),
                "total_spent": float(total_spent_all),
                "total_received": float(total_received),
                "dividends": float(dividends),
                "realized_pnl": float(realized_pnl),
                "cost_basis_held": float(cost_basis_held),
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
