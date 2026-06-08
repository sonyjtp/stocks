from pydantic import BaseModel
from datetime import date
from decimal import Decimal
from typing import Optional

class TransactionBase(BaseModel):
    activity_date: date
    process_date: Optional[date] = None
    settle_date: Optional[date] = None
    ticker: Optional[str] = None
    description: str
    trans_code: str
    quantity: Optional[Decimal] = None
    price: Optional[Decimal] = None
    amount: Decimal

class TransactionCreate(TransactionBase):
    broker: str

class TransactionResponse(TransactionCreate):
    id: int

    class Config:
        from_attributes = True

class ConsolidatedReportItem(BaseModel):
    ticker: str
    shares_bought: Decimal
    shares_sold: Decimal
    shares_held: Decimal
    total_spent: Decimal
    total_received: Decimal
    dividends: Decimal
    realized_pnl: Decimal
    avg_cost: Decimal

class HoldingsItem(BaseModel):
    ticker: str
    shares_held: Decimal
    avg_cost: Decimal

class PnLSummary(BaseModel):
    total_invested: float
    cost_of_sold_shares: float
    cost_of_held_shares: float
    total_received: float
    held_shares_current_value: float
    realized_pnl: float
    unrealized_pnl: float
    dividends: float
    fees: float
    net_pnl: float

class TransfersSummary(BaseModel):
    ach_deposits: Decimal
    ach_withdrawals: Decimal
    interest_earned: Decimal
    fees_paid: Decimal

class DuplicateTransaction(TransactionBase):
    pass

class UploadResponse(BaseModel):
    message: str
    rows_inserted: int
    duplicates: list[DuplicateTransaction] = []
    db_duplicates: list[DuplicateTransaction] = []
