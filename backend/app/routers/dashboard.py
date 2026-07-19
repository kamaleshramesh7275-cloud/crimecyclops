from fastapi import APIRouter
from app.database import get_db_connection

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/overview")
def overview():
    conn = get_db_connection()
    totals = conn.execute("SELECT COUNT(*) AS total_firs FROM fir_records").fetchone()
    districts = conn.execute("SELECT COUNT(*) AS total_districts FROM districts").fetchone()
    stations = conn.execute("SELECT COUNT(*) AS total_stations FROM stations").fetchone()
    open_cases = conn.execute("SELECT COUNT(*) AS open_cases FROM fir_records WHERE status != 'closed'").fetchone()
    conn.close()
    return {
        "total_firs": totals["total_firs"],
        "total_districts": districts["total_districts"],
        "total_stations": stations["total_stations"],
        "open_cases": open_cases["open_cases"],
    }


@router.get("/dashboard/trends")
def trends():
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT incident_date, crime_type, COUNT(*) AS count FROM fir_records GROUP BY incident_date, crime_type ORDER BY incident_date LIMIT 20"
    ).fetchall()
    conn.close()
    return {"data": [dict(row) for row in rows]}


@router.get("/dashboard/hotspots")
def hotspots():
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT station_id, COUNT(*) AS count, AVG(latitude) AS lat, AVG(longitude) AS lon FROM fir_records GROUP BY station_id ORDER BY count DESC LIMIT 12"
    ).fetchall()
    conn.close()
    return {"hotspots": [dict(row) for row in rows]}
