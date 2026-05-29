export type TabId = 'overview' | 'signals' | 'market_intel' | 'backtest' | 'quote_health' | 'audit_log' | 'telemetry';

export interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

export type SignalStatus = 'GATED' | 'PROMOTED' | 'REJECTED';
export type SignalDirection = 'LONG' | 'SHORT';

export interface TradeSignal {
  id: string;
  asset: string;
  model: string;
  direction: SignalDirection;
  confidence: number; // 0.0 to 1.0
  status: SignalStatus;
  timestamp: string;
  evidenceId: string;
}

export interface MetricTileData {
  label: string;
  value: string;
  status: 'cyan' | 'green' | 'amber' | 'red' | 'violet';
  subtext?: string;
}
