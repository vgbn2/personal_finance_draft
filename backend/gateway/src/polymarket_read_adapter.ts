export interface GatewayPosition {
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

export interface PolymarketTradePagination {
  pages_fetched: number;
  trades_fetched: number;
  page_cap: number;
  truncated: boolean;
  next_cursor?: string;
}

export interface PolymarketReadAdapterOptions {
  host?: string;
  privateKey?: string;
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
  funderAddress?: string;
  signatureType?: number;
}

export interface PolymarketReadAdapter {
  isConfigured(): boolean;
  getSignerAddress(): Promise<string | null>;
  getAccountIdentity(): { funderAddress?: string; signatureType?: number };
  getCollateralStatus(): Promise<{ balance: number; allowance: number; asset_type: 'COLLATERAL' }>;
  getPortfolioBalance(): Promise<Record<string, number>>;
  getOpenOrders(): Promise<GatewayPosition[]>;
  getPositions(): Promise<GatewayPosition[]>;
  getTradePagination(): PolymarketTradePagination | undefined;
}

export type PolymarketReadAdapterFactory = (
  options?: PolymarketReadAdapterOptions,
) => PolymarketReadAdapter;
