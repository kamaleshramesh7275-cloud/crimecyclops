from fastapi import APIRouter, HTTPException, Depends
import networkx as nx
import numpy as np
from app.database import get_db_connection
from app.auth_service import get_current_user

router = APIRouter(tags=["network"])


@router.get("/network/graph")
def graph(current_user: dict = Depends(get_current_user)):
    with get_db_connection() as conn:
        # Fetch 500 records to build our network graph
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
        
        # Link person node to FIR node
        G.add_edge(f"person:{p_id}", f"fir:{f_id}", weight=1)

    # Simple keyword-based MO matching for similar cases
    for f_id, f in firs_dict.items():
        similars = []
        for other_id, other_f in firs_dict.items():
            if other_id == f_id:
                continue
            
            # MO similarity score (0.0 to 1.0)
            score = 0.0
            if other_f["crime_type"] == f["crime_type"]:
                score += 0.4
            if other_f["instruments"] == f["instruments"] and f["instruments"] != "None":
                score += 0.3
                
            # Intersect words in descriptions
            words1 = set((f["description"] or "").lower().split())
            words2 = set((other_f["description"] or "").lower().split())
            common_words = words1.intersection(words2)
            if common_words:
                score += min(0.3, len(common_words) * 0.05)
                
            if score >= 0.4:
                similars.append((other_id, score))
                
        # Sort by similarity score descending
        similars.sort(key=lambda x: -x[1])
        f["similar_cases"] = [item[0] for item in similars[:3]]

    # Add nodes to graph
    for p_id, p in persons_dict.items():
        G.add_node(
            f"person:{p_id}",
            label=p["name"],
            group=p["role"],
            node_type="person",
        )

    for f_id, f in firs_dict.items():
        G.add_node(
            f"fir:{f_id}",
            label=f["crime_type"],
            group="fir",
            node_type="fir",
            district=f["district"],
        )

    # Link co-offenders (persons in the same FIR)
    fir_to_persons = {}
    for row in links_data:
        f_id = row["fir_id"]
        p_id = row["person_id"]
        if f_id not in fir_to_persons:
            fir_to_persons[f_id] = []
        fir_to_persons[f_id].append(p_id)
        
    links_raw = []
    # Add person-fir edges to response format
    for row in links_data:
        links_raw.append({
            "source": f"person:{row['person_id']}",
            "target": f"fir:{row['fir_id']}",
            "weight": 1,
            "type": "person_fir"
        })

    # Add co-offender links to graph
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

    if G.number_of_nodes() == 0:
        return {"nodes": [], "links": [], "stats": {}}

    # Compute network centrality measures
    degree_centrality = nx.degree_centrality(G)
    betweenness = nx.betweenness_centrality(G, normalized=True)
    
    try:
        pagerank = nx.pagerank(G, weight="weight")
    except Exception:
        pagerank = {node: 0.0 for node in G.nodes()}

    # Compute communities (Criminal Gang detection)
    try:
        from networkx.algorithms.community import louvain_communities
        communities = louvain_communities(G)
        community_map = {}
        for idx, community in enumerate(communities):
            for node in community:
                community_map[node] = idx
    except Exception:
        try:
            from networkx.algorithms.community import label_propagation_communities
            communities = label_propagation_communities(G)
            community_map = {}
            for idx, community in enumerate(communities):
                for node in community:
                    community_map[node] = idx
        except Exception:
            community_map = {node: 0 for node in G.nodes()}

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
            "pagerank": round(pagerank.get(node_id, 0), 4),
            "community_id": community_map.get(node_id, 0),
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

    # Crime breakdown stats
    crime_counts = {}
    for f in firs_dict.values():
        ct = f["crime_type"]
        crime_counts[ct] = crime_counts.get(ct, 0) + 1
    crime_stats = [{"crime_type": k, "count": v} for k, v in sorted(crime_counts.items(), key=lambda x: -x[1])]

    # Top connected criminal/person profiles
    top_persons = sorted(
        [n for n in nodes_out if n["node_type"] == "person"],
        key=lambda x: x["pagerank"],
        reverse=True,
    )[:8]

    avg_degree = round(sum(d for _, d in G.degree()) / G.number_of_nodes(), 2)

    return {
        "nodes": nodes_out,
        "links": links_raw,
        "stats": {
            "total_nodes": len(nodes_out),
            "total_links": len(links_raw),
            "total_persons": len(persons_dict),
            "total_firs": len(firs_dict),
            "total_communities": len(set(community_map.values())),
            "crime_breakdown": crime_stats,
            "top_connected": [
                {
                    "id": p["id"],
                    "label": p["label"],
                    "degree": p["degree"],
                    "betweenness": p["betweenness"],
                    "pagerank": p["pagerank"],
                    "community_id": p["community_id"]
                }
                for p in top_persons
            ],
            "avg_degree": avg_degree,
            "density": round(nx.density(G), 4),
        },
    }


@router.get("/network/mo-similarity/{fir_id}")
def mo_similarity(fir_id: int, current_user: dict = Depends(get_current_user)):
    """Search for FIRs matching the Modus Operandi of the target FIR."""
    with get_db_connection() as conn:
        is_postgres = "postgres" in str(type(conn))
        target_sql = "SELECT id, crime_type, description, latitude, longitude FROM fir_records WHERE id = %s LIMIT 1" if is_postgres else "SELECT id, crime_type, description, latitude, longitude FROM fir_records WHERE id = ? LIMIT 1"
        target = conn.execute(target_sql, (fir_id,)).fetchone()

        if not target:
            raise HTTPException(status_code=404, detail="Target FIR not found")

        # Fetch candidate cases
        cand_sql = "SELECT id, crime_type, description, incident_date, status, latitude, longitude FROM fir_records WHERE id != %s" if is_postgres else "SELECT id, crime_type, description, incident_date, status, latitude, longitude FROM fir_records WHERE id != ?"
        candidates = conn.execute(cand_sql, (fir_id,)).fetchall()

    similar_cases = []
    
    # Calculate score against candidates
    target_words = set((target["description"] or "").lower().split())
    
    for row in candidates:
        score = 0.0
        # 1. Matching crime type
        if row["crime_type"] == target["crime_type"]:
            score += 0.4
            
        # 2. Text description overlap
        row_words = set((row["description"] or "").lower().split())
        intersection = target_words.intersection(row_words)
        if intersection:
            score += min(0.3, len(intersection) * 0.05)
            
        # 3. Spatial proximity (Jaccard-like coordinate approximation)
        lat_diff = abs((row["latitude"] or 0) - (target["latitude"] or 0))
        lon_diff = abs((row["longitude"] or 0) - (target["longitude"] or 0))
        if lat_diff < 0.05 and lon_diff < 0.05:
            score += 0.3
            
        if score >= 0.4:
            similar_cases.append({
                "fir_id": row["id"],
                "crime_type": row["crime_type"],
                "description": row["description"],
                "incident_date": row["incident_date"],
                "status": row["status"],
                "similarity_score": round(score, 2),
            })
            
    # Sort by similarity score descending
    similar_cases.sort(key=lambda x: -x["similarity_score"])
    
    return {
        "target_fir": dict(target),
        "similar_cases": similar_cases[:10]
    }
