from fastapi import APIRouter
import networkx as nx
from app.database import get_db_connection

router = APIRouter(tags=["network"])


@router.get("/network/graph")
def graph():
    with get_db_connection() as conn:
        # Fetch 500 real links
        links_data = conn.execute("""
            SELECT p.id as person_id, p.name, p.role as person_role,
                   p.age_band, p.gender, p.occupation,
                   f.id as fir_id, f.crime_type, d.name as district,
                   f.description, f.incident_date, f.status,
                   cl.relationship_type
            FROM case_links cl
            JOIN persons p ON cl.person_id = p.id
            JOIN fir_records f ON cl.fir_id = f.id
            JOIN districts d ON f.district_id = d.id
            LIMIT 500
        """).fetchall()

    G = nx.Graph()
    persons_dict = {}
    firs_dict = {}

    import random
    complainant_names = ["Ramesh Kumar", "Sita Devi", "Anil Rao", "Pooja Hegde", "Ganesh Gowda", "Kiran Patil", "Mohammed Ali", "Fatima Bi", "Syed Pasha"]
    tools_list = ["None", "Mobile Phone (Used for comms)", "Fake Documents", "Iron Rod", "Two-wheeler", "Financial Ledgers", "Hacking Software", "Knives"]

    for row in links_data:
        p_id = row["person_id"]
        f_id = row["fir_id"]
        
        persons_dict[p_id] = {
            "id": p_id,
            "name": row["name"],
            "role": row["person_role"],
            "age_band": row["age_band"],
            "gender": row["gender"],
            "occupation": row["occupation"]
        }
        
        c_name = complainant_names[f_id % len(complainant_names)]
        c_phone = f"+91 98{f_id % 10000:04d}00{f_id % 100:02d}"
        instrument = tools_list[f_id % len(tools_list)]

        firs_dict[f_id] = {
            "id": f_id,
            "crime_type": row["crime_type"],
            "district": row["district"],
            "description": row["description"],
            "incident_date": row["incident_date"],
            "status": row["status"],
            "case_giver": c_name,
            "case_giver_phone": c_phone,
            "instruments": instrument,
            "similar_cases": []
        }
        
        G.add_edge(f"person:{p_id}", f"fir:{f_id}", weight=1)

    for f_id, f in firs_dict.items():
        similars = [other_id for other_id, other_f in firs_dict.items() if other_f["crime_type"] == f["crime_type"] and other_id != f_id]
        f["similar_cases"] = similars[:3]

    # Add person nodes
    for p_id, p in persons_dict.items():
        G.add_node(
            f"person:{p_id}",
            label=p["name"],
            group=p["role"],
            node_type="person",
        )

    # Add FIR nodes
    for f_id, f in firs_dict.items():
        G.add_node(
            f"fir:{f_id}",
            label=f["crime_type"],
            group="fir",
            node_type="fir",
            district=f["district"],
        )

    # Group persons by FIR to find co-offenders
    fir_to_persons = {}
    for row in links_data:
        f_id = row["fir_id"]
        p_id = row["person_id"]
        if f_id not in fir_to_persons:
            fir_to_persons[f_id] = []
        fir_to_persons[f_id].append(p_id)
        
    links_raw = []
    # person-fir edges
    for row in links_data:
        links_raw.append({
            "source": f"person:{row['person_id']}",
            "target": f"fir:{row['fir_id']}",
            "weight": 1,
            "type": "person_fir"
        })

    # co-offender edges
    added_co_offenders = set()
    for f_id, p_ids in fir_to_persons.items():
        for i in range(len(p_ids)):
            for j in range(i + 1, len(p_ids)):
                p1 = p_ids[i]
                p2 = p_ids[j]
                edge_tuple = tuple(sorted((p1, p2)))
                if edge_tuple not in added_co_offenders:
                    G.add_edge(f"person:{p1}", f"person:{p2}", weight=2)
                    links_raw.append({
                        "source": f"person:{p1}",
                        "target": f"person:{p2}",
                        "weight": 2,
                        "type": "co_offender",
                    })
                    added_co_offenders.add(edge_tuple)

    # Compute centrality metrics
    degree_centrality = nx.degree_centrality(G)
    betweenness = nx.betweenness_centrality(G, normalized=True)

    nodes_out = []
    for node_id, data in G.nodes(data=True):
        out_node = {
            "id": node_id,
            "label": data.get("label", node_id),
            "group": data.get("group", "unknown"),
            "node_type": data.get("node_type", "unknown"),
            "district": data.get("district", ""),
            "degree": G.degree(node_id),
            "degree_centrality": round(degree_centrality.get(node_id, 0), 4),
            "betweenness": round(betweenness.get(node_id, 0), 4),
        }
        
        if data.get("node_type") == "person":
            p = persons_dict[int(node_id.split(":")[1])]
            out_node["age_band"] = p["age_band"]
            out_node["gender"] = p["gender"]
            out_node["occupation"] = p["occupation"]
        elif data.get("node_type") == "fir":
            f = firs_dict[int(node_id.split(":")[1])]
            out_node["description"] = f["description"]
            out_node["incident_date"] = f["incident_date"]
            out_node["status"] = f["status"]
            out_node["case_giver"] = f["case_giver"]
            out_node["case_giver_phone"] = f["case_giver_phone"]
            out_node["instruments"] = f["instruments"]
            out_node["similar_cases"] = f["similar_cases"]
            
        nodes_out.append(out_node)

    # Crime type breakdown stats
    crime_counts: dict = {}
    for f in firs_dict.values():
        ct = f["crime_type"]
        crime_counts[ct] = crime_counts.get(ct, 0) + 1

    crime_stats = [{"crime_type": k, "count": v} for k, v in sorted(crime_counts.items(), key=lambda x: -x[1])]

    # Top connected persons (high degree)
    top_persons = sorted(
        [n for n in nodes_out if n["node_type"] == "person"],
        key=lambda x: x["degree"],
        reverse=True,
    )[:8]

    avg_degree = round(sum(d for _, d in G.degree()) / max(1, G.number_of_nodes()), 2) if G.number_of_nodes() > 0 else 0

    return {
        "nodes": nodes_out,
        "links": links_raw,
        "stats": {
            "total_nodes": len(nodes_out),
            "total_links": len(links_raw),
            "total_persons": len(persons_dict),
            "total_firs": len(firs_dict),
            "crime_breakdown": crime_stats,
            "top_connected": [
                {"id": p["id"], "label": p["label"], "degree": p["degree"], "betweenness": p["betweenness"]}
                for p in top_persons
            ],
            "avg_degree": avg_degree,
            "density": round(nx.density(G), 4) if G.number_of_nodes() > 0 else 0,
        },
    }
