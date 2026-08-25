import { BrokerAdapter, Position, TradeOrder } from './types';

// @ts-ignore
const { resolveGateIoSettings } = require('../../../../shared/lib/brokers/gateio_env');
// @ts-ignore
const { fetchWithRetry } = require('../../../../shared/lib/runtime/fetch_retry');
// @ts-ignore
const { signGateIoRequest } = require('../../../../shared/lib/brokers/gateio_sign');

export interface GateIoAdapterOptions {
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  simulateIfMissingCredentials?: boolean;
}

function toJsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class GateIoAdapter implements BrokerAdapter {
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
