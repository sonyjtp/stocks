from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from datetime import datetime
from ..database import get_db
from ..models import UploadLog, UploadError, UploadDuplicate, UploadTransaction, UploadLogDeletion
from ..cache import invalidate_cache
from ..logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["settings"])


@router.post("/settings/clear-cache")
def clear_cache():
    invalidate_cache()
    logger.info("Cache cleared via settings")
    return {"message": "Cache cleared successfully"}


@router.get("/upload-logs")
def get_upload_logs(db: Session = Depends(get_db)):
    logs = db.query(UploadLog).order_by(desc(UploadLog.upload_time)).all()
    return [
        {
            "id": log.id,
            "filename": log.filename,
            "upload_time": log.upload_time.isoformat() if log.upload_time else None,
            "status": log.status,
            "rows_parsed": log.rows_parsed,
            "rows_inserted": log.rows_inserted,
            "csv_duplicates": log.csv_duplicates,
            "db_duplicates": log.db_duplicates,
            "error_message": log.error_message,
            "failed_count": len(log.failed_rows),
            "has_duplicate_rows": len(log.duplicate_rows) > 0,
            "has_inserted_rows": len(log.inserted_transactions) > 0,
            "deletion": {
                "deleted_count": log.deletion.deleted_count,
                "deleted_at": log.deletion.deleted_at.isoformat(),
            } if log.deletion else None,
        }
        for log in logs
    ]


@router.get("/upload-logs/{log_id}/errors")
def get_upload_errors(log_id: int, db: Session = Depends(get_db)):
    errors = db.query(UploadError).filter(UploadError.upload_log_id == log_id).all()
    return [
        {
            "id": e.id,
            "activity_date": e.activity_date,
            "ticker": e.ticker,
            "description": e.description,
            "trans_code": e.trans_code,
            "quantity": e.quantity,
            "amount": e.amount,
            "reason": e.reason,
        }
        for e in errors
    ]


@router.get("/upload-logs/{log_id}/duplicates")
def get_upload_duplicates(log_id: int, db: Session = Depends(get_db)):
    dups = db.query(UploadDuplicate).filter(UploadDuplicate.upload_log_id == log_id).all()
    return [
        {
            "dup_type": d.dup_type,
            "activity_date": d.activity_date,
            "ticker": d.ticker,
            "description": d.description,
            "trans_code": d.trans_code,
            "quantity": d.quantity,
            "price": d.price,
            "amount": d.amount,
        }
        for d in dups
    ]


@router.delete("/upload-logs/{log_id}/transactions")
def rollback_upload_transactions(log_id: int, db: Session = Depends(get_db)):
    """Delete all transactions inserted by this upload from the database."""
    from ..models import Transaction
    links = db.query(UploadTransaction).filter(UploadTransaction.upload_log_id == log_id).all()
    tx_ids = [l.transaction_id for l in links]
    deleted = db.query(Transaction).filter(Transaction.id.in_(tx_ids)).delete(synchronize_session=False)
    db.add(UploadLogDeletion(upload_log_id=log_id, deleted_count=deleted, deleted_at=datetime.utcnow()))
    db.commit()
    invalidate_cache()
    return {"deleted_count": deleted}


@router.delete("/upload-logs/{log_id}")
def delete_upload_log(log_id: int, db: Session = Depends(get_db)):
    log = db.query(UploadLog).filter(UploadLog.id == log_id).first()
    if not log:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Log not found")
    db.delete(log)
    db.commit()
    return {"message": f"Log {log_id} deleted"}


@router.delete("/upload-logs")
def clear_all_upload_logs(db: Session = Depends(get_db)):
    db.query(UploadError).delete()
    db.query(UploadDuplicate).delete()
    db.query(UploadLog).delete()
    db.commit()
    return {"message": "All upload logs cleared"}
