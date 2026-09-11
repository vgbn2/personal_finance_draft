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
  strategy?: string;
  broker?: string;
  providerPaper?: boolean;
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

export interface Mt5RegistrationMessage {
  type: 'REGISTER';
  terminalId: string;
  account: number;
  server: string;
  company?: string;
  marginMode: 'RETAIL_HEDGING' | 'RETAIL_NETTING' | 'EXCHANGE';
  currency: string;
  leverage: number;
  tradeAllowed: boolean;
}

export interface Mt5OrderSubmitMessage {
  type: 'ORDER_SUBMIT';
  nonce: string;
  clientOrderId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  quantity: number;
  price?: number;
  sl?: number;
  tp?: number;
  magic: string;
  comment?: string;
}

export interface Mt5OrderResultMessage {
  type: 'ORDER_RESULT';
  nonce: string;
  ok: boolean;
  ticket?: number;
  deal?: number;
  symbol?: string;
  volume?: number;
  fillPrice?: number;
  retcode: number;
  retcodeDescription?: string;
  error?: string;
  timestamp: string;
}

