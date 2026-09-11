# MT5 Trade Integration & Execution Stub Architecture Plan

**Document Version**: 1.0.0  
**Target Milestone**: Session 9 MT5 Trade Execution Engine  
**Author**: Sovereign Platform Core Architecture  
**Status**: DRAFT / APPROVED FOR IMPLEMENTATION  

---

## 1. Executive Summary & Problem Statement

### 1.1 Context & Current Footprint
The Sovereign platform currently possesses a quote-side read integration and profile management interface for MetaTrader 5 (MT5):
1. **Profile Vault**: `shared/lib/profiles/mt5_profiles.js` and `backend/cli/commands/trade/trade_mt5.js` manage AES-256-GCM encrypted credentials and generate temporary configuration files for launching MT5.
2. **Quote Export Bridge**: `tools/mt5/SovereignExport.mq5` writes real-time tick/bar data from the terminal data folder to local disk.
3. **Core Quote Feed**: `backend/core/src/feeds/mt5_quote_feed_adapter.hpp` ingests local binary/CSV time-series feeds into the C++ analytical pipeline.

### 1.2 The Execution Gap
While quote ingestion and profile provisioning exist, **trade execution through MT5 is currently an unmounted stub**:
- **Gateway Adapter Absence**: `backend/gateway/src/adapters/` contains `alpaca_adapter.ts`, `gate_io_adapter.ts`, `polymarket_adapter.ts`, and `simulation_adapter.ts`, but **no `mt5_adapter.ts`**.
- **CLI Command Divergence**: `backend/cli/commands/trade/trade.js` routes MT5 commands exclusively to diagnostics (`doctor`), setup (`connect`, `bridge`), and credential management (`profile`), failing to expose standard execution verbs (`buy`, `sell`, `positions`, `balance`, `cancel`).
- **Sub-Position Disconnect**: The virtual sub-positions ledger (`shared/lib/risk/sub_positions_ledger.js`) has no mapping to MT5 order tickets or MQL5 `ORDER_MAGIC` metadata.

---

## 2. Architecture & IPC Communication Patterns

MT5 runs as a Windows application (or under Wine in Linux/Docker environments like `hpdesk-1`). Direct in-process C-bindings from Node.js can suffer from instability or platform locking. We analyze three IPC models:

```text
+-------------------------------------------------------------------------------+
|                       Sovereign Trading Engine (Node.js)                      |
|  +-------------------------------------------------------------------------+  |
|  |             Execution Gateway (`backend/gateway/src/`)                  |  |
|  |   +-----------------------------------------------------------------+   |  |
|  |   |             MT5 Broker Adapter (`mt5_adapter.ts`)               |   |  |
|  |   +-----------------------------------------------------------------+   |  |
|  +-------------------------------------------------------------------------+  |
+----------------------------------------|--------------------------------------+
                                         | IPC Channel
                                         v
+-------------------------------------------------------------------------------+
|                    MetaTrader 5 Client Terminal (MQL5 / Wine)                 |
|  +-------------------------------------------------------------------------+  |
|  |         SovereignTradeBridge EA (`SovereignTradeBridge.mq5`)            |  |
|  |   - Listens on 127.0.0.1:8282 (TCP Server) or polls Orders inbox       |  |
|  |   - Validates magic number, slippage, and volume step                   |  |
|  |   - Dispatches `OrderSend()` / `OrderClose()` to Broker Server          |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

### 2.1 IPC Topology Evaluation

| Attribute | Option A: ZeroMQ / TCP Bridge | Option B: Atomic File Mailbox | Option C: Windows Named Pipes |
|---|---|---|---|
| **Mechanism** | Lightweight localhost TCP socket inside MQL5 EA (`SocketCreate`, `SocketListen`) | Atomic JSON file swap in MT5 `Files/` directory with file locking (`withFileLockSync`) | Win32 Named Pipe via Wine virtual driver |
| **Latency** | **< 1 ms** (Ultra-low) | 10–50 ms (Polling interval) | 2–5 ms |
| **Cross-Platform Parity** | 100% native on Linux, macOS, Windows | 100% compatible across all OS / Docker / Wine | Unreliable across Wine container boundaries |
| **External Dependencies** | Zero external libraries (Pure native MQL5 sockets + Node `net.Socket`) | Zero external dependencies (Stdlib `node:fs`) | Native binary shims required |
| **Crash Recovery** | Instant TCP reconnect on reset | Persistent queue survives sudden crash | Orphaned handles risk deadlock |

### 2.2 Recommended Dual-Mode Architecture: "Socket-First, File-Fallback"
1. **Primary Transport (TCP Loopback)**:
   - Node gateway connects as a client to `127.0.0.1:8282` hosted by `SovereignTradeBridge.mq5`.
   - Framing: Newline-delimited JSON (`NDJSON`).
   - Request-Response correlated via `nonce` / `clientOrderId`.
2. **Deterministic Fallback (File Mailbox)**:
   - If TCP connection drops or is unconfigured, adapter writes atomic command files to `$MT5_DATA_DIR/MQL5/Files/Sovereign/inbox/*.json`.
   - EA executes on tick / timer, writes responses to `outbox/*.json`.

---

## 3. Protocol & Message Specification

### 3.1 Order Submission Protocol (`TRADE_SUBMIT`)

**Node.js Gateway Request (`NDJSON`)**:
```json
{
  "type": "ORDER_SUBMIT",
  "nonce": "mt5_cmd_1726027384912_a1f9",
  "clientOrderId": "sov-alp-20260911-001",
  "strategyId": "auto_momentum_cnn_window_v0_5m",
  "magic": 1084201,
  "action": "BUY",
  "symbol": "EURUSD",
  "volume": 0.10,
  "orderType": "MARKET",
  "price": 1.08450,
  "slippage": 10,
  "sl": 1.08200,
  "tp": 1.08900,
  "comment": "sov|mom_cnn|001"
}
```

**MQL5 Bridge Response (`NDJSON`)**:
```json
{
  "type": "ORDER_RESULT",
  "nonce": "mt5_cmd_1726027384912_a1f9",
  "ok": true,
  "ticket": 48920194,
  "symbol": "EURUSD",
  "volume": 0.10,
  "fillPrice": 1.08452,
  "timestamp": "2026-09-11T03:30:00.124Z",
  "retcode": 10009,
  "retcodeDescription": "TRADE_RETCODE_DONE"
}
```

### 3.2 Position Query Protocol (`POSITIONS_GET`)

**Node.js Gateway Request**:
```json
{
  "type": "POSITIONS_GET",
  "nonce": "mt5_cmd_1726027384915_b2c4",
  "magicFilter": 0
}
```

**MQL5 Bridge Response**:
```json
{
  "type": "POSITIONS_RESULT",
  "nonce": "mt5_cmd_1726027384915_b2c4",
  "ok": true,
  "positions": [
    {
      "ticket": 48920194,
      "symbol": "EURUSD",
      "side": "BUY",
      "volume": 0.10,
      "entryPrice": 1.08452,
      "currentPrice": 1.08510,
      "unrealizedPnl": 5.80,
      "sl": 1.08200,
      "tp": 1.08900,
      "magic": 1084201,
      "comment": "sov|mom_cnn|001"
    }
  ],
  "account": {
    "login": 50129481,
    "balance": 10045.20,
    "equity": 10051.00,
    "freeMargin": 9851.00,
    "leverage": 100,
    "currency": "USD"
  }
}
```

---

## 4. Subsystem Interfaces & Core Integration

### 4.1 Broker Adapter Implementation (`backend/gateway/src/adapters/mt5_adapter.ts`)
Must implement `BrokerAdapter` interface defined in `backend/gateway/src/adapters/types.ts`:

```typescript
export class Mt5Adapter implements BrokerAdapter {
  private client: net.Socket | null = null;
  private config: Mt5Config;
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

  constructor(config: Mt5Config) {
    this.config = config;
  }

  async connect(): Promise<void>;
  async getBalance(): Promise<AccountBalance>;
  async getPositions(): Promise<Position[]>;
  async submitOrder(order: TradeOrder): Promise<OrderResult>;
  async cancelOrder(orderId: string): Promise<CancelResult>;
  async closePosition(symbol: string, quantity?: number): Promise<OrderResult>;
}
```

### 4.2 Sizing & Unit Transformation Matrix
Different asset classes on MT5 use varying contract multipliers:

$$\text{Required Lots} = \frac{\text{Position Notional}}{\text{Lot Size} \times \text{Asset Base Price}}$$

| Instrument Category | Symbol Example | Standard Lot Size | Min Lot Step | Sovereign Sizing Converter |
|---|---|---|---|---|
| **Forex Major** | `EURUSD`, `GBPUSD` | 100,000 base currency | 0.01 ($1,000 notional) | `units / 100000` |
| **Forex Cross** | `EURJPY`, `GBPJPY` | 100,000 base currency | 0.01 | `units / 100000` |
| **Spot Metals** | `XAUUSD` (Gold) | 100 troy ounces | 0.01 (1 oz) | `units / 100` |
| **Index CFD** | `US500`, `US100` | 1 index point contract | 0.10 | Direct contract multiplier |
| **Crypto CFD** | `BTCUSD`, `ETHUSD` | 1 coin contract | 0.01 | Direct contract multiplier |

### 4.3 Sub-Positions Attribution & Magic Number Schema
To prevent collisions between automated strategies running concurrently on a single MT5 account:
- `ORDER_MAGIC` Schema: `Prefix (1) + Strategy Hash (4 digits) + Timeframe (2 digits)`.
- Order Comment: Prefixed with `sov|` followed by abbreviated strategy identifier and short hash.
- Fill events automatically pipe into `shared/lib/risk/sub_positions_ledger.js` using the MT5 ticket as `subPositionId`.

---

## 5. Security & Safety Invariants

1. **Trade PIN Elevation**:
   - As enforced across Alpaca and Polymarket in Session 6, any MT5 `--live` trade command without interactive TTY or PIN validation fails closed (`process.exit(1)`).
2. **Account Type Guard (Real vs Demo)**:
   - Before executing live trades, the adapter verifies `AccountInfoInteger(ACCOUNT_TRADE_MODE)`.
   - If `SOVEREIGN_EXECUTION_AUTHORIZED=false`, order dispatch is rejected if account is `ACCOUNT_TRADE_MODE_REAL`.
3. **C++20 Drawdown Guard Pre-Trade Validation**:
   - `DrawdownGuard::evaluate` must approve the current equity curve before `Mt5Adapter` issues `ORDER_SUBMIT`.
4. **Volume Ceiling & Lot Size Sanity Checks**:
   - Hard cap: Max lot size per ticket = 2.0 lots ($200,000 notional). Any sizing computation exceeding this threshold triggers immediate fail-closed rejection.

---

## 6. Implementation Roadmap for Next Session (Session 9)

```text
[Phase 1: Gateway Adapter & Contracts]
       |
       +---> Author `backend/gateway/src/adapters/mt5_adapter.ts`
       +---> Export `Mt5Adapter` in `backend/gateway/src/adapters/index.ts`
       +---> Wire `broker === 'mt5'` in `backend/gateway/src/index.ts`
       |
[Phase 2: MQL5 Trade Bridge EA]
       |
       +---> Create `tools/mt5/SovereignTradeBridge.mq5`
       +---> Implement Socket server (Port 8282) with JSON request dispatcher
       +---> Add lot step / tick rounding and execution confirmation handler
       |
[Phase 3: CLI & API Dispatchers]
       |
       +---> Expand `backend/cli/commands/trade/trade_mt5.js` with `buy`, `sell`, `positions`
       +---> Wire REST route `/api/trade/mt5` in `backend/api/server/routes/`
       |
[Phase 4: Keyless Testing & Fixture Harness]
       |
       +---> Build mock TCP server fixture simulating MT5 bridge
       +---> Author unit suite `tests/scripts/operational/mt5_adapter.test.js`
       +---> Verify 100% test integrity across all test gates
```

---

## 7. Deliverable Verification Checklist

- [ ] `npx tsc -p backend/gateway/tsconfig.json --noEmit` passes cleanly.
- [ ] `node tests/run_node_tests.js tests/scripts/operational/mt5_adapter.test.js` passes with zero live credentials.
- [ ] `npm run hygiene` remains 100% clean.
- [ ] Zero unhandled rejections or deadlocks on TCP socket disconnect.
- [ ] Documentation updated in `docs/engineering/architecture/05_EXECUTION_SUB_POSITIONS_AND_RISK.md`.
