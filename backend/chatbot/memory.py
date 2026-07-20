from typing import Dict, List, Any
import time

# In-memory session store
_SESSION_STORAGE: Dict[str, List[Dict[str, Any]]] = {}

def get_session_history(session_id: str) -> List[Dict[str, Any]]:
    """Retrieve chat history for a session."""
    return _SESSION_STORAGE.get(session_id, [])

def add_to_session(session_id: str, sender: str, text: str, sources: List[Dict[str, Any]] = None, confidence: float = None) -> None:
    """Add message to session history."""
    if session_id not in _SESSION_STORAGE:
        _SESSION_STORAGE[session_id] = []
        
    entry = {
        "id": f"msg_{int(time.time()*1000)}",
        "sender": sender,
        "text": text,
        "timestamp": time.strftime("%H:%M"),
    }
    if sources:
        entry["sources"] = sources
    if confidence is not None:
        entry["confidence"] = confidence
        
    _SESSION_STORAGE[session_id].append(entry)
    
    # Cap session history length
    if len(_SESSION_STORAGE[session_id]) > 30:
        _SESSION_STORAGE[session_id] = _SESSION_STORAGE[session_id][-30:]

def clear_session_history(session_id: str) -> None:
    """Clear chat history for session."""
    if session_id in _SESSION_STORAGE:
        _SESSION_STORAGE[session_id] = []
