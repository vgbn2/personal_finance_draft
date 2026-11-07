import { createClobClient, polymarketGet, resolveOwnerAddress } from './clob_factory';
import { type BotExecutionOptions, type BotOrderIntent } from './cycle';
import {
  classifyPolymarketGatewayError,
  validateProposedOrdersPayload,
} from './polymarket/index.js';
import { fetchPolymarketOrderBook as fetchOrderBook } from './polymarket_account_adapter.js';
// @ts-ignore
const { resolvePolymarketClientSettings } = require('../../../shared/lib/brokers/polymarket_env.js');
// @ts-ignore
const { PersistenceBridge } = require('../../../shared/lib/runtime/persistence_bridge');
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

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
  strategyId?: string;
  clientOrderId?: string;
  timeframe?: string;
  confidence?: number;
  source?: 'bot' | 'manual';
  submittedAt?: string;
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

import {
  PolymarketAdapter,
  type PolymarketAdapterOptions,
  type PreparedPolymarketOrder,
  VALID_POLYMARKET_TICK_SIZES,
  buildPolymarketOrderError,
} from './adapters/polymarket_adapter';

export {
  PolymarketAdapter,
  type PolymarketAdapterOptions,
  type PreparedPolymarketOrder,
  VALID_POLYMARKET_TICK_SIZES,
  buildPolymarketOrderError,
};
export { type BrokerAdapter } from './adapters/types';

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
