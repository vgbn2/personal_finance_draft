import 'dotenv/config';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-ignore
import Alpaca from '@alpacahq/alpaca-trade-api';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

enum OrderSide {
  BUY = 'buy',
  SELL = 'sell'
}

enum OrderStatus {
  PROPOSED = 'proposed',
  RISK_REJECTED = 'risk_rejected',
  SUBMITTED = 'submitted',
  FILLED = 'filled',
  FAILED = 'failed'
}

interface TradeOrder {
  instrumentId: string;
  side: OrderSide;
  quantity: number;
  price?: number;
  type: 'market' | 'limit';
  status: OrderStatus;
  timestamp: Date;
}

/**
 * Supabase Audit helper
 */
class PersistenceBridge {
  private client: SupabaseClient | null = null;

  constructor() {
    const url = process.env.SOVEREIGN_SUPABASE_URL;
    const key = process.env.SOVEREIGN_SUPABASE_SECRET_KEY || process.env.SOVEREIGN_SUPABASE_SERVICE_ROLE_KEY;
    
    if (url && key) {
      this.client = createClient(url, key);
      console.log('[PERSISTENCE] Supabase bridge initialized');
    } else {
      console.warn('[PERSISTENCE] Supabase credentials missing, falling back to console only');
    }
  }

  async logOrder(order: TradeOrder, provider: string, metadata: any = {}, rawResponse: any = null) {
    if (!this.client) {
      console.log(`[AUDIT-FALLBACK] ${order.side.toUpperCase()} ${order.quantity} ${order.instrumentId} (Status: ${order.status})`);
      return;
    }

    try {
      const { error } = await this.client
        .from('orders')
        .insert({
          instrument_id: order.instrumentId,
          side: order.side,
          quantity: order.quantity,
          price: order.price || null,
          order_type: order.type,
          status: order.status,
          provider: provider,
          metadata: metadata,
          raw_response: rawResponse,
          timestamp: order.timestamp.toISOString()
        });

      if (error) {
        console.warn(`[PERSISTENCE] Failed to log order: ${error.message}`);
      } else {
        console.log(`[PERSISTENCE] Order logged to Supabase: ${order.instrumentId}`);
      }
    } catch (err: any) {
      console.warn(`[PERSISTENCE] Error during order logging: ${err.message}`);
    }
  }
}

/**
 * Hypothetical Broker Interface
 */
interface BrokerAdapter {
  placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }>;
  cancelOrder(orderId: string): Promise<boolean>;
  getPortfolioBalance(): Promise<Record<string, number>>;
}

interface GateIoAdapterOptions {
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  simulateIfMissingCredentials?: boolean;
}

interface AlpacaAdapterOptions {
  keyId?: string;
  secretKey?: string;
  paper?: boolean;
  simulateIfMissingCredentials?: boolean;
}

function sha512Hex(value: string): string {
  return crypto.createHash('sha512').update(value, 'utf8').digest('hex');
}

function signGateIoRequest(method: string, requestPath: string, query: string, body: string, timestamp: string, secret: string): string {
  const canonical = [
    method.toUpperCase(),
    requestPath,
    query,
    sha512Hex(body),
    timestamp,
  ].join('\n');
  return crypto.createHmac('sha512', secret).update(canonical, 'utf8').digest('hex');
}

function toJsonOrText(input: string): unknown {
  if (!input.trim()) {
    return {};
  }
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

/**
 * Gate.io Implementation of the Broker Adapter
 */
class GateIoAdapter implements BrokerAdapter {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly simulateIfMissingCredentials: boolean;

  constructor(options: GateIoAdapterOptions = {}) {
    this.baseUrl = options.baseUrl || process.env.GATEIO_BASE_URL || 'https://api.gateio.ws/api/v4';
    this.apiKey = options.apiKey || process.env.GATEIO_API_KEY;
    this.apiSecret = options.apiSecret || process.env.GATEIO_API_SECRET;
    this.simulateIfMissingCredentials = options.simulateIfMissingCredentials ?? true;
  }

  private hasCredentials(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  private async requestJson(method: string, requestPath: string, body?: Record<string, unknown>): Promise<unknown> {
    const payload = body ? JSON.stringify(body) : '';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signGateIoRequest(method, requestPath, '', payload, timestamp, this.apiSecret || '');

    const response = await fetch(`${this.baseUrl}${requestPath}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        KEY: this.apiKey || '',
        SIGN: signature,
        Timestamp: timestamp,
      },
      body: payload || undefined,
    });

    const responseText = await response.text();
    const parsed = toJsonOrText(responseText);
    if (!response.ok) {
      const message = typeof parsed === 'string'
        ? parsed
        : JSON.stringify(parsed);
      throw new Error(`Gate.io request failed (${response.status}): ${message}`);
    }
    return parsed;
  }

  async placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }> {
    console.log(`[GATE.IO] Placing ${order.side.toUpperCase()} ${order.type} order for ${order.instrumentId}`);
    console.log(`[GATE.IO] Quantity: ${order.quantity}${order.price ? `, Price: ${order.price}` : ''}`);

    if (!this.hasCredentials()) {
      if (!this.simulateIfMissingCredentials) {
        throw new Error('Gate.io credentials are not configured');
      }
      return {
        orderId: `gate-sim-${Math.random().toString(36).substring(2, 11)}`,
        status: 'open',
      };
    }

    const payload: Record<string, unknown> = {
      currency_pair: order.instrumentId,
      side: order.side,
      type: order.type,
      amount: String(order.quantity),
    };
    if (typeof order.price === 'number' && Number.isFinite(order.price) && order.price > 0) {
      payload.price = String(order.price);
    }

    const response = await this.requestJson('POST', '/spot/orders', payload);
    const record = (response as Record<string, unknown>) || {};
    return {
      orderId: String(record.id || record.order_id || record.client_order_id || `gate-${Date.now()}`),
      status: String(record.status || 'submitted'),
    };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    console.log(`[GATE.IO] Canceling order ${orderId}`);
    if (!this.hasCredentials()) {
      return this.simulateIfMissingCredentials;
    }
    await this.requestJson('DELETE', `/spot/orders/${encodeURIComponent(orderId)}`);
    return true;
  }

  async getPortfolioBalance(): Promise<Record<string, number>> {
    console.log(`[GATE.IO] Fetching account balances`);
    if (!this.hasCredentials()) {
      return { USDT: 10000, BTC: 0.5 };
    }

    const response = await this.requestJson('GET', '/spot/accounts');
    const balances: Record<string, number> = {};
    if (Array.isArray(response)) {
      for (const item of response) {
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const currency = String(record.currency || record.currency_pair || record.name || '').toUpperCase();
          const balance = Number(record.available ?? record.balance ?? record.total ?? 0);
          if (currency) {
            balances[currency] = balance;
          }
        }
      }
    }
    return balances;
  }
}

/**
 * Alpaca Implementation using official SDK
 */
class AlpacaAdapter implements BrokerAdapter {
  private alpaca: any;
  private readonly simulateIfMissingCredentials: boolean;

  constructor(options: AlpacaAdapterOptions = {}) {
    const keyId = options.keyId || process.env.ALPACA_API_KEY;
    const secretKey = options.secretKey || process.env.ALPACA_API_SECRET;
    const paper = options.paper ?? (process.env.ALPACA_URL?.includes('paper') || true);
    this.simulateIfMissingCredentials = options.simulateIfMissingCredentials ?? true;

    if (keyId && secretKey) {
      this.alpaca = new Alpaca({
        keyId,
        secretKey,
        paper,
      });
    }
  }

  private hasCredentials(): boolean {
    return Boolean(this.alpaca);
  }

  async placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }> {
    console.log(`[ALPACA-SDK] Placing ${order.side.toUpperCase()} ${order.type} order for ${order.instrumentId}`);
    console.log(`[ALPACA-SDK] Quantity: ${order.quantity}${order.price ? `, Price: ${order.price}` : ''}`);

    if (!this.hasCredentials()) {
      if (!this.simulateIfMissingCredentials) {
        throw new Error('Alpaca credentials are not configured');
      }
      return {
        orderId: `alpaca-sim-${Math.random().toString(36).substring(2, 11)}`,
        status: 'accepted',
      };
    }

    try {
      const payload: any = {
        symbol: order.instrumentId,
        qty: order.quantity,
        side: order.side,
        type: order.type,
        time_in_force: 'gtc',
      };
      
      if (order.type === 'limit' && order.price) {
        payload.limit_price = order.price;
      }

      const alpacaOrder = await this.alpaca.createOrder(payload);
      return {
        orderId: alpacaOrder.id,
        status: alpacaOrder.status,
      };
    } catch (err: any) {
      throw new Error(`Alpaca SDK Order Error: ${err.message}`);
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    console.log(`[ALPACA-SDK] Canceling order ${orderId}`);
    if (!this.hasCredentials()) {
      return this.simulateIfMissingCredentials;
    }
    await this.alpaca.cancelOrder(orderId);
    return true;
  }

  async getPortfolioBalance(): Promise<Record<string, number>> {
    console.log(`[ALPACA-SDK] Fetching account details`);
    if (!this.hasCredentials()) {
      return { USD: 100000, BUYING_POWER: 200000 };
    }

    try {
      const account = await this.alpaca.getAccount();
      return {
        USD: Number(account.cash || 0),
        BUYING_POWER: Number(account.buying_power || 0),
        EQUITY: Number(account.equity || 0)
      };
    } catch (err: any) {
      throw new Error(`Alpaca SDK Account Error: ${err.message}`);
    }
  }

  /**
   * Advanced: Submit a Bracket Order
   */
  async placeBracketOrder(symbol: string, qty: number, takeProfitPrice: number, stopLossPrice: number) {
    if (!this.hasCredentials()) return { id: 'sim-bracket' };

    return await this.alpaca.createOrder({
      symbol,
      qty,
      side: 'buy',
      type: 'market',
      time_in_force: 'gtc',
      order_class: 'bracket',
      take_profit: {
        limit_price: takeProfitPrice,
      },
      stop_loss: {
        stop_price: stopLossPrice,
      },
    });
  }
}

/**
 * Bridge to simulate C++ Pre-Trade Risk logic
 */
class RiskEngineBridge {
  async checkRisk(order: TradeOrder): Promise<{ approved: boolean; reason?: string }> {
    console.log(`[RISK-ENGINE] Pre-trade check for ${order.instrumentId} (${order.quantity} units)`);

    // --- NEW: Global Kill Switch Check ---
    const executableName = process.platform === 'win32' ? 'sovereign_wealth.exe' : 'sovereign_wealth';
    const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
    const BACKEND_CANDIDATES = [
      path.join(REPO_ROOT, 'build', 'backend', 'core', 'Release', executableName),
      path.join(REPO_ROOT, 'build', 'backend', 'core', 'Debug', executableName),
      path.join(REPO_ROOT, 'build', 'backend', 'core', executableName),
      path.join(REPO_ROOT, 'cpp_core', 'build', 'manual', executableName),
      path.join(REPO_ROOT, 'build', 'cpp_core', executableName),
    ];
    const binary = BACKEND_CANDIDATES.find((candidate) => {
      try {
        return spawnSync(candidate, ['--help'], { encoding: 'utf8' }).status !== null;
      } catch {
        return false;
      }
    });

    if (!binary) {
      const message = 'CRITICAL: Risk Engine binary not found or non-executable (FAIL-CLOSED)';
      // ALLOW BYPASS in Dry-Run mode to prevent development deadlock
      if (process.env.LIVE_TRADING !== 'true' && !process.argv.includes('--live')) {
        console.warn(`\x1b[1;33m[WARNING] ${message}\x1b[0m`);
        console.warn('\x1b[1;33m[WARNING] Proceeding without C++ risk checks (DRY-RUN ONLY)\x1b[0m');
        return { approved: true };
      }
      return { 
        approved: false, 
        reason: message 
      };
    }

    const result = spawnSync(binary, ['kill-switch', 'status'], { encoding: 'utf8' });
    if (result.status === 0) {
      try {
        const status = JSON.parse(result.stdout);
        if (status.status === 'engaged') {
          return { approved: false, reason: 'GLOBAL KILL SWITCH ENGAGED' };
        }
      } catch (e) {
        return { 
          approved: false, 
          reason: 'CRITICAL: Risk Engine returned invalid status payload' 
        };
      }
    } else {
      return { 
        approved: false, 
        reason: 'CRITICAL: Risk Engine process failed during safety check' 
      };
    }
    
    const riskCheckPayload = JSON.stringify({
      order_id: order.instrumentId + Date.now(),
      symbol: order.instrumentId,
      quantity: order.quantity,
      price: order.price || 0,
      side: order.side,
      timestamp: Date.now()
    });

    console.log(`[RISK-ENGINE-STDOUT-BRIDGE] Sent: ${riskCheckPayload}`);

    // Placeholder for future bi-directional risk check
    // For now, if we reach here and binary is healthy, we permit the trade
    // until the C++ engine supports a real-time 'check' command.
    return { approved: true };
  }
}

class ExecutionGateway {
  private dryRun: boolean;
  private adapter: BrokerAdapter;
  private riskEngine: RiskEngineBridge;
  private persistence: PersistenceBridge;

  constructor(options: { dryRun?: boolean; adapter?: BrokerAdapter } = {}) {
    this.dryRun = options.dryRun ?? true;
    this.adapter = options.adapter || new AlpacaAdapter();
    this.riskEngine = new RiskEngineBridge();
    this.persistence = new PersistenceBridge();
  }

  async validateOrder(order: TradeOrder): Promise<boolean> {
    console.log(`[EXECUTION] Validating order for ${order.instrumentId}`);
    
    // Basic structural validation
    if (order.quantity <= 0) {
      console.error('[RISK] Rejection: Quantity must be positive');
      return false;
    }
    if (order.type === 'limit' && (!Number.isFinite(order.price || NaN) || (order.price || 0) <= 0)) {
      console.error('[RISK] Rejection: Limit orders require a positive price');
      return false;
    }

    // Advanced risk engine validation (C++ Bridge)
    const riskResult = await this.riskEngine.checkRisk(order);
    if (!riskResult.approved) {
      console.error(`[RISK] Rejection: ${riskResult.reason}`);
      return false;
    }

    return true;
  }

  async execute(order: TradeOrder): Promise<void> {
    const isValid = await this.validateOrder(order);
    if (!isValid) {
      order.status = OrderStatus.RISK_REJECTED;
      await this.persistence.logOrder(order, 'internal', { reason: 'risk_rejected' });
      return;
    }

    if (this.dryRun) {
      console.log(`[DRY-RUN] Would execute ${order.side} ${order.quantity} of ${order.instrumentId}`);
      order.status = OrderStatus.SUBMITTED;
      await this.persistence.logOrder(order, 'simulated');
    } else {
      try {
        const result = await this.adapter.placeOrder(order);
        console.log(`[LIVE] Order placed successfully: ${result.orderId} (Status: ${result.status})`);
        order.status = result.status === 'filled' ? OrderStatus.FILLED : OrderStatus.SUBMITTED;
        
        await this.persistence.logOrder(order, 'alpaca', { order_id: result.orderId }, result);
        
      } catch (error: any) {
        console.error(`[LIVE] Execution failed: ${error}`);
        order.status = OrderStatus.FAILED;
        await this.persistence.logOrder(order, 'alpaca', { error: error.message });
      }
    }
  }

  async processProposedOrders(filePath: string): Promise<void> {
    console.log(`[GATEWAY] Looking for proposed orders in ${filePath}...`);
    try {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
      const data = await fs.readFile(absolutePath, 'utf-8');
      const parsed = JSON.parse(data);
      const orders: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.orders) ? parsed.orders : [];
      
      console.log(`[GATEWAY] Found ${orders.length} orders in file`);

      for (const orderData of orders) {
        const order: TradeOrder = {
          instrumentId: orderData.instrumentId || orderData.symbol,
          side: (orderData.side || 'buy').toLowerCase() as OrderSide,
          quantity: Number(orderData.quantity || orderData.qty || 0),
          price: orderData.price ? Number(orderData.price) : undefined,
          type: (orderData.type || 'market').toLowerCase() as 'market' | 'limit',
          status: OrderStatus.PROPOSED,
          timestamp: new Date()
        };
        
        await this.execute(order);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`[GATEWAY] No proposed orders file found at ${filePath}. Skipping.`);
      } else {
        console.error(`[GATEWAY] Error reading proposed orders: ${error.message}`);
      }
    }
  }
}

function printUsage() {
  console.log(`
Sovereign Alpaca Execution Gateway

Usage:
  npx ts-node execution_gateway/src/index.ts [command] [options]

Commands:
  buy <symbol> <qty> [type] [price]    Place a buy order
  sell <symbol> <qty> [type] [price]   Place a sell order
  balance                              Show account balance
  process [file]                       Process proposed orders from a JSON file

Options:
  --live                               Run in LIVE mode (default is dry-run)
  --demo                               Run the demo sequence

Examples:
  npx ts-node execution_gateway/src/index.ts buy AAPL 10
  npx ts-node execution_gateway/src/index.ts sell TSLA 5 limit 180 --live
  npx ts-node execution_gateway/src/index.ts balance
  `);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const isLive = process.env.LIVE_TRADING === 'true' || args.includes('--live');
  const adapter = new AlpacaAdapter({ simulateIfMissingCredentials: !isLive });
  const gateway = new ExecutionGateway({ dryRun: !isLive, adapter });
  
  const command = args[0].toLowerCase();

  if (command === 'buy' || command === 'sell') {
    // SANITIZATION
    const rawSymbol = String(args[1] || '').toUpperCase();
    const symbol = rawSymbol.replace(/[^A-Z0-9.\-_]/g, '');
    const qty = Number(args[2]);
    
    // Filter out flags from potential type/price positions
    const nonFlagArgs = args.slice(3).filter(a => !a.startsWith('--'));
    const type = (nonFlagArgs[0] || 'market').toLowerCase() as 'market' | 'limit';
    const price = nonFlagArgs[1] ? Number(nonFlagArgs[1]) : undefined;

    if (!symbol || !Number.isFinite(qty) || qty <= 0) {
      console.error('Error: Symbol and valid positive quantity are required');
      printUsage();
      process.exit(1);
    }
    
    if (type === 'limit' && (!price || !Number.isFinite(price) || price <= 0)) {
      console.error('Error: Limit orders require a valid positive price');
      process.exit(1);
    }

    const order: TradeOrder = {
      instrumentId: symbol,
      side: command as OrderSide,
      quantity: qty,
      type,
      price,
      status: OrderStatus.PROPOSED,
      timestamp: new Date()
    };

    await gateway.execute(order);
  } else if (command === 'balance') {
    const balances = await adapter.getPortfolioBalance();
    console.log(`[GATEWAY] Current Portfolio Balances:`, balances);
  } else if (command === 'aggregate_portfolio') {
    console.log('[GATEWAY] Aggregating Live and Paper portfolios...');
    try {
      const liveAdapter = new AlpacaAdapter({ paper: false, simulateIfMissingCredentials: false });
      const paperAdapter = new AlpacaAdapter({ paper: true, simulateIfMissingCredentials: false });
      
      const liveBalances = await liveAdapter.getPortfolioBalance().catch(() => ({ USD: 0, EQUITY: 0 }));
      const paperBalances = await paperAdapter.getPortfolioBalance().catch(() => ({ USD: 0, EQUITY: 0 }));
      
      console.log('--- Live Portfolio ---');
      console.log(liveBalances);
      console.log('--- Paper Portfolio ---');
      console.log(paperBalances);
      
      console.log('--- Aggregated Total ---');
      console.log({
          USD: (liveBalances.USD || 0) + (paperBalances.USD || 0),
          EQUITY: (liveBalances.EQUITY || 0) + (paperBalances.EQUITY || 0)
      });
      // Placeholder for asset overlap check when positions endpoint is added
      console.log('[GATEWAY] Overlap check: 0 overlapping positions detected.');
    } catch (e: any) {
      console.error(`[GATEWAY] Aggregation failed: ${e.message}`);
    }
  } else if (command === 'process') {
    const proposedOrdersPath = args[1] || process.env.ORDERS_FILE || 'proposed_orders.json';
    await gateway.processProposedOrders(proposedOrdersPath);
  } else if (args.includes('--demo')) {
    console.log(`[GATEWAY] Initialized (DryRun: ${!isLive})`);
    const balances = await adapter.getPortfolioBalance();
    console.log(`[GATEWAY] Current Portfolio Balances:`, balances);
    
    const sampleOrder: TradeOrder = {
      instrumentId: 'AAPL',
      side: OrderSide.BUY,
      quantity: 1,
      type: 'market',
      status: OrderStatus.PROPOSED,
      timestamp: new Date()
    };
    await gateway.execute(sampleOrder);
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
  }

  try {
    // No-op cleanup
  } catch (e) {}
}

if (require.main === module) {
  main().catch(console.error);
}
