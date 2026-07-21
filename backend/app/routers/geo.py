from fastapi import APIRouter, HTTPException, Query, Depends
from app.database import get_db_connection
from typing import Optional
from app.auth_service import get_current_user

router = APIRouter(tags=["geo"])


def _build_fir_filters(crime_type: Optional[str], status: Optional[str]):
    filters = []
    params = []
    if crime_type and crime_type != "All":
        filters.append("crime_type = ?")
        params.append(crime_type)
    if status and status != "All":
        if status == "Open":
            filters.append("status != 'closed'")
        elif status == "Closed":
            filters.append("status = 'closed'")
    return filters, params


@router.get("/geo/districts")
def get_districts(
    crime_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """Return all districts with aggregate crime stats for map choropleth."""
    conn = get_db_connection()
    
    filters, params = _build_fir_filters(crime_type, status)
    join_cond = " AND ".join(["f." + f for f in filters]) if filters else "1=1"
    
    districts = conn.execute(
        f"""
        SELECT
            d.id,
            d.name,
            d.population_density,
            d.literacy_rate,
            d.unemployment_proxy,
            COUNT(f.id) AS total_firs,
            SUM(CASE WHEN f.status != 'closed' THEN 1 ELSE 0 END) AS open_cases,
            AVG(f.latitude) AS centroid_lat,
            AVG(f.longitude) AS centroid_lon
        FROM districts d
        LEFT JOIN fir_records f ON f.district_id = d.id AND {join_cond}
        GROUP BY d.id
        ORDER BY total_firs DESC
        """,
        tuple(params)
    ).fetchall()

    result = []
    for row in districts:
        dist_dict = dict(row)
        # Top crime type for this district
        top = conn.execute(
            f"""
            SELECT crime_type, COUNT(*) AS cnt
            FROM fir_records 
            WHERE district_id = ? {'AND ' + ' AND '.join(filters) if filters else ''}
            GROUP BY crime_type ORDER BY cnt DESC LIMIT 1
            """,
            tuple([row["id"]] + params)
        ).fetchone()
        dist_dict["top_crime_type"] = top["crime_type"] if top else None
        dist_dict["top_crime_count"] = top["cnt"] if top else 0

        # Station count
        dist_dict["station_count"] = conn.execute(
            "SELECT COUNT(*) FROM stations WHERE district_id = ?", (row["id"],)
        ).fetchone()[0]

        result.append(dist_dict)

    conn.close()
    return {"districts": result}


@router.get("/geo/districts/{district_id}")
def get_district_detail(
    district_id: int,
    crime_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """Deep detail for one district: stations list + crime breakdown + 30-day trend."""
    conn = get_db_connection()

    district = conn.execute(
        "SELECT * FROM districts WHERE id = ?", (district_id,)
    ).fetchone()
    if not district:
        conn.close()
        raise HTTPException(status_code=404, detail="District not found")

    filters, params = _build_fir_filters(crime_type, status)
    join_cond = " AND ".join(["f." + f for f in filters]) if filters else "1=1"
    where_cond = " AND ".join(filters) if filters else "1=1"

    # Stations with their own FIR counts
    stations = conn.execute(
        f"""
        SELECT
            s.id,
            s.name,
            s.beat,
            s.latitude,
            s.longitude,
            COUNT(f.id) AS fir_count,
            SUM(CASE WHEN f.status != 'closed' THEN 1 ELSE 0 END) AS open_cases
        FROM stations s
        LEFT JOIN fir_records f ON f.station_id = s.id AND {join_cond}
        WHERE s.district_id = ?
        GROUP BY s.id
        ORDER BY fir_count DESC
        """,
        tuple(params + [district_id]),
    ).fetchall()

    # Crime type breakdown for the district
    crime_breakdown = conn.execute(
        f"""
        SELECT crime_type, COUNT(*) AS count
        FROM fir_records 
        WHERE district_id = ? AND {where_cond}
        GROUP BY crime_type ORDER BY count DESC
        """,
        tuple([district_id] + params),
    ).fetchall()

    # Monthly trend (last 12 months)
    trend = conn.execute(
        f"""
        SELECT
            substr(incident_date, 1, 7) AS month,
            COUNT(*) AS count
        FROM fir_records
        WHERE district_id = ? AND {where_cond}
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
        """,
        tuple([district_id] + params),
    ).fetchall()

    conn.close()
    return {
        "district": dict(district),
        "stations": [dict(s) for s in stations],
        "crime_breakdown": [dict(c) for c in crime_breakdown],
        "trend": [dict(t) for t in reversed(trend)],
    }


@router.get("/geo/stations/{station_id}")
def get_station_detail(station_id: int):
    """Full deep analysis for one station."""
    conn = get_db_connection()

    station = conn.execute(
        """
        SELECT s.*, d.name AS district_name
        FROM stations s
        JOIN districts d ON d.id = s.district_id
        WHERE s.id = ?
        """,
        (station_id,),
    ).fetchone()
    if not station:
        conn.close()
        raise HTTPException(status_code=404, detail="Station not found")

    # Crime type breakdown
    crime_breakdown = conn.execute(
        """
        SELECT crime_type, ipc_section, COUNT(*) AS count,
               SUM(CASE WHEN status != 'closed' THEN 1 ELSE 0 END) AS open_count
        FROM fir_records WHERE station_id = ?
        GROUP BY crime_type ORDER BY count DESC
        """,
        (station_id,),
    ).fetchall()

    # Monthly trend
    trend = conn.execute(
        """
        SELECT substr(incident_date, 1, 7) AS month, COUNT(*) AS count
        FROM fir_records WHERE station_id = ?
        GROUP BY month ORDER BY month DESC LIMIT 12
        """,
        (station_id,),
    ).fetchall()

    # Officer workload
    officers = conn.execute(
        "SELECT name, workload FROM officers WHERE station_id = ? ORDER BY workload DESC",
        (station_id,),
    ).fetchall()

    # Court outcome summary
    outcomes = conn.execute(
        """
        SELECT co.outcome, COUNT(*) AS count, AVG(co.conviction_rate) AS avg_rate
        FROM court_outcomes co
        JOIN fir_records f ON f.id = co.fir_id
        WHERE f.station_id = ?
        GROUP BY co.outcome
        """,
        (station_id,),
    ).fetchall()

    # Seizure summary
    seizures = conn.execute(
        """
        SELECT sz.seizure_type, COUNT(*) AS count
        FROM seizures sz
        JOIN fir_records f ON f.id = sz.fir_id
        WHERE f.station_id = ?
        GROUP BY sz.seizure_type ORDER BY count DESC
        """,
        (station_id,),
    ).fetchall()

    # Status summary
    status_summary = conn.execute(
        """
        SELECT status, COUNT(*) AS count
        FROM fir_records WHERE station_id = ?
        GROUP BY status
        """,
        (station_id,),
    ).fetchall()

    conn.close()
    return {
        "station": dict(station),
        "crime_breakdown": [dict(c) for c in crime_breakdown],
        "trend": [dict(t) for t in reversed(trend)],
        "officers": [dict(o) for o in officers],
        "court_outcomes": [dict(o) for o in outcomes],
        "seizures": [dict(s) for s in seizures],
        "status_summary": [dict(s) for s in status_summary],
    }


@router.get("/geo/state")
def get_state_overview():
    """Top-level Karnataka state summary."""
    conn = get_db_connection()
    total = conn.execute("SELECT COUNT(*) AS c FROM fir_records").fetchone()["c"]
    open_c = conn.execute(
        "SELECT COUNT(*) AS c FROM fir_records WHERE status != 'closed'"
    ).fetchone()["c"]
    districts = conn.execute("SELECT COUNT(*) AS c FROM districts").fetchone()["c"]
    stations = conn.execute("SELECT COUNT(*) AS c FROM stations").fetchone()["c"]

    top_crimes = conn.execute(
        "SELECT crime_type, COUNT(*) AS count FROM fir_records GROUP BY crime_type ORDER BY count DESC LIMIT 5"
    ).fetchall()

    monthly = conn.execute(
        """
        SELECT substr(incident_date,1,7) AS month, COUNT(*) AS count
        FROM fir_records GROUP BY month ORDER BY month DESC LIMIT 12
        """
    ).fetchall()

    conn.close()
    return {
        "state": "Karnataka",
        "total_firs": total,
        "open_cases": open_c,
        "total_districts": districts,
        "total_stations": stations,
        "top_crimes": [dict(c) for c in top_crimes],
        "monthly_trend": [dict(m) for m in reversed(monthly)],
    }


@router.get("/geo/socio-correlation")
def socio_correlation(current_user: dict = Depends(get_current_user)):
    """Expose Pearson correlation coefficients between crime rates and socio-economic markers."""
    conn = get_db_connection()
    
    # Query districts and aggregate counts
    districts = conn.execute("""
        SELECT 
            d.id, d.name, d.population_density, d.literacy_rate, d.unemployment_proxy,
            COUNT(f.id) as total_firs
        FROM districts d
        LEFT JOIN fir_records f ON f.district_id = d.id
        GROUP BY d.id
    """).fetchall()
    conn.close()
    
    if len(districts) < 2:
        return {"correlations": {}, "district_data": []}
        
    densities = []
    literacies = []
    unemployments = []
    crime_counts = []
    
    for row in districts:
        densities.append(row["population_density"] or 0.0)
        literacies.append(row["literacy_rate"] or 0.0)
        unemployments.append(row["unemployment_proxy"] or 0.0)
        crime_counts.append(row["total_firs"] or 0)
        
    import numpy as np
    
    # Compute Pearson Correlation matrix coefficients
    corr_density = float(np.corrcoef(densities, crime_counts)[0, 1]) if np.std(densities) > 0 and np.std(crime_counts) > 0 else 0.0
    corr_literacy = float(np.corrcoef(literacies, crime_counts)[0, 1]) if np.std(literacies) > 0 and np.std(crime_counts) > 0 else 0.0
    corr_unemployment = float(np.corrcoef(unemployments, crime_counts)[0, 1]) if np.std(unemployments) > 0 and np.std(crime_counts) > 0 else 0.0
    
    return {
        "correlations": {
            "population_density": round(corr_density, 3) if not np.isnan(corr_density) else 0.0,
            "literacy_rate": round(corr_literacy, 3) if not np.isnan(corr_literacy) else 0.0,
            "unemployment_rate": round(corr_unemployment, 3) if not np.isnan(corr_unemployment) else 0.0
        },
        "district_data": [
            {
                "name": r["name"],
                "total_firs": r["total_firs"],
                "population_density": r["population_density"],
                "literacy_rate": r["literacy_rate"],
                "unemployment_proxy": r["unemployment_proxy"]
            }
            for r in districts
        ]
    }
