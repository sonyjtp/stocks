import os
import tempfile
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..cache import invalidate_cache
from ..database import get_db
from ..logger import get_logger
from ..models import Transaction, UploadDuplicate, UploadError, UploadLog, UploadTransaction
from ..parsers.robinhood import parse_robinhood_csv
from ..parsers.robinhood_pdf import parse_robinhood_pdf
from ..schemas import UploadResponse

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["upload"])


class TransactionData(BaseModel):
    broker: str
    activity_date: str
    process_date: Optional[str] = None
    settle_date: Optional[str] = None
    ticker: Optional[str] = None
    description: str
    trans_code: str
    quantity: Optional[float] = None
    price: Optional[float] = None
    amount: float


class UploadDuplicatesRequest(BaseModel):
    transactions: List[TransactionData]


@router.post("/validate")
async def validate_upload(file: UploadFile = File(...)):
    """Parse a file and return validation errors without saving anything."""
    try:
        content = await file.read()
        file_ext = file.filename.lower().split(".")[-1]

        if file_ext == "pdf":
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            try:
                transactions = parse_robinhood_pdf(tmp_path)
            finally:
                os.unlink(tmp_path)
        elif file_ext == "csv":
            csv_text = content.decode("utf-8-sig")  # utf-8-sig strips BOM if present
            transactions = parse_robinhood_csv(csv_text)
        else:
            from fastapi import HTTPException

            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_ext}")

        if len(transactions) == 0 and len(content) > 0:
            return {
                "filename": file.filename,
                "total_rows": 0,
                "error_count": 1,
                "errors": [
                    {
                        "row": "—",
                        "date": "",
                        "ticker": "",
                        "description": "",
                        "trans_code": "",
                        "quantity": "",
                        "price": "",
                        "amount": "",
                        "errors": [
                            "No rows could be parsed. Verify this is a valid Robinhood CSV"
                            " with the expected column headers"
                            " (Activity Date, Instrument, Trans Code, etc.)"
                        ],
                    }
                ],
            }

        errors = []
        seen = set()

        for i, trans in enumerate(transactions):
            row_errors = []
            row_num = i + 2  # +1 for 1-index, +1 for header

            if not trans.get("activity_date"):
                row_errors.append("Missing or invalid date")

            code = trans.get("trans_code", "").strip()
            if not code:
                row_errors.append("Missing transaction type")

            if code in ("Buy", "Sell"):
                if not trans.get("ticker"):
                    row_errors.append("Buy/Sell is missing a ticker symbol")
                if trans.get("quantity") is None:
                    row_errors.append("Buy/Sell is missing quantity")
                amt = float(trans.get("amount") or 0)
                if code == "Buy" and amt > 0:
                    row_errors.append(f"Buy amount is positive (${amt:,.2f}); expected negative")
                if code == "Sell" and amt < 0:
                    row_errors.append(f"Sell amount is negative (${amt:,.2f}); expected positive")

            trans_key = (
                str(trans.get("activity_date")),
                code,
                str(trans.get("ticker")),
                str(trans.get("quantity")),
                str(trans.get("amount")),
            )
            if trans_key in seen:
                row_errors.append("Duplicate row within this file")
            seen.add(trans_key)

            if row_errors:
                errors.append(
                    {
                        "row": row_num,
                        "date": str(trans.get("activity_date") or ""),
                        "ticker": trans.get("ticker") or "",
                        "description": trans.get("description") or "",
                        "trans_code": code,
                        "quantity": str(trans.get("quantity") or ""),
                        "price": str(trans.get("price") or ""),
                        "amount": str(trans.get("amount") or ""),
                        "errors": row_errors,
                    }
                )

        return {
            "filename": file.filename,
            "total_rows": len(transactions),
            "error_count": len(errors),
            "errors": errors,
        }

    except Exception as e:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")


@router.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload and parse Robinhood CSV or PDF file."""
    logger.info(f"Starting upload for file: {file.filename}")

    log = UploadLog(
        filename=file.filename,
        status="error",
        rows_parsed=0,
        rows_inserted=0,
        csv_duplicates=0,
        db_duplicates=0,
    )
    db.add(log)
    db.flush()  # get log.id

    try:
        content = await file.read()
        file_ext = file.filename.lower().split(".")[-1]

        if file_ext == "pdf":
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            try:
                transactions = parse_robinhood_pdf(tmp_path)
            finally:
                os.unlink(tmp_path)
        elif file_ext == "csv":
            csv_text = content.decode("utf-8-sig")  # utf-8-sig strips BOM if present
            transactions = parse_robinhood_csv(csv_text)
        else:
            raise ValueError(f"Unsupported file type: {file_ext}. Please upload a CSV or PDF file.")

        log.rows_parsed = len(transactions)

        # Deduplicate within file
        seen = set()
        duplicates = []
        unique_transactions = []
        for trans in transactions:
            trans_key = (
                trans["broker"],
                trans["activity_date"],
                trans["trans_code"],
                trans.get("ticker"),
                trans.get("quantity"),
                trans.get("amount"),
            )
            if trans_key in seen:
                duplicates.append(trans)
            else:
                seen.add(trans_key)
                unique_transactions.append(trans)

        # Insert unique, check DB duplicates
        inserted = 0
        db_duplicates = []
        failed_rows = []
        for trans in unique_transactions:
            try:
                existing = (
                    db.query(Transaction)
                    .filter(
                        and_(
                            Transaction.broker == trans["broker"],
                            Transaction.activity_date == trans["activity_date"],
                            Transaction.trans_code == trans["trans_code"],
                            Transaction.ticker == trans["ticker"],
                            Transaction.quantity == trans["quantity"],
                            Transaction.amount == trans["amount"],
                        )
                    )
                    .first()
                )
                if not existing:
                    tx_obj = Transaction(**trans)
                    db.add(tx_obj)
                    db.flush()
                    db.add(UploadTransaction(upload_log_id=log.id, transaction_id=tx_obj.id))
                    inserted += 1
                else:
                    db_duplicates.append(trans)
            except Exception as row_err:
                failed_rows.append({"trans": trans, "reason": str(row_err)})

        db.commit()

        # Save any failed rows to upload_errors
        for row in failed_rows:
            t = row["trans"]
            db.add(
                UploadError(
                    upload_log_id=log.id,
                    activity_date=str(t.get("activity_date", "")),
                    ticker=t.get("ticker"),
                    description=t.get("description"),
                    trans_code=t.get("trans_code"),
                    quantity=str(t.get("quantity", "")),
                    amount=str(t.get("amount", "")),
                    reason=row["reason"],
                )
            )

        # Save duplicate rows so they can be retrieved and re-pasted later
        for dup in duplicates:
            db.add(
                UploadDuplicate(
                    upload_log_id=log.id,
                    dup_type="csv",
                    activity_date=str(dup.get("activity_date", "")),
                    ticker=dup.get("ticker"),
                    description=dup.get("description"),
                    trans_code=dup.get("trans_code"),
                    quantity=str(dup["quantity"]) if dup.get("quantity") is not None else "",
                    price=str(dup["price"]) if dup.get("price") is not None else "",
                    amount=str(dup.get("amount", "")),
                )
            )
        for dup in db_duplicates:
            db.add(
                UploadDuplicate(
                    upload_log_id=log.id,
                    dup_type="db",
                    activity_date=str(dup.get("activity_date", "")),
                    ticker=dup.get("ticker"),
                    description=dup.get("description"),
                    trans_code=dup.get("trans_code"),
                    quantity=str(dup["quantity"]) if dup.get("quantity") is not None else "",
                    price=str(dup["price"]) if dup.get("price") is not None else "",
                    amount=str(dup.get("amount", "")),
                )
            )

        log.status = "success"
        log.rows_inserted = inserted
        log.csv_duplicates = len(duplicates)
        log.db_duplicates = len(db_duplicates)
        db.commit()

        invalidate_cache()
        logger.info(
            f"Upload complete: {inserted} inserted, {len(duplicates)} CSV dups, "
            f"{len(db_duplicates)} DB dups, {len(failed_rows)} failed"
        )

        return {
            "message": f"Successfully uploaded {inserted} transactions"
            + (
                f" ({len(duplicates)} CSV duplicates, {len(db_duplicates)} DB duplicates)"
                if (duplicates or db_duplicates)
                else ""
            ),
            "rows_inserted": inserted,
            "duplicates": duplicates,
            "db_duplicates": db_duplicates,
        }

    except Exception as e:
        log.status = "error"
        log.error_message = str(e)
        db.commit()
        logger.error(f"Upload error: {e}", exc_info=True)
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=f"Error during upload: {str(e)}")


@router.post("/upload-duplicates", response_model=UploadResponse)
async def upload_duplicates(request: UploadDuplicatesRequest, db: Session = Depends(get_db)):
    """Upload previously identified duplicate transactions."""
    logger.info(f"Uploading {len(request.transactions)} duplicate transactions")

    try:
        inserted = 0
        for trans_data in request.transactions:
            # Helper function to parse date string
            def parse_date_str(date_str):
                if not date_str:
                    return None
                if isinstance(date_str, str):
                    try:
                        return datetime.strptime(date_str, "%Y-%m-%d").date()
                    except Exception:
                        return None
                return date_str

            # Convert TransactionData to dict for Transaction model
            trans_dict = {
                "broker": trans_data.broker,
                "activity_date": parse_date_str(trans_data.activity_date),
                "process_date": parse_date_str(trans_data.process_date),
                "settle_date": parse_date_str(trans_data.settle_date),
                "ticker": trans_data.ticker,
                "description": trans_data.description,
                "trans_code": trans_data.trans_code,
                "quantity": trans_data.quantity,
                "price": trans_data.price,
                "amount": trans_data.amount,
            }

            # Check if transaction already exists in database
            existing = (
                db.query(Transaction)
                .filter(
                    and_(
                        Transaction.broker == trans_dict["broker"],
                        Transaction.activity_date == trans_dict["activity_date"],
                        Transaction.trans_code == trans_dict["trans_code"],
                        Transaction.ticker == trans_dict["ticker"],
                        Transaction.quantity == trans_dict["quantity"],
                        Transaction.amount == trans_dict["amount"],
                    )
                )
                .first()
            )

            if not existing:
                db_trans = Transaction(**trans_dict)
                db.add(db_trans)
                inserted += 1
                logger.debug(
                    f"Inserted duplicate: {trans_dict['ticker']} on {trans_dict['activity_date']}"
                )

        db.commit()
        logger.info(f"Successfully inserted {inserted} duplicate transactions")
        invalidate_cache()

        return {
            "message": f"Successfully uploaded {inserted} transactions",
            "rows_inserted": inserted,
            "duplicates": [],
        }

    except Exception as e:
        logger.error(f"Error uploading duplicates: {str(e)}", exc_info=True)
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=f"Error uploading duplicates: {str(e)}")
