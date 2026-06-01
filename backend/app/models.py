from sqlalchemy import Column, Integer, String, Date, Numeric, Text
from .database import Base
from datetime import date
from decimal import Decimal

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    broker = Column(String, index=True)  # robinhood, stash, fidelity
    activity_date = Column(Date, index=True)
    process_date = Column(Date, nullable=True)
    settle_date = Column(Date, nullable=True)
    ticker = Column(String, nullable=True, index=True)  # nullable for non-equity
    description = Column(Text)
    trans_code = Column(String, index=True)  # Buy, Sell, INT, GOLD, CDIV, MINT, ACH
    quantity = Column(Numeric(18, 6), nullable=True)
    price = Column(Numeric(18, 4), nullable=True)
    amount = Column(Numeric(18, 4))  # positive = credit, negative = debit
