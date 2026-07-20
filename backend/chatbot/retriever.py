from typing import Dict, Any, List
from chatbot.config import TOP_K, SIMILARITY_THRESHOLD
from chatbot.vectorstore import vector_store_instance

def retrieve_context(query: str, top_k: int = TOP_K) -> Dict[str, Any]:
    """Retrieve top-K matching documents for query and build structured citations."""
    results = vector_store_instance.search(query, top_k=top_k)
    
    context_chunks = []
    sources = []
    max_score = 0.0
    
    for doc, score in results:
        if score > max_score:
            max_score = score
            
        context_chunks.append(doc["text"])
        
        meta = doc.get("metadata", {})
        source_info = {
            "source": meta.get("source", "CrimeCyclops Dataset"),
            "dataset": meta.get("dataset", "sqlite_db"),
            "similarity_score": round(float(score), 3),
            "details": doc["text"][:140] + "..." if len(doc["text"]) > 140 else doc["text"]
        }
        if "fir_id" in meta and meta["fir_id"]:
            source_info["fir_id"] = meta["fir_id"]
        if "district" in meta and meta["district"]:
            source_info["district"] = meta["district"]
        if "station" in meta and meta["station"]:
            source_info["station"] = meta["station"]
            
        sources.append(source_info)
        
    context_str = "\n\n".join([f"--- Source {i+1} [{sources[i]['source']}] ---\n{chunk}" for i, chunk in enumerate(context_chunks)])
    
    # Calculate confidence score between 0.0 and 1.0
    confidence = round(min(max(max_score, 0.0), 1.0), 2)
    
    return {
        "context": context_str,
        "sources": sources,
        "confidence": confidence,
        "has_context": len(context_chunks) > 0 and max_score >= SIMILARITY_THRESHOLD
    }
