"""
Architect Engine — ChromaDB Vector Store

Wraps ChromaDB for semantic search over engineering constraints.
Uses sentence-transformers for local embedding generation.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Any

from .. import config

logger = logging.getLogger(__name__)


class ConstraintVectorStore:
    """
    ChromaDB-backed vector store for constraint retrieval.

    Each constraint is stored as a single document with metadata
    (domain, precedence, version). Queries return the top-K
    most semantically similar constraints above the threshold.
    """

    COLLECTION_NAME = "engineering_constraints"

    def __init__(self, persist_dir: Optional[str] = None):
        self._persist_dir = persist_dir or str(config.CHROMA_DIR)
        self._client = None
        self._collection = None

    def connect(self):
        """Initialize ChromaDB client and collection."""
        import chromadb
        from chromadb.utils import embedding_functions

        config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)

        self._client = chromadb.PersistentClient(path=self._persist_dir)

        # Use sentence-transformers for local embeddings
        ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=config.EMBEDDING_MODEL
        )

        self._collection = self._client.get_or_create_collection(
            name=self.COLLECTION_NAME,
            embedding_function=ef,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "ChromaDB connected: %d constraints in store",
            self._collection.count(),
        )

    @property
    def count(self) -> int:
        return self._collection.count() if self._collection else 0

    # ── Add / Update ─────────────────────────────────────

    def add_constraint(
        self,
        constraint_id: str,
        rule_text: str,
        domain: str,
        rationale: str = "",
        precedence: int = 50,
        version: int = 1,
    ):
        """Add or update a constraint in the vector store."""
        if self._collection is None:
            raise RuntimeError("Call connect() first")

        # Combine rule + rationale for richer embedding
        document = f"[{domain.upper()}] {rule_text}"
        if rationale:
            document += f" — Rationale: {rationale}"

        self._collection.upsert(
            ids=[constraint_id],
            documents=[document],
            metadatas=[{
                "domain": domain,
                "precedence": precedence,
                "version": version,
                "rule_text": rule_text,
                "rationale": rationale,
            }],
        )

    def delete_constraint(self, constraint_id: str):
        """Remove a constraint from the store."""
        if self._collection:
            self._collection.delete(ids=[constraint_id])

    # ── Query ────────────────────────────────────────────

    def query(
        self,
        prompt: str,
        top_k: int = config.TOP_K,
        threshold: float = config.SIMILARITY_THRESHOLD,
        domain_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve constraints relevant to a prompt.

        Returns list of dicts with keys:
          id, rule_text, domain, precedence, similarity, rationale
        """
        if self._collection is None:
            raise RuntimeError("Call connect() first")

        where_filter = {"domain": domain_filter} if domain_filter else None

        results = self._collection.query(
            query_texts=[prompt],
            n_results=min(top_k, self._collection.count() or top_k),
            where=where_filter,
            include=["metadatas", "distances", "documents"],
        )

        constraints = []
        if not results["ids"] or not results["ids"][0]:
            return constraints

        for i, cid in enumerate(results["ids"][0]):
            # ChromaDB returns distances (lower = more similar for cosine)
            # Convert to similarity: similarity = 1 - distance
            distance = results["distances"][0][i]
            similarity = 1.0 - distance

            if similarity < threshold:
                continue

            meta = results["metadatas"][0][i]
            constraints.append({
                "id": cid,
                "rule_text": meta.get("rule_text", ""),
                "domain": meta.get("domain", ""),
                "precedence": meta.get("precedence", 50),
                "rationale": meta.get("rationale", ""),
                "similarity": round(similarity, 4),
            })

        # Sort by precedence (descending), then similarity
        constraints.sort(key=lambda c: (-c["precedence"], -c["similarity"]))
        return constraints

    # ── Bulk Operations ──────────────────────────────────

    def sync_from_db(self, db_constraints: List[Dict[str, Any]]):
        """
        Sync all constraints from SQLite into ChromaDB.
        Used during initialization or after bulk imports.
        """
        for c in db_constraints:
            self.add_constraint(
                constraint_id=c["id"],
                rule_text=c["rule_text"],
                domain=c["domain"],
                rationale=c.get("rationale", ""),
                precedence=c.get("precedence", 50),
                version=c.get("version", 1),
            )
        logger.info("Synced %d constraints to vector store", len(db_constraints))

    def get_all(self) -> List[Dict[str, Any]]:
        """Return all stored constraints with metadata."""
        if not self._collection or self._collection.count() == 0:
            return []

        results = self._collection.get(
            include=["metadatas", "documents"],
        )

        items = []
        for i, cid in enumerate(results["ids"]):
            meta = results["metadatas"][i]
            items.append({
                "id": cid,
                "rule_text": meta.get("rule_text", ""),
                "domain": meta.get("domain", ""),
                "precedence": meta.get("precedence", 50),
                "rationale": meta.get("rationale", ""),
            })
        return items
