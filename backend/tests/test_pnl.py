"""
Integration tests for the P&L FIFO calculation.

Each test inserts transactions into an in-memory SQLite DB, calls the
/api/report/pnl endpoint (with the real DB dependency overridden), and
asserts on the returned figures.
"""

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.cache import invalidate_cache
from app.database import Base, get_db
from app.main import app
from app.models import Transaction

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="function")
def db_session():
    # StaticPool keeps a single in-memory connection alive for the entire test
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """TestClient with the real DB replaced by the in-memory session."""
    invalidate_cache()  # ensure no stale cached results from a previous test

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def add_tx(
    session,
    ticker,
    trans_code,
    quantity,
    amount,
    activity_date,
    price=None,
    broker="robinhood",
    description="Test",
):
    tx = Transaction(
        broker=broker,
        activity_date=activity_date,
        process_date=activity_date,
        settle_date=activity_date,
        ticker=ticker,
        description=description,
        trans_code=trans_code,
        quantity=quantity,
        price=price,
        amount=amount,
    )
    session.add(tx)
    session.commit()
    return tx


def get_pnl(client, start=None, end=None):
    params = {"broker": "robinhood"}
    if start:
        params["start"] = str(start)
    if end:
        params["end"] = str(end)
    resp = client.get("/api/report/pnl", params=params)
    assert resp.status_code == 200
    return resp.json()


# ---------------------------------------------------------------------------
# Basic FIFO scenarios
# ---------------------------------------------------------------------------


class TestBasicFifo:
    def test_simple_buy_sell_profit(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-1000"), date(2024, 1, 1))
        add_tx(db_session, "AAPL", "Sell", Decimal("10"), Decimal("1200"), date(2024, 6, 1))
        pnl = get_pnl(client)
        assert abs(pnl["realized_pnl"] - 200.0) < 0.01

    def test_simple_buy_sell_loss(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-1000"), date(2024, 1, 1))
        add_tx(db_session, "AAPL", "Sell", Decimal("10"), Decimal("800"), date(2024, 6, 1))
        pnl = get_pnl(client)
        assert abs(pnl["realized_pnl"] - (-200.0)) < 0.01

    def test_partial_sell(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-1000"), date(2024, 1, 1))
        add_tx(db_session, "AAPL", "Sell", Decimal("4"), Decimal("480"), date(2024, 6, 1))
        pnl = get_pnl(client)
        # cost of sold = 4 × $100 = $400; proceeds = $480; P&L = $80
        assert abs(pnl["realized_pnl"] - 80.0) < 0.01

    def test_no_sells_zero_realized_pnl(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-1000"), date(2024, 1, 1))
        pnl = get_pnl(client)
        assert pnl["realized_pnl"] == 0.0

    def test_no_transactions_all_zeros(self, client, db_session):
        pnl = get_pnl(client)
        assert pnl["realized_pnl"] == 0.0
        assert pnl["total_invested"] == 0.0

    def test_multiple_tickers(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-1000"), date(2024, 1, 1))
        add_tx(db_session, "AAPL", "Sell", Decimal("10"), Decimal("1100"), date(2024, 6, 1))
        add_tx(db_session, "MSFT", "Buy", Decimal("5"), Decimal("-500"), date(2024, 2, 1))
        add_tx(db_session, "MSFT", "Sell", Decimal("5"), Decimal("400"), date(2024, 7, 1))
        pnl = get_pnl(client)
        # AAPL: +$100; MSFT: -$100; net = $0
        assert abs(pnl["realized_pnl"]) < 0.01


class TestFifoOrdering:
    def test_oldest_lots_consumed_first(self, client, db_session):
        # Lot 1 (Jan): 5 shares @ $100 each
        add_tx(db_session, "AAPL", "Buy", Decimal("5"), Decimal("-500"), date(2024, 1, 1))
        # Lot 2 (Mar): 5 shares @ $200 each
        add_tx(db_session, "AAPL", "Buy", Decimal("5"), Decimal("-1000"), date(2024, 3, 1))
        # Sell 5 shares — FIFO: should consume the Jan lot ($100/share)
        add_tx(db_session, "AAPL", "Sell", Decimal("5"), Decimal("750"), date(2024, 6, 1))
        pnl = get_pnl(client)
        # Cost = 5 × $100 = $500; proceeds = $750; P&L = $250
        assert abs(pnl["realized_pnl"] - 250.0) < 0.01
        # Cost of held (Mar lot, 5 shares @ $200) = $1000
        assert abs(pnl["cost_of_held_shares"] - 1000.0) < 0.01

    def test_two_lots_partially_consumed(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("5"), Decimal("-500"), date(2024, 1, 1))
        add_tx(db_session, "AAPL", "Buy", Decimal("5"), Decimal("-1000"), date(2024, 3, 1))
        # Sell 7: consume all 5 of Jan lot + 2 from Mar lot
        add_tx(db_session, "AAPL", "Sell", Decimal("7"), Decimal("1050"), date(2024, 6, 1))
        pnl = get_pnl(client)
        # cost = 5×100 + 2×200 = 900; proceeds = 1050; P&L = 150
        assert abs(pnl["realized_pnl"] - 150.0) < 0.01


# ---------------------------------------------------------------------------
# Date range filtering
# ---------------------------------------------------------------------------


class TestDateRange:
    def test_only_in_range_sells_counted(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-1000"), date(2023, 1, 1))
        # Sell 5 in 2023 — outside range
        add_tx(db_session, "AAPL", "Sell", Decimal("5"), Decimal("600"), date(2023, 6, 1))
        # Sell 5 in 2024 — inside range
        add_tx(db_session, "AAPL", "Sell", Decimal("5"), Decimal("700"), date(2024, 6, 1))
        pnl = get_pnl(client, start=date(2024, 1, 1), end=date(2024, 12, 31))
        # Pre-range sell consumes first 5 lots ($500 cost); in-range sell takes next 5 ($500 cost)
        assert abs(pnl["realized_pnl"] - 200.0) < 0.01  # 700-500=200

    def test_pre_range_sell_consumes_lots_for_fifo(self, client, db_session):
        # Buy cheap lot first, expensive lot second
        add_tx(
            db_session, "AAPL", "Buy", Decimal("5"), Decimal("-100"), date(2023, 1, 1)
        )  # $20/share
        add_tx(
            db_session, "AAPL", "Buy", Decimal("5"), Decimal("-1000"), date(2023, 6, 1)
        )  # $200/share
        # Pre-range sell consumes the cheap lot
        add_tx(db_session, "AAPL", "Sell", Decimal("5"), Decimal("150"), date(2023, 12, 1))
        # In-range sell: only expensive lot remains
        add_tx(db_session, "AAPL", "Sell", Decimal("5"), Decimal("900"), date(2024, 6, 1))
        pnl = get_pnl(client, start=date(2024, 1, 1), end=date(2024, 12, 31))
        # In-range: cost = 5×200 = 1000; proceeds = 900; P&L = -100
        assert abs(pnl["realized_pnl"] - (-100.0)) < 0.01

    def test_no_sells_in_range_zero_realized(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-1000"), date(2023, 1, 1))
        add_tx(db_session, "AAPL", "Sell", Decimal("10"), Decimal("1200"), date(2023, 6, 1))
        pnl = get_pnl(client, start=date(2024, 1, 1), end=date(2024, 12, 31))
        assert pnl["realized_pnl"] == 0.0


# ---------------------------------------------------------------------------
# Stock split (SPL)
# ---------------------------------------------------------------------------


class TestStockSplit:
    def test_split_adjusts_cost_basis(self, client, db_session):
        # Buy 10 shares @ $400 each (pre-split), total cost $4,000
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-4000"), date(2020, 1, 1))
        # 4:1 split adds 30 shares
        add_tx(db_session, "AAPL", "SPL", Decimal("30"), Decimal("0"), date(2020, 8, 31))
        # Sell all 40 post-split shares @ $120 = $4,800
        add_tx(db_session, "AAPL", "Sell", Decimal("40"), Decimal("4800"), date(2021, 1, 1))
        pnl = get_pnl(client)
        # After split: 40 shares with total cost $4,000 → cost/share = $100
        # Proceeds = $4,800; P&L = $800
        assert abs(pnl["realized_pnl"] - 800.0) < 0.01

    def test_split_total_cost_unchanged(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-4000"), date(2020, 1, 1))
        add_tx(db_session, "AAPL", "SPL", Decimal("30"), Decimal("0"), date(2020, 8, 31))
        # Sell only 20 post-split shares
        add_tx(db_session, "AAPL", "Sell", Decimal("20"), Decimal("2400"), date(2021, 1, 1))
        pnl = get_pnl(client)
        # Cost of sold 20 shares = 20 × $100 = $2,000; proceeds = $2,400; P&L = $400
        assert abs(pnl["realized_pnl"] - 400.0) < 0.01
        # Remaining 20 shares also cost $2,000
        assert abs(pnl["cost_of_held_shares"] - 2000.0) < 0.01

    def test_split_with_no_existing_lots_treated_as_zero_cost(self, client, db_session):
        # SPL before any buy (edge case: shouldn't normally happen)
        add_tx(db_session, "AAPL", "SPL", Decimal("30"), Decimal("0"), date(2020, 8, 31))
        add_tx(db_session, "AAPL", "Sell", Decimal("30"), Decimal("3000"), date(2021, 1, 1))
        pnl = get_pnl(client)
        # No buy lots → cost = $0; proceeds = $3,000 → P&L = $3,000
        assert abs(pnl["realized_pnl"] - 3000.0) < 0.01


# ---------------------------------------------------------------------------
# Broker transfer (CONV)
# ---------------------------------------------------------------------------


class TestConv:
    def test_conv_shares_at_zero_cost(self, client, db_session):
        # Shares transferred with unknown cost
        add_tx(db_session, "MU", "CONV", Decimal("50"), Decimal("0"), date(2018, 11, 12))
        add_tx(db_session, "MU", "Sell", Decimal("50"), Decimal("2500"), date(2019, 1, 1))
        pnl = get_pnl(client)
        # CONV lots have $0 cost → full proceeds = profit
        assert abs(pnl["realized_pnl"] - 2500.0) < 0.01

    def test_conv_consumed_by_fifo_after_earlier_buys(self, client, db_session):
        # Buy 10 @ $30 in Jan (before CONV)
        add_tx(db_session, "MU", "Buy", Decimal("10"), Decimal("-300"), date(2018, 1, 1))
        # CONV 5 @ $0 in Nov
        add_tx(db_session, "MU", "CONV", Decimal("5"), Decimal("0"), date(2018, 11, 12))
        # Sell 10: FIFO consumes the 10 Jan-lot shares first ($30/share)
        add_tx(db_session, "MU", "Sell", Decimal("10"), Decimal("400"), date(2019, 1, 1))
        pnl = get_pnl(client)
        # cost = 10×30 = 300; proceeds = 400; P&L = 100
        assert abs(pnl["realized_pnl"] - 100.0) < 0.01


# ---------------------------------------------------------------------------
# Write-off (sell at $0)
# ---------------------------------------------------------------------------


class TestWriteOff:
    def test_worthless_stock_is_full_loss(self, client, db_session):
        add_tx(db_session, "TEUM", "Buy", Decimal("1000"), Decimal("-5000"), date(2019, 1, 1))
        add_tx(
            db_session,
            "TEUM",
            "Sell",
            Decimal("1000"),
            Decimal("0"),
            date(2026, 6, 7),
            description="Write-off: worthless security",
        )
        pnl = get_pnl(client)
        assert abs(pnl["realized_pnl"] - (-5000.0)) < 0.01

    def test_write_off_removes_from_held(self, client, db_session):
        add_tx(db_session, "TEUM", "Buy", Decimal("1000"), Decimal("-5000"), date(2019, 1, 1))
        add_tx(db_session, "TEUM", "Sell", Decimal("1000"), Decimal("0"), date(2026, 6, 7))
        pnl = get_pnl(client)
        assert abs(pnl["cost_of_held_shares"]) < 0.01


# ---------------------------------------------------------------------------
# Dividends and fees
# ---------------------------------------------------------------------------


class TestDividendsAndFees:
    def test_dividends_counted_in_net_pnl(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-1000"), date(2024, 1, 1))
        add_tx(db_session, "AAPL", "CDIV", None, Decimal("50"), date(2024, 5, 1))
        pnl = get_pnl(client)
        assert abs(pnl["dividends"] - 50.0) < 0.01
        # Net P&L includes dividends
        assert pnl["net_pnl"] == pytest.approx(
            pnl["realized_pnl"]
            + pnl["unrealized_pnl"]
            + pnl["dividends"]
            + pnl["interest"]
            - pnl["fees"],
            abs=0.01,
        )

    def test_gold_fees_subtracted(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-1000"), date(2024, 1, 1))
        add_tx(db_session, "AAPL", "GOLD", None, Decimal("-5"), date(2024, 2, 1))
        pnl = get_pnl(client)
        assert abs(pnl["fees"] - 5.0) < 0.01

    def test_dividends_date_range_filtered(self, client, db_session):
        add_tx(db_session, "AAPL", "CDIV", None, Decimal("30"), date(2023, 5, 1))
        add_tx(db_session, "AAPL", "CDIV", None, Decimal("50"), date(2024, 5, 1))
        pnl = get_pnl(client, start=date(2024, 1, 1), end=date(2024, 12, 31))
        assert abs(pnl["dividends"] - 50.0) < 0.01


# ---------------------------------------------------------------------------
# Interest income (INT + SLIP)
# ---------------------------------------------------------------------------


class TestInterest:
    def test_int_counted_in_interest(self, client, db_session):
        add_tx(db_session, None, "INT", None, Decimal("12.50"), date(2024, 3, 1))
        pnl = get_pnl(client)
        assert abs(pnl["interest"] - 12.50) < 0.01

    def test_slip_counted_in_interest(self, client, db_session):
        add_tx(db_session, "AAPL", "SLIP", None, Decimal("5.00"), date(2024, 4, 1))
        pnl = get_pnl(client)
        assert abs(pnl["interest"] - 5.00) < 0.01

    def test_int_and_slip_summed(self, client, db_session):
        add_tx(db_session, None, "INT", None, Decimal("10.00"), date(2024, 3, 1))
        add_tx(db_session, "AAPL", "SLIP", None, Decimal("7.50"), date(2024, 4, 1))
        pnl = get_pnl(client)
        assert abs(pnl["interest"] - 17.50) < 0.01

    def test_interest_included_in_net_pnl(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("10"), Decimal("-1000"), date(2024, 1, 1))
        add_tx(db_session, "AAPL", "Sell", Decimal("10"), Decimal("1100"), date(2024, 6, 1))
        add_tx(db_session, None, "INT", None, Decimal("15.00"), date(2024, 5, 1))
        pnl = get_pnl(client)
        assert abs(pnl["interest"] - 15.00) < 0.01
        # realized P&L = $100; interest = $15; net should include both
        assert pnl["net_pnl"] == pytest.approx(
            pnl["realized_pnl"]
            + pnl["unrealized_pnl"]
            + pnl["dividends"]
            + pnl["interest"]
            - pnl["fees"],
            abs=0.01,
        )

    def test_interest_date_range_filtered(self, client, db_session):
        add_tx(db_session, None, "INT", None, Decimal("20.00"), date(2023, 6, 1))
        add_tx(db_session, None, "INT", None, Decimal("30.00"), date(2024, 6, 1))
        pnl = get_pnl(client, start=date(2024, 1, 1), end=date(2024, 12, 31))
        assert abs(pnl["interest"] - 30.00) < 0.01

    def test_no_interest_transactions_zero(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("5"), Decimal("-500"), date(2024, 1, 1))
        pnl = get_pnl(client)
        assert pnl["interest"] == 0.0
