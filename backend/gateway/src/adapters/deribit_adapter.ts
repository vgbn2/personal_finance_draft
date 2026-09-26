import { BrokerAdapter, Position, TradeOrder } from './types';

const { resolveDeribitSettings } = require('../../../../shared/lib/brokers/deribit_env');
const { fetchWithRetry } = require('../../../../shared/lib/runtime/fetch_retry');

export interface DeribitAdapterOptions {
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  testnet?: boolean;
  simulateIfMissingCredentials?: boolean;
  currencies?: string[];
}

export interface DeribitAccountSummary {
  currency: string;
  equity: number;
  balance: number;
  marginBalance: number;
  initialMargin: number;
  maintenanceMargin: number;
  optionsDelta: number;
  optionsGamma: number;
  optionsVega: number;
  optionsTheta: number;
  optionsSessionRpl: number;
  optionsSessionUpl: number;
}

export class DeribitAdapter implements BrokerAdapter {
  private readonly baseUrl: string;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly testnet: boolean;
  private readonly simulateIfMissingCredentials: boolean;
  private readonly currencies: string[];

  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private authError: Error | null = null;

  constructor(options: DeribitAdapterOptions = {}) {
    const settings = resolveDeribitSettings(process.env, options);
    this.baseUrl = settings.baseUrl;
    this.clientId = settings.clientId;
    this.clientSecret = settings.clientSecret;
    this.testnet = settings.testnet;
    this.simulateIfMissingCredentials = options.simulateIfMissingCredentials ?? false;
    this.currencies = options.currencies && options.currencies.length > 0
      ? options.currencies.map(c => c.toUpperCase())
      : ['BTC', 'ETH', 'SOL'];
  }

  public hasCredentials(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  public isTestnet(): boolean {
    return this.testnet;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    if (this.authError) {
      throw this.authError;
    }

    if (!this.hasCredentials()) {
      throw new Error('Deribit credentials (client_id / client_secret) are not configured');
    }

    const authUrl = `${this.baseUrl}/api/v2/public/auth?grant_type=client_credentials&client_id=${encodeURIComponent(
      this.clientId!
    )}&client_secret=${encodeURIComponent(this.clientSecret!)}`;

    try {
      const response = await fetchWithRetry(authUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }, { attempts: 1 });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `Deribit auth failed (${response.status})`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.error?.message) {
            errMsg = `Deribit auth failed: ${parsed.error.message}`;
          }
        } catch (_) {}
        const err = new Error(errMsg);
        this.authError = err;
        throw err;
      }

      const json = (await response.json()) as any;
      if (json.error) {
        const err = new Error(`Deribit auth RPC error: ${json.error.message || 'unknown'}`);
        this.authError = err;
        throw err;
      }

      const result = json.result || {};
      this.accessToken = result.access_token;
      // Expire 60 seconds before actual TTL to avoid edge-of-window rejects
      const expiresIn = Number(result.expires_in || 900);
      this.tokenExpiresAt = Date.now() + Math.max(30, expiresIn - 60) * 1000;

      return this.accessToken!;
    } catch (err: any) {
      this.authError = err;
      throw err;
    }
  }

  private async requestJson(
    endpoint: string,
    params: Record<string, any> = {},
    isPrivate = true
  ): Promise<any> {
    const queryEntries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
    const queryString = queryEntries.length > 0
      ? '?' + queryEntries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
      : '';

    const url = `${this.baseUrl}${endpoint}${queryString}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (isPrivate) {
      if (!this.hasCredentials()) {
        if (this.simulateIfMissingCredentials) {
          return null;
        }
        throw new Error('Deribit credentials are not configured');
      }
      const token = await this.authenticate();
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Deribit request failed (${response.status}) on ${endpoint}: ${errText}`);
    }

    const json = (await response.json()) as any;
    if (json.error) {
      throw new Error(`Deribit RPC error on ${endpoint}: ${json.error.message || JSON.stringify(json.error)}`);
    }

    return json.result;
  }

  async placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }> {
    console.log(`[DERIBIT] Placing ${order.side.toUpperCase()} ${order.type} order for ${order.instrumentId}`);
    console.log(`[DERIBIT] Quantity: ${order.quantity}${order.price ? `, Price: ${order.price}` : ''}`);

    if (!this.hasCredentials()) {
      if (!this.simulateIfMissingCredentials) {
        throw new Error('Deribit credentials are not configured');
      }
      return {
        orderId: `deribit-sim-${Math.random().toString(36).substring(2, 11)}`,
        status: 'open',
      };
    }

    const endpoint = order.side === 'buy' ? '/api/v2/private/buy' : '/api/v2/private/sell';
    const params: Record<string, any> = {
      instrument_name: order.instrumentId,
      amount: order.quantity,
      type: order.type || 'limit',
      label: order.clientOrderId || order.strategyId || 'sovereign',
    };

    if (typeof order.price === 'number' && Number.isFinite(order.price) && order.price > 0) {
      params.price = order.price;
    }

    const result = await this.requestJson(endpoint, params, true);
    const orderData = result?.order || result || {};
    return {
      orderId: String(orderData.order_id || orderData.orderId || `deribit-${Date.now()}`),
      status: String(orderData.order_state || orderData.status || 'submitted'),
    };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    console.log(`[DERIBIT] Canceling order ${orderId}`);
    if (!this.hasCredentials()) {
      return this.simulateIfMissingCredentials;
    }
    try {
      await this.requestJson('/api/v2/private/cancel', { order_id: orderId }, true);
      return true;
    } catch {
      return false;
    }
  }

  async modifyOrder(
    orderId: string,
    modification: { sl?: number; tp?: number; price?: number }
  ): Promise<boolean> {
    if (!this.hasCredentials()) {
      return this.simulateIfMissingCredentials;
    }
    if (typeof modification.price !== 'number') return false;
    try {
      await this.requestJson('/api/v2/private/edit', { order_id: orderId, price: modification.price }, true);
      return true;
    } catch {
      return false;
    }
  }

  async getAccountSummary(currency = 'BTC'): Promise<DeribitAccountSummary> {
    const res = await this.requestJson('/api/v2/private/get_account_summary', {
      currency: currency.toUpperCase(),
      extended: true,
    }, true);

    if (!res) {
      return {
        currency: currency.toUpperCase(),
        equity: 0,
        balance: 0,
        marginBalance: 0,
        initialMargin: 0,
        maintenanceMargin: 0,
        optionsDelta: 0,
        optionsGamma: 0,
        optionsVega: 0,
        optionsTheta: 0,
        optionsSessionRpl: 0,
        optionsSessionUpl: 0,
      };
    }

    return {
      currency: String(res.currency || currency).toUpperCase(),
      equity: Number(res.equity ?? res.balance ?? 0),
      balance: Number(res.balance ?? 0),
      marginBalance: Number(res.margin_balance ?? res.equity ?? 0),
      initialMargin: Number(res.initial_margin ?? 0),
      maintenanceMargin: Number(res.maintenance_margin ?? 0),
      optionsDelta: Number(res.options_delta ?? 0),
      optionsGamma: Number(res.options_gamma ?? 0),
      optionsVega: Number(res.options_vega ?? 0),
      optionsTheta: Number(res.options_theta ?? 0),
      optionsSessionRpl: Number(res.options_session_rpl ?? 0),
      optionsSessionUpl: Number(res.options_session_upl ?? 0),
    };
  }

  async getPortfolioBalance(): Promise<Record<string, number>> {
    console.log(`[DERIBIT] Fetching options account balances (${this.testnet ? 'Testnet' : 'Live'})`);
    if (!this.hasCredentials()) {
      if (!this.simulateIfMissingCredentials) {
        throw new Error('Deribit credentials are not configured');
      }
      return { BTC: 0, ETH: 0, SOL: 0 };
    }

    await this.authenticate();

    const balances: Record<string, number> = {};
    for (const curr of this.currencies) {
      try {
        const summary = await this.getAccountSummary(curr);
        balances[curr] = summary.equity;
      } catch {
        balances[curr] = 0;
      }
    }
    return balances;
  }

  async getPositions(): Promise<Position[]> {
    console.log(`[DERIBIT] Fetching open options positions`);
    if (!this.hasCredentials()) {
      if (!this.simulateIfMissingCredentials) {
        throw new Error('Deribit credentials are not configured');
      }
      return [];
    }

    await this.authenticate();

    const positions: Position[] = [];
    for (const curr of this.currencies) {
      try {
        const res = await this.requestJson('/api/v2/private/get_positions', {
          currency: curr,
          kind: 'option',
        }, true);

        if (Array.isArray(res)) {
          for (const p of res) {
            const size = Number(p.size ?? p.amount ?? 0);
            if (size === 0) continue;
            const avgPrice = Number(p.average_price ?? 0);
            const markPrice = Number(p.mark_price ?? avgPrice);
            const upl = Number(p.floating_profit_loss_usd ?? p.floating_profit_loss ?? 0);
            positions.push({
              symbol: String(p.instrument_name),
              quantity: size,
              averagePrice: avgPrice,
              marketValue: Math.abs(size) * markPrice,
              unrealizedPl: upl,
              asset_type: 'option',
              side: size >= 0 ? 'buy' : 'sell',
            });
          }
        }
      } catch (err: any) {
        console.warn(`[DERIBIT] Warning: Could not fetch ${curr} positions: ${err.message}`);
      }
    }
    return positions;
  }

  async getQuote(symbol: string): Promise<number> {
    try {
      const res = await this.requestJson('/api/v2/public/ticker', { instrument_name: symbol }, false);
      if (!res) return 0;
      return Number(res.mark_price ?? res.last_price ?? res.best_bid_price ?? 0);
    } catch {
      return 0;
    }
  }

  async getOptionsGreeks(currency = 'BTC'): Promise<{ delta: number; gamma: number; vega: number; theta: number }> {
    try {
      const summary = await this.getAccountSummary(currency);
      return {
        delta: summary.optionsDelta,
        gamma: summary.optionsGamma,
        vega: summary.optionsVega,
        theta: summary.optionsTheta,
      };
    } catch {
      return { delta: 0, gamma: 0, vega: 0, theta: 0 };
    }
  }
}
