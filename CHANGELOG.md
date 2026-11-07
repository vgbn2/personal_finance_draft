# Changelog

All notable changes to the Sovereign Trading Platform are documented in this file.

## v1.2.0 (2026-11-08)

### Features
- **market**: migrate historical Polymarket ingestion to native Data API v2 and enforce >200 trade quant floor (`1c55c47b`)
- **quant**: enforce canonical strategy taxonomy and document workstation memory topology (`e76fbe0f`)
- **quant**: stage automated Bollinger mean reversion strategy 5166b37e (`b9308112`)
- **quant**: stage automated YAML strategies and CLI options for overnight discovery (`4d5b6b79`)
- **strategy**: add ML meta-labeling query and YAML serializer to interval discovery engine (`7592261e`)
- **quant**: autonomous strategy discovery loop, dynamic sizing floor, and CT114 deployment (`bc891034`)

### Bug Fixes
- **ops**: purge legacy tools/ops directory on remote sync before symlink unpack (`1055f886`)

### Performance & Refactoring
- **ops**: rename tools/ops to tools/operational and add unified update engine (`04b75731`)
