# Broker & Gateway Setup Guide

This guide details configuring and validating broker gateways in the Sovereign trading platform across Alpaca, Gate.io, Polymarket, Supabase, and MetaTrader 5 (MT5).

---

## Shared Security & Architecture Rules

1. **Zero-Key Test Default**: All automated unit, data, and structure test suites run 100% keyless against offline fixtures and virtual paper ledgers.
2. **Encrypted Local Vaults**: Real and demo broker secrets never reside unencrypted in repository files or version control. MT5 profiles are AES-256-GCM encrypted in `storage/secrets/mt5/`.
3. **Redacted Diagnostics**: The CLI `doctor` command strictly redacts secret values and only outputs masked identifiers (`12***78`).
4. **Execution Policy Enforcement**: Live order submission requires valid runtime authorization (`canLiveExecute`), portfolio drawdown validation, and MFA PIN authentication.

---

## Provider Capability Taxonomy

Sovereign strictly segregates provider responsibilities into three adapter archetypes:

| Provider / Subsystem | Capability Type | Market Data Ingestion | Order Execution | Historical / Auxiliary Stub |
|---|---|:---:|:---:|---|
| **Alpaca** | **Dual Adapter** | Equities & Crypto 1m/5m Bars | REST Paper & Live Orders | Integrated Alpaca Market Data API |
| **Gate.io** | **Dual Adapter** | Spot & Perps Public Feeds | Signed Spot/Futures Orders | Integrated REST / WS API |
| **Hyperliquid** *(Roadmap)* | **Dual Adapter** | L2 Books & Candle Feeds | L1 Signed Actions | Info API + Exchange API |
| **Polymarket** | **Trade Execution** | — | CLOB Orders (Polygon EOA/Safe) | **PMXT** Historical L2 Snapshot Archive |
| **MetaTrader 5** | **Trade Execution** | — | TCP Socket Bridge (`net.Server`) | **SovereignExport.mq5** JSON Quote File Stub |
| **Binance / Yahoo / Stooq** | **Data Ingestion** | Crypto & Equities OHLCV | — | Public REST / WebSocket feeds |
| **Paper Ledger** | **Trade Execution** | — | In-memory & disk virtual fills | Zero-key double-entry accounting |

---

## 1. MetaTrader 5 (MT5) Setup

MetaTrader 5 integrates via a local TCP NDJSON socket bridge. The Sovereign backend runs a lightweight `net.Server` on `127.0.0.1:8282` communicating with the native MQL5 Expert Advisor (`tools/mt5/SovereignTradeBridge.mq5`).

```
┌──────────────────────────────────────────────────────────────┐
│                    Sovereign Platform                        │
│  backend/gateway/src/adapters/mt5_adapter.ts (TCP Server)   │
│                   Port 8282 (127.0.0.1)                      │
└──────────────────────────────▲───────────────────────────────┘
                               │
            TCP Socket (NDJSON │ Request / Response Stream)
            ~1-3ms Local RTT   │ Nonce-Correlated Packets
                               │
┌──────────────────────────────▼───────────────────────────────┐
│              MetaTrader 5 Client Terminal                    │
│      tools/mt5/SovereignTradeBridge.mq5 (Socket Client)      │
│      - 50ms high-resolution timer loop                       │
│      - Native OrderSend execution                            │
│      - 64-bit MagicCodec strategy attribution                │
└──────────────────────────────────────────────────────────────┘
```

### Step 1: Install EA & Scripts into MT5
Auto-install the quote export script and trade bridge EA to your MT5 terminal:
```bash
# Interactive installation to detected MT5 directories
node backend/scripts/verification/mt5_bridge_install.js
```
Or manually copy:
- `tools/mt5/SovereignTradeBridge.mq5` → `MQL5/Experts/SovereignTradeBridge.mq5`
- `tools/mt5/SovereignExport.mq5` → `MQL5/Scripts/SovereignExport.mq5`

Open **MetaEditor**, compile `SovereignTradeBridge.mq5` into `.ex5`, and attach the EA to any chart with **"Allow Algo Trading"** enabled.

### Step 2: Configure Encrypted Profile Vault
Manage account credentials in isolated AES-256-GCM encrypted slots (`propfirm`, `test`, `live`):
```bash
# Add or update profile slot
node backend/cli/sovereign_cli.js mt5 profile add --slot test

# List registered profile summaries
node backend/cli/sovereign_cli.js mt5 profile list

# Remove profile slot
node backend/cli/sovereign_cli.js mt5 profile remove --slot test
```

### Step 3: Run Diagnostics
Verify terminal path discovery, vault encryption, and bridge readiness:
```bash
node backend/cli/sovereign_cli.js mt5 doctor
```

### Step 4: Connect & Trade
Launch the terminal with ephemeral crash-safe configuration and execute trades:
```bash
# Connect and launch terminal (with optional --headless flag for Wine/Xvfb)
node backend/cli/sovereign_cli.js mt5 connect --slot test

# Execute market buy order
node backend/cli/sovereign_cli.js mt5 buy --symbol EURUSD --lots 0.10

# Execute market sell order
node backend/cli/sovereign_cli.js mt5 sell --symbol GBPUSD --lots 0.05
```

### Step 5: Remote Execution via Docker
Run headless MT5 in a Wine + Xvfb container (`sv-mt5`):
```bash
docker compose --profile paper-mt5 up -d sv-mt5
```
The container connects to host port 8282 via `host.docker.internal`.

---

## 2. Alpaca Setup (US Equities & Crypto)

### Credentials Configuration (`.env`)
```bash
# Paper Trading Sandbox (Default for development)
ALPACA_PAPER_API_KEY=your_paper_key_id
ALPACA_PAPER_SECRET_KEY=your_paper_secret_key
ALPACA_PAPER_BASE_URL=https://paper-api.alpaca.markets

# Live Production (Restricted to isolated host hpdesk-1)
ALPACA_LIVE_API_KEY=your_live_key_id
ALPACA_LIVE_SECRET_KEY=your_live_secret_key
ALPACA_LIVE_BASE_URL=https://api.alpaca.markets
```

### Verification
```bash
# Check Alpaca gateway status and account connectivity
node backend/cli/sovereign_cli.js doctor alpaca
```

---

## 3. Polymarket Setup (Prediction Markets CLOB)

Polymarket integrates with Polygon mainnet using Level 2 CLOB API credentials.

### Configuration (`.env`)
```bash
POLYMARKET_PRIVATE_KEY=0x...
POLYMARKET_WALLET_ADDRESS=0x...
POLYMARKET_API_KEY=...
POLYMARKET_API_SECRET=...
POLYMARKET_API_PASSPHRASE=...
POLYMARKET_FUNDER_ADDRESS=0x... # Required if using Gnosis Safe deposit wallet
POLYMARKET_SIGNATURE_TYPE=2    # 0=EOA, 1=POLY_PROXY, 2=POLY_GNOSIS_SAFE
```

### Verification & Trading
```bash
# Verify CLOB connectivity and balances
node backend/cli/sovereign_cli.js doctor polymarket

# Inspect active prediction market positions
node backend/cli/sovereign_cli.js polymarket positions
```

---

## 4. Gate.io Setup (Crypto Spot & Perps)

### Configuration (`.env`)
```bash
GATEIO_API_KEY=your_gateio_api_key
GATEIO_API_SECRET=your_gateio_api_secret
GATEIO_API_PASSPHRASE=your_passphrase
GATEIO_BASE_URL=https://api.gateio.ws
```

### Verification
```bash
node backend/cli/sovereign_cli.js doctor gateio
```

---

## 5. Supabase Setup (Database & Auth)

### Configuration (`.env`)
```bash
SOVEREIGN_SUPABASE_URL=https://your-project.supabase.co
SOVEREIGN_SUPABASE_PUBLISHABLE_KEY=your_publishable_anon_key
SOVEREIGN_SUPABASE_SECRET_KEY=your_service_role_key
```

### Verification
```bash
node backend/cli/sovereign_cli.js doctor supabase
```
