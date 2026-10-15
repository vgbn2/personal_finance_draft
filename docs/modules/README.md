# Module Catalog

Module pages explain which source owner is responsible for a capability across entrypoints, configuration, persistence, tests, failure behavior, and recovery.

## Rules

- One capability has one canonical module page.
- Use stable symbols and repository-relative paths instead of mutable line numbers.
- Link to Code Atlas records for deep algorithms, structures, protocols, and topology; do not repeat them.
- Link to operational runbooks for procedures; do not copy them.
- Historical evidence may justify a note only after current source verification.

## Catalog

- [Documentation retrieval and knowledge boundaries](documentation-retrieval.md) — manifest-selected canonical/historical lookup, index/cache ownership, and documentation validation.
- [Alpaca Asymmetric Exit Cap & Multi-Position Deduplication](alpaca-deduplicated-exit.md) — asymmetric buy vs sell notional caps (`ALPACA_PAPER_MAX_NOTIONAL`), same-symbol exit aggregation, and attribution preservation (`ALPACA-EXIT-01`).
- [Proxmox Host Storage & Backup Safety Guard](ct-storage-backup-safety.md) — dual-threshold fail-closed root disk checks (`<1GB` or `<5%`), `/data/backups/` external mount isolation, and atomic provenance retention (`CT-STORAGE-01`).
- [Ingestion Staging & Quarantine Engine](ingestion-quarantine.md) — microstructure anomaly quarantine, reason taxonomy (`QUARANTINE_REASONS`), SHA-256 payload digests, and 30-day retention pruning.
- [Market Data & Research Invariants Specification](market-invariants-spec.md) — the 7 foundational mathematical research invariants, half-open interval partitioning, UTC primacy, exact decimal scaling, and bitemporal point-in-time filtering.
- [Paper Trading Settlement & Accounting Ledger](paper-settlement-ledger.md) — cryptographically chained SHA-256 event journal, temporal projection grounding (`asOf ?? Date.now()`), and available cash buy sizing (`PM-SETTLE-01`).
- [Polymarket CLOB Reference Pricing](polymarket-clob-reference-pricing.md) — microstructure spread fallback pricing ($> \$0.10 \implies P_{\text{last}}$), top-5 harmonic depth imbalance ($DIR_5$), and EIP-712 order validation.

New pages must follow [TEMPLATE.md](TEMPLATE.md), link to their Code Atlas records, and be registered in [`docs/documentation_manifest.json`](../documentation_manifest.json).