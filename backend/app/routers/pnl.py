from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..cache import CACHE_TTL_LONG, CACHE_TTL_SHORT, get_cached, set_cached
from ..database import get_db
from ..logger import get_logger
from ..models import (
    FEE_CODES,
    INCOME_CODES,
    PNL_ACQUISITION_CODES,
    TC,
    TRADE_CODES,
    PnLSummary,
    Transaction,
)

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["pnl"])


@router.get("/report/pnl", response_model=PnLSummary)
def get_pnl_summary(
    broker: str = "robinhood",
    start: date = Query(None),
    end: date = Query(None),
    db: Session = Depends(get_db),
):
    """Get P&L summary with gross and net figures."""
    cache_key = f"pnl:{broker}:{start}:{end}"
    cached = get_cached(cache_key)
    if cached:
        logger.debug(f"Returning cached P&L summary for {broker} ({start} to {end})")
        return cached

    logger.debug(f"Generating P&L summary for {broker} ({start} to {end})")

    query = db.query(Transaction).filter(Transaction.broker == broker)

    if start:
        query = query.filter(Transaction.activity_date >= start)
    if end:
        query = query.filter(Transaction.activity_date <= end)

    # Get all tickers traded
    tickers = db.query(Transaction.ticker).filter(
        Transaction.broker == broker,
        Transaction.ticker.isnot(None),
        Transaction.trans_code.in_(TRADE_CODES),
    )
    if start:
        tickers = tickers.filter(Transaction.activity_date >= start)
    if end:
        tickers = tickers.filter(Transaction.activity_date <= end)
    tickers = tickers.distinct().all()

    total_invested = Decimal("0")
    total_received = Decimal("0")
    cost_of_sold_shares = Decimal("0")
    realized_pnl = Decimal("0")

    for (ticker,) in tickers:
        # Get ALL acquisitions: buys, broker transfers (CONV), and stock splits (SPL/SPR)
        all_acquisitions = (
            db.query(
                Transaction.quantity,
                Transaction.amount,
                Transaction.activity_date,
                Transaction.trans_code,
            )
            .filter(
                Transaction.broker == broker,
                Transaction.ticker == ticker,
                Transaction.trans_code.in_(PNL_ACQUISITION_CODES),
                Transaction.quantity.isnot(None),
                Transaction.quantity > 0,
            )
            .order_by(Transaction.activity_date)
            .all()
        )

        # Get ALL sells ever (needed to consume lots before the date range)
        sells_all = (
            db.query(Transaction.quantity, Transaction.amount, Transaction.activity_date)
            .filter(
                Transaction.broker == broker,
                Transaction.ticker == ticker,
                Transaction.trans_code == TC.SELL,
                Transaction.quantity.isnot(None),
            )
            .order_by(Transaction.activity_date)
            .all()
        )

        if not all_acquisitions and not sells_all:
            continue

        # Build buy lots with cost per share for FIFO matching
        buy_lots = []
        for quantity, amount, act_date, trans_code in all_acquisitions:
            qty = Decimal(str(quantity))
            if trans_code == TC.BUY:
                cost_per_share = (-Decimal(str(amount))) / qty if amount else Decimal("0")
                buy_lots.append(
                    {"quantity": qty, "cost_per_share": cost_per_share, "remaining": qty}
                )
            elif trans_code == TC.CONV:
                # Broker transfer (Apex→RHS): original buy predates history, cost unknown
                buy_lots.append({"quantity": qty, "cost_per_share": Decimal("0"), "remaining": qty})
            elif trans_code in (TC.SPL, TC.SPR):
                # Stock split: redistribute total cost across all shares (new + old)
                total_before = sum(lot["remaining"] for lot in buy_lots)
                if total_before > 0:
                    new_total = total_before + qty
                    ratio = new_total / total_before
                    for lot in buy_lots:
                        lot["quantity"] = lot["quantity"] * ratio
                        lot["remaining"] = lot["remaining"] * ratio
                        lot["cost_per_share"] = lot["cost_per_share"] / ratio
                else:
                    buy_lots.append(
                        {"quantity": qty, "cost_per_share": Decimal("0"), "remaining": qty}
                    )

        # Process sells using FIFO:
        # - Sells BEFORE date range: consume lots but don't count P&L
        # - Sells WITHIN date range: consume lots AND count P&L
        ticker_cost_of_sold = Decimal("0")
        ticker_sell_amount = Decimal("0")

        for sell_qty, sell_amount_tx, sell_date in sells_all:
            if not sell_qty or sell_qty <= 0:
                continue

            # Consume buy lots for this sell using FIFO
            remaining = sell_qty
            cost_this_sell = Decimal("0")
            for lot in buy_lots:
                if remaining <= 0:
                    break
                if lot["remaining"] > 0:
                    sold_from_lot = min(remaining, lot["remaining"])
                    cost_this_sell += sold_from_lot * lot["cost_per_share"]
                    lot["remaining"] -= sold_from_lot
                    remaining -= sold_from_lot

            # Only count P&L for sells within the date range
            in_range = (not start or sell_date >= start) and (not end or sell_date <= end)
            if in_range:
                ticker_cost_of_sold += cost_this_sell
                ticker_sell_amount += sell_amount_tx or Decimal("0")

        # Total invested = buys within date range
        buy_amount = db.query(func.sum(Transaction.amount)).filter(
            Transaction.broker == broker,
            Transaction.ticker == ticker,
            Transaction.trans_code == TC.BUY,
        )
        if start:
            buy_amount = buy_amount.filter(Transaction.activity_date >= start)
        if end:
            buy_amount = buy_amount.filter(Transaction.activity_date <= end)
        buy_amount = buy_amount.scalar() or Decimal("0")

        total_spent = -buy_amount
        total_invested += total_spent
        total_received += ticker_sell_amount
        cost_of_sold_shares += ticker_cost_of_sold
        realized_pnl += ticker_sell_amount - ticker_cost_of_sold

    # Dividends earned
    dividends = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker, Transaction.trans_code == TC.CDIV
    )
    if start:
        dividends = dividends.filter(Transaction.activity_date >= start)
    if end:
        dividends = dividends.filter(Transaction.activity_date <= end)
    dividends = dividends.scalar() or Decimal("0")

    # Interest income (INT + SLIP — stock lending and cash interest)
    interest_q = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker, Transaction.trans_code.in_(INCOME_CODES)
    )
    if start:
        interest_q = interest_q.filter(Transaction.activity_date >= start)
    if end:
        interest_q = interest_q.filter(Transaction.activity_date <= end)
    interest = interest_q.scalar() or Decimal("0")

    # Total fees (GOLD subscription + MINT margin interest)
    fees = db.query(func.sum(Transaction.amount)).filter(
        Transaction.broker == broker, Transaction.trans_code.in_(FEE_CODES)
    )
    if start:
        fees = fees.filter(Transaction.activity_date >= start)
    if end:
        fees = fees.filter(Transaction.activity_date <= end)
    fees_sum = fees.scalar() or Decimal("0")
    fees = -fees_sum  # Fees are negative, convert to positive for display

    # Calculate held shares cost
    cost_of_held_shares = total_invested - cost_of_sold_shares

    # Calculate unrealized P&L (requires current prices)
    # Skip price fetching for historical date ranges (only fetch for current/recent data)
    from datetime import datetime

    from ..routers.holdings import get_consolidated_report

    unrealized_pnl = Decimal("0")
    held_shares_current_value = Decimal("0")

    # Only fetch prices if querying recent data (end date is None or within last 7 days)
    should_fetch_prices = False
    if not end:
        should_fetch_prices = True
    else:
        days_old = (datetime.now().date() - end).days
        should_fetch_prices = days_old <= 7

    if should_fetch_prices:
        consolidated = get_consolidated_report(broker, db)
        holdings = consolidated.get("holdings", [])

        if holdings:
            import pandas as pd
            import yfinance as yf

            tickers_str = ",".join([h["ticker"] for h in holdings])
            ticker_list = [t.strip().upper() for t in tickers_str.split(",")]
            try:
                data = yf.download(ticker_list, period="1d", progress=False)

                if len(ticker_list) == 1:
                    close_price = data["Close"].iloc[-1] if len(data) > 0 else None
                    prices = {
                        ticker_list[0]: float(close_price) if close_price is not None else None
                    }
                else:
                    prices = {}
                    for ticker in ticker_list:
                        try:
                            close_price = data["Close"][ticker].iloc[-1]
                            prices[ticker] = (
                                float(close_price) if not pd.isna(close_price) else None
                            )
                        except Exception:
                            prices[ticker] = None
            except Exception as e:
                logger.warning(f"Could not fetch prices for unrealized P&L: {e}")
                prices = {t: None for t in ticker_list}

            for holding in holdings:
                if holding["shares_held"] > 0 and prices.get(holding["ticker"]):
                    current_value = holding["shares_held"] * prices[holding["ticker"]]
                    cost_basis = holding["shares_held"] * holding["avg_cost"]
                    unrealized_pnl += Decimal(str(current_value - cost_basis))
                    held_shares_current_value += Decimal(str(current_value))

    # Net P&L = realized_pnl + unrealized_pnl + dividends + interest - fees
    net_pnl = realized_pnl + unrealized_pnl + dividends + interest - fees

    result = PnLSummary(
        total_invested=float(total_invested),
        cost_of_sold_shares=float(cost_of_sold_shares),
        cost_of_held_shares=float(cost_of_held_shares),
        total_received=float(total_received),
        held_shares_current_value=float(held_shares_current_value),
        realized_pnl=float(realized_pnl),
        unrealized_pnl=float(unrealized_pnl),
        dividends=float(dividends),
        interest=float(interest),
        fees=float(fees),
        net_pnl=float(net_pnl),
    )

    # Cache longer for historical date ranges (they won't change)
    cache_ttl = CACHE_TTL_LONG if (start or end) else CACHE_TTL_SHORT
    set_cached(cache_key, result.model_dump(), ttl=cache_ttl)
    logger.info(
        f"P&L Summary - Realized: ${realized_pnl:.2f}, "
        f"Unrealized: ${unrealized_pnl:.2f}, Net: ${net_pnl:.2f} - CACHED"
    )
    return result
