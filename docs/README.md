# Sovereign Documentation

This hub routes readers to source-centered documentation by purpose and audience. The machine-readable [`documentation_manifest.json`](documentation_manifest.json) classifies each registered page as `canonical`, `supporting`, `needs_refresh`, or `historical`.

Historical logs, handoffs, plans, reviews, and graph reports are deliberately retained and scraped for durable engineering knowledge. They are a secondary evidence corpus—not the default answer to “how does this module work now?” Promoted facts must be verified against current source first.

## Start Here

1. [Project README](../README.md) — purpose, safety boundary, first commands, and audience routes.
2. [Architecture entrypoint](ARCHITECTURE.md) — short system map and canonical owners.
3. [Tutorials Overview](tutorials/README.md) — step-by-step learning path from 00 to 07.
4. [How-To Runbooks](how_to/README.md) — deployment, operations, and recovery procedures.
5. [Reference Specifications](reference/README.md) — 40-route REST/WS API, capability and stack manifests.
6. [Explanation & Architecture](explanation/README.md) — system topology, C++ core, risk models, and financial primer.
7. [Social Alpha Signal Research](research/social_alpha/README.md) — alternative data, YouTube transcript NLP, and contrarian alpha.
8. [Documentation standard](reference/standards/documentation_standard.md) — how to write and review docs in this repository.

## By Audience

| Audience | First document | Continue with |
|---|---|---|
| Operator | [Environment Setup](how_to/environment_setup.md) | [CLI operations](how_to/cli_operations_guide.md), [operations runbook](how_to/disaster_recovery_and_rollback.md) |
| Contributor | [Contributing](how_to/contributing_and_pr_hygiene.md) | [architecture](explanation/architecture/01_system_topology_and_invariants.md), [testing surface](how_to/testing_surface_and_verification.md) |
| Quantitative researcher | [Research overview](explanation/quant_research/research_methodology.md) | [social alpha](research/social_alpha/README.md), [tutorials](tutorials/README.md) |
| API/frontend developer | [Web/API reference](reference/api/web_rest_and_websocket_api.md) | [frontend design](explanation/design_rationale/frontend_design.md) |
| Deployment maintainer | [Proxmox VM Deployment](how_to/proxmox_vm_deployment.md) | [soak runbook](how_to/operational_soak_runbook.md), [environment setup](how_to/environment_setup.md) |
| Module maintainer | [Module catalog](modules/README.md) | [Code Atlas](atlas/README.md), [documentation standard](reference/standards/documentation_standard.md) |

## Documentation Types (Diátaxis 4-Quadrant Standard)

The repository strictly enforces the [Diátaxis framework](https://diataxis.fr/) keeping learning, task, reference, explanation, and isolated research distinct:

### Quadrant 1: Tutorials (Learning)
[Tutorials Overview](tutorials/README.md) — guided learning with real source traces and bounded labs:
- [00. Quick Onboarding & Tour](tutorials/00_quick_onboarding.md)
- [01. Native C++20 Core](tutorials/01_cpp_core_engine.md)
- [02. Data Ingestion Pipeline](tutorials/02_data_ingestion_pipeline.md)
- [03. Strategy, Backtest & ML](tutorials/03_strategy_backtest_ml.md)
- [04. Trading Gateway & Live Orders](tutorials/04_trading_gateway_live_orders.md)
- [05. Terminal TUI & CLI](tutorials/05_tui_cli_dashboard.md)
- [06. Web Dashboard & API](tutorials/06_web_dashboard_api.md)
- [07. Testing Methodology](tutorials/07_testing_methodology.md)

### Quadrant 2: How-To Guides (Problem-Solving)
[How-To Overview](how_to/README.md) — task-oriented runbooks:
- [Environment Setup](how_to/environment_setup.md)
- [Proxmox VM Deployment](how_to/proxmox_vm_deployment.md)
- [Operational Soak Runbook](how_to/operational_soak_runbook.md)
- [Broker Gateway Setup](how_to/broker_gateway_setup.md)
- [CLI Operations Guide](how_to/cli_operations_guide.md)
- [Data Backfill & Ingestion](how_to/data_backfill_and_ingestion.md)
- [Strategy Explorer Workflow](how_to/strategy_explorer_workflow.md)
- [Disaster Recovery & Rollback](how_to/disaster_recovery_and_rollback.md)
- [Contributing & PR Hygiene](how_to/contributing_and_pr_hygiene.md)
- [Testing Surface & Verification](how_to/testing_surface_and_verification.md)

### Quadrant 3: Reference (Information)
[Reference Overview](reference/README.md) — exact technical contracts:
- [Documentation manifest](documentation_manifest.json) — corpus status and review ownership.
- [Web REST & WebSocket API](reference/api/web_rest_and_websocket_api.md) — canonical 40-route specification.
- [Product Specification](reference/specifications/product_specification.md)
- [Technical Specification](reference/specifications/technical_specification.md)
- [Capability Manifest](reference/specifications/capability_manifest.md)
- [Stack & Toolchain Manifest](reference/specifications/stack_manifest.md)
- [TUI Feature Map](reference/specifications/tui_feature_map.md)
- [Documentation Standard](reference/standards/documentation_standard.md)
- [Engineering Standards](reference/standards/engineering_standards.md)
- [Code Atlas](atlas/README.md) — algorithms, structures, protocols, and topology.
- [Domain Structure Guides](sections/) — subsystem maps for [backend](sections/backend/README.md), [shared](sections/shared/README.md), [frontend](sections/frontend/README.md), [config](sections/config/README.md), [storage](sections/storage/README.md), and [tests](sections/tests/README.md).

### Quadrant 4: Explanation (Understanding)
[Explanation Overview](explanation/README.md) — architectural rationale and theoretical foundations:
- [01. System Topology & Invariants](explanation/architecture/01_system_topology_and_invariants.md)
- [02. Data Pipeline & Binary Storage](explanation/architecture/02_data_pipeline_and_storage.md)
- [03. Native C++20 Core & Backtester](explanation/architecture/03_native_cpp_core_and_backtester.md)
- [04. Quantitative Alpha & ML Workbench](explanation/architecture/04_quantitative_alpha_and_ml_workbench.md)
- [05. Sub-Positions Ledger & Execution Risk](explanation/architecture/05_sub_positions_and_risk_ledger.md)
- [06. Prediction Markets & L2 Archive](explanation/architecture/06_prediction_markets_and_orderbook_archive.md)
- [07. Security Model & Deployment](explanation/architecture/07_security_model_and_deployment.md)
- [08. Financial Primer for Systems Engineers](explanation/architecture/08_financial_primer_for_engineers.md)
- [Quant Research Methodology](explanation/quant_research/research_methodology.md)
- [Frontend Design Rationale](explanation/design_rationale/frontend_design.md)

### Research & Alpha Stubs (Isolated)
[Social Alpha Research Stub](research/social_alpha/README.md) — multi-modal YouTube transcript extraction and contrarian consensus alpha.
- [Security, APIs & Deployment](engineering/architecture/07_SECURITY_API_TESTING_DEPLOYMENT.md)
- [Financial Primer for Systems Engineers](engineering/architecture/08_FINANCIAL_PRIMER_FOR_ENGINEERS.md)
- [Product specification](engineering/specs/product_spec.md) — core invariants and capabilities matrix.
- [Technical specification](engineering/specs/technical_spec.md) — multi-tier architecture, SOVT binary layout, and concurrency.
- [Engineering standards](engineering/standards/engineering_standards.md)
- [Research overview](research/quant_research.md)
- [Macro model (Historical)](archive/research/macro_model.md) — early exploratory macro and FX modeling direction.
- [Frontend design](design/frontend_design_spec.md)

### Historical Evidence

Use history to answer “what happened?” or to mine a durable decision—not as the current module contract.

- `workspace/STATE.md` — project-direction and dated status history.
- `workspace/handoff/` and `workspace/SESSION_MEMORY.md` — continuity and operational discoveries.
- `workspace/DEV_REVIEW.md` — review findings and acceptance criteria.
- `workspace/plans/` and `workspace/research/` — planned and research evidence.
- `docs/memory/` and `docs/archive/` — mirrors and superseded material.
- `graphify-out/` — generated structural evidence, not authoritative ownership by itself.
- [Documentation knowledge inventory](../workspace/reports/DOCUMENTATION_KNOWLEDGE_INVENTORY.md) — candidates being source-verified and promoted.

## Status Rules

- **Canonical:** normal current documentation for the declared contract.
- **Supporting:** useful teaching or context; source remains authoritative.
- **Needs refresh:** retained and linked, but known to contain stale or incomplete claims.
- **Historical:** true for a dated revision or session; never promoted without source revalidation.

When two documents disagree, do not resolve the conflict by recency alone. Read the owning source/config/test surface, update the canonical page, and record the historical source in the promotion ledger when it contains a durable lesson.

## Contributing Documentation

Before writing:

1. identify the reader and documentation type;
2. find the canonical source owner and existing page;
3. scrape relevant historical evidence;
4. verify the fact against current source;
5. update the smallest owning page;
6. run available documentation, structure, link/path, and focused behavior gates;
7. disclose which provider, host, deployment, recovery, paper, or live checks were not run.

See [Documentation Standard](engineering/standards/documentation_standard.md) for the full contract.
