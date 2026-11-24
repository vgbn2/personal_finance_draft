import { BrokerAdapter, Position, TradeOrder } from './types';

import { Alpaca, trading, orders } from '@alpacahq/alpaca-trade-api';
const { normalizeAlpacaPosition, resolveAlpacaSettings, toAlpacaTradeSymbol } = require('../../../../shared/lib/brokers/alpaca_env');

export interface AlpacaAdapterOptions {
  keyId?: string;
  secretKey?: string;
  paper?: boolean;
  baseUrl?: string;
  simulateIfMissingCredentials?: boolean;
  client?: any;
}

export class AlpacaAdapter implements BrokerAdapter {
  private alpaca: any;
  private readonly simulateIfMissingCredentials: boolean;
  private readonly paper: boolean;

  constructor(options: AlpacaAdapterOptions = {}) {
    const settings = resolveAlpacaSettings(process.env, options);
    const keyId = settings.keyId;
    const secretKey = settings.secretKey;
    const paper = settings.paper;
    this.paper = paper;
    this.simulateIfMissingCredentials = options.simulateIfMissingCredentials ?? false;

    if (options.client) {
      this.alpaca = options.client;
      // ponytail: retain the existing legacy injection seam, not a second runtime owner.
      if (!this.alpaca.trading) {
        const legacy = options.client;
        const latestQuote = async (symbol: string) => {
          const quote = await legacy.getLatestQuote(symbol);
          return {
            ap: quote?.AskPrice ?? quote?.askPrice ?? quote?.ap,
            bp: quote?.BidPrice ?? quote?.bidPrice ?? quote?.bp,
          };
        };
        this.alpaca = {
          trading: {
            account: {
              getAccount: async () => trading.AccountFromJSON(await legacy.getAccount()),
            },
            positions: {
              getAllOpenPositions: async () => (await legacy.getPositions()).map(trading.PositionFromJSON),
            },
            orders: {
              postOrder: async ({ createOrderRequest }: trading.PostOrderRequest) => trading.OrderFromJSON(
                await legacy.createOrder(trading.CreateOrderRequestToJSON(createOrderRequest)),
              ),
              getAllOrders: async (query: trading.GetAllOrdersRequest) => (await legacy.getOrders(query)).map(trading.OrderFromJSON),
              deleteOrderByOrderID: ({ orderId }: trading.DeleteOrderByOrderIDRequest) => legacy.cancelOrder(orderId),
              getOrderByOrderID: async ({ orderId }: trading.GetOrderByOrderIDRequest) => trading.OrderFromJSON(
                await legacy.getOrder(orderId),
              ),
            },
          },
          marketData: {
            stocks: {
              stockLatestQuoteSingle: async ({ symbol }: { symbol: string }) => ({ quote: await latestQuote(symbol) }),
            },
            crypto: {
              cryptoLatestQuotes: async ({ symbols }: { symbols: string }) => ({ quotes: { [symbols]: await latestQuote(symbols) } }),
            },
          },
        };
      }
    } else if (keyId && secretKey) {
      const credentials = {
        keyId,
        secret: secretKey,
        paper,
      };
      // The facade ignores baseUrl; generated APIs honor Configuration.basePath.
      const config = new trading.Configuration({
        ...credentials,
        basePath: settings.baseUrl.replace(/\/+$/, ''),
      });
      this.alpaca = {
        trading: {
          account: new trading.AccountsApi(config),
          positions: new trading.PositionsApi(config),
          orders: new trading.OrdersApi(config),
        },
        marketData: new Alpaca(credentials).marketData,
      };
    }
  }

  private hasCredentials(): boolean {
    return Boolean(this.alpaca);
  }

  private finiteNumber(value: unknown, field: string): number {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) {
      throw new Error(`Malformed Alpaca ${field}`);
    }
    return Number(value);
  }

  private async submitOrder(payload: orders.OrderInput): Promise<any> {
    const result = await this.alpaca.trading.orders.postOrder({
      createOrderRequest: orders.buildOrder(payload),
    });
    if (!result?.id || !result?.status) throw new Error('Malformed Alpaca order response');
    return result;
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
      if (!symbol || !Number.isFinite(order.quantity) || order.quantity <= 0 ||
          !['buy', 'sell'].includes(order.side) || !['market', 'limit'].includes(order.type)) {
        throw new Error('Invalid Alpaca order');
      }
      const isCrypto = symbol.includes('/');
      const isFractional = !Number.isInteger(order.quantity);
      const payload: orders.OrderInput = {
        symbol,
        qty: order.quantity,
        side: order.side,
        type: order.type,
        timeInForce: isCrypto ? 'gtc' : (isFractional ? 'day' : 'gtc'),
      };

      if (order.clientOrderId) {
        payload.clientOrderId = order.clientOrderId;
      }

      if (order.type === 'limit') {
        if (!Number.isFinite(order.price) || order.price! <= 0) throw new Error('Invalid Alpaca limit price');
        payload.limitPrice = order.price;
      }

      const alpacaOrder = await this.submitOrder(payload);
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
    await this.alpaca.trading.orders.deleteOrderByOrderID({ orderId });
    return true;
  }

  async getAccountNamespace(): Promise<string> {
    if (!this.hasCredentials()) throw new Error('Authenticated Alpaca account required');
    const account = await this.alpaca.trading.account.getAccount();
    if (typeof account?.id !== 'string' || !account.id.trim() || account.id.includes(':')) {
      throw new Error('Malformed Alpaca account ID');
    }
    return 'alpaca:' + (this.paper ? 'paper' : 'live') + ':' + account.id;
  }

  async getOrder(orderId: string) {
    if (!orderId || !this.hasCredentials()) {
      throw new Error('Alpaca order lookup requires an order ID and credentials');
    }
    const order = await this.alpaca.trading.orders.getOrderByOrderID({ orderId });
    if (order?.id !== orderId || !order.symbol || !order.status ||
        !['buy', 'sell'].includes(order.side)) {
      throw new Error('Malformed Alpaca order identity');
    }
    const quantity = this.finiteNumber(order.qty, 'order quantity');
    const filledQty = this.finiteNumber(order.filledQty, 'order filled quantity');
    const filledAvgPrice = filledQty > 0
      ? this.finiteNumber(order.filledAvgPrice, 'order fill price')
      : null;
    if (quantity <= 0 || filledQty < 0 || filledQty > quantity ||
        (filledAvgPrice !== null && filledAvgPrice <= 0)) {
      throw new Error('Malformed Alpaca order fill bounds');
    }
    return {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      status: order.status,
      quantity,
      filledQty,
      filledAvgPrice,
    };
  }

  async getPortfolioBalance(): Promise<Record<string, number>> {
    console.log(`[ALPACA-SDK] Fetching account details`);
    if (!this.hasCredentials()) {
      if (!this.simulateIfMissingCredentials) {
        throw new Error('Alpaca credentials are not configured');
      }
      return { USD: 0, BUYING_POWER: 0, EQUITY: 0 };
    }

    try {
      const account = await this.alpaca.trading.account.getAccount();
      return {
        USD: this.finiteNumber(account?.cash, 'cash'),
        BUYING_POWER: this.finiteNumber(account?.buyingPower, 'buying power'),
        EQUITY: this.finiteNumber(account?.equity, 'equity'),
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
      const positions = await this.alpaca.trading.positions.getAllOpenPositions();
      if (!Array.isArray(positions)) throw new Error('Malformed Alpaca positions');

      // ponytail: enrich only the latest 500 orders; paginate when full attribution is required.
      let orderMap: Record<string, { submitted_at?: string; filled_at?: string; client_order_id?: string }> = {};
      try {
        const closedOrders = await this.alpaca.trading.orders.getAllOrders({
          status: 'all',
          limit: 500,
          nested: false,
          direction: 'desc',
        });
        if (Array.isArray(closedOrders)) {
          for (const ord of closedOrders) {
            const rawSym = String(ord.symbol || '').toUpperCase();
            const sym = rawSym.replace('/', '');
            const submitted = ord.submittedAt ?? ord.createdAt;
            const filled = ord.filledAt;
            if ((submitted && !Number.isFinite(submitted.getTime())) || (filled && !Number.isFinite(filled.getTime()))) continue;
            const submittedAt = submitted?.toISOString();
            const filledAt = filled?.toISOString();
            if (sym && (!orderMap[sym] || (filledAt && orderMap[sym].filled_at && filledAt > orderMap[sym].filled_at!))) {
              orderMap[sym] = {
                submitted_at: submittedAt,
                filled_at: filledAt,
                client_order_id: ord.clientOrderId,
              };
            }
          }
        }
      } catch (err: any) {
        console.warn(`[ALPACA-SDK] Order history enrichment unavailable: ${err.message}`);
      }

      return positions.map((p: any) => {
        if (!p?.symbol) throw new Error('Malformed Alpaca position symbol');
        const rawSym = String(p.symbol || '').toUpperCase();
        const sym = rawSym.replace('/', '');
        return normalizeAlpacaPosition({
          symbol: p.symbol,
          qty: this.finiteNumber(p.qty, 'position quantity'),
          qty_available: p.qtyAvailable == null ? undefined : this.finiteNumber(p.qtyAvailable, 'available quantity'),
          avg_entry_price: this.finiteNumber(p.avgEntryPrice, 'entry price'),
          market_value: this.finiteNumber(p.marketValue, 'market value'),
          unrealized_pl: this.finiteNumber(p.unrealizedPl, 'unrealized P/L'),
        }, orderMap[sym] || orderMap[rawSym]);
      });
    } catch (err: any) {
      throw new Error(`Alpaca SDK Positions Error: ${err.message}`);
    }
  }

  async placeBracketOrder(symbol: string, qty: number, takeProfitPrice: number, stopLossPrice: number) {
    if (!this.hasCredentials()) {
      if (!this.simulateIfMissingCredentials) throw new Error('Alpaca credentials are not configured');
      return { id: 'sim-bracket' };
    }
    symbol = toAlpacaTradeSymbol(symbol);
    if (!symbol || symbol.includes('/') || !Number.isInteger(qty) || qty <= 0 ||
        !Number.isFinite(takeProfitPrice) || !Number.isFinite(stopLossPrice) ||
        stopLossPrice <= 0 || takeProfitPrice <= stopLossPrice) {
      throw new Error('Invalid Alpaca equity bracket order');
    }

    return this.submitOrder({
      symbol,
      qty,
      side: 'buy',
      type: 'market',
      timeInForce: 'gtc',
      orderClass: 'bracket',
      takeProfit: {
        limitPrice: takeProfitPrice,
      },
      stopLoss: {
        stopPrice: stopLossPrice,
      },
    });
  }

  async getQuote(symbol: string): Promise<number> {
    if (!this.hasCredentials()) {
      console.warn('[ALPACA] No credentials — quote unavailable');
      return 0;
    }
    try {
      symbol = toAlpacaTradeSymbol(symbol);
      const quote = symbol.includes('/')
        ? (await this.alpaca.marketData.crypto.cryptoLatestQuotes({ loc: 'us', symbols: symbol })).quotes?.[symbol]
        : (await this.alpaca.marketData.stocks.stockLatestQuoteSingle({ symbol })).quote;
      const price = Number(quote?.ap || quote?.bp || 0);
      return Number.isFinite(price) && price > 0 ? price : 0;
    } catch (err: any) {
      console.warn(`[ALPACA-SDK] Quote fetch failed for ${symbol}: ${err.message}`);
      return 0;
    }
  }
}
