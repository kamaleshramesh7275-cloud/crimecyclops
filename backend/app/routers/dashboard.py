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
    closed_cases_row = conn.execute("SELECT COUNT(*) AS closed_cases FROM fir_records WHERE status = 'closed'").fetchone()
    avg_res = conn.execute("""
        SELECT AVG(julianday('now') - julianday(substr(incident_date,1,10))) AS avg_days
        FROM fir_records WHERE status = 'closed'
    """).fetchone()
    conn.close()

    total = totals["total_firs"] or 1
    closed = closed_cases_row["closed_cases"] or 0
    closure_rate = round((closed / total) * 100, 1)

    return {
        "total_firs": totals["total_firs"],
        "total_districts": districts["total_districts"],
        "total_stations": stations["total_stations"],
        "open_cases": open_cases["open_cases"],
        "closed_cases": closed,
        "closure_rate_pct": closure_rate,
        "avg_resolution_days": round(avg_res["avg_days"] or 0, 1),
    }


@router.get("/dashboard/trends")
def trends():
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT
            substr(incident_date, 1, 7) AS month,
            crime_type,
            COUNT(*) AS count
        FROM fir_records
        GROUP BY month, crime_type
        ORDER BY month ASC
    """).fetchall()

    type_totals: dict = {}
    for row in rows:
        ct = row["crime_type"]
        type_totals[ct] = type_totals.get(ct, 0) + row["count"]
    top_types = sorted(type_totals, key=lambda x: -type_totals[x])[:5]

    monthly: dict = {}
    for row in rows:
        m = row["month"] or "Unknown"
        if m not in monthly:
            monthly[m] = {}
        monthly[m][row["crime_type"]] = row["count"]

    series = []
    for month in sorted(monthly.keys())[-12:]:
        entry: dict = {"month": month}
        for t in top_types:
            entry[t] = monthly[month].get(t, 0)
        series.append(entry)

    conn.close()
    return {"data": series, "top_types": top_types}


@router.get("/dashboard/hotspots")
def hotspots():
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT station_id, COUNT(*) AS count, AVG(latitude) AS lat, AVG(longitude) AS lon FROM fir_records GROUP BY station_id ORDER BY count DESC LIMIT 12"
    ).fetchall()
    conn.close()
    return {"hotspots": [dict(row) for row in rows]}


@router.get("/dashboard/crime-categories")
def crime_categories():
    """Top crime categories by volume with percentages and chart colors."""
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT crime_type, COUNT(*) AS count
        FROM fir_records
        GROUP BY crime_type
        ORDER BY count DESC
        LIMIT 10
    """).fetchall()
    conn.close()

    total = sum(r["count"] for r in rows)
    colors = ["#c084fc", "#38bdf8", "#34d399", "#fb7185", "#fbbf24",
              "#a78bfa", "#f97316", "#e879f9", "#94a3b8", "#67e8f9"]
    result = [
        {
            "crime_type": r["crime_type"],
            "count": r["count"],
            "percentage": round((r["count"] / max(1, total)) * 100, 1),
            "color": colors[i % len(colors)],
        }
        for i, r in enumerate(rows)
    ]
    return {"categories": result, "total": total}


@router.get("/dashboard/district-summary")
def district_summary():
    """Top 10 districts by FIR volume with open-case rates."""
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT
            d.name AS district_name,
            COUNT(f.id) AS total_firs,
            SUM(CASE WHEN f.status != 'closed' THEN 1 ELSE 0 END) AS open_cases,
            SUM(CASE WHEN f.status = 'closed' THEN 1 ELSE 0 END) AS closed_cases
        FROM fir_records f
        JOIN districts d ON f.district_id = d.id
        GROUP BY d.name
        ORDER BY total_firs DESC
        LIMIT 10
    """).fetchall()
    conn.close()

    result = []
    for i, r in enumerate(rows):
        total = r["total_firs"] or 1
        open_rate = round((r["open_cases"] / total) * 100, 1)
        color = "#fb7185" if open_rate > 60 else ("#fbbf24" if open_rate > 35 else "#34d399")
        result.append({
            "rank": i + 1,
            "district_name": r["district_name"],
            "total_firs": r["total_firs"],
            "open_cases": r["open_cases"],
            "closed_cases": r["closed_cases"],
            "open_rate_pct": open_rate,
            "open_rate_color": color,
        })
    return {"districts": result}


@router.get("/dashboard/recent-activity")
def recent_activity():
    """Last 10 FIR records ordered by incident_date descending."""
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT
            f.id,
            f.crime_type,
            f.status,
            f.incident_date,
            d.name AS district_name,
            s.name AS station_name
        FROM fir_records f
        LEFT JOIN districts d ON f.district_id = d.id
        LEFT JOIN stations s ON f.station_id = s.id
        ORDER BY f.incident_date DESC
        LIMIT 10
    """).fetchall()
    conn.close()
    return {"recent": [dict(r) for r in rows]}
