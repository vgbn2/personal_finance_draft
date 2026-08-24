import { createClobClient, polymarketGet } from './clob_factory';
import { type BotExecutionOptions, type BotOrderIntent } from './cycle';
// @ts-ignore
const { validateProposedOrdersPayload } = require('./proposed_orders.js');
// @ts-ignore
const { classifyPolymarketGatewayError } = require('./polymarket_errors.js');
// @ts-ignore
const { resolvePolymarketClientSettings } = require('../../../shared/lib/brokers/polymarket_env.js');
// @ts-ignore
const { PersistenceBridge } = require('../../../shared/lib/runtime/persistence_bridge');
// @ts-ignore
const { fetchPolymarketOrderBook } = require('./polymarket_markets.js');
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export enum OrderSide {
  BUY = 'buy',
  SELL = 'sell'
}

export enum OrderStatus {
  PROPOSED = 'proposed',
  RISK_REJECTED = 'risk_rejected',
  SUBMITTED = 'submitted',
  FILLED = 'filled',
  FAILED = 'failed'
}

export interface TradeOrder {
  instrumentId: string;
  side: OrderSide;
  quantity: number;
  price?: number;
  tickSizeOverride?: string;
  type: 'market' | 'limit';
  status: OrderStatus;
  timestamp: Date;
  error?: string;
  strategy?: string;
  providerPaper?: boolean;
}

export interface Position {
  symbol: string;
  assetId?: string;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  unrealizedPl: number;
  cost_basis_unavailable?: boolean;
  question?: string;
  outcome?: string;
  lifecycle?: 'active' | 'ended' | 'unknown';
  currentPrice?: number | null;
  valuationStatus?: 'live_quote' | 'unavailable';
  resolutionPrice?: number | null;
  historyStatus?: 'complete' | 'trade_history_truncated';
}

export interface BrokerAdapter {
  placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }>;
  cancelOrder(orderId: string): Promise<boolean>;
  getPortfolioBalance(): Promise<Record<string, number>>;
  getPositions(): Promise<Position[]>;
  getQuote(symbol: string): Promise<number>;
}

export interface PolymarketAdapterOptions {
  host?: string;
  privateKey?: string;
  creds?: { key: string; secret: string; passphrase: string };
  funderAddress?: string;
  signatureType?: number;
}

export interface PreparedPolymarketOrder {
  client: any;
  tickSize: string;
  signedOrder: any;
  accountIdentity: { funderAddress?: string; signatureType?: number };
}

const VALID_POLYMARKET_TICK_SIZES = new Set(['0.1', '0.01', '0.001', '0.0001']);

function buildPolymarketOrderError(stage: string, error: any): Error {
  const code = error?.code || error?.status || error?.response?.status;
  const detail = error?.response?.data ? JSON.stringify(error.response.data) : (error?.message ?? String(error));
  const err = new Error(`Polymarket ${stage} failed${code ? ` [code ${code}]` : ''}: ${detail}`);
  (err as any).cause = error;
  return err;
}

export class PolymarketAdapter implements BrokerAdapter {
  private readonly host: string;
  private readonly privateKey: string | undefined;
  private readonly creds: { key: string; secret: string; passphrase: string } | null;
  private readonly funderAddress: string | undefined;
  private readonly signatureType: number | undefined;
  private lastTradePagination: any;

  constructor(options: PolymarketAdapterOptions = {}) {
    const settings = resolvePolymarketClientSettings(process.env, options);
    this.host = settings.host;
    this.privateKey = settings.privateKey;
    this.creds = settings.creds;
    this.funderAddress = settings.funderAddress;
    this.signatureType = settings.signatureType;
  }

  private hasCredentials(): boolean {
    return Boolean(this.privateKey && this.creds);
  }

  getTradePagination(): any {
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

    return {
      pUSD,
      USD: pUSD,
      EQUITY: pUSD,
      COLLATERAL_ALLOWANCE: collateral.allowance / 1_000_000,
    };
  }

  async getPositions(): Promise<Position[]> {
    return [];
  }

  async getQuote(symbol: string): Promise<number> {
    const book = await fetchPolymarketOrderBook(symbol);
    const bids = Array.isArray(book?.book?.bids) ? book.book.bids : [];
    const asks = Array.isArray(book?.book?.asks) ? book.book.asks : [];

    let bestBid = 0;
    let bestAsk = 0;
    if (bids.length > 0) {
      const parsed = Number(bids[0]?.price);
      if (Number.isFinite(parsed) && parsed > 0) bestBid = parsed;
    }
    if (asks.length > 0) {
      const parsed = Number(asks[0]?.price);
      if (Number.isFinite(parsed) && parsed > 0) bestAsk = parsed;
    }

    if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
    if (bestAsk > 0) return bestAsk;
    if (bestBid > 0) return bestBid;
    return 0.5;
  }
}

/**
 * Shared core for submitPolymarketOrder and preflightPolymarketOrder.
 */
async function _polymarketOrderCore(
  tokenId: string,
  quantity: number,
  price: number | undefined,
  tickSizeOverride: string | undefined,
  side: 'buy' | 'sell',
  options: { preflightOnly: boolean },
  executionGatewayFactory?: (adapter: PolymarketAdapter) => any,
): Promise<any> {
  if (!tokenId) return { ok: false, error: 'Missing token id' };
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: 'Quantity must be a positive number' };
  if (!options.preflightOnly && (!Number.isFinite(price) || Number(price) <= 0 || Number(price) >= 1)) {
    return { ok: false, error: 'Live Polymarket orders require an explicit price between 0 and 1' };
  }

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
      if (executionGatewayFactory) {
        const gateway = executionGatewayFactory(adapter);
        if (!(await gateway.validateOrder(orderInput))) {
          return { ...errorBase, error: 'Order rejected by pre-trade risk controls' };
        }
      }
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

export async function submitPolymarketOrder(
  tokenId: string,
  quantity: number,
  price?: number,
  tickSizeOverride?: string,
  side: 'buy' | 'sell' = 'buy',
  executionGatewayFactory?: (adapter: PolymarketAdapter) => any,
): Promise<any> {
  return _polymarketOrderCore(tokenId, quantity, price, tickSizeOverride, side, { preflightOnly: false }, executionGatewayFactory);
}

export async function preflightPolymarketOrder(
  tokenId: string,
  quantity: number,
  price?: number,
  tickSizeOverride?: string,
  side: 'buy' | 'sell' = 'buy',
): Promise<any> {
  return _polymarketOrderCore(tokenId, quantity, price, tickSizeOverride, side, { preflightOnly: true });
}

export function buildPolymarketBotExecutionOptions(executionGatewayFactory: (adapter: PolymarketAdapter) => any): BotExecutionOptions {
  const adapter = new PolymarketAdapter();
  const gateway = executionGatewayFactory(adapter);

  return {
    authorizeOrder: async (intent: BotOrderIntent) => {
      if (!Number.isFinite(intent.price) || intent.price <= 0 || intent.price >= 1) {
        return { approved: false, reason: 'Prediction-market prices must be between 0 and 1' };
      }
      if (!Number.isFinite(intent.quantity) || intent.quantity <= 0) {
        return { approved: false, reason: 'Bot order quantity must be positive' };
      }

      const order: TradeOrder = {
        instrumentId: intent.instrumentId,
        side: intent.side === 'SELL' ? OrderSide.SELL : OrderSide.BUY,
        quantity: intent.quantity,
        price: intent.price,
        type: 'limit',
        status: OrderStatus.PROPOSED,
        timestamp: new Date(),
      };
      const approved = await gateway.validateOrder(order);
      return {
        approved,
        reason: approved ? undefined : 'Order rejected by pre-trade risk controls',
      };
    },
  };
}

export async function processProposedOrdersFile(filePath: string, gateway: any): Promise<void> {
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
      await gateway.execute(order);
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
