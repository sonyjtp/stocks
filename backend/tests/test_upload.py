"""Tests for the upload router — file ingestion, validation, and duplicate handling."""

import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.cache import invalidate_cache
from app.database import Base, get_db
from app.main import app
from app.models import Transaction, UploadLog

_HEADER = (
    "Activity Date,Process Date,Settle Date,"
    "Instrument,Description,Trans Code,Quantity,Price,Amount\n"
)

SAMPLE_CSV = (
    _HEADER
    + "1/15/2024,1/15/2024,1/17/2024,AAPL,Apple Inc,Buy,10,$150.00,($1500.00)\n"
    + "1/20/2024,1/20/2024,1/22/2024,AAPL,Apple Inc,Sell,5,$160.00,$800.00\n"
    + "2/1/2024,2/1/2024,2/3/2024,,ACH Deposit,ACH,,,$ 500.00\n"
)

DUPLICATE_CSV = (
    _HEADER
    + "1/15/2024,1/15/2024,1/17/2024,AAPL,Apple Inc,Buy,10,$150.00,($1500.00)\n"
    + "1/15/2024,1/15/2024,1/17/2024,AAPL,Apple Inc,Buy,10,$150.00,($1500.00)\n"
)


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


# ---------------------------------------------------------------------------
# /api/validate
# ---------------------------------------------------------------------------


class TestValidateEndpoint:
    def test_valid_csv_no_errors(self, client):
        resp = client.post(
            "/api/validate",
            files={"file": ("test.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_rows"] == 3
        assert data["error_count"] == 0

    def test_duplicate_row_flagged(self, client):
        resp = client.post(
            "/api/validate",
            files={"file": ("test.csv", io.BytesIO(DUPLICATE_CSV.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any("Duplicate" in e["errors"][0] for e in data["errors"])

    def test_empty_csv_returns_no_rows(self, client):
        csv = (
            "Activity Date,Process Date,Settle Date,Instrument,"
            "Description,Trans Code,Quantity,Price,Amount\n"
        )
        resp = client.post(
            "/api/validate",
            files={"file": ("empty.csv", io.BytesIO(csv.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["total_rows"] == 0

    def test_unsupported_file_type_rejected(self, client):
        resp = client.post(
            "/api/validate",
            files={"file": ("bad.txt", io.BytesIO(b"data"), "text/plain")},
        )
        assert resp.status_code == 400

    def test_buy_positive_amount_flagged(self, client):
        csv = (
            "Activity Date,Process Date,Settle Date,Instrument,Description,"
            "Trans Code,Quantity,Price,Amount\n"
            "1/15/2024,1/15/2024,1/17/2024,AAPL,Apple Inc,Buy,10,$150.00,$1500.00\n"
        )
        resp = client.post(
            "/api/validate",
            files={"file": ("bad.csv", io.BytesIO(csv.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        errors = resp.json()["errors"]
        assert len(errors) == 1
        assert any("positive" in e.lower() for e in errors[0]["errors"])


# ---------------------------------------------------------------------------
# /api/upload
# ---------------------------------------------------------------------------


class TestUploadEndpoint:
    def test_upload_inserts_rows(self, client, db_session):
        resp = client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["rows_inserted"] == 3
        assert db_session.query(Transaction).count() == 3

    def test_upload_detects_csv_duplicates(self, client, db_session):
        resp = client.post(
            "/api/upload",
            files={"file": ("dup.csv", io.BytesIO(DUPLICATE_CSV.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["rows_inserted"] == 1
        assert len(data["duplicates"]) == 1

    def test_upload_detects_db_duplicates(self, client, db_session):
        # Upload once, then again — second upload should find DB duplicates
        for _ in range(2):
            resp = client.post(
                "/api/upload",
                files={"file": ("test.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["rows_inserted"] == 0
        assert len(data["db_duplicates"]) == 3

    def test_upload_log_created(self, client, db_session):
        client.post(
            "/api/upload",
            files={"file": ("test.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
        )
        logs = db_session.query(UploadLog).all()
        assert len(logs) == 1
        assert logs[0].status == "success"
        assert logs[0].rows_inserted == 3

    def test_upload_unsupported_type(self, client):
        resp = client.post(
            "/api/upload",
            files={"file": ("bad.txt", io.BytesIO(b"hello"), "text/plain")},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# /api/upload-duplicates
# ---------------------------------------------------------------------------


class TestUploadDuplicatesEndpoint:
    def test_insert_new_transactions(self, client, db_session):
        payload = {
            "transactions": [
                {
                    "broker": "robinhood",
                    "activity_date": "2024-01-15",
                    "ticker": "AAPL",
                    "description": "Apple Inc",
                    "trans_code": "Buy",
                    "quantity": 10.0,
                    "price": 150.0,
                    "amount": -1500.0,
                }
            ]
        }
        resp = client.post("/api/upload-duplicates", json=payload)
        assert resp.status_code == 200
        assert resp.json()["rows_inserted"] == 1
        assert db_session.query(Transaction).count() == 1

    def test_skips_db_duplicates(self, client, db_session):
        payload = {
            "transactions": [
                {
                    "broker": "robinhood",
                    "activity_date": "2024-01-15",
                    "ticker": "AAPL",
                    "description": "Apple Inc",
                    "trans_code": "Buy",
                    "quantity": 10.0,
                    "price": 150.0,
                    "amount": -1500.0,
                }
            ]
        }
        client.post("/api/upload-duplicates", json=payload)
        resp = client.post("/api/upload-duplicates", json=payload)
        assert resp.status_code == 200
        assert resp.json()["rows_inserted"] == 0
        assert db_session.query(Transaction).count() == 1
