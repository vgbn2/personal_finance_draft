"""
Architect Engine -- Telemetry Scoring

Implements the complexity/proficiency scoring algorithm:

  Complexity(S) = alpha*N + beta*I + delta*D
  Proficiency(S) = Complexity(S) / (1 + gamma * error_rate)

Where:
  N = node count (components used)
  I = interface count (cross-component interactions)
  D = deployment complexity (estimated)
  error_rate = corrections / total_generations
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

from .. import config
from ..db.schema import ArchitectDB

logger = logging.getLogger(__name__)


class TelemetryScorer:
    """
    Computes and tracks engineering complexity and proficiency scores.
    """

    def __init__(self, db: Optional[ArchitectDB] = None):
        self.db = db or ArchitectDB()

    def connect(self):
        self.db.connect()

    def compute_complexity(
        self,
        node_count: int,
        interface_count: int,
        deploy_complexity: float = 0.0,
    ) -> float:
        """
        Compute complexity score for a session.

        C = alpha*N + beta*I + delta*D
        """
        return (
            config.COMPLEXITY_WEIGHT_NODE * node_count
            + config.COMPLEXITY_WEIGHT_INTERFACE * interface_count
            + config.COMPLEXITY_WEIGHT_DEPLOY * deploy_complexity
        )

    def compute_proficiency(
        self,
        complexity: float,
        error_rate: float,
    ) -> float:
        """
        Compute proficiency score.

        P = C / (1 + gamma * error_rate)
        """
        return complexity / (1 + config.PROFICIENCY_ERROR_WEIGHT * error_rate)

    def get_trend(self, limit: int = 50) -> Dict[str, Any]:
        """
        Compute trend statistics from recent sessions.

        Returns:
            avg_complexity, avg_proficiency, total_sessions,
            complexity_trend (slope), domain_breakdown
        """
        metrics = self.db.get_metrics_history(limit=limit)
        if not metrics:
            return {
                "avg_complexity": 0.0,
                "avg_proficiency": 0.0,
                "total_sessions": 0,
                "complexity_trend": 0.0,
                "domain_breakdown": {},
            }

        complexities = [m["complexity_score"] for m in metrics]
        proficiencies = [m["proficiency_score"] for m in metrics]

        # Simple linear trend via first-last difference
        if len(complexities) >= 2:
            trend = (complexities[0] - complexities[-1]) / len(complexities)
        else:
            trend = 0.0

        # Domain breakdown
        domain_counts: Dict[str, int] = {}
        for m in metrics:
            d = m.get("domain", "unknown")
            domain_counts[d] = domain_counts.get(d, 0) + 1

        return {
            "avg_complexity": sum(complexities) / len(complexities),
            "avg_proficiency": sum(proficiencies) / len(proficiencies),
            "total_sessions": len(metrics),
            "complexity_trend": trend,
            "domain_breakdown": domain_counts,
        }

    def get_constraint_usage(self) -> List[Dict[str, Any]]:
        """
        Get aggregate constraint usage statistics from lineage data.
        """
        conn = self.db.connect()
        rows = conn.execute("""
            SELECT
                constraint_id,
                COUNT(*) as times_applied,
                AVG(similarity_score) as avg_similarity,
                SUM(CASE WHEN was_applied = 1 THEN 1 ELSE 0 END) as applied_count,
                SUM(CASE WHEN was_applied = 0 THEN 1 ELSE 0 END) as overridden_count
            FROM constraint_lineage
            GROUP BY constraint_id
            ORDER BY times_applied DESC
        """).fetchall()
        return [dict(r) for r in rows]
