export interface SubPosition {
  sub_id: string;
  strategy_id: string;
  source: 'bot' | 'manual';
  quantity: number;
  averagePrice: number;
  marketValue: number;
  unrealizedPl: number;
  confidence?: number | null;
  timeframe?: string | null;
  signature?: string | null;
  submittedAt?: string | null;
}

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  unrealizedPl: number;
  asset_type?: string;
  asset_id?: string;
  side?: string;
  submittedAt?: string;
  subPositions?: SubPosition[];
}

export interface TradeOrder {
  instrumentId: string;
  quantity: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  price?: number;
  tickSizeOverride?: string;
  clientOrderId?: string;
  strategyId?: string;
  source?: 'bot' | 'manual';
  timeframe?: string;
  confidence?: number;
  submittedAt?: string;
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
