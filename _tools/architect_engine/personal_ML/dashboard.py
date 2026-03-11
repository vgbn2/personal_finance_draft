"""
Architect Engine -- Streamlit Dashboard

Visualizes engineering telemetry: complexity trends, constraint usage,
domain breakdown, and session history.

Launch:
    streamlit run architect_engine/dashboard.py
"""

from __future__ import annotations

import streamlit as st
import json
from datetime import datetime

# Must be first Streamlit call
st.set_page_config(
    page_title="Architect Engine -- Telemetry",
    page_icon="*",
    layout="wide",
)

# Import after page config to avoid reload issues
# Import after page config to avoid reload issues
try:
    from personal_ML import config
    from personal_ML.db.schema import ArchitectDB
    from personal_ML.telemetry.scorer import TelemetryScorer
except ImportError:
    # Fallback for when running directly inside the directory
    import config
    from db.schema import ArchitectDB
    from telemetry.scorer import TelemetryScorer


@st.cache_resource
def get_db():
    db = ArchitectDB()
    db.connect()
    return db


def main():
    st.title("Architect Engine -- Engineering Telemetry")
    st.caption("Tracking complexity, proficiency, and constraint adoption")

    db = get_db()
    scorer = TelemetryScorer(db)
    scorer.connect()

    # ── Sidebar ───────────────────────────────────────────
    with st.sidebar:
        st.header("Filters")
        limit = st.slider("Session limit", 10, 200, 50)
        st.divider()
        st.markdown("**Scoring Weights**")
        st.markdown(f"- Node (alpha): {config.COMPLEXITY_WEIGHT_NODE}")
        st.markdown(f"- Interface (beta): {config.COMPLEXITY_WEIGHT_INTERFACE}")
        st.markdown(f"- Deploy (delta): {config.COMPLEXITY_WEIGHT_DEPLOY}")
        st.markdown(f"- Error (gamma): {config.PROFICIENCY_ERROR_WEIGHT}")

    # ── Metrics Overview ──────────────────────────────────
    trend = scorer.get_trend(limit=limit)

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Sessions", trend["total_sessions"])
    with col2:
        st.metric(
            "Avg Complexity",
            f"{trend['avg_complexity']:.2f}",
            f"{trend['complexity_trend']:+.2f}" if trend["complexity_trend"] else None,
        )
    with col3:
        st.metric("Avg Proficiency", f"{trend['avg_proficiency']:.2f}")
    with col4:
        n_constraints = len(db.list_constraints())
        st.metric("Active Constraints", n_constraints)

    st.divider()

    # ── Charts ────────────────────────────────────────────
    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader("Complexity Over Sessions")
        metrics = db.get_metrics_history(limit=limit)
        if metrics:
            chart_data = {
                "Complexity": [m["complexity_score"] for m in reversed(metrics)],
                "Proficiency": [m["proficiency_score"] for m in reversed(metrics)],
            }
            st.line_chart(chart_data)
        else:
            st.info("No session data yet. Run `architect generate` to start tracking.")

    with col_right:
        st.subheader("Domain Breakdown")
        if trend["domain_breakdown"]:
            domain_data = trend["domain_breakdown"]
            st.bar_chart(domain_data)
        else:
            st.info("No domain data yet.")

    st.divider()

    # ── Constraint Usage ──────────────────────────────────
    st.subheader("Constraint Usage")
    usage = scorer.get_constraint_usage()
    if usage:
        for u in usage:
            cid = u["constraint_id"]
            constraint = db.get_constraint(cid)
            rule = constraint["rule_text"] if constraint else "Unknown"
            applied = u["applied_count"]
            overridden = u["overridden_count"]
            total = u["times_applied"]

            col_id, col_rule, col_bar = st.columns([1, 4, 2])
            with col_id:
                st.code(cid)
            with col_rule:
                st.markdown(rule)
            with col_bar:
                st.progress(applied / total if total > 0 else 0,
                           text=f"{applied}/{total} applied")
    else:
        st.info("No constraint usage data. Constraints are tracked when `architect generate` is used.")

    st.divider()

    # ── Session History Table ─────────────────────────────
    st.subheader("Recent Sessions")
    sessions = db.get_sessions(limit=limit)
    if sessions:
        rows = []
        for s in sessions:
            constraints_applied = s.get("constraints_applied", "[]")
            try:
                c_list = json.loads(constraints_applied) if constraints_applied else []
            except (json.JSONDecodeError, TypeError):
                c_list = []

            rows.append({
                "ID": s["id"],
                "Time": s.get("timestamp", ""),
                "Domain": s["domain"],
                "Goal": (s.get("goal_summary", "") or "")[:60],
                "Constraints": len(c_list),
                "Corrections": s.get("correction_cycles", 0),
                "Tokens": (s.get("prompt_tokens", 0) or 0) + (s.get("output_tokens", 0) or 0),
            })
        st.dataframe(rows, use_container_width=True)
    else:
        st.info("No sessions yet.")

    # ── Active Constraints ────────────────────────────────
    with st.expander("Active Constraints", expanded=False):
        constraints = db.list_constraints()
        if constraints:
            rows = []
            for c in constraints:
                rows.append({
                    "ID": c["id"],
                    "V": c["version"],
                    "Domain": c["domain"],
                    "Rule": c["rule_text"],
                    "Precedence": c["precedence"],
                })
            st.dataframe(rows, use_container_width=True)


if __name__ == "__main__":
    main()
