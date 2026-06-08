"""
Integration tests for transactions, transfers, settings, and main endpoints.
Uses an in-memory SQLite DB so no external infrastructure is needed.
"""

from datetime import date, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.cache import invalidate_cache
from app.database import Base, get_db
from app.main import app
from app.models import (
    Transaction,
    UploadDuplicate,
    UploadError,
    UploadLog,
    UploadLogDeletion,
    UploadTransaction,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="function")
def db_session():
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
    invalidate_cache()

    def override():
        yield db_session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def add_tx(
    session,
    ticker,
    trans_code,
    amount,
    activity_date=None,
    quantity=None,
    price=None,
    broker="robinhood",
    description="Test",
):
    if activity_date is None:
        activity_date = date(2024, 1, 15)
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
    session.refresh(tx)
    return tx


# ---------------------------------------------------------------------------
# Main app endpoints
# ---------------------------------------------------------------------------


class TestMainEndpoints:
    def test_root(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        assert "message" in resp.json()

    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_admin_clear_cache(self, client):
        resp = client.post("/admin/clear-cache")
        assert resp.status_code == 200
        assert "cleared" in resp.json()["message"].lower()

    def test_settings_clear_cache(self, client):
        resp = client.post("/api/settings/clear-cache")
        assert resp.status_code == 200
        assert "cleared" in resp.json()["message"].lower()


# ---------------------------------------------------------------------------
# GET /api/transactions
# ---------------------------------------------------------------------------


class TestGetTransactions:
    def test_returns_buy_and_sell(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("-1000"), quantity=Decimal("10"))
        add_tx(db_session, "AAPL", "Sell", Decimal("600"), quantity=Decimal("5"))
        resp = client.get("/api/transactions?broker=robinhood")
        assert resp.status_code == 200
        codes = {t["trans_code"] for t in resp.json()}
        assert "Buy" in codes and "Sell" in codes

    def test_filters_by_ticker(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("-1000"), quantity=Decimal("10"))
        add_tx(db_session, "MSFT", "Buy", Decimal("-500"), quantity=Decimal("2"))
        resp = client.get("/api/transactions?broker=robinhood&ticker=AAPL")
        assert resp.status_code == 200
        assert all(t["ticker"] == "AAPL" for t in resp.json())

    def test_filters_by_date_range(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("-1000"), activity_date=date(2023, 6, 1))
        add_tx(db_session, "AAPL", "Buy", Decimal("-500"), activity_date=date(2024, 6, 1))
        resp = client.get("/api/transactions?broker=robinhood&start=2024-01-01&end=2024-12-31")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["activity_date"].startswith("2024")

    def test_filters_by_trans_code(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("-1000"))
        add_tx(db_session, "AAPL", "CDIV", Decimal("25"))
        resp = client.get("/api/transactions?broker=robinhood&trans_code=CDIV")
        assert resp.status_code == 200
        assert all(t["trans_code"] == "CDIV" for t in resp.json())

    def test_excludes_ach_transfers(self, client, db_session):
        add_tx(db_session, None, "ACH", Decimal("500"))
        resp = client.get("/api/transactions?broker=robinhood")
        assert resp.status_code == 200
        assert len(resp.json()) == 0

    def test_empty_returns_empty_list(self, client):
        resp = client.get("/api/transactions?broker=robinhood")
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# DELETE /api/transactions/{id}
# ---------------------------------------------------------------------------


class TestDeleteTransaction:
    def test_deletes_existing(self, client, db_session):
        tx = add_tx(db_session, "AAPL", "Buy", Decimal("-1000"))
        resp = client.delete(f"/api/transactions/{tx.id}")
        assert resp.status_code == 204
        assert db_session.query(Transaction).count() == 0

    def test_404_for_missing(self, client):
        resp = client.delete("/api/transactions/99999")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/transactions/{id}
# ---------------------------------------------------------------------------


class TestUpdateTransaction:
    def test_updates_fields(self, client, db_session):
        tx = add_tx(db_session, "AAPL", "Buy", Decimal("-1000"), quantity=Decimal("10"))
        payload = {
            "activity_date": "2024-03-01",
            "ticker": "GOOG",
            "description": "Alphabet",
            "trans_code": "Buy",
            "quantity": 5.0,
            "price": 200.0,
            "amount": -1000.0,
        }
        resp = client.put(f"/api/transactions/{tx.id}", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["ticker"] == "GOOG"
        assert data["activity_date"] == "2024-03-01"

    def test_404_for_missing(self, client):
        payload = {
            "activity_date": "2024-01-01",
            "description": "X",
            "trans_code": "Buy",
            "amount": -100.0,
        }
        resp = client.put("/api/transactions/99999", json=payload)
        assert resp.status_code == 404

    def test_null_ticker_allowed(self, client, db_session):
        tx = add_tx(db_session, None, "ACH", Decimal("500"))
        payload = {
            "activity_date": "2024-01-15",
            "ticker": None,
            "description": "ACH Deposit",
            "trans_code": "ACH",
            "amount": 500.0,
        }
        resp = client.put(f"/api/transactions/{tx.id}", json=payload)
        assert resp.status_code == 200
        assert resp.json()["ticker"] is None


# ---------------------------------------------------------------------------
# GET /api/transfers
# ---------------------------------------------------------------------------


class TestGetTransfers:
    def test_returns_ach(self, client, db_session):
        add_tx(db_session, None, "ACH", Decimal("1000"))
        resp = client.get("/api/transfers?broker=robinhood")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["trans_code"] == "ACH"

    def test_returns_dtax(self, client, db_session):
        add_tx(db_session, "BUD", "DTAX", Decimal("-0.01"))
        resp = client.get("/api/transfers?broker=robinhood")
        assert resp.status_code == 200
        assert any(t["trans_code"] == "DTAX" for t in resp.json())

    def test_excludes_buy_transactions(self, client, db_session):
        add_tx(db_session, "AAPL", "Buy", Decimal("-500"))
        resp = client.get("/api/transfers?broker=robinhood")
        assert resp.status_code == 200
        assert len(resp.json()) == 0

    def test_date_range_filter(self, client, db_session):
        add_tx(db_session, None, "ACH", Decimal("500"), activity_date=date(2023, 1, 1))
        add_tx(db_session, None, "ACH", Decimal("1000"), activity_date=date(2024, 6, 1))
        resp = client.get("/api/transfers?broker=robinhood&start=2024-01-01&end=2024-12-31")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_empty_returns_empty_list(self, client):
        resp = client.get("/api/transfers?broker=robinhood")
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# GET /api/report/transfers
# ---------------------------------------------------------------------------


class TestTransfersSummary:
    def test_ach_deposits_counted(self, client, db_session):
        add_tx(db_session, None, "ACH", Decimal("1000"))
        resp = client.get("/api/report/transfers?broker=robinhood")
        assert resp.status_code == 200
        assert float(resp.json()["ach_deposits"]) == pytest.approx(1000.0)

    def test_ach_withdrawals_positive(self, client, db_session):
        add_tx(db_session, None, "ACH", Decimal("-500"))
        resp = client.get("/api/report/transfers?broker=robinhood")
        assert resp.status_code == 200
        assert float(resp.json()["ach_withdrawals"]) == pytest.approx(500.0)

    def test_interest_earned(self, client, db_session):
        add_tx(db_session, None, "INT", Decimal("10"))
        resp = client.get("/api/report/transfers?broker=robinhood")
        assert resp.status_code == 200
        assert float(resp.json()["interest_earned"]) == pytest.approx(10.0)

    def test_gold_fees_positive(self, client, db_session):
        add_tx(db_session, None, "GOLD", Decimal("-5"))
        resp = client.get("/api/report/transfers?broker=robinhood")
        assert resp.status_code == 200
        assert float(resp.json()["fees_paid"]) == pytest.approx(5.0)

    def test_mint_slip_counted_as_interest(self, client, db_session):
        add_tx(db_session, None, "MINT", Decimal("-3"))
        add_tx(db_session, None, "SLIP", Decimal("-2"))
        resp = client.get("/api/report/transfers?broker=robinhood")
        assert resp.status_code == 200
        assert float(resp.json()["interest_earned"]) == pytest.approx(5.0)

    def test_all_zeros_when_empty(self, client):
        resp = client.get("/api/report/transfers?broker=robinhood")
        assert resp.status_code == 200
        data = resp.json()
        assert float(data["ach_deposits"]) == pytest.approx(0.0)
        assert float(data["ach_withdrawals"]) == pytest.approx(0.0)
        assert float(data["interest_earned"]) == pytest.approx(0.0)
        assert float(data["fees_paid"]) == pytest.approx(0.0)

    def test_date_range_filter(self, client, db_session):
        add_tx(db_session, None, "ACH", Decimal("500"), activity_date=date(2023, 1, 1))
        add_tx(db_session, None, "ACH", Decimal("1000"), activity_date=date(2024, 6, 1))
        resp = client.get("/api/report/transfers?broker=robinhood&start=2024-01-01&end=2024-12-31")
        assert resp.status_code == 200
        assert float(resp.json()["ach_deposits"]) == pytest.approx(1000.0)


# ---------------------------------------------------------------------------
# Settings / upload-logs endpoints
# ---------------------------------------------------------------------------


def make_upload_log(session, filename="test.csv", status="success", rows=3):
    log = UploadLog(
        filename=filename,
        upload_time=datetime(2024, 6, 1, 12, 0, 0),
        status=status,
        rows_parsed=rows,
        rows_inserted=rows,
        csv_duplicates=0,
        db_duplicates=0,
    )
    session.add(log)
    session.commit()
    session.refresh(log)
    return log


class TestUploadLogs:
    def test_get_empty_logs(self, client):
        resp = client.get("/api/upload-logs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_logs_returns_records(self, client, db_session):
        make_upload_log(db_session, "a.csv")
        make_upload_log(db_session, "b.csv")
        resp = client.get("/api/upload-logs")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_log_fields_present(self, client, db_session):
        make_upload_log(db_session)
        data = client.get("/api/upload-logs").json()[0]
        for field in ("id", "filename", "status", "rows_inserted", "has_duplicate_rows"):
            assert field in data

    def test_log_with_deletion_flag(self, client, db_session):
        log = make_upload_log(db_session)
        db_session.add(
            UploadLogDeletion(
                upload_log_id=log.id,
                deleted_count=3,
                deleted_at=datetime(2024, 6, 2),
            )
        )
        db_session.commit()
        resp = client.get("/api/upload-logs")
        data = resp.json()[0]
        assert data["deletion"]["deleted_count"] == 3

    def test_get_errors_empty(self, client, db_session):
        log = make_upload_log(db_session)
        resp = client.get(f"/api/upload-logs/{log.id}/errors")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_errors_returns_records(self, client, db_session):
        log = make_upload_log(db_session)
        db_session.add(
            UploadError(
                upload_log_id=log.id,
                activity_date="2024-01-01",
                ticker="AAPL",
                description="bad row",
                trans_code="Buy",
                quantity="10",
                amount="-1000",
                reason="missing price",
            )
        )
        db_session.commit()
        resp = client.get(f"/api/upload-logs/{log.id}/errors")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["ticker"] == "AAPL"

    def test_get_duplicates_empty(self, client, db_session):
        log = make_upload_log(db_session)
        resp = client.get(f"/api/upload-logs/{log.id}/duplicates")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_duplicates_returns_records(self, client, db_session):
        log = make_upload_log(db_session)
        db_session.add(
            UploadDuplicate(
                upload_log_id=log.id,
                dup_type="csv",
                activity_date="2024-01-15",
                ticker="AAPL",
                description="Apple Inc",
                trans_code="Buy",
                quantity="10",
                price="150",
                amount="-1500",
            )
        )
        db_session.commit()
        resp = client.get(f"/api/upload-logs/{log.id}/duplicates")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["dup_type"] == "csv"

    def test_delete_log_removes_record(self, client, db_session):
        log = make_upload_log(db_session)
        resp = client.delete(f"/api/upload-logs/{log.id}")
        assert resp.status_code == 200
        assert db_session.query(UploadLog).count() == 0

    def test_delete_log_404_for_missing(self, client):
        resp = client.delete("/api/upload-logs/99999")
        assert resp.status_code == 404

    def test_clear_all_logs(self, client, db_session):
        make_upload_log(db_session, "a.csv")
        make_upload_log(db_session, "b.csv")
        resp = client.delete("/api/upload-logs")
        assert resp.status_code == 200
        assert db_session.query(UploadLog).count() == 0

    def test_rollback_transactions_deletes_them(self, client, db_session):
        log = make_upload_log(db_session)
        tx = add_tx(db_session, "AAPL", "Buy", Decimal("-1000"))
        db_session.add(UploadTransaction(upload_log_id=log.id, transaction_id=tx.id))
        db_session.commit()

        resp = client.delete(f"/api/upload-logs/{log.id}/transactions")
        assert resp.status_code == 200
        assert resp.json()["deleted_count"] == 1
        assert db_session.query(Transaction).count() == 0

    def test_rollback_creates_deletion_record(self, client, db_session):
        log = make_upload_log(db_session)
        tx = add_tx(db_session, "AAPL", "Buy", Decimal("-1000"))
        db_session.add(UploadTransaction(upload_log_id=log.id, transaction_id=tx.id))
        db_session.commit()

        client.delete(f"/api/upload-logs/{log.id}/transactions")
        db_session.expire_all()
        deletion = db_session.query(UploadLogDeletion).filter_by(upload_log_id=log.id).first()
        assert deletion is not None
        assert deletion.deleted_count == 1

    def test_rollback_empty_log_deletes_zero(self, client, db_session):
        log = make_upload_log(db_session)
        resp = client.delete(f"/api/upload-logs/{log.id}/transactions")
        assert resp.status_code == 200
        assert resp.json()["deleted_count"] == 0
