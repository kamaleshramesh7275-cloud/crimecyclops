import numpy as np
from typing import List
import hashlib
from chatbot.config import EMBEDDING_MODEL_NAME

_ST_MODEL = None
_USE_ST = True

def get_embedding_model():
    """Lazy initialize SentenceTransformer model or fallback to light vectorizer."""
    global _ST_MODEL, _USE_ST
    if _ST_MODEL is not None or not _USE_ST:
        return _ST_MODEL
    try:
        from sentence_transformers import SentenceTransformer
        _ST_MODEL = SentenceTransformer(EMBEDDING_MODEL_NAME)
        return _ST_MODEL
    except Exception:
        _USE_ST = False
        return None

def _hash_vector(text: str, dim: int = 384) -> np.ndarray:
    """Deterministic normalized pseudo-embedding fallback vectorizer."""
    vec = np.zeros(dim, dtype=np.float32)
    words = text.lower().split()
    if not words:
        return vec
    for word in words:
        # Create deterministic hash across dimension indices
        h = int(hashlib.md5(word.encode('utf-8')).hexdigest(), 16)
        idx1 = h % dim
        idx2 = (h >> 16) % dim
        vec[idx1] += 1.0
        vec[idx2] += 0.5
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec

def encode_texts(texts: List[str]) -> np.ndarray:
    """Encode a list of text strings into vector embeddings."""
    if not texts:
        return np.empty((0, 384), dtype=np.float32)

    model = get_embedding_model()
    if model is not None:
        try:
            embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
            return embeddings.astype(np.float32)
        except Exception:
            pass

    # Fallback vectorizer
    embeddings = [_hash_vector(text) for text in texts]
    return np.array(embeddings, dtype=np.float32)
