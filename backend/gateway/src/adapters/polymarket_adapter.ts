import { BrokerAdapter, Position, TradeOrder } from './types';
import {
  fetchPolymarketOrderBook,
  PolymarketTradePagination,
} from '../polymarket_account_adapter';
import { createClobClient, polymarketGet, resolveOwnerAddress } from '../clob_factory';
import { aggregatePolymarketFilledPositions } from '../polymarket/positions';

const { resolvePolymarketClientSettings } = require('../../../../shared/lib/brokers/polymarket_env');

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export interface PolymarketAdapterOptions {
  host?: string;
  privateKey?: string;
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
  passphrase?: string;
  creds?: { key: string; secret: string; passphrase: string };
  funderAddress?: string;
  signatureType?: number;
  simulateIfMissingCredentials?: boolean;
}

export interface PreparedPolymarketOrder {
  client: any;
  tickSize: string;
  signedOrder: any;
  accountIdentity: { funderAddress?: string; signatureType?: number };
}

export const VALID_POLYMARKET_TICK_SIZES = new Set(['0.1', '0.01', '0.001', '0.0001']);

export function buildPolymarketOrderError(stage: string, error: any): Error {
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
  private readonly simulateIfMissingCredentials: boolean;
  private lastTradePagination: PolymarketTradePagination | undefined;

  constructor(options: PolymarketAdapterOptions = {}) {
    const settings = resolvePolymarketClientSettings(process.env, options);
    this.host = settings.host;
    this.privateKey = settings.privateKey;
    this.creds = settings.creds;
    this.funderAddress = settings.funderAddress;
    this.signatureType = settings.signatureType;
    this.simulateIfMissingCredentials = options.simulateIfMissingCredentials ?? false;
  }

  hasCredentials(): boolean {
    return Boolean(this.privateKey && this.creds);
  }

  isConfigured(): boolean {
    return this.hasCredentials();
  }

  async getSignerAddress(): Promise<string | null> {
    if (!this.privateKey) return null;
    try {
      const { Wallet } = await import('ethers');
      return new Wallet(this.privateKey).address;
    } catch {
      return null;
    }
  }

  getTradePagination(): PolymarketTradePagination | undefined {
    return this.lastTradePagination;
  }

  getAccountIdentity(): { funderAddress?: string; signatureType?: number } {
    return { funderAddress: this.funderAddress, signatureType: this.signatureType };
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

  async prepareOrder(order: TradeOrder): Promise<PreparedPolymarketOrder> {
    if (!this.hasCredentials()) throw new Error('Polymarket credentials not configured');
    const client = await createClobClient({
      withCreds: true,
      host: this.host,
      privateKey: this.privateKey,
      creds: this.creds,
      funderAddress: this.funderAddress,
      signatureType: this.signatureType,
    });

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
        const publicBook = await fetchPolymarketOrderBook(order.instrumentId as any);
        const fallbackTickSize = String((publicBook as any)?.book?.tick_size ?? '');
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
        side: order.side === 'buy' ? Side.BUY : Side.SELL,
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

  async placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }> {
    const { client, signedOrder } = await this.prepareOrder(order);
    try {
      const resp = await client.postOrder(signedOrder);
      const orderId = resp?.orderID || resp?.id || 'SUBMITTED';
      const status = resp?.status || 'SUBMITTED';
      return { orderId, status };
    } catch (error: any) {
      throw buildPolymarketOrderError('order placement', error);
    }
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
    if (!this.hasCredentials()) {
      if (!this.simulateIfMissingCredentials) {
        throw new Error('Polymarket credentials not configured');
      }
      return [];
    }
    try {
      const owner = await resolveOwnerAddress(this.privateKey as string, this.funderAddress);
      const raw = await polymarketGet('/data/trades', { maker_address: owner }, {
        privateKey: this.privateKey,
        creds: this.creds ?? undefined,
        funderAddress: this.funderAddress,
        host: this.host,
      }) ?? [];
      const trades: any[] = Array.isArray(raw) ? raw : raw?.data ?? [];
      const filled = aggregatePolymarketFilledPositions(trades);
      return filled.map((p) => ({
        symbol: p.symbol || p.assetId || 'POLYMARKET',
        quantity: p.quantity,
        averagePrice: p.averagePrice,
        marketValue: p.marketValue,
        unrealizedPl: p.unrealizedPl,
        asset_id: p.assetId,
        side: (p.outcome || 'buy') as any,
        lifecycle: p.lifecycle,
      }));
    } catch {
      return [];
    }
  }

  async getQuote(symbol: string): Promise<number> {
    const book = await fetchPolymarketOrderBook(symbol);
    if (!book.ok || !book.book) return 0;
    const ask = book.book.asks?.[0]?.price;
    const bid = book.book.bids?.[0]?.price;
    return Number(ask || bid || 0);
  }
}
