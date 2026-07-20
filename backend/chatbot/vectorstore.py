import json
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Tuple
from chatbot.config import FAISS_INDEX_DIR
from chatbot.embeddings import encode_texts

_FAISS_AVAILABLE = True
try:
    import faiss
except ImportError:
    _FAISS_AVAILABLE = False

class VectorStore:
    def __init__(self):
        self.documents: List[Dict[str, Any]] = []
        self.vectors: np.ndarray = np.empty((0, 384), dtype=np.float32)
        self.faiss_index = None

    def build_index(self, docs: List[Dict[str, Any]]) -> None:
        """Build vector index from document list."""
        if not docs:
            self.documents = []
            self.vectors = np.empty((0, 384), dtype=np.float32)
            self.faiss_index = None
            return

        texts = [doc["text"] for doc in docs]
        vecs = encode_texts(texts)
        
        # Normalize vectors for cosine similarity
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        vecs = vecs / norms

        self.documents = docs
        self.vectors = vecs

        if _FAISS_AVAILABLE:
            dim = vecs.shape[1]
            index = faiss.IndexFlatIP(dim)
            index.add(vecs)
            self.faiss_index = index

        self.save_to_disk()

    def search(self, query: str, top_k: int = 5) -> List[Tuple[Dict[str, Any], float]]:
        """Perform similarity search for query text."""
        if len(self.documents) == 0:
            return []

        query_vec = encode_texts([query])
        norm = np.linalg.norm(query_vec)
        if norm > 0:
            query_vec = query_vec / norm

        if _FAISS_AVAILABLE and self.faiss_index is not None:
            scores, indices = self.faiss_index.search(query_vec, min(top_k, len(self.documents)))
            results = []
            for idx, score in zip(indices[0], scores[0]):
                if 0 <= idx < len(self.documents):
                    results.append((self.documents[idx], float(score)))
            return results
        else:
            # Fallback cosine similarity matrix multiplication
            sims = np.dot(self.vectors, query_vec.T).squeeze()
            if sims.ndim == 0:
                sims = np.array([sims])
            top_indices = np.argsort(sims)[::-1][:top_k]
            results = []
            for idx in top_indices:
                results.append((self.documents[idx], float(sims[idx])))
            return results

    def save_to_disk(self) -> None:
        """Persist index metadata and vectors to disk."""
        FAISS_INDEX_DIR.mkdir(parents=True, exist_ok=True)
        meta_file = FAISS_INDEX_DIR / "metadata.json"
        vec_file = FAISS_INDEX_DIR / "vectors.npy"

        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(self.documents, f, indent=2)

        np.save(vec_file, self.vectors)

        if _FAISS_AVAILABLE and self.faiss_index is not None:
            faiss.write_index(self.faiss_index, str(FAISS_INDEX_DIR / "faiss.index"))

    def load_from_disk(self) -> bool:
        """Load persisted index from disk if available."""
        meta_file = FAISS_INDEX_DIR / "metadata.json"
        vec_file = FAISS_INDEX_DIR / "vectors.npy"

        if not meta_file.exists() or not vec_file.exists():
            return False

        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                self.documents = json.load(f)
            
            self.vectors = np.load(vec_file)

            if _FAISS_AVAILABLE:
                faiss_file = FAISS_INDEX_DIR / "faiss.index"
                if faiss_file.exists():
                    self.faiss_index = faiss.read_index(str(faiss_file))
                else:
                    dim = self.vectors.shape[1] if self.vectors.ndim > 1 else 384
                    index = faiss.IndexFlatIP(dim)
                    index.add(self.vectors)
                    self.faiss_index = index
            return True
        except Exception:
            return False

# Global Singleton Instance
vector_store_instance = VectorStore()
