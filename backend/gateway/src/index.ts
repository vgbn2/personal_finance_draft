import 'dotenv/config';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-ignore
import Alpaca from '@alpacahq/alpaca-trade-api';
import { createClobClient, resolveOwnerAddress, polymarketGet } from './clob_factory.js';
import { runCycle, runBotLoop, runForceSell, runBotHealth } from './cycle.js';
import { loadBotState, saveBotState } from './bot_state.js';
// @ts-ignore
const { buildAggregatedPortfolioSnapshot } = require('./polymarket_portfolio.js');
// @ts-ignore
const { fetchPolymarketGammaMarkets, fetchPolymarketGammaEvents } = require('./polymarket_markets.js');
// @ts-ignore
const { buildPolymarketCollateralProbeSnapshot, buildPolymarketDebugSnapshot, buildTradePagination, getConfiguredSignatureType, getConfiguredWalletAddress, polymarketAddressRoles, polymarketModeCandidates, polymarketProbeCandidates } = require('./polymarket_account.js');
// @ts-ignore
const { validateProposedOrdersPayload } = require('./proposed_orders.js');
// @ts-ignore
const { traceCsvFile } = require('./polymarket_trace.js');
// @ts-ignore
const { normalizePolymarketApiCreds, summarizePolymarketApiCredShape } = require('./polymarket_creds.js');
// @ts-ignore
const { classifyPolymarketGatewayError, describeGatewayError } = require('./polymarket_errors.js');
// @ts-ignore
const { runPolymarketPaperRun, loadPortfolio: loadInternalPaperPortfolio, summarizePortfolio: summarizeInternalPaperPortfolio } = require('./polymarket_paper.js');
// @ts-ignore
const { runPolymarketOrderbookLiteBackfill } = require('../../cli/commands/trade/polymarket_backtest.js');
// @ts-ignore
const { resolveAlpacaSettings, resolveGateIoSettings } = require('../../../shared/lib/brokers/index.js');
// @ts-ignore
const { resolvePolymarketClientSettings } = require('../../../shared/lib/brokers/polymarket_env.js');
// @ts-ignore
const { PersistenceBridge } = require('../../../shared/lib/runtime/persistence_bridge');
// @ts-ignore
const { fetchWithRetry, retryTransient } = require('../../../shared/lib/runtime/fetch_retry');

const ansi = {
  reset:       '\x1b[0m',
  bold:        '\x1b[1m',
  dim:         '\x1b[2m',
  red:         '\x1b[31m',
  green:       '\x1b[32m',
  yellow:      '\x1b[33m',
  magenta:     '\x1b[35m',
  boldGreen:   '\x1b[1;32m',
  boldYellow:  '\x1b[1;33m',
  boldMagenta: '\x1b[1;35m',
  boldCyan:    '\x1b[1;36m',
} as const;

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
  tickSizeOverride?: string;
  type: 'market' | 'limit';
  status: OrderStatus;
  timestamp: Date;
  error?: string;
}


interface Position {
  symbol: string;
  assetId?: string;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  unrealizedPl: number;
  cost_basis_unavailable?: boolean;
}

interface PolymarketTrade {
  id?: string;
  asset_id?: string;
  market?: string;
  outcome?: string;
  outcome_index?: number;
  side?: string | number;
  size?: string | number;
  price?: string | number;
  match_time?: string;
  last_update?: string;
}

interface PolymarketTradePagination {
  pages_fetched: number;
  trades_fetched: number;
  page_cap: number;
  truncated: boolean;
  next_cursor?: string;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePolymarketSide(side: unknown): 'buy' | 'sell' | null {
  if (typeof side === 'string') {
    const upper = side.toUpperCase();
    if (upper === 'BUY') return 'buy';
    if (upper === 'SELL') return 'sell';
  }
  if (side === 0) return 'buy';
  if (side === 1) return 'sell';
  return null;
}

function aggregatePolymarketFilledPositions(trades: PolymarketTrade[]): Position[] {
  const buckets = new Map<string, {
    assetId: string;
    symbol: string;
    quantity: number;
    costBasis: number;
    seenAt: number;
  }>();

  const sortedTrades = [...trades].sort((a, b) => {
    const ta = Date.parse(String(a.match_time || a.last_update || ''));
    const tb = Date.parse(String(b.match_time || b.last_update || ''));
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
  });

  for (const trade of sortedTrades) {
    const assetId = String(trade.asset_id || '');
    if (!assetId) continue;

    const side = normalizePolymarketSide(trade.side);
    if (!side) continue;

    // CLOB /trades returns size in raw units (1 raw = 0.1 shares); normalize to shares
    const size = toFiniteNumber(trade.size) / 10;
    const price = toFiniteNumber(trade.price);
    if (size <= 0 || price < 0) continue;

    const key = assetId;
    const bucket = buckets.get(key) || {
      assetId: key,
      symbol: String(trade.outcome || trade.market || assetId),
      quantity: 0,
      costBasis: 0,
      seenAt: 0,
    };

    bucket.symbol = String(trade.outcome || trade.market || assetId);
    bucket.seenAt = Math.max(bucket.seenAt, Date.parse(String(trade.match_time || trade.last_update || '')) || 0);

    if (side === 'buy') {
      bucket.quantity += size;
      bucket.costBasis += size * price;
    } else {
      if (bucket.quantity > 0) {
        const avgCost = bucket.costBasis / bucket.quantity;
        const closedSize = Math.min(bucket.quantity, size);
        bucket.quantity -= closedSize;
        bucket.costBasis = Math.max(0, bucket.costBasis - (avgCost * closedSize));
      }
    }

    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.quantity > 0)
    .map((bucket) => {
      const averagePrice = bucket.quantity > 0 ? bucket.costBasis / bucket.quantity : 0;
      return {
        assetId: bucket.assetId,
        symbol: bucket.symbol,
        quantity: bucket.quantity,
        averagePrice,
        marketValue: bucket.quantity * averagePrice,
        unrealizedPl: 0,
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Hypothetical Broker Interface
 */
interface BrokerAdapter {
  placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }>;
  cancelOrder(orderId: string): Promise<boolean>;
  getPortfolioBalance(): Promise<Record<string, number>>;
  getPositions(): Promise<Position[]>;
  getQuote(symbol: string): Promise<number>;
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
    const settings = resolveGateIoSettings(process.env, options);
    this.baseUrl = settings.baseUrl;
    this.apiKey = settings.apiKey;
    this.apiSecret = settings.apiSecret;
    this.simulateIfMissingCredentials = options.simulateIfMissingCredentials ?? true;
  }

  private hasCredentials(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  private async requestJson(method: string, requestPath: string, body?: Record<string, unknown>): Promise<unknown> {
    const payload = body ? JSON.stringify(body) : '';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signGateIoRequest(method, requestPath, '', payload, timestamp, this.apiSecret || '');

    const response = await fetchWithRetry(`${this.baseUrl}${requestPath}`, {
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

  private async getCostBasisVwap(pair: string): Promise<{ averagePrice: number; found: boolean }> {
    try {
      const trades = await this.requestJson('GET', `/spot/my_trades?currency_pair=${encodeURIComponent(pair)}&limit=1000`) as any[];
      if (!Array.isArray(trades) || trades.length === 0) return { averagePrice: 0, found: false };
      let totalAmount = 0;
      let totalCost = 0;
      for (const t of trades) {
        if (String(t.side || '').toLowerCase() !== 'buy') continue;
        const amount = Number(t.amount ?? t.qty ?? 0);
        const price = Number(t.price ?? 0);
        if (amount > 0 && price > 0) {
          totalAmount += amount;
          totalCost += price * amount;
        }
      }
      if (totalAmount <= 0) return { averagePrice: 0, found: false };
      return { averagePrice: totalCost / totalAmount, found: true };
    } catch {
      return { averagePrice: 0, found: false };
    }
  }

  async getPositions(): Promise<Position[]> {
    const balances = await this.getPortfolioBalance();
    const heldCurrencies = Object.entries(balances).filter(([sym, qty]) => qty > 0 && sym !== 'USDT');

    if (heldCurrencies.length === 0) return [];

    // Fetch spot tickers to enrich balances with current market prices
    let tickerMap: Record<string, number> = {};
    try {
      const tickers = await this.requestJson('GET', '/spot/tickers') as any[];
      if (Array.isArray(tickers)) {
        for (const t of tickers) {
          if (t && t.currency_pair) {
            const lastPrice = Number(t.last ?? t.last_price ?? 0);
            if (lastPrice > 0) tickerMap[String(t.currency_pair).toUpperCase()] = lastPrice;
          }
        }
      }
    } catch {
      // Non-fatal: fall back to zero market value
    }

    const positions: Position[] = [];
    for (const [symbol, qty] of heldCurrencies) {
      const pair = `${symbol}_USDT`;
      const currentPrice = tickerMap[pair] ?? 0;
      const { averagePrice, found } = await this.getCostBasisVwap(pair);
      const unrealizedPl = found && averagePrice > 0
        ? Number(((currentPrice - averagePrice) * qty).toFixed(4))
        : 0;
      positions.push({
        symbol,
        quantity: qty,
        averagePrice: found ? Number(averagePrice.toFixed(6)) : 0,
        marketValue: Number((qty * currentPrice).toFixed(4)),
        unrealizedPl,
        ...(found ? {} : { cost_basis_unavailable: true }),
      });
    }
    return positions;
  }

  async getQuote(symbol: string): Promise<number> {
    if (!this.hasCredentials()) {
      console.warn('[GATE.IO] No credentials — quote unavailable');
      return 0;
    }
    const pair = symbol.includes('_') ? symbol.toUpperCase() : `${symbol.toUpperCase()}_USDT`;
    try {
        const tickers = await this.requestJson('GET', `/spot/tickers?currency_pair=${pair}`) as any[];
        if (Array.isArray(tickers) && tickers[0]) {
            return Number(tickers[0].last || tickers[0].last_price || 0);
        }
        return 0;
    } catch (err: any) {
        console.warn(`[GATE.IO] Quote fetch failed for ${pair}: ${err.message}`);
        return 0;
    }
  }
}

// Alpaca trades crypto as slash pairs against USD (BTC/USD); the platform's cache
// universe uses concatenated symbols (BTCUSDT). Map known crypto bases; leave
// everything else (equities, already-slashed pairs) untouched.
const ALPACA_CRYPTO_SYMBOL = /^(BTC|ETH|SOL|DOGE|XRP|ADA|AVAX|LINK|LTC|BCH|UNI|AAVE|SHIB|PEPE|SUI|DOT|TRX|NEAR|POL|MATIC)(USDT|USDC|USD)$/;
function toAlpacaTradeSymbol(symbol: string): string {
  const upper = String(symbol || '').toUpperCase();
  if (upper.includes('/')) return upper;
  const m = upper.match(ALPACA_CRYPTO_SYMBOL);
  return m ? `${m[1]}/USD` : upper;
}

/**
 * Alpaca Implementation using official SDK
 */
class AlpacaAdapter implements BrokerAdapter {
  private alpaca: any;
  private readonly simulateIfMissingCredentials: boolean;

  constructor(options: AlpacaAdapterOptions = {}) {
    const settings = resolveAlpacaSettings(process.env, options);
    const keyId = settings.keyId;
    const secretKey = settings.secretKey;
    const paper = settings.paper;
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
      const symbol = toAlpacaTradeSymbol(order.instrumentId);
      const isCrypto = symbol.includes('/');
      const isFractional = !Number.isInteger(order.quantity);
      const payload: any = {
        symbol,
        qty: order.quantity,
        side: order.side,
        type: order.type,
        // Alpaca rejects fractional equity orders with any TIF other than 'day' (422).
        time_in_force: isCrypto ? 'gtc' : (isFractional ? 'day' : 'gtc'),
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
      const detail = err?.response?.data ? ` ${JSON.stringify(err.response.data)}` : '';
      throw new Error(`Alpaca SDK Order Error: ${err.message}${detail}`);
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
      return { USD: 100000, BUYING_POWER: 200000, EQUITY: 100000 };
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

  async getPositions(): Promise<Position[]> {
    console.log(`[ALPACA-SDK] Fetching positions`);
    if (!this.hasCredentials()) {
      if (!this.simulateIfMissingCredentials) throw new Error('Alpaca credentials are not configured');
      return [];
    }

    try {
      const positions = await this.alpaca.getPositions();
      return positions.map((p: any) => ({
        symbol: p.symbol,
        quantity: Number(p.qty),
        averagePrice: Number(p.avg_entry_price),
        marketValue: Number(p.market_value),
        unrealizedPl: Number(p.unrealized_pl)
      }));
    } catch (err: any) {
      throw new Error(`Alpaca SDK Positions Error: ${err.message}`);
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

  async getQuote(symbol: string): Promise<number> {
    if (!this.hasCredentials()) {
      console.warn('[ALPACA] No credentials — quote unavailable');
      return 0;
    }
    try {
      const quote = await this.alpaca.getLatestQuote(symbol);
      return Number(quote.AskPrice || quote.BidPrice || 0);
    } catch (err: any) {
      console.warn(`[ALPACA-SDK] Quote fetch failed for ${symbol}: ${err.message}`);
      return 0;
    }
  }
}

/**
 * Bridge to simulate C++ Pre-Trade Risk logic
 */
class RiskEngineBridge {
  async checkRisk(order: TradeOrder): Promise<{ approved: boolean; reason?: string }> {
    console.log(`[RISK-ENGINE] Pre-trade check for ${order.instrumentId} (${order.quantity} units)`);

    // --- NEW: Global Kill Switch Check ---
    // @ts-ignore
    const { findBackendBinary } = require('../../../shared/lib/runtime/paths');
    const binary: string | null = findBackendBinary();

    if (!binary) {
      const message = 'CRITICAL: Risk Engine binary not found or non-executable (FAIL-CLOSED)';
      // ALLOW BYPASS in Dry-Run mode to prevent development deadlock
      if (process.env.LIVE_TRADING !== 'true' && !process.argv.includes('--live')) {
        console.warn(`${ansi.boldYellow}[WARNING] ${message}${ansi.reset}`);
        console.warn(`${ansi.boldYellow}[WARNING] Proceeding without C++ risk checks (DRY-RUN ONLY)${ansi.reset}`);
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
    
    // Preparation for C++ Risk Check
    const notional = (order.price || 0) * order.quantity;
    const volatility = Number(process.env.ESTIMATED_PORTFOLIO_VOLATILITY || 50000); // Proxy for equity/vol
    const drawdown = Number(process.env.CURRENT_PORTFOLIO_DRAWDOWN || 0.0);
    const maxDrawdown = Number(process.env.MAX_ALLOWED_DRAWDOWN || 0.20);

    const riskCheckArgs = [
      'risk', 'check',
      '--notional', notional.toString(),
      '--volatility', volatility.toString(),
      '--drawdown', drawdown.toString(),
      '--max-drawdown', maxDrawdown.toString()
    ];

    console.log(`[RISK-ENGINE-BRIDGE] Invoking: ${binary} ${riskCheckArgs.join(' ')}`);
    const riskResult = spawnSync(binary, riskCheckArgs, { encoding: 'utf8' });

    if (riskResult.status === 0 || riskResult.status === 2) {
       try {
          const decision = JSON.parse(riskResult.stdout);
          return {
             approved: decision.approved,
             reason: decision.reason
          };
       } catch (e) {
          return {
             approved: false,
             reason: `CRITICAL: Risk Engine returned malformed JSON: ${riskResult.stdout}`
          };
       }
    }

    return { 
      approved: false, 
      reason: `CRITICAL: Risk Engine execution failed (Code: ${riskResult.status})` 
    };
  }
}

class ExecutionGateway {
  private dryRun: boolean;
  private adapter: BrokerAdapter;
  private riskEngine: RiskEngineBridge;
  private persistence: any; // PersistenceBridge (CommonJS require — value, not a type)

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
        order.error = error.message ?? String(error);
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
      const validation = validateProposedOrdersPayload(parsed);

      console.log(`[GATEWAY] Found ${validation.total} orders in file`);
      if (!validation.ok) {
        console.error('[GATEWAY] Proposed order validation failed:');
        validation.errors.forEach((entry: any) => {
          console.error(`  [${entry.index}] ${entry.errors.join('; ')}`);
        });
        throw new Error('Malformed or unsupported proposed orders');
      }

      if (validation.preview.length) {
        console.log('[GATEWAY] Proposed order preview:');
        validation.preview.forEach((entry: any, idx: number) => {
          console.log(`  [${idx}] ${entry.side} ${entry.quantity} ${entry.instrumentId} ${entry.type}${entry.price != null ? ` @ ${entry.price}` : ''}`);
        });
      }

      for (const orderData of validation.orders) {
        const order: TradeOrder = {
          instrumentId: orderData.instrumentId,
          side: orderData.side as OrderSide,
          quantity: Number(orderData.quantity),
          price: orderData.price !== undefined ? Number(orderData.price) : undefined,
          type: orderData.type as 'market' | 'limit',
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
        throw error;
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
  aggregate_portfolio                  Aggregate balances across all brokers
  polymarket portfolio                 Show pUSD, open orders, and filled positions
  polymarket debug                     Show signer/funder, balance, allowance, and account diagnostics
  polymarket auth-health               Run no-spend auth/read probes for the active Polymarket mode
  polymarket collateral-probe          Show signer/funder and collateral balance/allowance only
  polymarket modes                     Probe the main Polymarket signer/funder/signature-type combinations
                                       Add --collateral-only to keep the matrix read-light
  polymarket investigate --csv <path>  Trace a CSV export and probe downstream candidates automatically
  polymarket probe --address <addr>    Probe one arbitrary funder address with signature types 1 and 3
  polymarket topology                  Show Polymarket address roles and configured funder mode
  polymarket trace --csv <path>        Summarize funding-path inflows and downstream recipients from explorer CSV
  polymarket markets [limit]           List active prediction markets (public, no auth)
  polymarket orderbook --token <id>    Show public order book depth for one token id
  polymarket price-history --token <id> [--interval 1h] [--fidelity N]
                                       Show public price history for one token id
  polymarket paper-run                 Run paper-trading cycle without submitting CLOB orders
  polymarket buy <token> <qty> [price] Submit a live buy order for one token id
  polymarket sell <token> <qty> [price] Submit a live sell order for one token id
                                       Add --preflight to sign and validate without posting
                                       Add --tick-size <0.001> to reuse a known orderbook tick size
  polymarket derive-creds              Derive L2 API credentials from POLYMARKET_PRIVATE_KEY
  process [file]                       Process proposed orders from a JSON file

Options:
  --live                               Run in LIVE mode (default is dry-run)
  --json                               Output as JSON
  --demo                               Run the demo sequence

Examples:
  npx ts-node execution_gateway/src/index.ts buy AAPL 10
  npx ts-node execution_gateway/src/index.ts sell TSLA 5 limit 180 --live
  npx ts-node execution_gateway/src/index.ts balance
  npx ts-node execution_gateway/src/index.ts polymarket portfolio
  `);
}

interface PolymarketAdapterOptions {
  host?: string;
  privateKey?: string;
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
}

const VALID_POLYMARKET_TICK_SIZES = new Set(['0.1', '0.01', '0.001', '0.0001']);

function buildPolymarketOrderError(stage: string, error: any): Error {
  const diagnostic = classifyPolymarketGatewayError(error);
  const err = new Error(`Polymarket CLOB ${stage} failed: ${diagnostic.error}`);
  (err as any).error_category = diagnostic.error_category;
  (err as any).suggestion = diagnostic.suggestion;
  (err as any).stage = stage;
  return err;
}

interface PreparedPolymarketOrder {
  client: any;
  tickSize: string;
  signedOrder: any;
  accountIdentity: { funderAddress?: string; signatureType?: number };
}

/**
 * Polymarket CLOB Adapter
 * Uses @polymarket/clob-client against https://clob.polymarket.com (Polygon mainnet).
 * Requires POLYMARKET_PRIVATE_KEY + L2 credentials in env; falls back to no-credential
 * mode (public endpoints only — no balances or positions) if missing.
 */
class PolymarketAdapter implements BrokerAdapter {
  private readonly host: string;
  private readonly privateKey: string | undefined;
  private readonly creds: { key: string; secret: string; passphrase: string } | null;
  private readonly funderAddress: string | undefined;
  private readonly signatureType: number | undefined;
  private lastTradePagination: PolymarketTradePagination | undefined;

  constructor(options: PolymarketAdapterOptions = {}) {
    const settings = resolvePolymarketClientSettings(process.env, options);
    this.host = settings.host;
    this.privateKey = settings.privateKey;
    this.creds = settings.creds;
    // Deposit/proxy wallet that actually owns collateral and orders (falls back to signer EOA).
    this.funderAddress = settings.funderAddress;
    this.signatureType = settings.signatureType;
  }

  private hasCredentials(): boolean {
    return Boolean(this.privateKey && this.creds);
  }

  getTradePagination(): PolymarketTradePagination | undefined {
    return this.lastTradePagination;
  }

  getAccountIdentity(): { funderAddress?: string; signatureType?: number } {
    return { funderAddress: this.funderAddress, signatureType: this.signatureType };
  }

  async prepareOrder(order: TradeOrder): Promise<PreparedPolymarketOrder> {
    if (!this.hasCredentials()) throw new Error('Polymarket credentials not configured');
    const client = await createClobClient({ withCreds: true, host: this.host, privateKey: this.privateKey, creds: this.creds, funderAddress: this.funderAddress, signatureType: this.signatureType });

    const price = order.price ?? 0.5;
    if (!Number.isFinite(price) || price <= 0 || price >= 1) {
      throw new Error('Polymarket limit orders require a finite price between 0 and 1');
    }

    let tickSize: string | undefined = String(order.tickSizeOverride || '').trim() || undefined;
    try {
      if (!tickSize || !VALID_POLYMARKET_TICK_SIZES.has(tickSize)) {
        tickSize = String(await client.getTickSize(order.instrumentId));
      }
      if (!VALID_POLYMARKET_TICK_SIZES.has(tickSize)) {
        const publicBook = await fetchPolymarketOrderBook(order.instrumentId);
        const fallbackTickSize = String(publicBook?.book?.tick_size ?? '');
        if (VALID_POLYMARKET_TICK_SIZES.has(fallbackTickSize)) {
          tickSize = fallbackTickSize;
        }
      }
      if (!VALID_POLYMARKET_TICK_SIZES.has(tickSize)) {
        throw new Error(`Unable to resolve valid CLOB tick size for token ${order.instrumentId}: ${tickSize || 'missing'}`);
      }
    } catch (error: any) {
      throw buildPolymarketOrderError('tick-size lookup', error);
    }

    let signedOrder: any;
    try {
      const { Side } = await import('@polymarket/clob-client-v2');
      signedOrder = await client.createOrder({
        tokenID: order.instrumentId,
        price,
        size: order.quantity,
        side: order.side === OrderSide.BUY ? Side.BUY : Side.SELL,
      }, { tickSize: tickSize as any });
    } catch (error: any) {
      throw buildPolymarketOrderError('order signing', error);
    }

    return {
      client,
      tickSize,
      signedOrder,
      accountIdentity: this.getAccountIdentity(),
    };
  }

  async getCollateralStatus(): Promise<{ balance: number; allowance: number; asset_type: 'COLLATERAL' }> {
    if (!this.hasCredentials()) throw new Error('Polymarket credentials not configured');
    await polymarketGet('/balance-allowance/update', { asset_type: 'COLLATERAL' }, {
      privateKey: this.privateKey,
      creds: this.creds ?? undefined,
      funderAddress: this.funderAddress,
      signatureType: this.signatureType,
      host: this.host,
    });
    const data = await polymarketGet('/balance-allowance', { asset_type: 'COLLATERAL' }, {
      privateKey: this.privateKey,
      creds: this.creds ?? undefined,
      funderAddress: this.funderAddress,
      signatureType: this.signatureType,
      host: this.host,
    });
    return {
      balance: Number(data?.balance ?? 0),
      allowance: Number(data?.allowance ?? 0),
      asset_type: 'COLLATERAL',
    };
  }

  async placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }> {
    const prepared = await this.prepareOrder(order);
    const client = prepared.client;
    const signedOrder = prepared.signedOrder;

    let resp: any;
    try {
      const { OrderType } = await import('@polymarket/clob-client-v2');
      resp = await client.postOrder(signedOrder, OrderType.GTC) as any;
    } catch (error: any) {
      throw buildPolymarketOrderError('order submit', error);
    }
    if (!resp?.success) {
      throw new Error(`Polymarket CLOB rejected order: ${resp?.errorMsg || JSON.stringify(resp)}`);
    }
    return { orderId: resp.orderID, status: resp.status ?? 'submitted' };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    if (!this.hasCredentials()) throw new Error('Polymarket credentials not configured');
    const client = await createClobClient({ withCreds: true, host: this.host, privateKey: this.privateKey, creds: this.creds, funderAddress: this.funderAddress });
    await client.cancelOrder({ orderID: orderId });
    return true;
  }

  async getPortfolioBalance(): Promise<Record<string, number>> {
    const collateral = await this.getCollateralStatus();
    let pUSD = collateral.balance / 1_000_000;

    // When funderAddress is the Gnosis Safe (signatureType=2) and the primary
    // balance is zero, also check the PROXY_ADDRESS (signatureType=1 / old
    // deposit flow). Users who deposited before switching to the Gnosis Safe flow
    // still have collateral there.
    if (pUSD === 0 && this.signatureType === 2) {
      const proxyAddress = process.env.PROXY_ADDRESS?.trim();
      if (proxyAddress && proxyAddress.toLowerCase() !== String(this.funderAddress ?? '').toLowerCase()) {
        try {
          const proxyData = await polymarketGet('/balance-allowance', { asset_type: 'COLLATERAL' }, {
            privateKey: this.privateKey,
            creds: this.creds ?? undefined,
            funderAddress: proxyAddress,
            signatureType: 1,
            host: this.host,
          });
          pUSD += Number(proxyData?.balance ?? 0) / 1_000_000;
        } catch { /* best-effort */ }
      }
    }

    return { pUSD };
  }

  async getOpenOrders(): Promise<Position[]> {
    if (!this.hasCredentials()) throw new Error('Polymarket credentials not configured');
    const owner = await resolveOwnerAddress(this.privateKey as string, this.funderAddress);
    const raw = await polymarketGet('/data/orders', { owner }, {
      privateKey: this.privateKey,
      creds: this.creds ?? undefined,
      funderAddress: this.funderAddress,
      host: this.host,
    }) ?? [];
    const orders: any[] = Array.isArray(raw) ? raw : raw?.data ?? [];
    return orders
      .map((o: any) => {
        const original = toFiniteNumber(o.original_size);
        const matched = toFiniteNumber(o.size_matched);
        const remaining = Math.max(0, original - matched);
        return {
          symbol: String(o.outcome ?? o.market ?? o.asset_id ?? ''),
          quantity: remaining,
          averagePrice: toFiniteNumber(o.price),
          marketValue: remaining * toFiniteNumber(o.price),
          unrealizedPl: 0,
        };
      })
      .filter((o) => o.quantity > 0)
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  async getPositions(): Promise<Position[]> {
    if (!this.hasCredentials()) throw new Error('Polymarket credentials not configured');
    const owner = await resolveOwnerAddress(this.privateKey as string, this.funderAddress);
    const gatewayOpts = {
      privateKey: this.privateKey,
      creds: this.creds ?? undefined,
      funderAddress: this.funderAddress,
      signatureType: this.signatureType,
      host: this.host,
    };
    const allTrades: PolymarketTrade[] = [];
    let cursor: string | undefined;
    const configuredPageCap = Number.parseInt(process.env.POLYMARKET_TRADE_PAGE_CAP || '10', 10);
    const PAGE_CAP = Number.isFinite(configuredPageCap) && configuredPageCap > 0 ? configuredPageCap : 10;
    let pagesFetched = 0;
    for (let page = 0; page < PAGE_CAP; page++) {
      const params: Record<string, string> = { owner, limit: '1000' };
      if (cursor) params.cursor = cursor;
      const raw = await polymarketGet('/trades', params, gatewayOpts) ?? [];
      const page_trades: PolymarketTrade[] = Array.isArray(raw) ? raw : raw?.data ?? [];
      pagesFetched += 1;
      allTrades.push(...page_trades);
      cursor = Array.isArray(raw) ? undefined : raw?.next_cursor;
      if (!cursor || page_trades.length === 0) break;
    }
    const tradePagination = buildTradePagination(pagesFetched, allTrades.length, PAGE_CAP, cursor);
    this.lastTradePagination = tradePagination;
    // truncation is noted in trade_pagination; no console noise needed
    const trades = allTrades;
    const positions = aggregatePolymarketFilledPositions(trades);

    if (positions.length === 0) return [];

    // Batch-fetch market questions from Gamma API for all unique token IDs.
    // Two passes: (1) default (active markets) and (2) active=false (resolved/closed markets).
    // Gamma API excludes resolved markets by default, so a second pass is required to name them.
    const uniqueTokenIds = [...new Set(positions.map((p) => p.assetId).filter(Boolean))];
    const tokenToQuestion: Record<string, string> = {};
    if (uniqueTokenIds.length > 0) {
      const axios = require('axios') as any;
      const gammaHeaders = { accept: 'application/json' };
      const parseMarketQuestion = (m: any) => {
        const tokenIds: string[] = (() => {
          try { return JSON.parse(m.clobTokenIds ?? m.clob_token_ids ?? '[]'); } catch { return []; }
        })();
        tokenIds.forEach((tid) => { if (tid && !tokenToQuestion[tid]) tokenToQuestion[tid] = m.question ?? ''; });
      };
      const buildParams = (extra?: Record<string, string>) => {
        const p = new URLSearchParams();
        uniqueTokenIds.forEach((id) => p.append('clob_token_ids', id as string));
        p.set('limit', String(Math.min(uniqueTokenIds.length * 2, 200)));
        if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
        return p;
      };
      // Pass 1 — active markets
      try {
        const resp = await retryTransient(() => axios.get(`https://gamma-api.polymarket.com/markets?${buildParams().toString()}`, { timeout: 8000, headers: gammaHeaders }));
        const markets: any[] = Array.isArray(resp.data) ? resp.data : (resp.data?.data ?? []);
        markets.forEach(parseMarketQuestion);
      } catch { /* best-effort */ }
      // Pass 2 — resolved/closed markets (Gamma excludes these from the default response)
      const stillMissing = uniqueTokenIds.filter((id) => !tokenToQuestion[id as string]);
      if (stillMissing.length > 0) {
        try {
          const p2 = new URLSearchParams();
          stillMissing.forEach((id) => p2.append('clob_token_ids', id as string));
          p2.set('limit', String(Math.min(stillMissing.length * 2, 200)));
          p2.set('active', 'false');
          const resp2 = await retryTransient(() => axios.get(`https://gamma-api.polymarket.com/markets?${p2.toString()}`, { timeout: 8000, headers: gammaHeaders }));
          const markets2: any[] = Array.isArray(resp2.data) ? resp2.data : (resp2.data?.data ?? []);
          markets2.forEach(parseMarketQuestion);
        } catch { /* best-effort */ }
      }
    }

    // Suppress SDK's internal console.error for resolved-market 404s across all concurrent fetches
    const origConsoleError = console.error;
    console.error = () => {};
    const clientForQuote = await createClobClient({ host: this.host });
    const priced = await Promise.all(positions.map(async (position) => {
      const tokenId = position.assetId || position.symbol;
      let currentPrice = 0;
      try {
        const resp = await clientForQuote.getPrice(tokenId, 'BUY');
        currentPrice = Number(resp?.price ?? resp ?? 0);
      } catch {
        currentPrice = 0;
      }
      const marketValue = currentPrice > 0 ? currentPrice * position.quantity : position.marketValue;
      const unrealizedPl = currentPrice > 0 ? (currentPrice - position.averagePrice) * position.quantity : 0;
      const question = position.assetId ? tokenToQuestion[position.assetId] : undefined;
      const label = question
        ? `${question.slice(0, 38)}… (${position.symbol})`
        : position.symbol;
      return {
        ...position,
        symbol: label,
        marketValue,
        unrealizedPl,
      };
    }));
    console.error = origConsoleError;

    return priced.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  async getQuote(symbol: string): Promise<number> {
    const client = await createClobClient({ host: this.host }); // public endpoint, no creds
    try {
      const resp = await client.getPrice(symbol, 'BUY');
      return Number(resp?.price ?? resp ?? 0);
    } catch {
      return 0;
    }
  }
}

interface PolymarketSection {
  ok: boolean;
  configured: boolean;
  lastUpdated?: string;
  balance?: Record<string, number>;
  openOrders?: Position[];
  positions?: Position[];
  trade_pagination?: PolymarketTradePagination;
  error?: string;
}

interface PolymarketDebugSection {
  ok: boolean;
  configured: boolean;
  signerAddress?: string | null;
  funderAddress?: string | null;
  signatureType?: number | null;
  walletMode?: string | number;
  collateral?: { balance: number; allowance: number; asset_type: string };
  openOrderCount?: number;
  positionCount?: number;
  tradePagination?: PolymarketTradePagination | null;
  accountState?: string;
  notes?: string[];
  error?: string;
}

interface PolymarketModeProbeResult {
  case: string;
  signatureType: number;
  funderAddress?: string;
  ok: boolean;
  signerAddress?: string | null;
  walletMode?: string | number | null;
  collateral?: { balance: number; allowance: number; asset_type: string } | null;
  openOrderCount?: number | null;
  positionCount?: number | null;
  accountState?: string | null;
  error?: string;
}

interface PolymarketCollateralProbeSection {
  ok: boolean;
  configured: boolean;
  signerAddress?: string | null;
  funderAddress?: string | null;
  signatureType?: number | null;
  walletMode?: string | number;
  collateral?: { balance: number; allowance: number; asset_type: string };
  accountState?: string;
  error?: string;
}

interface PolymarketAuthStage {
  ok: boolean;
  count?: number;
  accountState?: string;
  collateral?: { balance: number; allowance: number; asset_type: string };
  tradePagination?: PolymarketTradePagination | null;
  error?: string;
  error_category?: string;
  suggestion?: string;
}

interface PolymarketAuthHealthSection {
  ok: boolean;
  configured: boolean;
  signerAddress?: string | null;
  funderAddress?: string | null;
  signatureType?: number | null;
  walletMode?: string | number;
  env: {
    hasPrivateKey: boolean;
    hasApiCreds: boolean;
    hasDepositAddress: boolean;
    hasProxyAddress: boolean;
    hasFunderAddress: boolean;
  };
  stages?: {
    collateral: PolymarketAuthStage;
    open_orders: PolymarketAuthStage;
    positions: PolymarketAuthStage;
  };
  likelyFailureStage?: 'not_configured' | 'collateral' | 'open_orders' | 'positions' | null;
  note?: string;
  error?: string;
}

function fmtQty(n: number): string {
  // cap at 4 decimal places; trim trailing zeros
  const s = n.toFixed(4);
  return s.replace(/\.?0+$/, '') || '0';
}
function fmtUsd(n: number): string { return '$' + n.toFixed(2); }
function fmtPnl(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${fmtUsd(n)}`;
}

function walletModeLabel(signatureType?: number | null): string {
  if (signatureType === 3) return 'POLY_1271';
  if (signatureType === 2) return 'POLY_GNOSIS_SAFE';
  if (signatureType === 1) return 'POLY_PROXY';
  if (signatureType === 0) return 'EOA';
  return 'unknown';
}

function buildPolymarketEnvPresence(env = process.env) {
  return {
    hasPrivateKey: Boolean(String(env.POLYMARKET_PRIVATE_KEY || '').trim()),
    hasApiCreds: Boolean(
      String(env.POLYMARKET_API_KEY || '').trim()
      && String(env.POLYMARKET_API_SECRET || '').trim()
      && String(env.POLYMARKET_API_PASSPHRASE || '').trim()
    ),
    hasDepositAddress: Boolean(String(env.DEPOSIT_ADDRESS || env.POLYMARKET_WALLET_ADDRESS || env.POLYMARKET_WAllET_ADDRESS || '').trim()),
    hasProxyAddress: Boolean(String(env.PROXY_ADDRESS || '').trim()),
    hasFunderAddress: Boolean(String(env.POLYMARKET_FUNDER_ADDRESS || '').trim()),
  };
}

function renderPolymarketSection(pm: PolymarketSection) {
  console.log(`\n${ansi.boldMagenta}Polymarket Portfolio${ansi.reset}`);
  if (!pm.configured) {
    console.log(`  ${ansi.yellow}Not configured — set POLYMARKET_PRIVATE_KEY + API credentials${ansi.reset}`);
    return;
  }
  if (!pm.ok) {
    console.log(`  ${ansi.red}Error: ${pm.error}${ansi.reset}`);
    return;
  }

  const pusdBalance = pm.balance?.pUSD ?? 0;
  const ts = pm.lastUpdated ? new Date(pm.lastUpdated).toLocaleTimeString() : '?';
  console.log(`  ${ansi.bold}Balance${ansi.reset}  ${ansi.green}${fmtUsd(pusdBalance)}${ansi.reset}  ${ansi.dim}pUSD · ${ts}${ansi.reset}`);

  // Open orders
  if (pm.openOrders && pm.openOrders.length > 0) {
    console.log(`\n  ${ansi.bold}Open Orders${ansi.reset}`);
    pm.openOrders.forEach((p) => {
      const label = p.symbol.length > 44 ? p.symbol.slice(0, 44) + '…' : p.symbol;
      console.log(`  ${ansi.dim}·${ansi.reset} ${label.padEnd(46)}  qty ${fmtQty(p.quantity).padStart(8)}  ${fmtUsd(p.marketValue).padStart(8)}`);
    });
  }

  // Split positions: named (have market question) vs unknown (only outcome label)
  const all = pm.positions ?? [];
  const named   = all.filter((p) => p.symbol.includes('…') || p.symbol.length > 6);
  const unknown = all.filter((p) => !p.symbol.includes('…') && p.symbol.length <= 6);

  if (named.length > 0) {
    const totalValue = named.reduce((s, p) => s + p.marketValue, 0);
    const totalPnl   = named.reduce((s, p) => s + p.unrealizedPl, 0);
    const pnlColor   = totalPnl >= 0 ? ansi.green : ansi.red;
    console.log(`\n  ${ansi.bold}Active Positions${ansi.reset}  ${ansi.dim}(${named.length} markets · total ${fmtUsd(totalValue)} · PnL ${pnlColor}${fmtPnl(totalPnl)}${ansi.reset}${ansi.dim})${ansi.reset}`);
    named.forEach((p) => {
      const plColor = p.unrealizedPl > 0 ? ansi.green : p.unrealizedPl < 0 ? ansi.red : ansi.dim;
      const label = p.symbol.length > 50 ? p.symbol.slice(0, 50) + '…' : p.symbol;
      console.log(
        `  ${ansi.dim}·${ansi.reset} ${label.padEnd(52)}` +
        `  ${ansi.dim}qty${ansi.reset} ${fmtQty(p.quantity).padStart(7)}` +
        `  ${fmtUsd(p.marketValue).padStart(7)}` +
        `  ${plColor}${fmtPnl(p.unrealizedPl).padStart(8)}${ansi.reset}`
      );
    });
  }

  if (unknown.length > 0) {
    const unValue = unknown.reduce((s, p) => s + p.marketValue, 0);
    console.log(`\n  ${ansi.dim}+ ${unknown.length} unnamed positions  (total ${fmtUsd(unValue)})${ansi.reset}`);
  }

  if (named.length === 0 && unknown.length === 0) {
    console.log('  No positions.');
  }
}

async function fetchPolymarketPortfolio(): Promise<PolymarketSection> {
  const adapter = new PolymarketAdapter();
  const configured = adapter['hasCredentials']();
  if (!configured) {
    return { ok: false, configured: false, error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)' };
  }
  try {
    const [balance, openOrders, filledPositions] = await Promise.all([
      adapter.getPortfolioBalance(),
      adapter.getOpenOrders(),
      adapter.getPositions(),
    ]);
    return { ok: true, configured: true, lastUpdated: new Date().toISOString(), balance, openOrders, positions: filledPositions, trade_pagination: adapter.getTradePagination() };
  } catch (e: any) {
    return { ok: false, configured: true, error: e.message };
  }
}

function renderPolymarketDebugSection(snapshot: PolymarketDebugSection) {
  console.log(`\n${ansi.boldMagenta}--- POLYMARKET DEBUG ---${ansi.reset}`);
  if (!snapshot.configured) {
    console.log(`  ${ansi.yellow}Not configured — set POLYMARKET_PRIVATE_KEY + POLYMARKET_API_KEY/SECRET/PASSPHRASE${ansi.reset}`);
    return;
  }
  if (!snapshot.ok) {
    console.log(`  ${ansi.red}Error: ${snapshot.error}${ansi.reset}`);
    return;
  }
  console.log(`  Signer: ${snapshot.signerAddress}`);
  console.log(`  Funder: ${snapshot.funderAddress ?? 'none'}`);
  console.log(`  Signature Type: ${snapshot.signatureType ?? 'unset'} (${snapshot.walletMode})`);
  console.log(`  Collateral: balance=${snapshot.collateral?.balance ?? 0} allowance=${snapshot.collateral?.allowance ?? 0}`);
  console.log(`  Open Orders: ${snapshot.openOrderCount ?? 0}`);
  console.log(`  Filled Positions: ${snapshot.positionCount ?? 0}`);
  console.log(`  Account State: ${snapshot.accountState}`);
  if (snapshot.notes && snapshot.notes.length > 0) {
    snapshot.notes.forEach((note) => console.log(`  Note: ${note}`));
  }
}

function renderPolymarketAuthHealthSection(health: PolymarketAuthHealthSection) {
  console.log(`\n${ansi.boldMagenta}--- POLYMARKET AUTH HEALTH ---${ansi.reset}`);
  console.log(`  Configured: ${health.configured ? ansi.green + 'yes' : ansi.red + 'no'}${ansi.reset}`);
  console.log(`  Env: private_key=${health.env.hasPrivateKey ? 'yes' : 'no'} api_creds=${health.env.hasApiCreds ? 'yes' : 'no'} funder=${health.env.hasFunderAddress ? 'yes' : 'no'} deposit=${health.env.hasDepositAddress ? 'yes' : 'no'} proxy=${health.env.hasProxyAddress ? 'yes' : 'no'}`);
  if (!health.configured) {
    if (health.note) console.log(`  Note: ${health.note}`);
    return;
  }
  console.log(`  Signer: ${health.signerAddress ?? 'none'}`);
  console.log(`  Funder: ${health.funderAddress ?? 'none'}`);
  console.log(`  Signature Type: ${health.signatureType ?? 'unset'} (${health.walletMode ?? walletModeLabel(health.signatureType)})`);
  if (health.stages) {
    const stages: Array<[string, PolymarketAuthStage]> = [
      ['collateral', health.stages.collateral],
      ['open_orders', health.stages.open_orders],
      ['positions', health.stages.positions],
    ];
    for (const [name, stage] of stages) {
      const okLabel = stage.ok ? `${ansi.green}ok${ansi.reset}` : `${ansi.red}fail${ansi.reset}`;
      const parts = [`  ${name}: ${okLabel}`];
      if (typeof stage.count === 'number') parts.push(`count=${stage.count}`);
      if (stage.accountState) parts.push(`state=${stage.accountState}`);
      if (stage.collateral) {
        parts.push(`balance=${stage.collateral.balance}`);
        parts.push(`allowance=${stage.collateral.allowance}`);
      }
      console.log(parts.join('  '));
      if (!stage.ok && stage.error) console.log(`    error: ${stage.error}`);
      if (!stage.ok && stage.suggestion) console.log(`    suggestion: ${stage.suggestion}`);
    }
  }
  if (health.likelyFailureStage) {
    console.log(`  Likely failure stage: ${health.likelyFailureStage}`);
  }
  if (health.note) console.log(`  Note: ${health.note}`);
}

async function fetchPolymarketDebug(): Promise<PolymarketDebugSection> {
  const adapter = new PolymarketAdapter();
  const configured = adapter['hasCredentials']();
  if (!configured) {
    return { ok: false, configured: false, error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)' };
  }
  try {
    const { Wallet } = await import('ethers');
    const signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
    const [collateral, openOrders, filledPositions] = await Promise.all([
      adapter.getCollateralStatus(),
      adapter.getOpenOrders(),
      adapter.getPositions(),
    ]);
    const identity = adapter.getAccountIdentity();
    return buildPolymarketDebugSnapshot({
      signerAddress,
      funderAddress: identity.funderAddress,
      signatureType: identity.signatureType,
      collateral,
      openOrders,
      positions: filledPositions,
      tradePagination: adapter.getTradePagination(),
    });
  } catch (e: any) {
    return { ok: false, configured: true, error: describeGatewayError(e) };
  }
}

async function fetchPolymarketCollateralProbe(options: { funderAddress?: string; signatureType?: number } = {}): Promise<PolymarketCollateralProbeSection> {
  const adapter = new PolymarketAdapter();
  const configured = adapter['hasCredentials']();
  if (!configured) {
    return { ok: false, configured: false, error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)' };
  }
  try {
    const { Wallet } = await import('ethers');
    const signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
    if (options.funderAddress !== undefined) {
      (adapter as any).funderAddress = options.funderAddress;
    }
    if (options.signatureType !== undefined) {
      (adapter as any).signatureType = options.signatureType;
    }
    const collateral = await adapter.getCollateralStatus();
    const identity = adapter.getAccountIdentity();
    return buildPolymarketCollateralProbeSnapshot({
      signerAddress,
      funderAddress: identity.funderAddress,
      signatureType: identity.signatureType,
      collateral,
    });
  } catch (e: any) {
    return { ok: false, configured: true, error: describeGatewayError(e) };
  }
}

async function fetchPolymarketAuthHealth(): Promise<PolymarketAuthHealthSection> {
  const env = buildPolymarketEnvPresence(process.env);
  const adapter = new PolymarketAdapter();
  const configured = adapter['hasCredentials']();
  if (!configured) {
    return {
      ok: false,
      configured: false,
      env,
      likelyFailureStage: 'not_configured',
      note: 'Set POLYMARKET_PRIVATE_KEY plus POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_API_PASSPHRASE.',
    };
  }

  const identity = adapter.getAccountIdentity();
  let signerAddress: string | null = null;
  try {
    const { Wallet } = await import('ethers');
    signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
  } catch {}

  const stages: PolymarketAuthHealthSection['stages'] = {
    collateral: { ok: false },
    open_orders: { ok: false },
    positions: { ok: false },
  };

  try {
    const collateral = await adapter.getCollateralStatus();
    const snapshot = buildPolymarketCollateralProbeSnapshot({
      signerAddress,
      funderAddress: identity.funderAddress,
      signatureType: identity.signatureType,
      collateral,
    });
    stages.collateral = {
      ok: true,
      accountState: snapshot.accountState,
      collateral: snapshot.collateral,
    };
  } catch (e: any) {
    stages.collateral = { ok: false, ...classifyPolymarketGatewayError(e) };
  }

  try {
    const openOrders = await adapter.getOpenOrders();
    stages.open_orders = { ok: true, count: openOrders.length };
  } catch (e: any) {
    stages.open_orders = { ok: false, ...classifyPolymarketGatewayError(e) };
  }

  try {
    const positions = await adapter.getPositions();
    stages.positions = {
      ok: true,
      count: positions.length,
      tradePagination: adapter.getTradePagination() ?? null,
    };
  } catch (e: any) {
    stages.positions = { ok: false, ...classifyPolymarketGatewayError(e) };
  }

  const likelyFailureStage = !stages.collateral.ok
    ? 'collateral'
    : !stages.open_orders.ok
      ? 'open_orders'
      : !stages.positions.ok
        ? 'positions'
        : null;

  return {
    ok: !likelyFailureStage,
    configured: true,
    signerAddress,
    funderAddress: identity.funderAddress ?? null,
    signatureType: identity.signatureType ?? null,
    walletMode: walletModeLabel(identity.signatureType),
    env,
    stages,
    likelyFailureStage,
    note: likelyFailureStage
      ? 'This is a no-spend read-only health probe. Fix the first failing stage before retrying live orders.'
      : 'Current credentials and wallet mode passed the no-spend read surfaces.',
  };
}

async function fetchPolymarketModes(options: { collateralOnly?: boolean } = {}): Promise<{ ok: boolean; signerAddress?: string | null; results: PolymarketModeProbeResult[]; error?: string }> {
  const baseAdapter = new PolymarketAdapter();
  const configured = baseAdapter['hasCredentials']();
  if (!configured) {
    return { ok: false, results: [], error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)' };
  }
  try {
    const { Wallet } = await import('ethers');
    const signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
    const candidates = polymarketModeCandidates(process.env);
    const results: PolymarketModeProbeResult[] = [];
    for (const candidate of candidates) {
      const adapter = new PolymarketAdapter({
        privateKey: process.env.POLYMARKET_PRIVATE_KEY,
        apiKey: process.env.POLYMARKET_API_KEY,
        apiSecret: process.env.POLYMARKET_API_SECRET,
        apiPassphrase: process.env.POLYMARKET_API_PASSPHRASE,
      });
      (adapter as any).funderAddress = candidate.funderAddress;
      (adapter as any).signatureType = candidate.signatureType;
      try {
        const collateral = await adapter.getCollateralStatus();
        const [openOrders, positions] = options.collateralOnly
          ? [[], []]
          : await Promise.all([
            adapter.getOpenOrders(),
            adapter.getPositions(),
          ]);
        const snapshot = buildPolymarketDebugSnapshot({
          signerAddress,
          funderAddress: candidate.funderAddress,
          signatureType: candidate.signatureType,
          collateral,
          openOrders,
          positions,
          tradePagination: adapter.getTradePagination(),
        });
        results.push({
          case: candidate.name,
          signatureType: candidate.signatureType,
          funderAddress: candidate.funderAddress,
          ok: true,
          signerAddress,
          walletMode: snapshot.walletMode,
          collateral: snapshot.collateral,
          openOrderCount: options.collateralOnly ? null : snapshot.openOrderCount,
          positionCount: options.collateralOnly ? null : snapshot.positionCount,
          accountState: snapshot.accountState,
        });
      } catch (e: any) {
        results.push({
          case: candidate.name,
          signatureType: candidate.signatureType,
          funderAddress: candidate.funderAddress,
          ok: false,
          signerAddress,
          error: describeGatewayError(e),
        });
      }
    }
    return { ok: true, signerAddress, results };
  } catch (e: any) {
    return { ok: false, results: [], error: describeGatewayError(e) };
  }
}

async function fetchPolymarketProbe(address: string): Promise<{ ok: boolean; signerAddress?: string | null; address: string; results: PolymarketModeProbeResult[]; error?: string }> {
  const baseAdapter = new PolymarketAdapter();
  const configured = baseAdapter['hasCredentials']();
  if (!configured) {
    return { ok: false, address, results: [], error: 'Polymarket credentials not set (POLYMARKET_API_KEY / _SECRET / _PASSPHRASE / _PRIVATE_KEY)' };
  }
  try {
    const { Wallet } = await import('ethers');
    const signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
    const results: PolymarketModeProbeResult[] = [];
    for (const candidate of polymarketProbeCandidates(address)) {
      const adapter = new PolymarketAdapter({
        privateKey: process.env.POLYMARKET_PRIVATE_KEY,
        apiKey: process.env.POLYMARKET_API_KEY,
        apiSecret: process.env.POLYMARKET_API_SECRET,
        apiPassphrase: process.env.POLYMARKET_API_PASSPHRASE,
      });
      (adapter as any).funderAddress = candidate.funderAddress;
      (adapter as any).signatureType = candidate.signatureType;
      try {
        const [collateral, openOrders, positions] = await Promise.all([
          adapter.getCollateralStatus(),
          adapter.getOpenOrders(),
          adapter.getPositions(),
        ]);
        const snapshot = buildPolymarketDebugSnapshot({
          signerAddress,
          funderAddress: candidate.funderAddress,
          signatureType: candidate.signatureType,
          collateral,
          openOrders,
          positions,
          tradePagination: adapter.getTradePagination(),
        });
        results.push({
          case: candidate.name,
          signatureType: candidate.signatureType,
          funderAddress: candidate.funderAddress,
          ok: true,
          signerAddress,
          walletMode: snapshot.walletMode,
          collateral: snapshot.collateral,
          openOrderCount: snapshot.openOrderCount,
          positionCount: snapshot.positionCount,
          accountState: snapshot.accountState,
        });
      } catch (e: any) {
        results.push({
          case: candidate.name,
          signatureType: candidate.signatureType,
          funderAddress: candidate.funderAddress,
          ok: false,
          signerAddress,
          error: describeGatewayError(e),
        });
      }
    }
    return { ok: true, signerAddress, address, results };
  } catch (e: any) {
    return { ok: false, address, results: [], error: describeGatewayError(e) };
  }
}

async function probeCandidateSet(addresses: string[]): Promise<{ ok: boolean; signerAddress?: string | null; probes: any[]; error?: string }> {
  const unique = Array.from(new Set(addresses.map((value) => String(value || '').trim()).filter(Boolean)));
  if (unique.length === 0) return { ok: true, probes: [] };
  const first = await fetchPolymarketProbe(unique[0]);
  const signerAddress = first.signerAddress;
  const probes = [first];
  for (const address of unique.slice(1)) {
    probes.push(await fetchPolymarketProbe(address));
  }
  return { ok: true, signerAddress, probes };
}

async function fetchPolymarketTopology(): Promise<any> {
  const roles = polymarketAddressRoles(process.env);
  try {
    const { Wallet } = await import('ethers');
    roles.signer = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
  } catch {
    roles.signer = null;
  }
  return {
    ok: true,
    roles,
    modeCandidates: polymarketModeCandidates(process.env),
  };
}

function parseOptionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

async function withCapturedSdkRequestErrors<T>(run: () => Promise<T>): Promise<{ result: T; requestErrors: any[] }> {
  const originalConsoleError = console.error;
  const requestErrors: any[] = [];
  console.error = (...args: any[]) => {
    if (args[0] === 'request error' && args[1] && typeof args[1] === 'object') {
      requestErrors.push(args[1]);
      return;
    }
    originalConsoleError(...args);
  };
  try {
    const result = await run();
    return { result, requestErrors };
  } finally {
    console.error = originalConsoleError;
  }
}

async function derivePolymarketApiCreds(client: any): Promise<{
  creds: { key: string; secret: string; passphrase: string };
  source: 'created' | 'derived';
  createRequestErrors: any[];
  deriveRequestErrors: any[];
}> {
  const createAttempt = await withCapturedSdkRequestErrors(() => client.createApiKey());
  const createdCreds = normalizePolymarketApiCreds(createAttempt.result);
  if (createdCreds) {
    return {
      creds: createdCreds,
      source: 'created',
      createRequestErrors: createAttempt.requestErrors,
      deriveRequestErrors: [],
    };
  }

  const deriveAttempt = await withCapturedSdkRequestErrors(() => client.deriveApiKey());
  const derivedCreds = normalizePolymarketApiCreds(deriveAttempt.result);
  if (derivedCreds) {
    return {
      creds: derivedCreds,
      source: 'derived',
      createRequestErrors: createAttempt.requestErrors,
      deriveRequestErrors: deriveAttempt.requestErrors,
    };
  }

  const createError = (createAttempt.result as any)?.error;
  const deriveError = (deriveAttempt.result as any)?.error;
  const createShape = summarizePolymarketApiCredShape(createAttempt.result);
  const deriveShape = summarizePolymarketApiCredShape(deriveAttempt.result);
  throw new Error(`Polymarket auth did not return usable credentials (createError=${JSON.stringify(createError ?? null)}, deriveError=${JSON.stringify(deriveError ?? null)}, createShape=${JSON.stringify(createShape)}, deriveShape=${JSON.stringify(deriveShape)})`);
}

function inferRootAddressFromCsvPath(csvPath: string): string | undefined {
  const match = String(csvPath).match(/export-(0x[a-fA-F0-9]{40})\.csv$/i);
  return match ? match[1] : undefined;
}

function fetchPolymarketTrace(args: string[]): any {
  const csvPath = parseOptionValue(args, '--csv');
  if (!csvPath) {
    return { ok: false, error: 'Missing --csv <path>' };
  }
  const rootAddress = parseOptionValue(args, '--address') || inferRootAddressFromCsvPath(csvPath);
  if (!rootAddress) {
    return { ok: false, error: 'Unable to infer root address; pass --address <0x...>' };
  }
  const summary = traceCsvFile(csvPath, rootAddress);
  return { ok: true, csvPath, ...summary };
}

async function fetchPolymarketOrderBook(tokenId: string): Promise<any> {
  if (!tokenId) return { ok: false, error: 'Missing --token <id>' };
  try {
    const client = await createClobClient({});
    const book = await client.getOrderBook(tokenId);
    return { ok: true, tokenId, book };
  } catch (e: any) {
    const diagnostic = classifyPolymarketGatewayError(e);
    return { ok: false, tokenId, ...diagnostic };
  }
}

async function fetchPolymarketPriceHistory(tokenId: string, interval = '1h', fidelity?: number): Promise<any> {
  if (!tokenId) return { ok: false, error: 'Missing --token <id>' };
  try {
    const client = await createClobClient({});
    const params: Record<string, any> = { market: tokenId, interval };
    if (typeof fidelity === 'number' && Number.isFinite(fidelity)) params.fidelity = fidelity;
    const history = await client.getPricesHistory(params);
    return { ok: true, tokenId, interval, fidelity: params.fidelity ?? null, history };
  } catch (e: any) {
    const diagnostic = classifyPolymarketGatewayError(e);
    return { ok: false, tokenId, ...diagnostic };
  }
}

/**
 * Shared core for submitPolymarketOrder and preflightPolymarketOrder.
 * Handles input validation, adapter/identity setup, signer derivation, and
 * error wrapping; delegates the actual work to the adapter based on preflightOnly.
 *
 * Returns the exact JSON shapes expected by their respective callers.
 */
async function _polymarketOrderCore(
  tokenId: string,
  quantity: number,
  price: number | undefined,
  tickSizeOverride: string | undefined,
  side: 'buy' | 'sell',
  options: { preflightOnly: boolean },
): Promise<any> {
  if (!tokenId) return { ok: false, error: 'Missing token id' };
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: 'Quantity must be a positive number' };

  const adapter = new PolymarketAdapter();
  const identity = adapter.getAccountIdentity();
  let signerAddress = null;
  try {
    const { Wallet } = await import('ethers');
    signerAddress = new Wallet(process.env.POLYMARKET_PRIVATE_KEY as string).address;
  } catch {}

  const orderInput: TradeOrder = {
    instrumentId: tokenId,
    side: side === 'sell' ? OrderSide.SELL : OrderSide.BUY,
    quantity,
    price: typeof price === 'number' && Number.isFinite(price) ? price : undefined,
    tickSizeOverride: String(tickSizeOverride || '').trim() || undefined,
    type: 'limit',
    status: OrderStatus.PROPOSED,
    timestamp: new Date(),
  };
  const priceField = typeof price === 'number' && Number.isFinite(price) ? price : null;

  const errorBase = {
    ok: false,
    tokenId,
    side,
    quantity,
    price: priceField,
    signerAddress,
    funderAddress: identity.funderAddress ?? null,
    signatureType: identity.signatureType ?? null,
  };

  if (options.preflightOnly) {
    try {
      const prepared = await adapter.prepareOrder(orderInput);
      return {
        ok: true,
        tokenId,
        side,
        quantity,
        price: priceField,
        preflight: {
          signerAddress,
          funderAddress: prepared.accountIdentity.funderAddress ?? null,
          signatureType: prepared.accountIdentity.signatureType ?? null,
          tickSize: prepared.tickSize,
          signed: Boolean(prepared.signedOrder),
        },
      };
    } catch (e: any) {
      const diagnostic = classifyPolymarketGatewayError(e);
      return { ...errorBase, ...diagnostic };
    }
  } else {
    try {
      const result = await adapter.placeOrder(orderInput);
      return {
        ok: true,
        tokenId,
        side,
        quantity,
        price: priceField,
        signerAddress,
        funderAddress: identity.funderAddress ?? null,
        signatureType: identity.signatureType ?? null,
        result,
      };
    } catch (e: any) {
      const diagnostic = classifyPolymarketGatewayError(e);
      return { ...errorBase, ...diagnostic };
    }
  }
}

async function submitPolymarketOrder(tokenId: string, quantity: number, price?: number, tickSizeOverride?: string, side: 'buy' | 'sell' = 'buy'): Promise<any> {
  return _polymarketOrderCore(tokenId, quantity, price, tickSizeOverride, side, { preflightOnly: false });
}

async function preflightPolymarketOrder(tokenId: string, quantity: number, price?: number, tickSizeOverride?: string, side: 'buy' | 'sell' = 'buy'): Promise<any> {
  return _polymarketOrderCore(tokenId, quantity, price, tickSizeOverride, side, { preflightOnly: true });
}

async function fetchPolymarketInvestigate(args: string[]): Promise<any> {
  const trace = fetchPolymarketTrace(args);
  if (!trace.ok) return trace;
  const rawLimit = parseOptionValue(args, '--limit');
  const limit = rawLimit ? Math.max(1, Number.parseInt(rawLimit, 10) || 3) : 3;
  const addresses = (trace.recommendedProbeAddresses || []).slice(0, limit);
  const probe = await probeCandidateSet(addresses);
  return {
    ok: true,
    trace,
    probe,
    summary: {
      candidateCount: addresses.length,
      fundedCandidates: (probe.probes || []).filter((entry: any) => Array.isArray(entry.results) && entry.results.some((result: any) => Number(result?.collateral?.balance ?? 0) > 0 || Number(result?.collateral?.allowance ?? 0) > 0)),
    },
  };
}

export async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const isLive = process.env.LIVE_TRADING === 'true' || args.includes('--live');
  const useJson = args.includes('--json');
  const adapter = new AlpacaAdapter({ simulateIfMissingCredentials: !isLive });
  const gateway = new ExecutionGateway({ dryRun: !isLive, adapter });
  
  const command = args[0].toLowerCase();

  if (command === 'buy' || command === 'sell') {
    // SANITIZATION
    const rawSymbol = String(args[1] || '').toUpperCase();
    const symbol = rawSymbol.replace(/[^A-Z0-9.\-_]/g, '');
    
    let qty: number;
    const rawQty = String(args[2] || '');
    if (rawQty.startsWith('amount:')) {
      const usdAmount = Number(rawQty.split(':')[1]);
      if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
        if (useJson) {
          console.log(JSON.stringify({ ok: false, error: 'Valid positive USD amount is required for amount: sizing' }));
        } else {
          console.error('Error: Valid positive USD amount is required for amount: sizing');
        }
        process.exit(1);
      }
      const price = await adapter.getQuote(symbol);
      if (price <= 0) {
        if (useJson) {
          console.log(JSON.stringify({ ok: false, error: `Unable to fetch current price for ${symbol} to calculate dollar-based sizing` }));
        } else {
          console.error(`Error: Unable to fetch current price for ${symbol} to calculate dollar-based sizing`);
        }
        process.exit(1);
      }
      qty = Math.floor(usdAmount / price);
      if (!useJson) {
        console.log(`[GATEWAY] Dollar-based sizing: $${usdAmount} / $${price} = ${qty} units`);
      }
    } else {
      qty = Number(rawQty);
    }
    
    // Filter out flags from potential type/price positions
    const nonFlagArgs = args.slice(3).filter(a => !a.startsWith('--'));
    const type = (nonFlagArgs[0] || 'market').toLowerCase() as 'market' | 'limit';
    const price = nonFlagArgs[1] ? Number(nonFlagArgs[1]) : undefined;

    if (!symbol || !Number.isFinite(qty) || qty <= 0) {
      if (useJson) {
          console.log(JSON.stringify({ ok: false, error: 'Symbol and valid positive quantity are required' }));
      } else {
          console.error('Error: Symbol and valid positive quantity are required (Check if amount: calculation resulted in 0)');
          printUsage();
      }
      process.exit(1);
    }
    
    if (type === 'limit' && (!price || !Number.isFinite(price) || price <= 0)) {
        if (useJson) {
            console.log(JSON.stringify({ ok: false, error: 'Limit orders require a valid positive price' }));
        } else {
            console.error('Error: Limit orders require a valid positive price');
        }
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
    const orderFailed = order.status === OrderStatus.FAILED || order.status === OrderStatus.RISK_REJECTED;
    if (orderFailed) {
      process.exitCode = 1;
      const errMsg = order.error || `Order ${order.status}`;
      if (useJson) {
        console.log(JSON.stringify({ ok: false, error: errMsg, order }));
      } else {
        console.error(`[GATEWAY] Order ${order.status}: ${errMsg}`);
      }
    } else {
      if (useJson) {
        console.log(JSON.stringify({ ok: true, order }));
      }
    }
  } else if (command === 'balance') {
    const balances = await adapter.getPortfolioBalance();
    if (useJson) {
        console.log(JSON.stringify(balances));
    } else {
        console.log(`[GATEWAY] Current Portfolio Balances:`, balances);
    }
  } else if (command === 'aggregate_portfolio') {
    const isVerbose = !useJson;
    if (isVerbose) console.log('[GATEWAY] Aggregating portfolios — live / live-paper / paper...');

    try {
      // "live": real-money broker connections (and the live Polymarket account).
      const liveAdapters = [
        { name: 'Alpaca (Live)', adapter: new AlpacaAdapter({ paper: false, simulateIfMissingCredentials: false }) },
        { name: 'Gate.io', adapter: new GateIoAdapter({ simulateIfMissingCredentials: false }) },
      ];
      // "live-paper": broker-hosted simulated accounts (Alpaca's own paper-trading API).
      const livePaperAdapters = [
        { name: 'Alpaca (Paper)', adapter: new AlpacaAdapter({ paper: true, simulateIfMissingCredentials: false }) },
      ];

      const fetchAdapterResults = (adapters: { name: string; adapter: BrokerAdapter }[]) => Promise.all(adapters.map(async (entry) => {
        try {
          const [balance, positions] = await Promise.all([
            entry.adapter.getPortfolioBalance(),
            entry.adapter.getPositions()
          ]);
          return { name: entry.name, ok: true, balance, positions };
        } catch (e: any) {
          return { name: entry.name, ok: false, error: e.message };
        }
      }));

      const [liveResults, livePaperResults, polymarket] = await Promise.all([
        fetchAdapterResults(liveAdapters),
        fetchAdapterResults(livePaperAdapters),
        fetchPolymarketPortfolio(),
      ]);

      const dedupePositions = (positions: Position[]) => {
        const merged = new Map<string, Position>();
        for (const p of positions) {
          if (merged.has(p.symbol)) {
            const existing = merged.get(p.symbol)!;
            const totalQty = existing.quantity + p.quantity;
            const avgPrice = ((existing.quantity * existing.averagePrice) + (p.quantity * p.averagePrice)) / totalQty;
            merged.set(p.symbol, {
              symbol: p.symbol,
              quantity: totalQty,
              averagePrice: Number(avgPrice.toFixed(4)),
              marketValue: existing.marketValue + p.marketValue,
              unrealizedPl: existing.unrealizedPl + p.unrealizedPl
            });
          } else {
            merged.set(p.symbol, { ...p });
          }
        }
        return Array.from(merged.values());
      };

      // "live" bucket includes the live Polymarket account (real funds, real exposure).
      const live: any = buildAggregatedPortfolioSnapshot(liveResults, polymarket);
      live.positions = dedupePositions(live.positions);

      // "live-paper" bucket: Alpaca's hosted paper account only — no Polymarket (that's real-money).
      const livePaper: any = buildAggregatedPortfolioSnapshot(livePaperResults, null);
      livePaper.positions = dedupePositions(livePaper.positions);

      // "paper" bucket: this platform's own internal/simulated Polymarket dry-run ledger
      // (storage/data/paper_trading/portfolio.json) — distinct from Alpaca's hosted paper account.
      const internalPaperPortfolio = loadInternalPaperPortfolio();
      const internalPaperSummary = summarizeInternalPaperPortfolio(internalPaperPortfolio);
      const paper = {
        name: 'Internal Paper Bot (Polymarket dry-run)',
        ...internalPaperSummary,
        positions: internalPaperPortfolio.positions || [],
      };

      const aggregated: any = { live, live_paper: livePaper, paper };

      if (useJson) {
        console.log(JSON.stringify(aggregated));
      } else {
        const renderBucket = (title: string, bucket: any) => {
          console.log(`${ansi.boldCyan}--- ${title} ---${ansi.reset}`);
          console.log(`Total Equity: $${ansi.boldGreen}${bucket.total_equity.toLocaleString()}${ansi.reset}`);
          console.log(`Total Cash: $${ansi.green}${bucket.total_usd.toLocaleString()}${ansi.reset}`);
          console.log(`${ansi.bold}Brokers:${ansi.reset}`);
          bucket.brokers.forEach((b: any) => {
            const statusColor = b.status === 'connected' ? ansi.green : ansi.red;
            console.log(`  - ${b.name}: ${statusColor}${b.status}${ansi.reset} ${b.error ? `(${b.error})` : ''}`);
          });
          console.log(`${ansi.bold}Active Positions (${bucket.positions.length}):${ansi.reset}`);
          bucket.positions.forEach((p: Position) => {
            const plColor = p.unrealizedPl >= 0 ? ansi.green : ansi.red;
            console.log(`  ${p.symbol.padEnd(6)} | Qty: ${p.quantity.toString().padEnd(6)} | Value: $${p.marketValue.toLocaleString().padEnd(10)} | PnL: ${plColor}$${p.unrealizedPl.toLocaleString()}${ansi.reset}`);
          });
        };

        renderBucket('LIVE  (real funds: Alpaca Live, Gate.io, Polymarket)', live);
        renderPolymarketSection(live.prediction_markets.polymarket);

        renderBucket('LIVE-PAPER  (broker-hosted simulation: Alpaca Paper)', livePaper);

        console.log(`${ansi.boldCyan}--- PAPER  (internal Polymarket dry-run ledger) ---${ansi.reset}`);
        console.log(`Virtual Balance: $${ansi.green}${paper.virtual_balance}${ansi.reset} (started at $${paper.starting_balance})`);
        console.log(`Open Positions: ${paper.open_positions} | Open Cost: $${paper.open_cost} | Equity (marked at cost): $${ansi.boldGreen}${paper.equity_marked_at_cost}${ansi.reset}`);
        paper.positions.forEach((p: any) => {
          console.log(`  ${String(p.question || p.market_id || '').slice(0, 56).padEnd(56)} | ${String(p.outcome || '').padEnd(4)} | shares ${Number(p.shares).toFixed(2).padStart(10)} @ ${p.avg_price}`);
        });
      }
    } catch (e: any) {
      if (useJson) {
        console.log(JSON.stringify({ ok: false, error: e.message }));
      } else {
        console.error(`[GATEWAY] Aggregation failed: ${e.message}`);
      }
    }
  } else if (command === 'polymarket') {
    const sub = (args[1] || 'portfolio').toLowerCase();
    if (sub === 'portfolio' || sub === 'balance') {
      const pm = await fetchPolymarketPortfolio();
      if (useJson) {
        console.log(JSON.stringify(pm));
      } else {
        renderPolymarketSection(pm);
      }
    } else if (sub === 'debug') {
      const debug = await fetchPolymarketDebug();
      if (useJson) {
        console.log(JSON.stringify(debug));
      } else {
        renderPolymarketDebugSection(debug);
      }
    } else if (sub === 'auth-health') {
      const health = await fetchPolymarketAuthHealth();
      if (useJson) {
        console.log(JSON.stringify(health));
      } else {
        renderPolymarketAuthHealthSection(health);
      }
    } else if (sub === 'modes') {
      const modes = await fetchPolymarketModes({ collateralOnly: args.includes('--collateral-only') || args.includes('--light') });
      if (useJson) {
        console.log(JSON.stringify(modes));
      } else {
        console.log(JSON.stringify(modes, null, 2));
      }
    } else if (sub === 'collateral-probe') {
      const subArgs = args.slice(2);
      const address = parseOptionValue(subArgs, '--address');
      const rawSignatureType = parseOptionValue(subArgs, '--signature-type');
      const parsedSignatureType = rawSignatureType !== undefined ? Number(rawSignatureType) : undefined;
      const probe = await fetchPolymarketCollateralProbe({
        funderAddress: address,
        signatureType: Number.isInteger(parsedSignatureType) ? parsedSignatureType : undefined,
      });
      if (useJson) {
        console.log(JSON.stringify(probe));
      } else {
        console.log(JSON.stringify(probe, null, 2));
      }
    } else if (sub === 'investigate') {
      const investigate = await fetchPolymarketInvestigate(args.slice(2));
      if (useJson) {
        console.log(JSON.stringify(investigate));
      } else {
        console.log(JSON.stringify(investigate, null, 2));
      }
    } else if (sub === 'probe') {
      const address = parseOptionValue(args.slice(2), '--address');
      const probe = address
        ? await fetchPolymarketProbe(address)
        : { ok: false, address: '', results: [], error: 'Missing --address <0x...>' };
      if (useJson) {
        console.log(JSON.stringify(probe));
      } else {
        console.log(JSON.stringify(probe, null, 2));
      }
    } else if (sub === 'topology') {
      const topology = await fetchPolymarketTopology();
      if (useJson) {
        console.log(JSON.stringify(topology));
      } else {
        console.log(JSON.stringify(topology, null, 2));
      }
    } else if (sub === 'trace') {
      const trace = fetchPolymarketTrace(args.slice(2));
      if (useJson) {
        console.log(JSON.stringify(trace));
      } else {
        console.log(JSON.stringify(trace, null, 2));
      }
    } else if (sub === 'derive-creds') {
      const pk = process.env.POLYMARKET_PRIVATE_KEY;
      if (!pk) {
        console.error(`${ansi.red}POLYMARKET_PRIVATE_KEY not set in .env${ansi.reset}`);
        process.exit(1);
      }
      const revealCreds = args.includes('--reveal');
      const maskValue = (val: string) => revealCreds ? val : (val ? `${String(val).slice(0, 4)}…` : '');
      try {
        const { Wallet } = await import('ethers');
        const signer = new Wallet(pk);
        const settings = resolvePolymarketClientSettings(process.env, { privateKey: pk });
        const client = await createClobClient({
          privateKey: pk,
          funderAddress: settings.funderAddress,
          signatureType: settings.signatureType,
          host: settings.host,
        });
        console.log(`${ansi.boldYellow}Deriving L2 API credentials from wallet ${signer.address}...${ansi.reset}`);
        const derivation = await derivePolymarketApiCreds(client as any);
        const normalizedCreds = derivation.creds;
        if (useJson) {
          console.log(JSON.stringify({
            key: normalizedCreds.key,
            secret: maskValue(normalizedCreds.secret),
            passphrase: maskValue(normalizedCreds.passphrase),
            source: derivation.source,
            createRequestErrors: derivation.createRequestErrors,
            deriveRequestErrors: derivation.deriveRequestErrors,
          }));
        } else {
          if (derivation.source === 'derived') {
            console.log(`${ansi.yellow}Create API key failed or returned no key; derived an existing API key instead.${ansi.reset}`);
          } else {
            console.log(`${ansi.green}Created a new API key successfully.${ansi.reset}`);
          }
          if (derivation.createRequestErrors.length > 0) {
            console.log(`${ansi.yellow}Create attempt diagnostics:${ansi.reset} ${JSON.stringify(derivation.createRequestErrors[0])}`);
          }
          console.log(`\n${ansi.boldCyan}Paste these into your .env:${ansi.reset}`);
          if (!revealCreds) {
            console.log(`${ansi.yellow}(secret and passphrase masked — pass --reveal to show in full)${ansi.reset}`);
          }
          console.log(`POLYMARKET_API_KEY=${normalizedCreds.key}`);
          console.log(`POLYMARKET_API_SECRET=${maskValue(normalizedCreds.secret)}`);
          console.log(`POLYMARKET_API_PASSPHRASE=${maskValue(normalizedCreds.passphrase)}`);
        }
      } catch (e: any) {
        console.error(`${ansi.red}derive-creds failed: ${e.message}${ansi.reset}`);
        process.exit(1);
      }
    } else if (sub === 'markets') {
      try {
        const limitArg = args.find((arg, index) => index > 1 && /^\d+$/.test(arg));
        const categoryIndex = args.indexOf('--category');
        const category = categoryIndex >= 0 && args[categoryIndex + 1] ? args[categoryIndex + 1] : 'crypto';
        const limit = Number(limitArg) || 25;
        const result = await fetchPolymarketGammaMarkets(limit, { category });
        if (useJson) {
          console.log(JSON.stringify({ ok: true, source: result.source, category, count: result.count, sections: result.sections, data: result.data }));
        } else {
          const title = category === 'all' ? 'Active Markets' : `Active ${category.toUpperCase()} Markets`;
          console.log(`${ansi.boldCyan}${title} (${result.count}):${ansi.reset}`);
          if (result.data.length === 0) {
            console.log(`  ${ansi.yellow}No active ${category} markets returned from Gamma API.${ansi.reset}`);
          }
          result.sections.forEach((sectionGroup: any) => {
            console.log(`\n  ${ansi.boldYellow}${sectionGroup.section}${ansi.reset} ${ansi.yellow}(${sectionGroup.count})${ansi.reset}`);
            sectionGroup.data.forEach((m: any) => {
              const volume = m.volume ? `  vol: ${Number(m.volume).toLocaleString()}` : '';
              console.log(`    ${String(m.question || m.condition_id || '').slice(0, 72)}${ansi.yellow}${volume}${ansi.reset}`);
              (m.tokens ?? []).slice(0, 2).forEach((t: any) =>
                console.log(`      ${ansi.yellow}${String(t.outcome ?? '').padEnd(6)}${ansi.reset}  token: ${t.token_id}`)
              );
            });
          });
        }
      } catch (e: any) {
        if (useJson) {
          console.log(JSON.stringify({ ok: false, source: 'https://gamma-api.polymarket.com/markets', error: e.message }));
        } else {
          console.error(`${ansi.red}markets fetch failed: ${e.message}${ansi.reset}`);
        }
        process.exit(1);
      }
    } else if (sub === 'events') {
      try {
        const limitArg = args.find((arg: string, index: number) => index > 1 && /^\d+$/.test(arg));
        const categoryIndex = args.indexOf('--category');
        const category = categoryIndex >= 0 && args[categoryIndex + 1] ? args[categoryIndex + 1] : 'crypto';
        const limit = Number(limitArg) || 15;
        const result = await fetchPolymarketGammaEvents(limit, { category });
        console.log(JSON.stringify({ ok: true, source: result.source, category, count: result.count, data: result.data }));
      } catch (e: any) {
        if (useJson) {
          console.log(JSON.stringify({ ok: false, source: 'https://gamma-api.polymarket.com/events', error: e.message }));
        } else {
          console.error(`${ansi.red}events fetch failed: ${e.message}${ansi.reset}`);
        }
        process.exit(1);
      }
    } else if (sub === 'orderbook') {
      const tokenId = parseOptionValue(args.slice(2), '--token') || args[2];
      const book = await fetchPolymarketOrderBook(String(tokenId || ''));
      if (useJson) {
        console.log(JSON.stringify(book));
      } else if (!book.ok) {
        console.error(`${ansi.red}orderbook fetch failed: ${book.error}${ansi.reset}`);
        process.exit(1);
      } else {
        const bids = Array.isArray(book.book?.bids) ? book.book.bids : [];
        const asks = Array.isArray(book.book?.asks) ? book.book.asks : [];
        console.log(`${ansi.boldCyan}Polymarket Orderbook${ansi.reset} ${ansi.yellow}${book.tokenId}${ansi.reset}`);
        console.log(`  bids: ${bids.length}  asks: ${asks.length}`);
        console.log(`  top bids:`);
        bids.slice(0, 5).forEach((entry: any) => console.log(`    ${entry.price} x ${entry.size}`));
        console.log(`  top asks:`);
        asks.slice(0, 5).forEach((entry: any) => console.log(`    ${entry.price} x ${entry.size}`));
      }
    } else if (sub === 'price-history') {
      const tokenId = parseOptionValue(args.slice(2), '--token') || args[2];
      const interval = parseOptionValue(args.slice(2), '--interval') || '1h';
      const fidelityRaw = parseOptionValue(args.slice(2), '--fidelity');
      const fidelity = fidelityRaw ? Number(fidelityRaw) : undefined;
      const history = await fetchPolymarketPriceHistory(String(tokenId || ''), interval, fidelity);
      if (useJson) {
        console.log(JSON.stringify(history));
      } else if (!history.ok) {
        console.error(`${ansi.red}price-history fetch failed: ${history.error}${ansi.reset}`);
        process.exit(1);
      } else {
        const rows = Array.isArray(history.history) ? history.history : [];
        console.log(`${ansi.boldCyan}Polymarket Price History${ansi.reset} ${ansi.yellow}${history.tokenId}${ansi.reset} ${ansi.yellow}[${history.interval}]${ansi.reset}`);
        rows.slice(-10).forEach((row: any) => console.log(`  ${row.t ?? row.timestamp ?? ''}  p=${row.p ?? row.price ?? ''}`));
      }
    } else if (sub === 'paper-run') {
      const subArgs = args.slice(2);
      const strategy = parseOptionValue(subArgs, '--strategy') || 'low_prob_dip';
      const category = parseOptionValue(subArgs, '--category') || 'crypto';
      const limitRaw = parseOptionValue(subArgs, '--limit');
      const balanceRaw = parseOptionValue(subArgs, '--virtual-balance');
      const maxPositionRaw = parseOptionValue(subArgs, '--max-position-usd');
      const maxConcurrentRaw = parseOptionValue(subArgs, '--max-concurrent');
      const maxSpreadRaw = parseOptionValue(subArgs, '--max-spread');
      const maxEntryRaw = parseOptionValue(subArgs, '--max-entry-price');
      const minLiquidityRaw = parseOptionValue(subArgs, '--min-liquidity');
      const limit = Math.max(1, Number.parseInt(limitRaw || '25', 10) || 25);
      try {
        const markets = await fetchPolymarketGammaMarkets(limit, { category });
        const result = await runPolymarketPaperRun({
          strategy,
          markets: markets.data,
          virtualBalance: balanceRaw !== undefined ? Number(balanceRaw) : 100,
          maxPositionUsd: maxPositionRaw !== undefined ? Number(maxPositionRaw) : 1,
          maxConcurrent: maxConcurrentRaw !== undefined ? Number(maxConcurrentRaw) : 5,
          maxSpread: maxSpreadRaw !== undefined ? Number(maxSpreadRaw) : 0.08,
          maxEntryPrice: maxEntryRaw !== undefined ? Number(maxEntryRaw) : 0.15,
          minLiquidity: minLiquidityRaw !== undefined ? Number(minLiquidityRaw) : 0,
          fetchOrderBook: fetchPolymarketOrderBook,
        });
        const payload = { ...result, source: markets.source, category };
        if (useJson) {
          console.log(JSON.stringify(payload));
        } else {
          console.log(`${ansi.boldCyan}Polymarket Paper Run${ansi.reset} strategy=${strategy}`);
          console.log(`  scanned=${payload.markets_scanned} fills=${payload.fills.length} skipped=${payload.skipped.length}`);
          console.log(`  balance=$${payload.summary.virtual_balance} open=${payload.summary.open_positions} equity_at_cost=$${payload.summary.equity_marked_at_cost}`);
          payload.fills.slice(0, 5).forEach((fill: any) => console.log(`    buy ${fill.shares} ${fill.outcome} @ ${fill.price}  ${String(fill.market || '').slice(0, 72)}`));
        }
      } catch (e: any) {
        const diagnostic = classifyPolymarketGatewayError(e);
        const payload = {
          ok: false,
          command: 'polymarket paper-run',
          source: 'https://gamma-api.polymarket.com/markets',
          category,
          limit,
          ...diagnostic,
        };
        if (useJson) console.log(JSON.stringify(payload));
        else console.error(`${ansi.red}paper-run failed: ${diagnostic.error}${ansi.reset}`);
        process.exit(1);
      }
    } else if (sub === 'history') {
      const historySub = (args[2] || 'backfill').toLowerCase();
      if (historySub !== 'backfill' && historySub !== 'orderbook-lite') {
        console.error(`Unknown polymarket history subcommand: ${historySub}. Available: backfill, orderbook-lite`);
        process.exit(1);
      }

      const subArgs = args.slice(3);
      if (historySub === 'backfill') {
        const history = require('../../../shared/lib/market/polymarket_history.js');
        const toNumber = (value: string | undefined, fallback: number): number => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const archiveResult = await history.backfillPolymarketArchive({
          daysBack: toNumber(parseOptionValue(subArgs, '--days'), 180),
          interval: parseOptionValue(subArgs, '--interval') || parseOptionValue(subArgs, '--timeframe') || '1h',
          maxMarkets: toNumber(parseOptionValue(subArgs, '--max-markets'), 500),
          startOffset: toNumber(parseOptionValue(subArgs, '--start-offset') || parseOptionValue(subArgs, '--offset'), 0),
          category: parseOptionValue(subArgs, '--category') || 'all',
          root: parseOptionValue(subArgs, '--archive-root'),
          includeNo: subArgs.includes('--include-no'),
          noCache: subArgs.includes('--no-cache'),
        });
        if (useJson) {
          console.log(JSON.stringify(archiveResult));
        } else {
          console.log(`${ansi.boldCyan}Polymarket History Archive Ingest${ansi.reset}`);
          console.log(`  markets:    ${archiveResult.markets_archived ?? 0}`);
          console.log(`  tokens:     ${archiveResult.tokens_archived ?? 0}`);
          console.log(`  prices:     ${archiveResult.price_points ?? 0}`);
          console.log(`  features:   ${archiveResult.feature_rows ?? 0}`);
          console.log(`  missing:    ${archiveResult.missing_history ?? 0}`);
        }
      } else {
        const toNumber = (value: string | undefined, fallback: number): number => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const orderbookLiteResult = await runPolymarketOrderbookLiteBackfill({
          tagId: toNumber(parseOptionValue(subArgs, '--tag-id'), 21),
          daysBack: toNumber(parseOptionValue(subArgs, '--days'), 365),
          strategy: parseOptionValue(subArgs, '--strategy') || 'low_prob_dip',
          maxMarkets: toNumber(parseOptionValue(subArgs, '--max-markets'), 200),
          entryThreshold: toNumber(parseOptionValue(subArgs, '--entry-threshold'), 0.15),
          interval: parseOptionValue(subArgs, '--interval') || parseOptionValue(subArgs, '--timeframe') || '1d',
          archiveRoot: parseOptionValue(subArgs, '--archive-root'),
          fee: toNumber(parseOptionValue(subArgs, '--fee'), 0),
          halfSpreadEstimate: toNumber(parseOptionValue(subArgs, '--half-spread') || parseOptionValue(subArgs, '--half-spread-estimate'), 0.01),
          impactY: toNumber(parseOptionValue(subArgs, '--impact-y'), 1),
          orderNotional: toNumber(parseOptionValue(subArgs, '--order-notional'), 10),
          rollingMarketVolume: parseOptionValue(subArgs, '--rolling-market-volume') !== undefined
            ? Number(parseOptionValue(subArgs, '--rolling-market-volume'))
            : undefined,
          captureThrottleMs: toNumber(parseOptionValue(subArgs, '--capture-throttle-ms') || parseOptionValue(subArgs, '--throttle-ms'), 250),
          pmxtApiKey: parseOptionValue(subArgs, '--pmxt-api-key') || process.env.PMXT_API_KEY || '',
          pmxtBaseUrl: parseOptionValue(subArgs, '--pmxt-base-url') || process.env.PMXT_BASE_URL || 'https://api.pmxt.dev',
          fromArchive: !subArgs.includes('--live-fetch') && !subArgs.includes('--no-archive'),
          repairMissing: subArgs.includes('--repair-missing'),
          noCache: subArgs.includes('--no-cache'),
        });
        if (useJson) {
          console.log(JSON.stringify(orderbookLiteResult));
        } else {
          console.log(`${ansi.boldCyan}Polymarket History Orderbook Lite${ansi.reset}`);
          console.log(`  downloaded: ${orderbookLiteResult.downloadedSnapshots ?? 0}`);
          console.log(`  failures:   ${orderbookLiteResult.failedSnapshots ?? 0}`);
        }
      }
    } else if (sub === 'buy' || sub === 'sell') {
      const tokenId = args[2];
      const quantity = Number(args[3]);
      const price = args[4] !== undefined ? Number(args[4]) : undefined;
      const tickSizeOverride = parseOptionValue(args.slice(2), '--tick-size');
      const preflightOnly = args.includes('--preflight');
      const placed = preflightOnly
        ? await preflightPolymarketOrder(String(tokenId || ''), quantity, price, tickSizeOverride, sub)
        : await submitPolymarketOrder(String(tokenId || ''), quantity, price, tickSizeOverride, sub);
      if (useJson) {
        console.log(JSON.stringify(placed));
      } else if (!placed.ok) {
        console.error(`${ansi.red}${preflightOnly ? `${sub} preflight failed` : `${sub} failed`}: ${placed.error}${ansi.reset}`);
        if (placed.signerAddress || placed.funderAddress || placed.signatureType !== undefined) {
          console.error(`  signer=${placed.signerAddress ?? 'none'} funder=${placed.funderAddress ?? 'none'} sigType=${placed.signatureType ?? 'unset'}`);
        }
        if (placed.suggestion) {
          console.error(`  suggestion=${placed.suggestion}`);
        }
        process.exit(1);
      } else if (preflightOnly) {
        console.log(`${ansi.green}Order preflight passed.${ansi.reset} token=${placed.tokenId} qty=${placed.quantity} price=${placed.price ?? 'market_ref'}`);
        console.log(`  signer=${placed.preflight?.signerAddress ?? 'none'} funder=${placed.preflight?.funderAddress ?? 'none'} sigType=${placed.preflight?.signatureType ?? 'unset'} tickSize=${placed.preflight?.tickSize ?? 'n/a'} signed=${placed.preflight?.signed ? 'yes' : 'no'}`);
      } else {
        console.log(`${ansi.green}${sub === 'sell' ? 'Sell order' : 'Order'} submitted.${ansi.reset} token=${placed.tokenId} qty=${placed.quantity} price=${placed.price ?? 'market_ref'}`);
        console.log(`  orderId=${placed.result?.orderId} status=${placed.result?.status}`);
      }
    } else {
      console.error(`Unknown polymarket subcommand: ${sub}. Available: portfolio, balance, debug, auth-health, modes, investigate, probe, topology, trace, derive-creds, markets, orderbook, price-history, paper-run, buy, sell`);
      process.exit(1);
    }
  } else if (command === 'bot') {
    const sub = (args[1] || 'status').toLowerCase();

    if (sub === 'cycle') {
      const result = await runCycle(args.slice(1));
      if (useJson) {
        console.log(JSON.stringify(result));
      } else {
        const ok = result.errors.length === 0;
        const icon = ok ? `${ansi.green}✔${ansi.reset}` : `${ansi.yellow}⚠${ansi.reset}`;
        console.log(`\n${ansi.boldCyan}--- BOT CYCLE COMPLETE ---${ansi.reset}`);
        console.log(`  ${icon} Sold: ${result.sellsExecuted}  Bought: ${result.buysFilled}  Errors: ${result.errors.length}  DryRun: ${result.dryRun}`);
        if (result.errors.length) result.errors.forEach((e: string) => console.warn(`  ${ansi.yellow}⚠ ${e}${ansi.reset}`));
        const skipped = (result as any).skipped as string[];
        const wouldBuy = (result as any).wouldBuy as any[];
        if (skipped?.length) {
          console.log(`\n  ${ansi.yellow}Skipped:${ansi.reset}`);
          skipped.forEach((s: string) => console.log(`    · ${s}`));
        }
        if (wouldBuy?.length) {
          console.log(`\n  ${ansi.boldCyan}${result.dryRun ? 'Would buy' : 'Bought'} (${wouldBuy.length}):${ansi.reset}`);
          wouldBuy.forEach((b: any) => console.log(`    ${ansi.green}${b.side.padEnd(4)}${ansi.reset} ${b.slug}  price: ${b.price}  edge: ${b.edge}%  ai: ${b.aiProb}%  target: ${b.target}`));
        } else if (!result.errors.length && !skipped?.length) {
          console.log(`  ${ansi.yellow}No candidates met the edge threshold (${ansi.reset}run bot health to diagnose${ansi.yellow})${ansi.reset}`);
        }
      }

    } else if (sub === 'status') {
      const state = loadBotState();
      if (useJson) {
        console.log(JSON.stringify({ ok: true, ...state }));
      } else {
        console.log(`\n${ansi.boldCyan}--- BOT STATUS ---${ansi.reset}`);
        console.log(`  Enabled:   ${state.config.enabled ? ansi.green + 'yes' : ansi.red + 'no'}${ansi.reset}   Live: ${state.config.liveTrading ? ansi.yellow + 'YES' : 'no'}${ansi.reset}`);
        console.log(`  Positions: ${state.positions.length}/${state.config.maxPositions}   Last cycle: ${state.lastCycleAt ?? 'never'}`);
        console.log(`  Min edge:  ${(state.config.minEdgeThreshold * 100).toFixed(0)}%   Bet size: $${state.config.positionSizeUsdc}   Stop-loss: ${(state.config.stopLossPct * 100).toFixed(0)}%`);
      }

    } else if (sub === 'health') {
      const health = await runBotHealth();
      if (useJson) {
        console.log(JSON.stringify(health));
      } else {
        console.log(`\n${ansi.boldCyan}--- BOT HEALTH ---${ansi.reset}`);
        for (const c of health.checks) {
          const icon = c.ok ? `${ansi.green}✔${ansi.reset}` : `${ansi.red}✖${ansi.reset}`;
          let detail = c.detail;
          // pUSD balance is stored in micro-units (1e6 = $1); convert to display dollars
          if (c.label === 'pUSD balance' && typeof detail === 'string') {
            const match = detail.match(/^([\d.]+)\s+pUSD(.*)/);
            if (match) {
              const displayAmount = (Number(match[1]) / 1e6).toFixed(2);
              detail = `${displayAmount} pUSD${match[2]}`;
            }
          }
          console.log(`  ${icon}  ${c.label.padEnd(42)} ${c.ok ? ansi.green : ansi.yellow}${detail}${ansi.reset}`);
        }
        console.log();
        if (health.ok) {
          console.log(`  ${ansi.boldGreen}All checks passed — ready to trade.${ansi.reset}`);
        } else {
          console.log(`  ${ansi.yellow}Some checks failed. Fix the issues above, then run again.${ansi.reset}`);
        }
      }

    } else if (sub === 'run') {
      await runBotLoop(args.slice(1));

    } else if (sub === 'sell') {
      const idx = args.indexOf('--position-id');
      const posId = idx !== -1 ? args[idx + 1] : '';
      if (!posId) {
        console.error(`${ansi.red}--position-id required${ansi.reset}`);
        process.exit(1);
      }
      const result = await runForceSell(posId, args.slice(1));
      if (useJson) {
        console.log(JSON.stringify(result));
      } else {
        if (result.ok) console.log(`${ansi.green}Force-sold position ${posId}. PnL: ${result.pnl?.toFixed(4) ?? 'n/a'}${ansi.reset}`);
        else console.error(`${ansi.red}Force-sell failed: ${result.error}${ansi.reset}`);
      }

    } else if (sub === 'config') {
      const kIdx = args.indexOf('--key');
      const vIdx = args.indexOf('--value');
      const key   = kIdx !== -1 ? args[kIdx + 1] : '';
      const value = vIdx !== -1 ? args[vIdx + 1] : '';
      const state = loadBotState();
      if (key && value !== '') {
        try {
          (state.config as any)[key] = JSON.parse(value);
          saveBotState(state);
          console.log(useJson ? JSON.stringify({ ok: true, config: state.config }) : `${ansi.green}Config updated: ${key} = ${value}${ansi.reset}`);
        } catch {
          console.error(`${ansi.red}Invalid value for ${key}${ansi.reset}`);
        }
      } else {
        console.log(useJson ? JSON.stringify({ ok: true, config: state.config }) : JSON.stringify(state.config, null, 2));
      }

    } else {
      console.error(`Unknown bot subcommand: ${sub}. Available: cycle, status, health, run, sell, config`);
      process.exit(1);
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
