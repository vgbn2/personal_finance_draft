import { BrokerAdapter, Position, TradeOrder } from './types';
import {
  submitPolymarketOrder,
  preflightPolymarketOrder,
} from '../polymarket_execution';
import {
  fetchPolymarketPortfolio,
  fetchPolymarketOrderBook,
  PolymarketTradePagination,
} from '../polymarket_account_adapter';

// @ts-ignore
const { resolvePolymarketClientSettings } = require('../../../shared/lib/brokers/polymarket_env');
// @ts-ignore
const { polymarketGet, createClobClient } = require('../../../shared/lib/brokers/polymarket_clob');
// @ts-ignore
const { resolveOwnerAddress } = require('../../../shared/lib/brokers/polymarket_env');

export interface PolymarketAdapterOptions {
  host?: string;
  privateKey?: string;
  creds?: { key: string; secret: string; passphrase: string };
  funderAddress?: string;
  signatureType?: number;
}

export class PolymarketAdapter implements BrokerAdapter {
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
    this.funderAddress = settings.funderAddress;
    this.signatureType = settings.signatureType;
  }

  hasCredentials(): boolean {
    return Boolean(this.privateKey && this.creds);
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

  async placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }> {
    const res = await submitPolymarketOrder(
      order.instrumentId,
      order.quantity,
      order.price,
      order.tickSizeOverride,
      order.side
    );
    return { orderId: res.orderId, status: res.status };
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

  async getPositions(): Promise<Position[]> {
    const section = await fetchPolymarketPortfolio();
    if (!section.ok || !section.positions) return [];
    return section.positions.map((p: any) => ({
      symbol: p.symbol || p.asset_id || p.slug || 'POLYMARKET',
      quantity: p.quantity || p.size || p.shares || 0,
      averagePrice: p.averagePrice || p.price || 0,
      marketValue: p.marketValue || p.current_value || 0,
      unrealizedPl: p.unrealizedPl || p.realized_pnl || 0,
      asset_id: p.assetId || p.asset_id,
      side: p.outcome || p.side,
      lifecycle: p.lifecycle,
    }));
  }

  async getQuote(symbol: string): Promise<number> {
    const book = await fetchPolymarketOrderBook(symbol);
    if (!book.ok || !book.book) return 0;
    const ask = book.book.asks?.[0]?.price;
    const bid = book.book.bids?.[0]?.price;
    return Number(ask || bid || 0);
  }
}
