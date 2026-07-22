from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from datetime import datetime
from app.database import get_db_connection
from app.auth_service import get_current_user

router = APIRouter(tags=["reports"])


@router.get("/reports/summary")
def summary(district_id: int = None, current_user: dict = Depends(get_current_user)):
    """Retrieve case-aging status, investigator workloads, and intelligence summary bullets."""
    conn = get_db_connection()
    
    where_clause = f"WHERE district_id = {district_id}" if district_id else ""
    where_clause_open = f"WHERE status != 'closed'" + (f" AND district_id = {district_id}" if district_id else "")

    # 1. Case-Aging Tracking
    firs = conn.execute(f"SELECT incident_date, status FROM fir_records {where_clause_open}").fetchall()
    
    today = datetime.now()
    aging = {
        "under_30_days": 0,
        "30_to_90_days": 0,
        "stagnant_over_90_days": 0
    }
    
    for row in firs:
        try:
            dt = datetime.strptime(row["incident_date"].split(" ")[0], "%Y-%m-%d")
            days = (today - dt).days
            if days < 30:
                aging["under_30_days"] += 1
            elif days <= 90:
                aging["30_to_90_days"] += 1
            else:
                aging["stagnant_over_90_days"] += 1
        except Exception:
            aging["under_30_days"] += 1

    # 2. Investigator Workloads
    officer_sql = """
        SELECT o.name, o.workload, s.name as station_name, d.name as district_name
        FROM officers o
        LEFT JOIN stations s ON o.station_id = s.id
        LEFT JOIN districts d ON s.district_id = d.id
    """
    if district_id:
        officer_sql += f" WHERE s.district_id = {district_id}"
    officer_sql += " ORDER BY o.workload DESC"

    officers = conn.execute(officer_sql).fetchall()
    
    workloads = [o["workload"] for o in officers]
    avg_workload = round(sum(workloads) / max(1, len(workloads)), 1)
    
    overloaded_officers = [
        {"name": o["name"], "station": o["station_name"], "district": dict(o).get("district_name", "Karnataka"), "workload": o["workload"]}
        for o in officers if o["workload"] > (avg_workload * 1.3)
    ]

    # 3. Dynamic Summary Bullet Points
    total_firs = conn.execute(f"SELECT COUNT(*) as c FROM fir_records {where_clause}").fetchone()["c"]
    open_firs = len(firs)
    top_crime_query = f"""
        SELECT crime_type, COUNT(*) as cnt 
        FROM fir_records {where_clause}
        GROUP BY crime_type 
        ORDER BY cnt DESC LIMIT 1
    """
    top_crime = conn.execute(top_crime_query).fetchone()
    top_crime_name = top_crime["crime_type"] if top_crime else "Unknown"
    
    districts_list = conn.execute("SELECT id, name FROM districts ORDER BY name").fetchall()
    district_options = [{"id": d["id"], "name": d["name"]} for d in districts_list]

    crime_dist = conn.execute(f"""
        SELECT crime_type, COUNT(*) as count 
        FROM fir_records {where_clause}
        GROUP BY crime_type 
        ORDER BY count DESC LIMIT 6
    """).fetchall()

    conn.close()

    summary_bullets = [
        f"A total of {total_firs} cases have been recorded. Current active open investigations stand at {open_firs}.",
        f"Primary crime category in this period is {top_crime_name}.",
        f"Average investigator workload is {avg_workload} active cases per officer across active stations.",
        f"Stagnancy alert: {aging['stagnant_over_90_days']} cases have remained under investigation for over 90 days."
    ]

    aging_chart_data = [
        {"category": "<30 Days (New)", "cases": aging["under_30_days"], "fill": "#34d399"},
        {"category": "30-90 Days (Active)", "cases": aging["30_to_90_days"], "fill": "#38bdf8"},
        {"category": ">90 Days (Stagnant)", "cases": aging["stagnant_over_90_days"], "fill": "#fb7185"}
    ]

    return {
        "report_type": "Karnataka State Intelligence Briefing Package",
        "aging_stats": aging,
        "aging_chart_data": aging_chart_data,
        "crime_distribution": [{"crime_type": c["crime_type"], "count": c["count"]} for c in crime_dist],
        "average_workload": avg_workload,
        "overloaded_investigators": overloaded_officers[:8],
        "summary": summary_bullets,
        "districts": district_options
    }



@router.get("/reports/executive-briefing", response_class=HTMLResponse)
def executive_briefing(current_user: dict = Depends(get_current_user)):
    """Generate a printable HTML Executive Briefing sheet detailing the state crime report."""
    data = summary(current_user=current_user)
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>CrimeCyclops Executive Briefing</title>
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 40px;
                background-color: #ffffff;
                color: #333333;
            }}
            .header {{
                text-align: center;
                border-bottom: 3px double #1a365d;
                padding-bottom: 20px;
                margin-bottom: 30px;
            }}
            .title {{
                font-size: 28px;
                font-weight: bold;
                color: #1a365d;
                text-transform: uppercase;
                margin: 0;
            }}
            .subtitle {{
                font-size: 14px;
                color: #4a5568;
                margin-top: 5px;
            }}
            .section {{
                margin-bottom: 25px;
            }}
            .section-title {{
                font-size: 18px;
                font-weight: bold;
                color: #2c5282;
                border-bottom: 1px solid #e2e8f0;
                padding-bottom: 5px;
                margin-bottom: 15px;
            }}
            .grid {{
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 20px;
                margin-bottom: 25px;
            }}
            .card {{
                border: 1px solid #cbd5e0;
                border-radius: 6px;
                padding: 15px;
                text-align: center;
                background-color: #f7fafc;
            }}
            .card-val {{
                font-size: 24px;
                font-weight: bold;
                color: #2b6cb0;
            }}
            .card-lbl {{
                font-size: 12px;
                color: #718096;
                text-transform: uppercase;
                margin-top: 5px;
            }}
            .bullet-list {{
                line-height: 1.6;
                padding-left: 20px;
            }}
            .bullet-list li {{
                margin-bottom: 10px;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
            }}
            th, td {{
                border: 1px solid #e2e8f0;
                padding: 8px 12px;
                text-align: left;
                font-size: 13px;
            }}
            th {{
                background-color: #edf2f7;
                color: #2d3748;
            }}
            .print-btn {{
                background-color: #3182ce;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                font-weight: bold;
                cursor: pointer;
                float: right;
            }}
            @media print {{
                .print-btn {{
                    display: none;
                }}
            }}
        </style>
    </head>
    <body>
        <button class="print-btn" onclick="window.print()">Print Briefing</button>
        <div class="header">
            <h1 class="title">Karnataka State Police Intelligence Command</h1>
            <div class="subtitle">Crime Records Bureau Briefing — Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</div>
        </div>

        <div class="section">
            <div class="section-title">Key Intelligence Indicators</div>
            <div class="grid">
                <div class="card">
                    <div class="card-val">{data['aging_stats']['under_30_days']}</div>
                    <div class="card-lbl">New Cases (&lt;30 days)</div>
                </div>
                <div class="card">
                    <div class="card-val">{data['aging_stats']['stagnant_over_90_days']}</div>
                    <div class="card-lbl">Stagnant Cases (&gt;90 days)</div>
                </div>
                <div class="card">
                    <div class="card-val">{data['average_workload']}</div>
                    <div class="card-lbl">Avg Case Workload / Officer</div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Executive Summary</div>
            <ul class="bullet-list">
                {"".join([f"<li>{bullet}</li>" for bullet in data['summary']])}
            </ul>
        </div>

        <div class="section">
            <div class="section-title">Critical Investigator Workload Allocation</div>
            <p style="font-size: 13px; color: #4a5568;">The following officers have active caseloads exceeding 150% of the state average and should be evaluated for support reallocation:</p>
            <table>
                <thead>
                    <tr>
                        <th>Officer Name</th>
                        <th>Station Beat Location</th>
                        <th>Active Caseload</th>
                    </tr>
                </thead>
                <tbody>
                    {"".join([
                        f"<tr><td>{o['name']}</td><td>{o['station']}</td><td>{o['workload']} cases</td></tr>"
                        for o in data['overloaded_investigators']
                    ]) if data['overloaded_investigators'] else "<tr><td colspan='3' style='text-align:center;'>No critical workload imbalances detected.</td></tr>"}
                </tbody>
            </table>
        </div>
    </body>
    </html>
    """
    return html_content
