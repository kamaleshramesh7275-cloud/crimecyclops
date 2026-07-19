from fastapi import APIRouter, UploadFile
from app.database import get_db_connection
from app.seed_data import seed_demo_data

router = APIRouter(tags=["ingestion"])


@router.post("/ingest/seed")
def seed():
    seed_demo_data()
    return {"status": "seeded"}


@router.post("/ingest/upload")
async def upload(file: UploadFile):
    payload = await file.read()
    lines = payload.decode("utf-8", errors="ignore").splitlines()
    valid_rows = 0
    errors = []
    if len(lines) < 2:
        return {"status": "error", "errors": ["No data rows found"]}
    header = [item.strip().lower() for item in lines[0].split(",")]
    for idx, row in enumerate(lines[1:], start=2):
        cols = row.split(",")
        if len(cols) != len(header):
            errors.append(f"Row {idx}: malformed")
            continue
        valid_rows += 1
    return {"status": "ok", "rows_read": valid_rows, "errors": errors}
