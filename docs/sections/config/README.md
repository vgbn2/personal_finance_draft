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

1. **Market Universes (`config/markets/`, `config/asset_mapping.json`):**
   - Configured Asset Mapping: `config/asset_mapping.json` (canonical symbol & asset metadata map)
   - Universe Matrix: `config/markets/asset_mapping.json` (legacy/compat asset universe grid)

2. **Strategy Manifests (`config/strategies/`):**
   - Registered Strategy Manifests: `config/strategies/*.yaml` (defines RSI reversal, EMA crossover, Bollinger breakout, etc.)

3. **System & Environment Manifest (`config/system/`):**
   - Environment Manifest: `config/system/environment_manifest.json` (classified environment variable catalog, surface permissions, default values)

4. **Trading & Prop Firm Profiles (`config/trading/`):**
   - Prop Firm Registries: `config/trading/prop_firm_profiles.json`

## Code Atlas & Related Maps

- Shared Configured Universe Owner — [`shared/lib/market/configured_universe.js`](../../../shared/lib/market/configured_universe.js)
- Environment Pipeline Contract — [`shared/lib/runtime/env_pipeline.js`](../../../shared/lib/runtime/env_pipeline.js)
