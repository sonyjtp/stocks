from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..cache import invalidate_cache
from ..database import get_db
from ..logger import get_logger
from ..models import UploadDuplicate, UploadError, UploadLog, UploadLogDeletion, UploadTransaction

logger = get_logger(__name__)
router = APIRouter(prefix="/api", tags=["settings"])


@router.post("/settings/clear-cache")
def clear_cache():
    logger.debug("→ clear_cache()")
    invalidate_cache()
    logger.info("clear_cache: Redis cache cleared via settings endpoint")
    logger.debug("← clear_cache: done")
    return {"message": "Cache cleared successfully"}


@router.get("/upload-logs")
def get_upload_logs(db: Session = Depends(get_db)):
    logger.debug("→ get_upload_logs()")
    logs = db.query(UploadLog).order_by(desc(UploadLog.upload_time)).all()
    logger.info(f"get_upload_logs: returning {len(logs)} upload log(s)")
    logger.debug("← get_upload_logs: done")
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
            "deletion": (
                {
                    "deleted_count": log.deletion.deleted_count,
                    "deleted_at": log.deletion.deleted_at.isoformat(),
                }
                if log.deletion
                else None
            ),
        }
        for log in logs
    ]


@router.get("/upload-logs/{log_id}/errors")
def get_upload_errors(log_id: int, db: Session = Depends(get_db)):
    logger.debug(f"→ get_upload_errors(log_id={log_id})")
    errors = db.query(UploadError).filter(UploadError.upload_log_id == log_id).all()
    logger.debug(f"← get_upload_errors: {len(errors)} error row(s) for log {log_id}")
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
    logger.debug(f"→ get_upload_duplicates(log_id={log_id})")
    dups = db.query(UploadDuplicate).filter(UploadDuplicate.upload_log_id == log_id).all()
    logger.debug(f"← get_upload_duplicates: {len(dups)} duplicate row(s) for log {log_id}")
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
    logger.debug(f"→ rollback_upload_transactions(log_id={log_id})")
    from ..models import Transaction

    links = db.query(UploadTransaction).filter(UploadTransaction.upload_log_id == log_id).all()
    tx_ids = [lnk.transaction_id for lnk in links]
    logger.debug(
        f"rollback_upload_transactions: found {len(tx_ids)} transaction(s) linked to log {log_id}"
    )
    deleted = (
        db.query(Transaction).filter(Transaction.id.in_(tx_ids)).delete(synchronize_session=False)
    )
    db.add(
        UploadLogDeletion(upload_log_id=log_id, deleted_count=deleted, deleted_at=datetime.utcnow())
    )
    db.commit()
    invalidate_cache()
    logger.info(
        f"rollback_upload_transactions: deleted {deleted} transaction(s)"
        f" for log {log_id} — cache invalidated"
    )
    logger.debug("← rollback_upload_transactions: done")
    return {"deleted_count": deleted}


@router.delete("/upload-logs/{log_id}")
def delete_upload_log(log_id: int, db: Session = Depends(get_db)):
    logger.debug(f"→ delete_upload_log(log_id={log_id})")
    log = db.query(UploadLog).filter(UploadLog.id == log_id).first()
    if not log:
        logger.warning(f"delete_upload_log: log {log_id} not found")
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Log not found")
    db.delete(log)
    db.commit()
    logger.info(f"delete_upload_log: log {log_id} deleted")
    logger.debug("← delete_upload_log: done")
    return {"message": f"Log {log_id} deleted"}


@router.delete("/upload-logs")
def clear_all_upload_logs(db: Session = Depends(get_db)):
    logger.debug("→ clear_all_upload_logs()")
    db.query(UploadError).delete()
    db.query(UploadDuplicate).delete()
    db.query(UploadLog).delete()
    db.commit()
    logger.info("clear_all_upload_logs: all upload logs, errors, and duplicates cleared")
    logger.debug("← clear_all_upload_logs: done")
    return {"message": "All upload logs cleared"}
