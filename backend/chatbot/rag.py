import urllib.request
import json
import logging
from typing import Dict, Any, List
from chatbot.config import OLLAMA_URL, OLLAMA_MODEL, GROQ_API_KEY, GROQ_MODEL
from chatbot.retriever import retrieve_context
from chatbot.prompt import build_prompt
from chatbot.memory import get_session_history

logger = logging.getLogger("crimecyclops.rag")


def query_groq(prompt: str) -> str:
    """Call Groq cloud LLM API (free tier). Primary LLM for production."""
    if not GROQ_API_KEY:
        return ""
    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)
        chat = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=512,
            timeout=15,
        )
        return chat.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"Groq API error: {e}")
        return ""


def query_ollama(prompt: str) -> str:
    """Send prompt to local Ollama API server if running (dev fallback)."""
    url = f"{OLLAMA_URL.rstrip('/')}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                result = json.loads(resp.read().decode("utf-8"))
                return result.get("response", "").strip()
    except Exception as e:
        logger.warning(f"Ollama local LLM offline or unreachable: {e}")
    return ""


def generate_grounded_summary(query: str, sources: List[Dict[str, Any]]) -> str:
    """Generate a clean markdown summary directly grounded in retrieved source documents."""
    lines = [f"Based on the **Karnataka Crime Intelligence Dataset**, here is what I found regarding *\"{query}\"*:\n"]

    seen_sources = set()
    for idx, src in enumerate(sources, 1):
        source_name = src.get("source", f"Record #{idx}")
        details = src.get("details", "").strip()
        if source_name not in seen_sources:
            seen_sources.add(source_name)
            lines.append(f"### {source_name}")
            lines.append(f"> {details}\n")

    lines.append("---")
    lines.append("*All records retrieved strictly from CrimeCyclops database.*")
    return "\n".join(lines)


def run_rag_pipeline(query: str, session_id: str = "default") -> Dict[str, Any]:
    """Complete RAG Pipeline: Retrieve → Ground → Generate → Format.

    LLM priority:
      1. Groq API (cloud, free) — used when GROQ_API_KEY env var is set
      2. Ollama (local, dev) — fallback if Groq key not set
      3. Grounded document summary — final fallback, always works
    """
    history = get_session_history(session_id)
    retrieval = retrieve_context(query)

    sources = retrieval["sources"]
    confidence = retrieval["confidence"]
    has_context = retrieval["has_context"]

    # If no relevant context found in dataset
    if not has_context or not sources:
        return {
            "answer": "I couldn't find this information in the available dataset.",
            "sources": [],
            "confidence": 0.0,
            "avatar_state": "no_answer"
        }

    prompt = build_prompt(query, retrieval["context"], history)

    # 1. Try Groq first (works on Render, production)
    answer = query_groq(prompt)

    # 2. Try local Ollama if Groq not configured (local dev)
    if not answer:
        answer = query_ollama(prompt)

    # 3. Fallback: structured document summary (always works)
    if not answer:
        answer = generate_grounded_summary(query, sources)

    return {
        "answer": answer,
        "sources": sources,
        "confidence": confidence,
        "avatar_state": "success"
    }

