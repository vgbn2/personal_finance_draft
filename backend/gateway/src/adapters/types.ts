export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  unrealizedPl: number;
  asset_type?: string;
  asset_id?: string;
  side?: string;
}

export interface TradeOrder {
  instrumentId: string;
  quantity: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  price?: number;
  tickSizeOverride?: string;
}

export interface RiskContext {
  accountEquity: number;
  currentDrawdown: number;
  openPositionsCount: number;
  maxDrawdownLimit?: number;
  notionalUsd?: number;
}

export interface BrokerAdapter {
  placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }>;
  cancelOrder(orderId: string): Promise<boolean>;
  getPortfolioBalance(): Promise<Record<string, number>>;
  getPositions(): Promise<Position[]>;
  getQuote?(symbol: string): Promise<number>;
}
