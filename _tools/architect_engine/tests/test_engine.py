"""
Architect Engine — End-to-End Test Suite

Tests the full pipeline from DB init through retrieval to generation.
Run with: python -m pytest tests/ -v
"""

import os
import sys
import json
import shutil
import tempfile
from pathlib import Path

import pytest

# Ensure project root is on path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from architect_engine import config
from architect_engine.db.schema import ArchitectDB
from architect_engine.db.vector_store import ConstraintVectorStore
from architect_engine.retrieval.engine import HybridRetriever
from architect_engine.generator.prompt_builder import (
    classify_domains,
    detect_conflicts,
    build_augmented_prompt,
    build_generation_context,
)
from architect_engine.telemetry.scorer import TelemetryScorer


# ── Fixtures ─────────────────────────────────────────────


@pytest.fixture
def tmp_data_dir(tmp_path):
    """Create a temporary data directory for tests."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    return data_dir


@pytest.fixture
def db(tmp_data_dir):
    """Fresh SQLite database in temp dir."""
    db_path = tmp_data_dir / "test.db"
    database = ArchitectDB(db_path=db_path)
    database.connect()
    database.init_schema()
    database.seed_starter_constraints()
    yield database
    database.close()


@pytest.fixture
def vector_store(tmp_data_dir):
    """Fresh ChromaDB store in temp dir."""
    chroma_dir = tmp_data_dir / "chroma"
    vs = ConstraintVectorStore(persist_dir=chroma_dir)
    vs.connect()
    return vs


@pytest.fixture
def seeded_vector_store(db, vector_store):
    """Vector store synced with seeded constraints."""
    constraints = db.list_constraints()
    vector_store.sync_from_db(constraints)
    return vector_store


@pytest.fixture
def retriever(db, seeded_vector_store):
    """HybridRetriever with both stores connected."""
    r = HybridRetriever(db=db, vector_store=seeded_vector_store)
    r.connect()
    return r


# ── Phase 1: Database Tests ──────────────────────────────


class TestDatabase:
    """Tests for SQLite schema and CRUD operations."""

    def test_schema_creation(self, db):
        """init_schema creates all expected tables."""
        conn = db.connect()
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        table_names = {t["name"] for t in tables}

        assert "constraints" in table_names
        assert "sessions" in table_names
        assert "architectural_components" in table_names
        assert "progress_metrics" in table_names
        assert "constraint_lineage" in table_names
        assert "constraint_versions" in table_names

    def test_starter_constraints_seeded(self, db):
        constraints = db.list_constraints()
        assert len(constraints) == 10

    def test_constraint_domains(self, db):
        constraints = db.list_constraints()
        domains = {c["domain"] for c in constraints}
        assert "concurrency" in domains
        assert "risk" in domains
        assert "data_structures" in domains

    def test_add_constraint(self, db):
        db.add_constraint("T001", "testing", "Test rule", "Test rationale", 60)
        c = db.get_constraint("T001")
        assert c is not None
        assert c["domain"] == "testing"
        assert c["rule_text"] == "Test rule"
        assert c["precedence"] == 60

    def test_deprecate_constraint(self, db):
        db.add_constraint("T002", "testing", "Deprecate me", "", 50)
        success = db.deprecate_constraint("T002")
        assert success is True

        # Should not appear in default listing
        constraints = db.list_constraints()
        ids = [c["id"] for c in constraints]
        assert "T002" not in ids

        # Should appear with include_deprecated
        all_constraints = db.list_constraints(include_deprecated=True)
        ids = [c["id"] for c in all_constraints]
        assert "T002" in ids

    def test_filter_by_domain(self, db):
        risk_constraints = db.list_constraints(domain="risk")
        assert all(c["domain"] == "risk" for c in risk_constraints)
        assert len(risk_constraints) >= 2  # C004, C005

    def test_precedence_ordering(self, db):
        constraints = db.list_constraints()
        precedences = [c["precedence"] for c in constraints]
        assert precedences == sorted(precedences, reverse=True)


# ── Phase 2: Versioning Tests ────────────────────────────


class TestVersioning:
    """Tests for constraint version management."""

    def test_update_creates_version_history(self, db):
        new_ver = db.update_constraint(
            "C001",
            rule_text="Updated rule text",
            change_reason="Test update",
        )
        assert new_ver == 2

        # Check current version
        c = db.get_constraint("C001")
        assert c["version"] == 2
        assert c["rule_text"] == "Updated rule text"

        # Check history
        history = db.get_constraint_history("C001")
        assert len(history) == 1
        assert history[0]["version"] == 1
        assert history[0]["change_reason"] == "Test update"

    def test_multiple_updates_track_versions(self, db):
        db.update_constraint("C001", rule_text="Version 2", change_reason="v2")
        db.update_constraint("C001", rule_text="Version 3", change_reason="v3")
        db.update_constraint("C001", rule_text="Version 4", change_reason="v4")

        c = db.get_constraint("C001")
        assert c["version"] == 4

        history = db.get_constraint_history("C001")
        assert len(history) == 3
        versions = [h["version"] for h in history]
        assert 1 in versions and 2 in versions and 3 in versions

    def test_update_nonexistent_raises(self, db):
        with pytest.raises(ValueError, match="not found"):
            db.update_constraint("ZZZZ", rule_text="nope")

    def test_partial_update(self, db):
        """Only specified fields should change."""
        original = db.get_constraint("C001")
        db.update_constraint("C001", precedence=99)

        updated = db.get_constraint("C001")
        assert updated["precedence"] == 99
        assert updated["rule_text"] == original["rule_text"]  # unchanged
        assert updated["domain"] == original["domain"]  # unchanged


# ── Phase 3: Retrieval Tests ─────────────────────────────


class TestRetrieval:
    """Tests for hybrid BM25 + vector retrieval."""

    def test_hybrid_search_returns_results(self, retriever):
        results = retriever.search("async websocket timeout", top_k=5)
        assert len(results) > 0

    def test_results_have_rrf_scores(self, retriever):
        results = retriever.search("asyncio coroutine", top_k=3)
        for r in results:
            assert "rrf_score" in r
            assert "final_score" in r
            assert r["final_score"] >= r["rrf_score"]  # precedence boost

    def test_results_have_provenance(self, retriever):
        results = retriever.search("websocket cleanup", top_k=3)
        for r in results:
            assert "vector_rank" in r or "bm25_rank" in r

    def test_domain_filter(self, retriever):
        results = retriever.search(
            "timeout handler", top_k=10, domain_filter="concurrency"
        )
        for r in results:
            assert r["domain"] == "concurrency"

    def test_empty_query(self, retriever):
        results = retriever.search("", top_k=5)
        # Should still return something (BM25 may not match but vector might)
        assert isinstance(results, list)

    def test_search_with_lineage(self, retriever, db):
        session_id = db.create_session("test", "test prompt", "test goal")
        results = retriever.search_with_lineage(
            "asyncio timeout", session_id, top_k=3
        )

        # Check lineage was recorded
        conn = db.connect()
        lineage = conn.execute(
            "SELECT * FROM constraint_lineage WHERE session_id = ?",
            (session_id,),
        ).fetchall()
        assert len(lineage) == len(results)


# ── Phase 4: Prompt Augmentation Tests ───────────────────


class TestPromptBuilder:
    """Tests for domain classification and prompt augmentation."""

    def test_classify_concurrency_domain(self):
        domains = classify_domains("async websocket handler with asyncio")
        domain_names = [d[0] for d in domains]
        assert "concurrency" in domain_names or "memory" in domain_names

    def test_classify_risk_domain(self):
        domains = classify_domains("position sizing with Kelly criterion")
        domain_names = [d[0] for d in domains]
        assert "risk" in domain_names

    def test_classify_multiple_domains(self):
        domains = classify_domains(
            "async websocket handler for position tracking with type hints"
        )
        assert len(domains) >= 2

    def test_classify_empty_returns_empty(self):
        domains = classify_domains("")
        assert domains == []

    def test_build_augmented_prompt(self):
        constraints = [
            {"id": "T1", "domain": "testing", "rule_text": "Test rule",
             "rationale": "Test reason", "precedence": 80},
        ]
        prompt = build_augmented_prompt("Write a test", constraints)
        assert "TESTING" in prompt
        assert "[T1]" in prompt
        assert "Test rule" in prompt
        assert "USER REQUEST:" in prompt
        assert "Write a test" in prompt

    def test_conflict_detection(self):
        constraints = [
            {"id": "A", "domain": "testing", "rule_text": "Never use mocks",
             "precedence": 90},
            {"id": "B", "domain": "testing", "rule_text": "Always use mocks",
             "precedence": 70},
        ]
        conflicts = detect_conflicts(constraints)
        assert len(conflicts) >= 1

    def test_build_generation_context(self, retriever):
        ctx = build_generation_context("async handler with timeout", retriever)
        assert "augmented_prompt" in ctx
        assert "domains" in ctx
        assert "constraints" in ctx
        assert "conflicts" in ctx
        assert isinstance(ctx["augmented_prompt"], str)


# ── Phase 5: Session Logger Tests ────────────────────────


class TestSessionLogger:
    """Tests for session creation and metric recording."""

    def test_create_session(self, db):
        sid = db.create_session("concurrency", "test prompt", "test goal")
        assert sid is not None
        sessions = db.get_sessions()
        assert len(sessions) == 1
        assert sessions[0]["domain"] == "concurrency"

    def test_update_session(self, db):
        sid = db.create_session("test", "prompt", "goal")
        db.update_session(sid, correction_cycles=3, output_hash="abc123")

        sessions = db.get_sessions()
        s = [x for x in sessions if x["id"] == sid][0]
        assert s["correction_cycles"] == 3
        assert s["output_hash"] == "abc123"

    def test_record_metrics(self, db):
        sid = db.create_session("test", "prompt", "goal")
        db.record_metrics(
            session_id=sid,
            complexity_score=5.5,
            proficiency_score=4.2,
            node_count=3,
            interface_count=1,
            error_rate=0.1,
        )

        metrics = db.get_metrics_history()
        assert len(metrics) == 1
        assert metrics[0]["complexity_score"] == 5.5

    def test_record_lineage(self, db):
        sid = db.create_session("test", "prompt", "goal")
        db.record_lineage(sid, "C001", 0.85, True)
        db.record_lineage(sid, "C002", 0.72, True)

        conn = db.connect()
        lineage = conn.execute(
            "SELECT * FROM constraint_lineage WHERE session_id = ?",
            (sid,),
        ).fetchall()
        assert len(lineage) == 2


# ── Phase 6: Telemetry Scorer Tests ──────────────────────


class TestTelemetryScorer:
    """Tests for complexity/proficiency scoring."""

    def test_complexity_formula(self):
        scorer = TelemetryScorer()
        # C = alpha*N + beta*I + delta*D
        c = scorer.compute_complexity(node_count=3, interface_count=2, deploy_complexity=1.0)
        expected = (
            config.COMPLEXITY_WEIGHT_NODE * 3
            + config.COMPLEXITY_WEIGHT_INTERFACE * 2
            + config.COMPLEXITY_WEIGHT_DEPLOY * 1.0
        )
        assert c == expected

    def test_proficiency_formula(self):
        scorer = TelemetryScorer()
        complexity = 10.0
        error_rate = 0.5
        p = scorer.compute_proficiency(complexity, error_rate)
        expected = complexity / (1 + config.PROFICIENCY_ERROR_WEIGHT * error_rate)
        assert p == expected

    def test_proficiency_zero_error(self):
        scorer = TelemetryScorer()
        p = scorer.compute_proficiency(10.0, 0.0)
        assert p == 10.0  # No error penalty

    def test_trend_empty(self, db):
        scorer = TelemetryScorer(db=db)
        scorer.connect()
        trend = scorer.get_trend()
        assert trend["total_sessions"] == 0
        assert trend["avg_complexity"] == 0.0

    def test_trend_with_data(self, db):
        scorer = TelemetryScorer(db=db)
        scorer.connect()

        # Create some sessions with metrics
        for i in range(5):
            sid = db.create_session("test", f"prompt {i}", f"goal {i}")
            db.record_metrics(
                session_id=sid,
                complexity_score=float(i + 1),
                proficiency_score=float(i + 1) * 0.8,
                node_count=i + 1,
                interface_count=i,
                error_rate=0.1,
            )

        trend = scorer.get_trend()
        assert trend["total_sessions"] == 5
        assert trend["avg_complexity"] > 0
        assert trend["domain_breakdown"].get("test", 0) == 5


# ── Vector Store Tests ───────────────────────────────────


class TestVectorStore:
    """Tests for ChromaDB operations."""

    def test_add_and_query(self, seeded_vector_store):
        results = seeded_vector_store.query("async timeout", top_k=3, threshold=0.0)
        assert len(results) > 0

    def test_count(self, seeded_vector_store):
        assert seeded_vector_store.count == 10

    def test_domain_filter(self, seeded_vector_store):
        results = seeded_vector_store.query(
            "timeout", top_k=10, threshold=0.0, domain_filter="concurrency"
        )
        for r in results:
            assert r["domain"] == "concurrency"

    def test_delete_constraint(self, seeded_vector_store):
        initial_count = seeded_vector_store.count
        seeded_vector_store.delete_constraint("C001")
        assert seeded_vector_store.count == initial_count - 1
