from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..database import get_db
from ..models import Transaction
from ..schemas import UploadResponse
from ..parsers.robinhood import parse_robinhood_csv
from ..cache import invalidate_cache
from ..logger import setup_logger
from typing import List
from pydantic import BaseModel

logger = setup_logger(__name__)
router = APIRouter(prefix="/api", tags=["upload"])

class TransactionData(BaseModel):
    broker: str
    activity_date: str
    process_date: str = None
    settle_date: str = None
    ticker: str = None
    description: str
    trans_code: str
    quantity: float = None
    price: float = None
    amount: float

class UploadDuplicatesRequest(BaseModel):
    transactions: List[TransactionData]

@router.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload and parse Robinhood CSV file."""
    logger.info(f"Starting upload for file: {file.filename}")

    try:
        content = await file.read()
        csv_text = content.decode('utf-8')
        logger.debug(f"File decoded successfully, size: {len(csv_text)} bytes")

        transactions = parse_robinhood_csv(csv_text)
        logger.info(f"Parsed {len(transactions)} transactions from CSV")

        # Track duplicates within the CSV file
        seen = set()
        duplicates = []
        unique_transactions = []

        for trans in transactions:
            # Create a hashable key for duplicate detection
            trans_key = (
                trans['broker'],
                trans['activity_date'],
                trans['trans_code'],
                trans.get('ticker'),
                trans.get('quantity'),
                trans.get('amount'),
            )

            if trans_key in seen:
                # This is a duplicate within the CSV
                logger.debug(f"Duplicate found: {trans.get('ticker')} on {trans['activity_date']}")
                duplicates.append(trans)
            else:
                seen.add(trans_key)
                unique_transactions.append(trans)

        logger.info(f"Found {len(duplicates)} duplicates, {len(unique_transactions)} unique transactions")

        # Now insert unique transactions, checking for existing ones in DB
        inserted = 0
        db_duplicates = []
        for trans in unique_transactions:
            # Check if transaction already exists in database
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
            else:
                db_duplicates.append(trans)
                logger.debug(f"Skipped existing DB transaction: {trans.get('ticker')} on {trans['activity_date']}")

        db.commit()
        logger.info(f"Successfully inserted {inserted} transactions, skipped {len(db_duplicates)} existing in DB")

        invalidate_cache()  # Clear all cache on new upload
        logger.debug("Cache invalidated")

        return {
            "message": f"Successfully uploaded {inserted} transactions" + (f" ({len(duplicates)} CSV duplicates, {len(db_duplicates)} DB duplicates)" if (duplicates or db_duplicates) else ""),
            "rows_inserted": inserted,
            "duplicates": duplicates,
            "db_duplicates": db_duplicates
        }

    except Exception as e:
        logger.error(f"Error during upload: {str(e)}", exc_info=True)
        raise


@router.post("/upload-duplicates", response_model=UploadResponse)
async def upload_duplicates(request: UploadDuplicatesRequest, db: Session = Depends(get_db)):
    """Upload previously identified duplicate transactions."""
    logger.info(f"Uploading {len(request.transactions)} duplicate transactions")

    try:
        inserted = 0
        for trans_data in request.transactions:
            # Convert TransactionData to dict for Transaction model
            trans_dict = {
                'broker': trans_data.broker,
                'activity_date': trans_data.activity_date,
                'process_date': trans_data.process_date,
                'settle_date': trans_data.settle_date,
                'ticker': trans_data.ticker,
                'description': trans_data.description,
                'trans_code': trans_data.trans_code,
                'quantity': trans_data.quantity,
                'price': trans_data.price,
                'amount': trans_data.amount,
            }

            # Check if transaction already exists in database
            existing = db.query(Transaction).filter(
                and_(
                    Transaction.broker == trans_dict['broker'],
                    Transaction.activity_date == trans_dict['activity_date'],
                    Transaction.trans_code == trans_dict['trans_code'],
                    Transaction.ticker == trans_dict['ticker'],
                    Transaction.quantity == trans_dict['quantity'],
                    Transaction.amount == trans_dict['amount'],
                )
            ).first()

            if not existing:
                db_trans = Transaction(**trans_dict)
                db.add(db_trans)
                inserted += 1
                logger.debug(f"Inserted duplicate: {trans_dict['ticker']} on {trans_dict['activity_date']}")

        db.commit()
        logger.info(f"Successfully inserted {inserted} duplicate transactions")
        invalidate_cache()

        return {
            "message": f"Successfully uploaded {inserted} transactions",
            "rows_inserted": inserted,
            "duplicates": []
        }

    except Exception as e:
        logger.error(f"Error uploading duplicates: {str(e)}", exc_info=True)
        raise
