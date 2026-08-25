import { BrokerAdapter, Position, TradeOrder } from './types';

// @ts-ignore
const Alpaca = require('@alpacahq/alpaca-trade-api');
const { resolveAlpacaSettings, toAlpacaTradeSymbol } = require('../../../../shared/lib/brokers/alpaca_env');

export interface AlpacaAdapterOptions {
  keyId?: string;
  secretKey?: string;
  paper?: boolean;
  simulateIfMissingCredentials?: boolean;
}

export class AlpacaAdapter implements BrokerAdapter {
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
        time_in_force: isCrypto ? 'gtc' : (isFractional ? 'day' : 'gtc'),
      };

      if (order.clientOrderId) {
        payload.client_order_id = order.clientOrderId;
      }

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

      // Enrich positions with order submission / fill history via Alpaca getOrders API
      let orderMap: Record<string, { submitted_at?: string; filled_at?: string; client_order_id?: string }> = {};
      try {
        const closedOrders = await this.alpaca.getOrders({ status: 'closed', limit: 100, nested: false });
        if (Array.isArray(closedOrders)) {
          for (const ord of closedOrders) {
            const sym = String(ord.symbol || '').toUpperCase();
            if (sym && (!orderMap[sym] || (ord.filled_at && orderMap[sym].filled_at && ord.filled_at > orderMap[sym].filled_at!))) {
              orderMap[sym] = {
                submitted_at: ord.submitted_at || ord.created_at,
                filled_at: ord.filled_at,
                client_order_id: ord.client_order_id
              };
            }
          }
        }
      } catch {
        // Non-fatal if order history enrichment fails
      }

      return positions.map((p: any) => {
        const sym = String(p.symbol || '').toUpperCase();
        const ordInfo = orderMap[sym];
        return {
          symbol: sym,
          quantity: Number(p.qty),
          averagePrice: Number(p.avg_entry_price),
          marketValue: Number(p.market_value),
          unrealizedPl: Number(p.unrealized_pl),
          submittedAt: ordInfo?.submitted_at || ordInfo?.filled_at || undefined,
        };
      });
    } catch (err: any) {
      throw new Error(`Alpaca SDK Positions Error: ${err.message}`);
    }
  }

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
