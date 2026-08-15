# Sovereign Documentation

This hub routes readers to source-centered documentation by purpose and audience. The machine-readable [`documentation_manifest.json`](documentation_manifest.json) classifies each registered page as `canonical`, `supporting`, `needs_refresh`, or `historical`.

Historical logs, handoffs, plans, reviews, and graph reports are deliberately retained and scraped for durable engineering knowledge. They are a secondary evidence corpus—not the default answer to “how does this module work now?” Promoted facts must be verified against current source first.

## Start Here

1. [Project README](../README.md) — purpose, safety boundary, first commands, and audience routes.
2. [Architecture entrypoint](ARCHITECTURE.md) — short system map and canonical owners.
3. [Architecture overview](engineering/architecture_overview.md) — runtime policy, paper ledger, execution, and deployment model.
4. [Codebase tour](codebase_tour/00_START_HERE.md) — guided traces and labs against real source; supporting material that may need path refresh.
5. [Documentation standard](engineering/documentation_standard.md) — how to write and review docs in this repository.

## By Audience

| Audience | First document | Continue with |
|---|---|---|
| Operator | [Quickstart](operational/guides/QUICKSTART.md) | [CLI guide](operational/guides/cli_quick_guide.md), [operations](operational/guides/operations.md) |
| Contributor | [Contributing](operational/guides/CONTRIBUTING.md) | [architecture](engineering/architecture_overview.md), [testing](operational/guides/testing_surface.md) |
| Quantitative researcher | [Research overview](research/quant_research.md) | [macro model](research/macro_model.md), [codebase tour](codebase_tour/00_START_HERE.md) |
| API/frontend developer | [Web/API reference](engineering/web_api.md) | [frontend design](design/frontend_design_spec.md) |
| Deployment maintainer | [Role-based hosting](operational/guides/role_based_hosting.md) | [deployment](operational/guides/DEPLOYMENT.md), [local-first setup](operational/local_first/local_first_setup.md) |
| Module maintainer | [Module catalog](modules/README.md) | [Code Atlas](atlas/README.md), [documentation standard](engineering/documentation_standard.md) |

## Documentation Types

The repository follows the [documentation standard](engineering/documentation_standard.md): keep learning, task, reference, explanation, and historical evidence distinct.

### Tutorials

Guided learning with real source traces and bounded labs:

- [Codebase tour: start here](codebase_tour/00_START_HERE.md)
- [C++ core](codebase_tour/01_cpp_core_engine.md)
- [Data ingestion and storage](codebase_tour/02_data_ingestion_pipeline.md)
- [Strategy, backtest, and ML](codebase_tour/03_strategy_backtest_ml.md)
- [Trading gateway](codebase_tour/04_trading_gateway_live_orders.md)
- [CLI and TUI](codebase_tour/05_tui_cli_dashboard.md)
- [Web dashboard and API](codebase_tour/06_web_dashboard_api.md)
- [Testing methodology](codebase_tour/07_testing_methodology.md)

These pages are supporting tutorials, not contract owners. Verify paths, symbols, and commands against current source before editing a safety-critical path.

### How-To Guides And Runbooks

- [Quickstart](operational/guides/QUICKSTART.md)
- [Environment setup](operational/guides/environment_setup.md)
- [CLI guide](operational/guides/cli_quick_guide.md)
- [Operations](operational/guides/operations.md)
- [Data ingestion](operational/guides/data_ingestion.md)
- [Deployment](operational/guides/DEPLOYMENT.md)
- [Role-based hosting](operational/guides/role_based_hosting.md)
- [Local-first setup](operational/local_first/local_first_setup.md)
- [Local-first migration](operational/local_first/local_first_migration.md)

Read each command's side-effect label before running provider, data-write, container, host, paper, or live actions.

### Reference

- [Documentation manifest](documentation_manifest.json) — corpus status and source/review ownership.
- [Documentation standard](engineering/documentation_standard.md) — writing and review contract.
- [Codebase organization](engineering/codebase_org.md) — canonical folder and ownership map.
- [Domain Structure Guides](sections/) — dedicated subsystem maps for [backend](sections/backend/README.md), [shared](sections/shared/README.md), [frontend](sections/frontend/README.md), [config](sections/config/README.md), [storage](sections/storage/README.md), and [tests](sections/tests/README.md).
- [Module catalog](modules/README.md) and [module template](modules/TEMPLATE.md) — cross-file ownership contracts.
- [Code Atlas](atlas/README.md) — source-linked algorithms, structures, protocols, and topology.
- [Testing surfaces](operational/guides/testing_surface.md) — test and evidence commands.
- [Web/API reference](engineering/web_api.md) — **needs refresh** against the active route registry.
- [Capability manifest](engineering/capability_manifest.md) — **needs refresh**; contains obsolete paths/data-store claims.
- [Stack manifest](engineering/stack_manifest.md)
- [Supabase integration](engineering/supabase_integration.md)

### Explanation

- [Architecture overview](engineering/architecture_overview.md)
- [Product specification](engineering/product_spec.md) — **needs refresh** to separate implemented, gated, and roadmap capabilities.
- [Technical specification](engineering/technical_spec.md) — **needs refresh** for current paths and public owners.
- [Engineering standards](engineering/engineering_standards.md)
- [Research overview](research/quant_research.md)
- [Macro model](research/macro_model.md)
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

See [Documentation Standard](engineering/documentation_standard.md) for the full contract.
