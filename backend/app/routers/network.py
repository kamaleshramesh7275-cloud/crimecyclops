from fastapi import APIRouter
from app.database import get_db_connection

router = APIRouter(tags=["network"])


@router.get("/network/graph")
def graph():
    conn = get_db_connection()
    persons = conn.execute("SELECT id, name, role FROM persons LIMIT 30").fetchall()
    firs = conn.execute("SELECT id, crime_type FROM fir_records LIMIT 25").fetchall()
    conn.close()

    nodes = [{"id": f"person:{p['id']}", "label": p["name"], "group": p["role"]} for p in persons]
    nodes.extend([{"id": f"fir:{f['id']}", "label": f["crime_type"], "group": "fir"} for f in firs])

    links = []
    for p in persons[:10]:
        links.append({"source": f"person:{p['id']}", "target": f"fir:{p['id'] % 25 + 1}"})
    return {"nodes": nodes, "links": links}
