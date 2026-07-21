import numpy as np
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sklearn.neighbors import KernelDensity
from sklearn.ensemble import IsolationForest
from app.database import get_db_connection
from app.auth_service import get_current_user
from chatbot.embeddings import encode_texts

router = APIRouter(tags=["analytics"])


@router.get("/analytics/predictive-risk")
def predictive_risk(current_user: dict = Depends(get_current_user)):
    """Generate geospatial predictive risk scores using Gaussian Kernel Density Estimation (KDE) and trend projection."""
    conn = get_db_connection()
    firs = conn.execute("""
        SELECT latitude, longitude, incident_date 
        FROM fir_records 
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """).fetchall()
    conn.close()

    if len(firs) < 5:
        return {"grid": [], "predicted_total": len(firs)}

    # Extract coordinates
    coords = np.array([[row["latitude"], row["longitude"]] for row in firs if row["latitude"] and row["longitude"]])
    
    # 1. Spatiotemporal forecasting: predict next month's volume based on simple trend projection
    dates = []
    for row in firs:
        try:
            # Parse YYYY-MM-DD
            dt = row["incident_date"].split(" ")[0]
            dates.append(dt[:7])  # YYYY-MM
        except Exception:
            pass
            
    months, counts = np.unique(dates, return_counts=True)
    if len(counts) >= 2:
        # Simple linear regression to project next month
        x = np.arange(len(counts))
        slope, intercept = np.polyfit(x, counts, 1)
        predicted_next = max(5, int(slope * (len(counts)) + intercept))
    else:
        predicted_next = len(firs) // max(1, len(months))

    # 2. Spatial KDE
    kde = KernelDensity(bandwidth=0.03, kernel='gaussian')
    kde.fit(coords)

    # Build a standard spatial grid across Karnataka boundaries based on data bounding box
    min_lat, max_lat = coords[:, 0].min(), coords[:, 0].max()
    min_lon, max_lon = coords[:, 1].min(), coords[:, 1].max()

    # Generate grid coordinates (15x15 resolution for demo performance)
    grid_lat = np.linspace(min_lat, max_lat, 15)
    grid_lon = np.linspace(min_lon, max_lon, 15)
    
    grid_points = []
    for lat in grid_lat:
        for lon in grid_lon:
            grid_points.append([lat, lon])
            
    grid_points = np.array(grid_points)
    
    # Compute density values
    log_dens = kde.score_samples(grid_points)
    densities = np.exp(log_dens)
    
    # Scale density values to range 0-100 representing risk score
    max_dens = densities.max() if densities.max() > 0 else 1.0
    scaled_scores = (densities / max_dens) * 100

    grid_results = []
    for i, pt in enumerate(grid_points):
        grid_results.append({
            "latitude": float(round(pt[0], 4)),
            "longitude": float(round(pt[1], 4)),
            "risk_score": float(round(scaled_scores[i], 1))
        })

    # Sort to return hot sectors first
    grid_results.sort(key=lambda x: -x["risk_score"])

    return {
        "grid": grid_results[:100],  # Return top 100 hottest grid sectors
        "predicted_next_month_volume": predicted_next,
        "bandwidth_used": 0.03
    }


@router.get("/analytics/anomalies")
def detect_anomalies(current_user: dict = Depends(get_current_user)):
    """Run unsupervised Isolation Forest anomaly detection on weekly aggregated district crime counts."""
    conn = get_db_connection()
    
    # Query weekly incident volume counts per district
    # Aggregating by year-week (e.g. YYYY-WW)
    is_postgres = "postgres" in str(type(conn))
    
    if is_postgres:
        raw_data = conn.execute("""
            SELECT 
                d.name as district_name,
                to_char(to_date(f.incident_date, 'YYYY-MM-DD'), 'IYYY-IW') as year_week,
                COUNT(f.id) as incident_count,
                SUM(CASE WHEN f.status != 'closed' THEN 1 ELSE 0 END)::float / COUNT(f.id) as open_ratio
            FROM fir_records f
            JOIN districts d ON f.district_id = d.id
            GROUP BY district_name, year_week
            ORDER BY year_week
        """).fetchall()
    else:
        raw_data = conn.execute("""
            SELECT 
                d.name as district_name,
                strftime('%Y-%W', incident_date) as year_week,
                COUNT(f.id) as incident_count,
                CAST(SUM(CASE WHEN f.status != 'closed' THEN 1 ELSE 0 END) AS REAL) / COUNT(f.id) as open_ratio
            FROM fir_records f
            JOIN districts d ON f.district_id = d.id
            GROUP BY district_name, year_week
            ORDER BY year_week
        """).fetchall()
        
    conn.close()

    if len(raw_data) < 10:
        return {"anomalies": [], "total_checked": len(raw_data)}

    # Convert to feature matrices
    # Features: [weekly_count, open_ratio, percent_change_from_district_average]
    district_averages = {}
    for row in raw_data:
        d_name = row["district_name"]
        if d_name not in district_averages:
            district_averages[d_name] = []
        district_averages[d_name].append(row["incident_count"])
        
    for k, v in district_averages.items():
        district_averages[k] = np.mean(v)

    features = []
    rows_mapped = []
    
    for row in raw_data:
        d_name = row["district_name"]
        avg = district_averages[d_name] or 1.0
        percent_diff = (row["incident_count"] - avg) / avg
        
        features.append([
            float(row["incident_count"]),
            float(row["open_ratio"] or 0.0),
            float(percent_diff)
        ])
        
        rows_mapped.append({
            "district": d_name,
            "year_week": row["year_week"],
            "count": row["incident_count"],
            "open_ratio": round(row["open_ratio"] or 0.0, 2),
            "deviation": round(percent_diff * 100, 1)
        })

    X = np.array(features)
    
    # Train Isolation Forest
    clf = IsolationForest(contamination=0.1, random_state=42)
    preds = clf.fit_predict(X)
    scores = clf.decision_function(X)

    anomalies_out = []
    for idx, pred in enumerate(preds):
        if pred == -1: # Flagged as an outlier
            item = rows_mapped[idx]
            item["anomaly_score"] = float(round(-scores[idx], 3))
            anomalies_out.append(item)

    # Sort anomalies by score descending
    anomalies_out.sort(key=lambda x: -x["anomaly_score"])

    return {
        "anomalies": anomalies_out,
        "total_checked": len(raw_data),
        "outlier_ratio": 0.1
    }


@router.get("/analytics/spike-alerts")
def spike_alerts(current_user: dict = Depends(get_current_user)):
    """Flag districts and crime types experiencing abnormal spikes (rolling 7-day volume vs historical averages)."""
    conn = get_db_connection()
    
    # Get 7-day counts
    recent_counts = conn.execute("""
        SELECT district_id, crime_type, COUNT(*) as active_count
        FROM fir_records 
        WHERE incident_date >= date('now', '-7 days') OR incident_date >= CAST(CURRENT_DATE - INTERVAL '7 days' AS VARCHAR)
        GROUP BY district_id, crime_type
    """).fetchall()

    # Get historical totals
    historical_avgs = conn.execute("""
        SELECT district_id, crime_type, COUNT(*) as hist_total
        FROM fir_records
        GROUP BY district_id, crime_type
    """).fetchall()
    
    # Fetch district names mapping
    districts = conn.execute("SELECT id, name FROM districts").fetchall()
    d_map = {row["id"]: row["name"] for row in districts}
    
    conn.close()

    hist_dict = {(row["district_id"], row["crime_type"]): row["hist_total"] for row in historical_avgs}

    spikes = []
    
    for row in recent_counts:
        d_id = row["district_id"]
        c_type = row["crime_type"]
        active = row["active_count"]
        
        hist_total = hist_dict.get((d_id, c_type), 0)
        # Approximate historical weekly average (assuming 52 weeks historical scale)
        hist_weekly_avg = max(1.0, hist_total / 52.0)
        
        # If active week is >3 times higher than historic weekly average, trigger spike
        if active > 2 and active > (hist_weekly_avg * 2.5):
            spikes.append({
                "district": d_map.get(d_id, f"District {d_id}"),
                "crime_type": c_type,
                "current_7day_count": active,
                "historical_weekly_average": round(hist_weekly_avg, 2),
                "severity": "High" if active > (hist_weekly_avg * 4.0) else "Medium",
                "message": f"Sudden spike in {c_type} incidents: {active} cases recorded in last 7 days compared to average of {hist_weekly_avg:.1f} per week."
            })
            
    return {
        "spikes": spikes,
        "total_active_categories": len(recent_counts)
    }
