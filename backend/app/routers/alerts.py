from fastapi import APIRouter

router = APIRouter(tags=["alerts"])


@router.get("/alerts")
def alerts():
    return {
        "alerts": [
            {"type": "hotspot", "district": "Bengaluru Urban", "severity": "high", "message": "Burglary spike detected in Hebbal beat"},
            {"type": "anomaly", "district": "Mysuru", "severity": "medium", "message": "Vehicle theft trend above rolling baseline"}
        ]
    }
