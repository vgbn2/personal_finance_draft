"""
Architect Engine — Hybrid Retrieval Engine

Combines BM25 keyword scoring with ChromaDB vector similarity
for robust constraint retrieval. The hybrid approach ensures both
semantic understanding AND keyword-dense rules are surfaced.

Pipeline:
  1. Vector search (ChromaDB) → semantic similarity
  2. BM25 search (rank_bm25) → keyword relevance
  3. Reciprocal Rank Fusion → merge both rankings
  4. Precedence re-ranking → business priority
  5. Threshold gate → only high-confidence results
"""

from __future__ import annotations

import math
import logging
from typing import Dict, List, Optional, Any, Tuple

from rank_bm25 import BM25Okapi

from .. import config
from ..db.schema import ArchitectDB
from ..db.vector_store import ConstraintVectorStore

logger = logging.getLogger(__name__)


class HybridRetriever:
    """
    Hybrid BM25 + Vector search over the constraint store.

    Uses Reciprocal Rank Fusion (RRF) to combine rankings from
    vector similarity search and BM25 keyword search, then
    re-ranks by precedence.
    """

    # RRF constant (standard value from the original paper)
    RRF_K = 60

    def __init__(
        self,
        db: Optional[ArchitectDB] = None,
        vector_store: Optional[ConstraintVectorStore] = None,
        vector_weight: float = 0.6,
        bm25_weight: float = 0.4,
    ):
        self.db = db or ArchitectDB()
        self.vs = vector_store or ConstraintVectorStore()
        self.vector_weight = vector_weight
        self.bm25_weight = bm25_weight

        # BM25 corpus (loaded on first query)
        self._bm25: Optional[BM25Okapi] = None
        self._bm25_constraints: List[Dict[str, Any]] = []

    def connect(self):
        """Initialize both stores."""
        self.db.connect()
        self.vs.connect()

    def _build_bm25_index(self):
        """Build BM25 index from all active constraints."""
        constraints = self.db.list_constraints(include_deprecated=False)
        self._bm25_constraints = constraints

        # Tokenize: combine rule_text + rationale for richer matching
        corpus = []
        for c in constraints:
            text = f"{c['rule_text']} {c.get('rationale', '')}"
            tokens = text.lower().split()
            corpus.append(tokens)

        if corpus:
            self._bm25 = BM25Okapi(corpus)
        else:
            self._bm25 = None

        logger.debug("BM25 index built with %d documents", len(corpus))

    def _vector_search(
        self,
        query: str,
        top_k: int,
        domain_filter: Optional[str],
    ) -> List[Tuple[str, float]]:
        """
        Vector similarity search.
        Returns list of (constraint_id, similarity_score).
        """
        results = self.vs.query(
            prompt=query,
            top_k=top_k,
            threshold=0.0,  # Don't threshold here; we threshold after fusion
            domain_filter=domain_filter,
        )
        return [(r["id"], r["similarity"]) for r in results]

    def _bm25_search(
        self,
        query: str,
        top_k: int,
        domain_filter: Optional[str],
    ) -> List[Tuple[str, float]]:
        """
        BM25 keyword search.
        Returns list of (constraint_id, bm25_score).
        """
        if self._bm25 is None:
            self._build_bm25_index()

        if self._bm25 is None or not self._bm25_constraints:
            return []

        tokens = query.lower().split()
        scores = self._bm25.get_scores(tokens)

        # Pair with constraint IDs and filter by domain
        scored = []
        for i, score in enumerate(scores):
            c = self._bm25_constraints[i]
            if domain_filter and c["domain"] != domain_filter:
                continue
            if score > 0:
                scored.append((c["id"], float(score)))

        # Sort by score descending and take top-k
        scored.sort(key=lambda x: -x[1])
        return scored[:top_k]

    def _reciprocal_rank_fusion(
        self,
        vector_results: List[Tuple[str, float]],
        bm25_results: List[Tuple[str, float]],
    ) -> Dict[str, float]:
        """
        Merge two ranked lists using Reciprocal Rank Fusion.

        RRF_score(d) = w_v / (k + rank_v(d)) + w_b / (k + rank_b(d))

        Items appearing in only one list still get partial credit.
        """
        scores: Dict[str, float] = {}
        k = self.RRF_K

        # Vector ranking contribution
        for rank, (cid, _sim) in enumerate(vector_results, start=1):
            scores[cid] = scores.get(cid, 0.0) + self.vector_weight / (k + rank)

        # BM25 ranking contribution
        for rank, (cid, _score) in enumerate(bm25_results, start=1):
            scores[cid] = scores.get(cid, 0.0) + self.bm25_weight / (k + rank)

        return scores

    def search(
        self,
        query: str,
        top_k: int = config.TOP_K,
        threshold: float = 0.0,
        domain_filter: Optional[str] = None,
        precedence_boost: float = 0.3,
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search: vector + BM25 with RRF fusion and precedence re-ranking.

        Args:
            query: The user prompt or search text
            top_k: Maximum results to return
            threshold: Minimum RRF score (0.0 = no threshold)
            domain_filter: Optional domain to filter by
            precedence_boost: How much to boost high-precedence constraints

        Returns:
            List of constraint dicts with 'rrf_score', 'vector_rank',
            'bm25_rank', and 'final_score' fields.
        """
        # Rebuild BM25 index (cheap for <1000 docs)
        self._build_bm25_index()

        # Run both searches
        vec_results = self._vector_search(query, top_k * 2, domain_filter)
        bm25_results = self._bm25_search(query, top_k * 2, domain_filter)

        # Fuse rankings
        rrf_scores = self._reciprocal_rank_fusion(vec_results, bm25_results)

        if not rrf_scores:
            return []

        # Build rank lookup for provenance
        vec_rank = {cid: rank for rank, (cid, _) in enumerate(vec_results, 1)}
        bm25_rank = {cid: rank for rank, (cid, _) in enumerate(bm25_results, 1)}

        # Get full constraint data and compute final scores
        results = []
        for cid, rrf_score in rrf_scores.items():
            constraint = self.db.get_constraint(cid)
            if not constraint or constraint.get("deprecated_at"):
                continue

            # Precedence boost: normalize precedence to [0, 1] and add weighted boost
            prec_normalized = constraint["precedence"] / 100.0
            final_score = rrf_score + (precedence_boost * prec_normalized * rrf_score)

            results.append({
                **constraint,
                "rrf_score": round(rrf_score, 6),
                "final_score": round(final_score, 6),
                "vector_rank": vec_rank.get(cid),
                "bm25_rank": bm25_rank.get(cid),
            })

        # Sort by final_score descending
        results.sort(key=lambda r: -r["final_score"])

        # Apply threshold
        if threshold > 0:
            results = [r for r in results if r["final_score"] >= threshold]

        return results[:top_k]

    def search_with_lineage(
        self,
        query: str,
        session_id: str,
        top_k: int = config.TOP_K,
        threshold: float = 0.0,
        domain_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search and record constraint lineage for audit trail.
        Same as search() but also logs which constraints were retrieved.
        """
        results = self.search(query, top_k, threshold, domain_filter)

        for r in results:
            self.db.record_lineage(
                session_id=session_id,
                constraint_id=r["id"],
                similarity_score=r["final_score"],
                was_applied=True,
            )

        return results
