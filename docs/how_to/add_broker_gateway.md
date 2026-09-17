# Contributor Guide: Adding New Broker Gateways

This guide details the process of adding a new execution broker adapter to Sovereign.

---

## 1. Gateway Architecture & Provider Types

Sovereign divides broker connectors into two distinct architectural patterns:

### Pattern A: Dual Adapters (Ingestion + Execution)
Brokers that provide both rich market data APIs and order execution surfaces on the same credentials:
- **Alpaca**: Markets API (OHLCV bars, quotes) + Trading API (orders, positions, account balance).
- **Gate.io**: Spot/Perps market feeds + Order execution gateway.
- **Hyperliquid** *(Roadmap)*: Info API (L2 orderbooks, clearinghouse user state, asset contexts) + Exchange API (EIP-712 signed order actions).

### Pattern B: Execution-Only Adapters (Paired with Separate Data Stubs)
Execution gateways where order routing is decoupled from data ingestion:
- **MetaTrader 5 (MT5)**:
  - *Execution*: Local TCP socket bridge (`Mt5Adapter` on port 8282) communicating with `tools/mt5/SovereignTradeBridge.mq5`.
  - *Data Feed*: Local export stub `tools/mt5/SovereignExport.mq5` writes quotes JSON to disk, ingested by `mt5_quotes_read.js`.
- **Polymarket**:
  - *Execution*: Polygon CLOB API (orders signed via EOA or Gnosis Safe deposit wallet).
  - *Data Feed*: Third-party historical archive **PMXT** (`https://api.pmxt.dev`) for L2 orderbook replay, plus live CLOB WebSocket orderbook snapshots.
- **Virtual Paper Ledger**:
  - *Execution*: In-memory & disk-backed simulated paper trading (`backend/gateway/src/paper_ledger.js`).
  - *Data Feed*: Consumes any historical binary TS file (`storage/data/ts/*.bin`).

```
┌───────────────────────────────────────────────────────────┐
│                    Strategy & Trade Desks                 │
│  backend/cli/commands/trade/trade.js (--broker <name>)    │
└─────────────────────────────┬─────────────────────────────┘
                              │
               [Pre-Trade Risk & Policy Filter]
               - canLiveExecute runtime check
               - Max drawdown & position size limits
               - MFA PIN verification
                              │
┌─────────────────────────────▼─────────────────────────────┐
│                 Unified Broker Gateway                     │
│  backend/gateway/src/adapters/types.ts (BrokerAdapter)    │
│                                                           │
│  [Dual Adapters]                 [Execution-Only]         │
│  - AlpacaAdapter (Bars + Trades)  - Mt5Adapter            │
│  - GateioAdapter (Feeds + Orders)   (Data: SovereignExport)│
│  - HyperliquidAdapter (Roadmap)   - PolymarketAdapter     │
│                                     (Data: PMXT Archive)  │
│                                   - PaperLedgerAdapter    │
└───────────────────────────────────────────────────────────┘
```

---

## 2. The `BrokerAdapter` Interface Contract

All broker adapters must implement the canonical TypeScript contract in `backend/gateway/src/adapters/types.ts`:

```typescript
export interface OrderRequest {
  instrumentId: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  strategyId?: string;
  clientOrderId?: string;
}

export interface OrderResult {
  orderId: string;
  status: 'filled' | 'pending' | 'rejected' | 'canceled';
  filledQuantity: number;
  averagePrice?: number;
  timestamp: number;
  raw?: any;
}

export interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPl: number;
  asset_id?: string;
}

export interface BrokerAdapter {
  placeOrder(order: OrderRequest): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<boolean>;
  getPositions(): Promise<Position[]>;
  getPortfolioBalance(): Promise<Record<string, number>>;
  getQuote(instrumentId: string): Promise<number>;
  stop?(): Promise<void>;
}
```

---

## 3. Step-by-Step Implementation

### Step 1: Create Adapter Implementation
Create `backend/gateway/src/adapters/mybroker_adapter.ts`:

```typescript
import { BrokerAdapter, OrderRequest, OrderResult, Position } from './types';

export class MyBrokerAdapter implements BrokerAdapter {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor(config: { apiKey?: string; apiSecret?: string; baseUrl?: string } = {}) {
    this.apiKey = config.apiKey || process.env.MYBROKER_API_KEY || '';
    this.apiSecret = config.apiSecret || process.env.MYBROKER_API_SECRET || '';
    this.baseUrl = config.baseUrl || 'https://api.mybroker.com';
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    // 1. Map canonical OrderRequest to broker API payload
    // 2. Submit signed HTTP/WebSocket request
    // 3. Return canonical OrderResult
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    // Cancel open order by ticket/ID
  }

  async getPositions(): Promise<Position[]> {
    // Return array of normalized positions
  }

  async getPortfolioBalance(): Promise<Record<string, number>> {
    // Return currency balances: { USD: 10000.0, EQUITY: 10500.0 }
  }

  async getQuote(instrumentId: string): Promise<number> {
    // Return latest mid/last price
  }
}
```

### Step 2: Register Adapter in Gateway Factory
Register the adapter in `backend/gateway/src/index.ts` so the CLI `--broker` flag routes correctly:

```typescript
import { MyBrokerAdapter } from './adapters/mybroker_adapter';

export function getBrokerAdapter(name: string): BrokerAdapter {
  switch (name.toLowerCase()) {
    case 'alpaca': return new AlpacaAdapter();
    case 'mt5': return new Mt5Adapter();
    case 'polymarket': return new PolymarketAdapter();
    case 'mybroker': return new MyBrokerAdapter();
    default: throw new Error(`Unknown broker adapter: ${name}`);
  }
}
```

### Step 3: Implement Profile Vault & Security
If the broker uses account credentials:
1. Store credentials encrypted under `storage/secrets/<broker>/` using AES-256-GCM.
2. Add diagnostic doctor check in `backend/cli/commands/doctor/`.
3. Add CLI subcommand dispatcher under `backend/cli/commands/trade/`.

### Step 4: Write Integration Tests with Mock Bridge
Create offline mock server/fixtures under `tests/fixtures/` and integration tests under `tests/scripts/integration/<broker>/`. Verify:
- Full order execution and error rejection mapping.
- Position and balance normalization.
- Disconnect and timeout recovery.
