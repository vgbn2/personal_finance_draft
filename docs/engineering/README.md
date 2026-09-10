# Sovereign Engineering Documentation Suite

This directory contains the canonical technical and architectural specifications for the Sovereign Trading Platform (SV Console), categorized into clear functional subdirectories.

```
docs/engineering/
├── architecture/      # Canonical 8-Section Architecture Suite & Financial Primer
├── standards/         # Engineering standards, agentic coding guidelines & checklists
├── specs/             # Component technical specs, manifests, and interface maps
└── README.md          # Reading roadmap & directory index
```

---

## 1. Canonical 8-Section Architecture Suite (`architecture/`)

The engineering architecture is organized into 8 modular, diagram-dense sections equipped with quantified Load Indices and mathematical formalisms:

1. **[01. System Architecture & Codebase Organization](architecture/01_ARCHITECTURE_AND_CODEBASE.md)**
   - Master multi-tier topology, module taxonomy, dependency direction, and fundamental invariants (single-writer, fail-closed, zero-key development, sub-position isolation).

2. **[02. Data Pipeline & Binary Storage Architecture](architecture/02_DATA_PIPELINE_AND_STORAGE.md)**
   - Ingestion lifecycle across equities (5m), crypto (1m from 2017), and prediction markets (1s), binary `SOVT` 48-byte packed format, C++20 zero-allocation streaming merger ($O(1)$ memory, $<5\text{MB}$ RSS), and local rollup synthesis.

3. **[03. Native C++20 Core & Quantitative Backtester](architecture/03_NATIVE_CORE_AND_BACKTESTER.md)**
   - C++20 Sovereign Core engine (`sovereign_wealth`), `FrameBacktester` (Mode A Native vs Mode B Annotated), execution drag simulation, Monte Carlo bootstrap engine (`xorshift64`), and `PreTradeRisk` microsecond gate.

4. **[04. Quantitative Alpha, ML & AI Agent Workbench](architecture/04_QUANTITATIVE_ALPHA_AND_ML_WORKBENCH.md)**
   - Autonomous 30-minute AI strategy discovery daemon, 6D normalized parameter hypercube, $\ge 50\%$ novelty distance metric, SHA-256 fingerprinting, rolling feature frames, and Model Context Protocol (MCP) `explore_strategy` workbench tool.

5. **[05. Execution, Sub-Positions Ledger & Risk Management](architecture/05_EXECUTION_SUB_POSITIONS_AND_RISK.md)**
   - Virtual sub-positions accounting ledger (`sub_positions.json`), deterministic order client IDs (`strat_<id>_<tf>_<ts>_<entropy>` and `manual_cli_<sym>_<ts>_<entropy>`), broker physical reconciliation, and fractional step sizing (`0.001` equity, `0.0001` crypto).

6. **[06. Prediction Markets & Polymarket Orderbook Archiving](architecture/06_PREDICTION_MARKETS_AND_ORDERBOOK_ARCHIVE.md)**
   - Polymarket Gamma and CLOB ingestion, 1-second L2 orderbook snapshot archiving, virtual prediction paper trading simulator (`paper_ledger.js`), and oracle resolution settlement.

7. **[07. Security Model, APIs, Testing Strategy & Deployment](architecture/07_SECURITY_API_TESTING_DEPLOYMENT.md)**
   - RBAC capability authorization, Express REST and WebSocket APIs, zero-key local test matrix (`test:safety`, `test:structure`, `test:core` 34 CTests), Docker Compose multi-container topology, and HPDesk Proxmox VM soak runbook.

8. **[08. Financial & Quantitative Primer for Systems Engineers](architecture/08_FINANCIAL_PRIMER_FOR_ENGINEERS.md)**
   - Comprehensive systems engineering analogy guide to financial mechanics: Central Limit Order Books, order types, slippage, OHLCV bars, DSP technical indicators, Sharpe/Sortino ratios, maximum drawdown, and prediction market EV calculations.

---

## 2. Engineering Standards & Checklists (`standards/`)

- **[Documentation Standard](standards/documentation_standard.md)**: Diátaxis framework, Corpus selection, and docs-as-code rules.
- **[Engineering Standards](standards/engineering_standards.md)**: Zero-key development, fail-closed design, and native C++ invariants.
- **[Agentic Coding Rules](standards/agentic_coding.md)** & **[Playbook](standards/agentic_coding_playbook.md)**: Autonomous agent workflow protocol.
- **[Blast-Through Checklist](standards/blast_through_checklist.md)**: System review and audit procedure.
- **[Architectural Debt](standards/architectural_debt.md)**: Long-term structural tracking.
- **[Dev Review Queue](standards/dev_review_queue.md)**: Code review backlog.

---

## 3. Specifications & Manifests (`specs/`)

- **[Technical Spec](specs/technical_spec.md)** & **[Product Spec](specs/product_spec.md)**: System component specifications.
- **[Stack Manifest](specs/stack_manifest.md)** & **[Capability Manifest](specs/capability_manifest.md)**: Engine and runtime capabilities.
- **[Web API Reference](specs/web_api.md)**: Native Node.js REST and WebSocket endpoints.
- **[TUI Feature Map](specs/tui_feature_map.md)**: Terminal dashboard command tree.
- **[Supabase Integration](specs/supabase_integration.md)**: Auth and cloud sync spec.
- **[Kronos Pipeline Spec](specs/kronos_pipeline.md)**: High-frequency data pipeline notes.

Historical specifications are preserved in the [Documentation Archive](../archive/README.md):
- **[Native Maintenance Notes](../archive/native_maintenance_notes.md)**: Historical native engine maintenance records.
- **[Rust Mirror Status](../archive/rust_mirror_status.md)**: Historical Rust parity and mirror study.
