from fastapi import APIRouter, Depends
from app.database import get_db_connection
from app.auth_service import get_current_user

router = APIRouter(tags=["public_safety"])

HELPLINES = [
    {"name": "Emergency Response Support System", "number": "112", "category": "General Emergency", "icon": "🚨"},
    {"name": "National Cyber Crime Helpline", "number": "1930", "category": "Cyber Fraud & Online Scams", "icon": "💻"},
    {"name": "Women Helpline", "number": "1091", "category": "Women & Child Safety", "icon": "🛡️"},
    {"name": "Senior Citizen Helpline", "number": "14567", "category": "Elder Assistance", "icon": "🤝"},
    {"name": "Karnataka Police WhatsApp Assist", "number": "+91 94808 01000", "category": "Public Feedback & Assistance", "icon": "📱"},
]

ADVISORIES = [
    {
        "id": "ADV-2026-01",
        "title": "Cyber Stock Trading & APK Fraud Prevention",
        "category": "Cyber Safety",
        "severity": "high",
        "date": "2026-07-15",
        "summary": "Beware of unverified WhatsApp & Telegram stock investment advice promising 500% returns. Do NOT install third-party APK packages sent via direct messaging.",
        "tips": [
            "Never download trading apps from external links or chat groups.",
            "Verify all stock broking apps on SEBI official portal before depositing funds.",
            "Report suspect fraudulent accounts to 1930 immediately."
        ]
    },
    {
        "id": "ADV-2026-02",
        "title": "Night Burglary Prevention Vigilance",
        "category": "Property Safety",
        "severity": "medium",
        "date": "2026-07-10",
        "summary": "Increased night burglary attempts reported in peripheral suburban layouts during monsoon travel. Ensure CCTV outdoor coverage and inform beat officers if traveling.",
        "tips": [
            "Use auto-timer smart lighting for unoccupied houses.",
            "Inform local beat constable via KSP City App when out of city.",
            "Double lock main balcony and rear terrace access doors."
        ]
    },
    {
        "id": "ADV-2026-03",
        "title": "Synthetic MDMA & Narcotics Awareness",
        "category": "Substance Prevention",
        "severity": "high",
        "date": "2026-07-05",
        "summary": "Community alert regarding clandestine narcotic distribution targeting college campuses. Anonymous tip lines active.",
        "tips": [
            "Parents & institution wardens advised to monitor unverified weekend rave events.",
            "Submit anonymous tips via KSP Portal — strict identity protection assured."
        ]
    }
]


@router.get("/public/safety-index")
def get_safety_index():
    """Calculates District Safety Index (DSI) grades and returns public safety advisories & emergency helplines."""
    conn = get_db_connection()
    
    districts = conn.execute("""
        SELECT d.id, d.name, d.population_density, d.literacy_rate, d.unemployment_proxy,
               COUNT(f.id) as total_incidents,
               SUM(CASE WHEN f.status = 'closed' THEN 1 ELSE 0 END) as closed_incidents
        FROM districts d
        LEFT JOIN fir_records f ON d.id = f.district_id
        GROUP BY d.id, d.name, d.population_density, d.literacy_rate, d.unemployment_proxy
    """).fetchall()
    
    conn.close()
    
    results = []
    for row in districts:
        incidents = row["total_incidents"] or 0
        closed = row["closed_incidents"] or 0
        lit = row["literacy_rate"] or 0.75
        unemp = row["unemployment_proxy"] or 0.15
        
        # Calculate composite score (0 - 100)
        # Higher score = safer district
        res_rate = (closed / max(1, incidents)) * 100
        incident_penalty = min(40.0, (incidents / 400.0) * 20.0)
        
        raw_score = 75.0 + (lit * 15.0) - (unemp * 20.0) + (res_rate * 0.15) - incident_penalty
        safety_score = round(max(35.0, min(98.0, raw_score)), 1)
        
        if safety_score >= 85:
            grade = "A+"
            status = "Low Risk / Safe Zone"
            color = "#34d399"
        elif safety_score >= 75:
            grade = "A"
            status = "Moderate Risk / High Vigilance"
            color = "#38bdf8"
        elif safety_score >= 65:
            grade = "B"
            status = "Elevated Monitoring Zone"
            color = "#fbbf24"
        else:
            grade = "C"
            status = "High Alert / Priority Patrol Zone"
            color = "#fb7185"
            
        results.append({
            "district_id": row["id"],
            "district_name": row["name"],
            "safety_score": safety_score,
            "grade": grade,
            "status": status,
            "color": color,
            "total_incidents": incidents,
            "resolution_rate_pct": round(res_rate, 1),
            "literacy_rate_pct": round(lit * 100, 1),
        })
        
    # Sort highest safety score first
    results.sort(key=lambda x: x["safety_score"], reverse=True)
    
    return {
        "district_safety_scores": results,
        "helplines": HELPLINES,
        "advisories": ADVISORIES
    }
