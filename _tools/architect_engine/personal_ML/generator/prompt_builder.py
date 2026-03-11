"""
Architect Engine -- Prompt Augmentation Pipeline

Analyzes user prompts to classify domain, retrieves relevant constraints,
detects conflicts, and builds an augmented system prompt for the LLM.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Any, Tuple

from .. import config
from ..retrieval.engine import HybridRetriever

logger = logging.getLogger(__name__)

# Domain keywords for fast classification (fallback when LLM isn't needed)
DOMAIN_KEYWORDS: Dict[str, List[str]] = {
    "concurrency": [
        "async", "await", "asyncio", "threading", "multiprocessing",
        "coroutine", "zmq", "zeromq", "concurrent", "parallel", "lock",
        "semaphore", "queue", "event_loop", "task", "gather",
    ],
    "risk": [
        "position", "bankroll", "kelly", "sizing", "risk", "drawdown",
        "stop_loss", "take_profit", "portfolio", "exposure", "leverage",
        "hedge", "pnl", "profit", "loss",
    ],
    "data_structures": [
        "deque", "list", "dict", "set", "array", "buffer", "queue",
        "stack", "tree", "graph", "heap", "hash", "linked_list",
        "collections", "history", "ring_buffer",
    ],
    "typing": [
        "type", "hint", "annotation", "TypeVar", "Generic", "Protocol",
        "Optional", "Union", "Literal", "mypy", "pyright", "cast",
        "override", "abstract", "interface",
    ],
    "performance": [
        "numpy", "pandas", "vectorize", "numba", "cython", "loop",
        "optimize", "profile", "benchmark", "cache", "memoize",
        "batch", "bulk", "parallel", "simd",
    ],
    "memory": [
        "websocket", "connection", "socket", "leak", "cleanup",
        "gc", "garbage", "reference", "weak_ref", "pool",
        "file_descriptor", "resource", "close", "dispose",
    ],
    "testing": [
        "test", "pytest", "unittest", "hypothesis", "property",
        "fixture", "mock", "stub", "assert", "coverage", "tdd",
        "integration", "unit", "e2e",
    ],
    "architecture": [
        "database", "connection_pool", "migration", "schema",
        "microservice", "api", "rest", "grpc", "queue", "broker",
        "container", "docker", "kubernetes", "deploy",
    ],
}


def classify_domains(prompt: str) -> List[Tuple[str, float]]:
    """
    Classify prompt into domains with confidence scores.
    Returns sorted list of (domain, score) tuples.
    """
    prompt_lower = prompt.lower()
    tokens = set(prompt_lower.replace("_", " ").split())

    scores: Dict[str, float] = {}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        # Count keyword hits
        hits = sum(1 for kw in keywords if kw in prompt_lower)
        # Also check token-level matches
        token_hits = len(tokens.intersection(set(keywords)))
        score = hits + (token_hits * 0.5)
        if score > 0:
            scores[domain] = score

    # Normalize to [0, 1]
    if scores:
        max_score = max(scores.values())
        scores = {d: s / max_score for d, s in scores.items()}

    return sorted(scores.items(), key=lambda x: -x[1])


def detect_conflicts(constraints: List[Dict[str, Any]]) -> List[Tuple[Dict, Dict, str]]:
    """
    Detect potential conflicts between retrieved constraints.
    Returns list of (constraint_a, constraint_b, conflict_description).
    """
    conflicts = []
    for i, a in enumerate(constraints):
        for b in constraints[i + 1:]:
            # Same domain, different precedence -- potential override
            if a["domain"] == b["domain"] and a["precedence"] != b["precedence"]:
                # Check for contradictory keywords
                a_words = set(a["rule_text"].lower().split())
                b_words = set(b["rule_text"].lower().split())
                negation_words = {"no", "not", "never", "avoid", "without", "don't"}
                a_has_neg = bool(a_words & negation_words)
                b_has_neg = bool(b_words & negation_words)

                if a_has_neg != b_has_neg:
                    winner = a if a["precedence"] > b["precedence"] else b
                    conflicts.append((
                        a, b,
                        f"Potential contradiction in [{a['domain']}]. "
                        f"{winner['id']} (P={winner['precedence']}) takes precedence."
                    ))

    return conflicts


def build_augmented_prompt(
    user_prompt: str,
    constraints: List[Dict[str, Any]],
    conflicts: Optional[List[Tuple[Dict, Dict, str]]] = None,
) -> str:
    """
    Build the augmented system prompt with retrieved constraints injected.

    Format:
        [System context with constraints]
        ---
        [User's original prompt]
    """
    # Header
    parts = [
        "You are a senior software engineer following strict engineering constraints.",
        "The following constraints MUST be applied to your code generation:",
        "",
    ]

    # Group constraints by domain
    by_domain: Dict[str, List[Dict]] = {}
    for c in constraints:
        by_domain.setdefault(c["domain"], []).append(c)

    for domain, domain_constraints in sorted(by_domain.items()):
        parts.append(f"## {domain.upper()}")
        for c in sorted(domain_constraints, key=lambda x: -x["precedence"]):
            parts.append(f"  [{c['id']}] (P={c['precedence']}) {c['rule_text']}")
            if c.get("rationale"):
                parts.append(f"    Rationale: {c['rationale']}")
        parts.append("")

    # Conflict warnings
    if conflicts:
        parts.append("## CONFLICT WARNINGS")
        for a, b, desc in conflicts:
            parts.append(f"  ! {desc}")
        parts.append("")

    # Separator
    parts.append("---")
    parts.append("")
    parts.append("USER REQUEST:")
    parts.append(user_prompt)

    return "\n".join(parts)


def build_generation_context(
    user_prompt: str,
    retriever: HybridRetriever,
    top_k: int = config.TOP_K,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full pipeline: classify -> retrieve -> detect conflicts -> augment.

    Returns dict with:
        augmented_prompt: str
        domains: list of classified domains
        constraints: list of retrieved constraints
        conflicts: list of detected conflicts
    """
    # Step 1: Classify domains
    domains = classify_domains(user_prompt)
    primary_domain = domains[0][0] if domains else None

    logger.info("Classified domains: %s", domains[:3])

    # Step 2: Retrieve constraints (hybrid search)
    if session_id:
        constraints = retriever.search_with_lineage(
            user_prompt, session_id, top_k=top_k
        )
    else:
        constraints = retriever.search(user_prompt, top_k=top_k)

    logger.info("Retrieved %d constraints", len(constraints))

    # Step 3: Detect conflicts
    conflicts = detect_conflicts(constraints)
    if conflicts:
        logger.warning("%d constraint conflicts detected", len(conflicts))

    # Step 4: Build augmented prompt
    augmented = build_augmented_prompt(user_prompt, constraints, conflicts)

    return {
        "augmented_prompt": augmented,
        "domains": domains,
        "constraints": constraints,
        "conflicts": conflicts,
        "primary_domain": primary_domain,
    }
