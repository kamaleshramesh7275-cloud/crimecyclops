import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
FAISS_INDEX_DIR = DATA_DIR / "faiss_index"

# Create directories if missing
DATA_DIR.mkdir(parents=True, exist_ok=True)
FAISS_INDEX_DIR.mkdir(parents=True, exist_ok=True)

# RAG & Model Configuration
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")

# Chunking & Retrieval
CHUNK_SIZE = 500
CHUNK_OVERLAP = 100
TOP_K = 5
SIMILARITY_THRESHOLD = 0.25

# Default Grounded System Prompt
SYSTEM_PROMPT = """You are CrimeCyclops AI, an expert Karnataka State Police intelligence & public safety assistant.
Answer ONLY using the provided context from the Karnataka Crime Intelligence Dataset. Never invent or hallucinate facts.
If the requested information is unavailable in the context, clearly reply:
"I couldn't find this information in the available dataset."

Always mention source documents, FIR IDs, police stations, or district names when relevant. Provide clear, structured, and helpful responses."""
