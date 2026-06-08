import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from unittest.mock import MagicMock

import sys
from pathlib import Path

# Add backend/ to sys.path so `from app.xxx import ...` resolves
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import Base
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def db_engine():
    """Create a test database engine."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function")
def db_session(db_engine):
    """Create a test database session."""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = sessionmaker(autocommit=False, autoflush=False, bind=connection)()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def mock_redis():
    """Mock Redis cache."""
    return MagicMock()


@pytest.fixture
def mock_logger():
    """Mock logger."""
    return MagicMock()
