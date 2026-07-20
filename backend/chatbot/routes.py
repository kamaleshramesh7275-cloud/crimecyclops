from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from chatbot.rag import run_rag_pipeline
from chatbot.memory import get_session_history, add_to_session, clear_session_history
from chatbot.dataset_loader import load_all_dataset
from chatbot.vectorstore import vector_store_instance

router = APIRouter(tags=["chatbot"])

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"

class ClearRequest(BaseModel):
    session_id: Optional[str] = "default"

@router.post("/chat")
def chat_endpoint(payload: ChatRequest):
    message = (payload.message or "").strip()
    session_id = payload.session_id or "default"

    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # Record user message in memory
    add_to_session(session_id, "user", message)

    try:
        res = run_rag_pipeline(message, session_id=session_id)
        
        # Record assistant response in memory
        add_to_session(
            session_id,
            "assistant",
            res["answer"],
            sources=res["sources"],
            confidence=res["confidence"]
        )

        return {
            "answer": res["answer"],
            "sources": res["sources"],
            "confidence": res["confidence"],
            "avatar_state": res["avatar_state"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chatbot processing error: {str(e)}")

@router.get("/chat/history")
def get_history(session_id: str = "default"):
    return {"history": get_session_history(session_id)}

@router.post("/chat/clear")
def clear_history(payload: ClearRequest):
    clear_session_history(payload.session_id or "default")
    return {"status": "cleared"}

@router.post("/rebuild-index")
def rebuild_index():
    try:
        docs = load_all_dataset()
        vector_store_instance.build_index(docs)
        return {
            "status": "index_rebuilt",
            "document_count": len(docs)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rebuild vector index: {str(e)}")
