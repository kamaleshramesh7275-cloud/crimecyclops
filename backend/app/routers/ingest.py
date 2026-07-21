from fastapi import APIRouter, UploadFile, Depends
from app.database import get_db_connection
from app.seed_data import seed_demo_data
from app.auth_service import get_current_user
from app.audit import log_action

router = APIRouter(tags=["ingestion"])


@router.post("/ingest/seed")
def seed(current_user: dict = Depends(get_current_user)):
    seed_demo_data()
    log_action(current_user["username"], "seed_demo_data", "database")
    return {"status": "seeded"}


@router.post("/ingest/upload")
async def upload(file: UploadFile, current_user: dict = Depends(get_current_user)):
    payload = await file.read()
    lines = payload.decode("utf-8", errors="ignore").splitlines()
    valid_rows = 0
    errors = []
    if len(lines) < 2:
        log_action(current_user["username"], "upload_failed_no_rows", f"file:{file.filename}")
        return {"status": "error", "errors": ["No data rows found"]}
        
    header = [item.strip().lower() for item in lines[0].split(",")]
    for idx, row in enumerate(lines[1:], start=2):
        cols = row.split(",")
        if len(cols) != len(header):
            errors.append(f"Row {idx}: malformed")
            continue
        valid_rows += 1
        
    log_action(current_user["username"], "upload_file_processed", f"file:{file.filename}, rows:{valid_rows}")
    return {"status": "ok", "rows_read": valid_rows, "errors": errors}
