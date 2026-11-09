# Config Domain Structure Map

Canonical structural map for the `config/` subsystem of the Sovereign Trading Platform.

## Overview And Subsystems

The `config/` directory stores declarative YAML and JSON configuration files governing asset universes, strategy parameters, trading rules, and system environments.

```text
config/
├── markets/      # Data sources & market asset universe definitions
├── strategies/   # Declarative strategy parameter YAML manifests
├── system/       # System environment manifests & security permissions
└── trading/      # Trading rules & prop firm profile profiles
```

## Active Subsystem Entrypoints

1. **Market Universes (`configs/markets/`, `configs/asset_mapping.json`):**
   - Configured Asset Mapping: `configs/asset_mapping.json` (canonical symbol & asset metadata map)
   - Universe Matrix: `configs/markets/asset_mapping.yaml` (legacy/compat asset universe grid)

2. **Strategy Manifests (`config/strategies/`):**
   - Registered Strategy Manifests: `config/strategies/*.yaml` (defines RSI reversal, EMA crossover, Bollinger breakout, etc.)

3. **System & Environment Manifest (`configs/system/`):**
   - Environment Manifest: `configs/system/environment_manifest.json` (classified environment variable catalog, surface permissions, default values)

4. **Trading & Prop Firm Profiles (`configs/trading/`):**
   - Prop Firm Registries: `configs/trading/prop_firms.json`

## Code Atlas & Related Maps

- Shared Configured Universe Owner — `shared/lib/market/configured_universe.js` (see [Shared Lib](../shared/README.md))
- Environment Pipeline Contract — `shared/lib/runtime/env_pipeline.js` (see [Shared Lib](../shared/README.md))
