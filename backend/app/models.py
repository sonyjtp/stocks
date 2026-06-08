from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    broker = Column(String, index=True)
    activity_date = Column(Date, index=True)
    process_date = Column(Date, nullable=True)
    settle_date = Column(Date, nullable=True)
    ticker = Column(String, nullable=True, index=True)
    description = Column(Text)
    trans_code = Column(String, index=True)
    quantity = Column(Numeric(18, 6), nullable=True)
    price = Column(Numeric(18, 4), nullable=True)
    amount = Column(Numeric(18, 4))


class UploadLog(Base):
    __tablename__ = "upload_logs"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    upload_time = Column(DateTime, server_default=func.now(), nullable=False)
    status = Column(String, nullable=False)  # success | error
    rows_parsed = Column(Integer, default=0)
    rows_inserted = Column(Integer, default=0)
    csv_duplicates = Column(Integer, default=0)
    db_duplicates = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    failed_rows = relationship(
        "UploadError", back_populates="upload_log", cascade="all, delete-orphan"
    )
    duplicate_rows = relationship(
        "UploadDuplicate", back_populates="upload_log", cascade="all, delete-orphan"
    )
    inserted_transactions = relationship(
        "UploadTransaction", back_populates="upload_log", cascade="all, delete-orphan"
    )
    deletion = relationship(
        "UploadLogDeletion",
        back_populates="upload_log",
        uselist=False,
        cascade="all, delete-orphan",
    )


class UploadError(Base):
    __tablename__ = "upload_errors"

    id = Column(Integer, primary_key=True, index=True)
    upload_log_id = Column(Integer, ForeignKey("upload_logs.id"), nullable=False, index=True)
    activity_date = Column(String, nullable=True)
    ticker = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    trans_code = Column(String, nullable=True)
    quantity = Column(String, nullable=True)
    amount = Column(String, nullable=True)
    reason = Column(Text, nullable=True)

    upload_log = relationship("UploadLog", back_populates="failed_rows")


class UploadDuplicate(Base):
    __tablename__ = "upload_duplicates"

    id = Column(Integer, primary_key=True, index=True)
    upload_log_id = Column(Integer, ForeignKey("upload_logs.id"), nullable=False, index=True)
    dup_type = Column(String, nullable=False)  # 'csv' or 'db'
    activity_date = Column(String, nullable=True)
    ticker = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    trans_code = Column(String, nullable=True)
    quantity = Column(String, nullable=True)
    price = Column(String, nullable=True)
    amount = Column(String, nullable=True)

    upload_log = relationship("UploadLog", back_populates="duplicate_rows")


class UploadTransaction(Base):
    """Tracks which transaction IDs were inserted by each upload."""

    __tablename__ = "upload_transactions"

    id = Column(Integer, primary_key=True, index=True)
    upload_log_id = Column(Integer, ForeignKey("upload_logs.id"), nullable=False, index=True)
    transaction_id = Column(Integer, nullable=False)

    upload_log = relationship("UploadLog", back_populates="inserted_transactions")


class UploadLogDeletion(Base):
    """Records when an upload's transactions were rolled back from the DB."""

    __tablename__ = "upload_log_deletions"

    upload_log_id = Column(Integer, ForeignKey("upload_logs.id"), primary_key=True)
    deleted_count = Column(Integer, nullable=False, default=0)
    deleted_at = Column(DateTime, nullable=False)

    upload_log = relationship("UploadLog", back_populates="deletion")
