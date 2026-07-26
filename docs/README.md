# Sovereign Documentation Hub

This is the filtered entrypoint for repo documentation. Start with the canonical files below, then move to the supporting or archived material only when you need the extra detail.

## Canonical

- [Architecture entrypoint](./ARCHITECTURE.md): short overview that points to the real ownership map.
- [Codebase organization map](./engineering/codebase_org.md): canonical folder and file ownership.
- [Architecture overview](./engineering/architecture_overview.md): high-level system and data-flow view.
- [Product specification](./engineering/product_spec.md): product scope and behavior boundaries.
- [Technical spec](./engineering/technical_spec.md): implementation-facing contract.
- [Engineering standards](./engineering/engineering_standards.md): repo-wide engineering rules.
- [Web API spec](./engineering/web_api.md): local API and dashboard contract.
- [Supabase integration](./engineering/supabase_integration.md): gated persistence integration surface.
- [Stack manifest](./engineering/stack_manifest.md): current platform stack inventory.
- [Agentic coding playbook](./engineering/agentic_coding_playbook.md): agent workflow guidance.
- [Quickstart](./operational/guides/QUICKSTART.md): first-run operator guide.
- [Bootstrap protocol](./operational/guides/bootstrap.md): session-start flow.
- [Contributor guide](./operational/guides/CONTRIBUTING.md): contribution workflow and expectations.
- [Deployment guide](./operational/guides/DEPLOYMENT.md): deployment and release operations.
- [Role-based portable hosting](./operational/guides/role_based_hosting.md): machine profiles, user capabilities, IP/session audit, laptop rehearsal, and mini-PC migration.
- [Environment setup](./operational/guides/environment_setup.md): local environment bootstrapping.
- [CLI quick guide](./operational/guides/cli_quick_guide.md): operator CLI reference.
- [Testing surface](./operational/guides/testing_surface.md): verification surface overview.
- [Local-first setup](./operational/local_first/local_first_setup.md): current local-first runtime setup.
- [Local-first migration](./operational/local_first/local_first_migration.md): migration path for local-first operation.
- [Local-first trading plan](./operational/local_first/local_first_trading_setup_plan.md): staged trading enablement plan.
- [Research overview](./research/quant_research.md): quantitative research entrypoint.
- [Macro model](./research/macro_model.md): macro strategy and model notes.
- [Legacy math](./research/legacy_math.md): older foundations kept for reference.
- [Frontend design spec](./design/frontend_design_spec.md): UI/UX design rules.
- [Frontend prompt](./design/frontend_prompt.md): prompt/reference material for the frontend workflow.

## Supporting

These are useful, but they should not be mistaken for the primary truth sources.

- [Architectural debt](./engineering/architectural_debt.md)
- [Blast-through checklist](./engineering/blast_through_checklist.md)
- [Dev review queue](./engineering/dev_review_queue.md)
- [Capability manifest](./engineering/capability_manifest.md)
- [Kronos pipeline](./engineering/kronos_pipeline.md)
- [Phase 5 spec](./engineering/phase_5_spec.md)
- [Rust mirror status](./engineering/rust_mirror_status.md)
- [Roadmap](./operational/roadmap/roadmap.md)
- [Roadmap CLI](./operational/roadmap/ROADMAP_CLI.md)
- [Operations](./operational/guides/operations.md)
- [Data ingestion](./operational/guides/data_ingestion.md)
- [Blast-through report](./memory/BLAST_THROUGH_REPORT.md)
- [Developer comments](./memory/DEV_COMMENTS.md)
- [Prompt log mirror](./memory/PROMPT_LOG.md)
- [Session memory mirror](./memory/SESSION_MEMORY.md)
- [Session report archive](./memory/SESSION_REPORT_2026-05-19.md)

## Archive And Mirrors

- `docs/archive/*`: legacy UI and old CLI artifacts; keep for history, not as active architecture truth.
- `docs/memory/*`: mirrors of workspace truth files. Prefer the workspace files when making decisions.
- `docs/ARCHITECTURE.md`: thin entrypoint only. It should stay short and defer to `docs/engineering/codebase_org.md`.
- `docs/engineering/architecture_overview.md` and `docs/engineering/codebase_org.md` are intentionally split between overview and ownership. Do not duplicate detailed path ownership in both.

## Redundant Or Superseded

These are present for history or transition tracking, but should not be treated as current canonical truth.

- `docs/archive/legacy_ui/*`
- `docs/archive/sovereign_cli.og.js`
- `docs/memory/*` as duplicates of workspace append-only state

## Reading Order

1. `docs/ARCHITECTURE.md`
2. `docs/engineering/codebase_org.md`
3. `docs/engineering/architecture_overview.md`
4. The specific operational, research, or design file you need

If a doc is not listed above, it is likely transitional, supporting, or archival.
