from fastapi import APIRouter

router = APIRouter(tags=["reports"])


@router.get("/reports/summary")
def summary():
    return {
        "report_type": "weekly_intelligence_package",
        "district": "Bengaluru Urban",
        "summary": [
            "Theft and burglary remain the dominant incidents, with pockets clustered near transit corridors.",
            "Public safety score remains stable, but hotspot density is elevated over the past 7 days.",
            "Field response support should be prioritized for Hebbal and Koramangala beats."
        ]
    }
