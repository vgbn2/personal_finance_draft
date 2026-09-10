# Sovereign Trading Platform

Institutional-grade, local-first quantitative research, high-performance backtesting, and algorithmic execution platform.

---

## Core System Invariants

Sovereign operates under five non-negotiable architectural invariants:

1. **Fail-Closed Operations**: Missing data, stale locks, risk boundary violations, or unexpected network disruptions abort execution immediately. Zero trade operations proceed in indeterminate states.
2. **Single-Writer Host Authority**: Only the designated central host (`hpdesk-1`) holds physical broker order routing authority and writes to shared state. All development environments run strictly in read-only research or virtual paper execution modes.
3. **Zero-Key Development**: All development, unit testing, integration suites, and backtest loops run keyless against recorded deterministic fixtures (`tests/fixtures/`, `storage/data/cache/last_fetch.json`).
4. **Deterministic Sub-Position Attribution**: Broker net positions are virtually partitioned across multiple concurrent quantitative strategies using cryptographic client order signatures (`strat_<id>_<timeframe>_<timestamp>_<entropy>`).
5. **Zero-Python Runtime Invariant**: Complete platform runtime, data processing, and test pipelines execute in pure **Node.js (v20+)** and **C++20 (CMake 3.15+)**.

---

## Documentation Navigation

The documentation corpus follows the **Diátaxis Documentation Framework**, partitioning knowledge into four distinct quadrants:

<div class="grid cards" markdown>

-   :material-compass: __[Overview](ARCHITECTURE.md)__

    ---

    System architecture overview, multi-tier topology, directory taxonomy, and Diátaxis structure map.

-   :material-book-open-page-variant: __[Architecture Suite](engineering/architecture/01_ARCHITECTURE_AND_CODEBASE.md)__

    ---

    8-section deep-dive with Load Indices, Big-O metrics, and GitHub-native Mermaid sequence & flow diagrams.

-   :material-file-document-check: __[Specifications](engineering/specs/product_spec.md)__

    ---

    Canonical contracts: Product Spec, Technical Spec, Web REST & WebSocket API, Capability and Stack manifests.

-   :material-hammer-wrench: __[Operations & Runbooks](OPERATIONAL_SOAK_RUNBOOK.md)__

    ---

    Proxmox VM deployment (`hpdesk`), soak test monitoring, CLI quickstart, and testing surface matrix.

</div>

---

## Fast Start

Clone repository and initialize development environment (copies `.env`, builds native C++20 engine, seeds fixtures, and verifies all test suites):

```bash
# Automated setup
npm run setup:dev

# Or step-by-step
cp .env.example .env
npm install
npm run native:build
npm run test:prepare
npm test
```

### Serve Documentation Locally

Serve this documentation site via Docker (no host Python or MkDocs installation required):

```bash
# Start live-reloading MkDocs server at http://localhost:8000
npm run docs:serve

# Build static HTML site into site/ directory
npm run docs:build
```

---

## Verification Matrix

```bash
npm run test:data        # Ingestion, indicators, backfill regression
npm run test:structure   # Repo structural contracts, hygiene, skill integrity
npm run test:core        # Native C++ analytics & CTest suite (34/34 tests)
npm run test:api         # Backend REST/WebSocket API contracts
npm run test:safety      # Risk gates, execution guards, and ledger safety
npm run docs:filter      # Comprehensive documentation audit & link validation
```
