from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..database import get_db
from ..models import Transaction
from ..schemas import UploadResponse
from ..parsers.robinhood import parse_robinhood_csv
from ..cache import invalidate_cache

router = APIRouter(prefix="/api", tags=["upload"])

@router.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload and parse Robinhood CSV file."""
    content = await file.read()
    csv_text = content.decode('utf-8')

    transactions = parse_robinhood_csv(csv_text)

    inserted = 0
    for trans in transactions:
        # Check if transaction already exists (deduplication)
        existing = db.query(Transaction).filter(
            and_(
                Transaction.broker == trans['broker'],
                Transaction.activity_date == trans['activity_date'],
                Transaction.trans_code == trans['trans_code'],
                Transaction.ticker == trans['ticker'],
                Transaction.quantity == trans['quantity'],
                Transaction.amount == trans['amount'],
            )
        ).first()

        if not existing:
            db_trans = Transaction(**trans)
            db.add(db_trans)
            inserted += 1

    db.commit()
    invalidate_cache()  # Clear all cache on new upload

    return {
        "message": f"Successfully uploaded {len(transactions)} transactions",
        "rows_inserted": inserted
    }
