from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from app.database import get_db_connection
from app.auth_service import get_current_user
from app.notify_utils import dispatch_email_alert, dispatch_sms_alert

router = APIRouter(tags=["alerts"])

STATIC_ALERTS = [
    {
        "id": "ALT-2026-901",
        "type": "spike_detected",
        "district": "Bengaluru Urban",
        "severity": "high",
        "timestamp": "2026-07-22 08:30",
        "crime_category": "Cyber Fraud",
        "message": "Critical spike: 18 stock trading APK scam complaints logged in Indiranagar & Whitefield within last 24h.",
        "recommended_action": "Deploy Cyber Crime Cell advisory notice to ISP gateways and alert beat officers.",
        "status": "open"
    },
    {
        "id": "ALT-2026-902",
        "type": "hotspot_escalation",
        "district": "Dakshina Kannada",
        "severity": "high",
        "timestamp": "2026-07-22 07:15",
        "crime_category": "Drug Trafficking",
        "message": "Seizure threshold breach: 450g synthetic MDMA intercepted at Ullal checkpost. Inter-state cartel link suspected.",
        "recommended_action": "Issue high-priority handoff to Narcotics Control Bureau (NCB) regional office.",
        "status": "open"
    },
    {
        "id": "ALT-2026-903",
        "type": "anomaly",
        "district": "Mysuru",
        "severity": "medium",
        "timestamp": "2026-07-21 21:40",
        "crime_category": "Vehicle Theft",
        "message": "Unusual pattern: 2-wheeler theft clusters near Gokulam & Devaraja Market during 18:00–22:00 window.",
        "recommended_action": "Increase evening motorcycle patrol density by 30% along Devaraja Market beat.",
        "status": "dispatched"
    },
    {
        "id": "ALT-2026-904",
        "type": "case_stagnancy",
        "district": "Kalaburagi",
        "severity": "medium",
        "timestamp": "2026-07-21 16:00",
        "crime_category": "Commercial Fraud",
        "message": "Case stagnancy flag: 14 open land forgery FIRs approaching >90 days threshold without charge-sheet filing.",
        "recommended_action": "Reallocate senior inspector supervisor to expedite forensic audit report.",
        "status": "open"
    },
    {
        "id": "ALT-2026-905",
        "type": "repeat_offender",
        "district": "Dharwad",
        "severity": "low",
        "timestamp": "2026-07-21 11:20",
        "crime_category": "Burglary",
        "message": "Network correlation match: Co-offender pattern detected linking Hubballi burglary #412 to Belagavi group.",
        "recommended_action": "Cross-reference suspect graph in Intelligence Network tab.",
        "status": "acknowledged"
    }
]

DISPATCH_LOGS = []


@router.get("/alerts")
def alerts(current_user: dict = Depends(get_current_user)):
    """Fetch active spatiotemporal spikes, high-severity alerts, and dispatch status queue."""
    conn = get_db_connection()
    
    recent = conn.execute("""
        SELECT district_id, crime_type, COUNT(*) as active_count
        FROM fir_records 
        WHERE incident_date >= '2026-07-01'
        GROUP BY district_id, crime_type
    """).fetchall()

    districts = conn.execute("SELECT id, name FROM districts").fetchall()
    d_map = {row["id"]: row["name"] for row in districts}
    
    conn.close()

    alerts_list = list(STATIC_ALERTS)

    # Real-time calculated alerts from recent data
    idx = 1
    for row in recent[:3]:
        d_id = row["district_id"]
        c_type = row["crime_type"]
        active = row["active_count"]
        d_name = d_map.get(d_id, "Karnataka District")
        
        alerts_list.append({
            "id": f"ALT-2026-RT{idx}",
            "type": "realtime_spike",
            "district": d_name,
            "severity": "high" if active > 30 else "medium",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "crime_category": c_type,
            "message": f"Real-time surge: {active} active {c_type} cases recorded in {d_name} during July 2026 monitoring window.",
            "recommended_action": f"Alert {d_name} District HQ superintendent to initiate spatiotemporal review.",
            "status": "open"
        })
        idx += 1

    return {
        "alerts": alerts_list,
        "dispatch_history": DISPATCH_LOGS
    }


@router.post("/alerts/dispatch")
async def dispatch_alert(payload: dict, current_user: dict = Depends(get_current_user)):
    """Dispatch an alert to field agents via SMS or Email channels."""
    target_channel = payload.get("channel") # 'sms' or 'email'
    recipient = payload.get("recipient")
    message = payload.get("message")
    alert_id = payload.get("alert_id", "ALT-GENERIC")

    if not recipient or not message:
        raise HTTPException(status_code=400, detail="Recipient and message content are required.")

    status_sent = False
    if target_channel == "sms":
        status_sent = await dispatch_sms_alert(recipient, message)
    elif target_channel == "email":
        status_sent = await dispatch_email_alert(
            recipient, 
            subject=f"CrimeCyclops Escalation Alert [{alert_id}]", 
            body=message
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid dispatch channel specified.")

    dispatch_entry = {
        "alert_id": alert_id,
        "channel": target_channel,
        "recipient": recipient,
        "message": message,
        "dispatched_by": current_user["username"],
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "status": "sent" if status_sent else "failed"
    }
    
    DISPATCH_LOGS.insert(0, dispatch_entry)

    return {"status": "dispatched" if status_sent else "failed", "entry": dispatch_entry}
