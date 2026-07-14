export type TabId = 'overview' | 'signals' | 'market_intel' | 'backtest' | 'quote_health' | 'audit_log' | 'telemetry' | 'sigma_band' | 'settings' | 'bot';

export type LayoutDensity = 'compact' | 'comfortable';
export type LayoutPreset = 'compact' | 'default' | 'research';

export interface DashboardLayout {
  default_tab: TabId;
  pinned_panels: TabId[];
  sidebar_collapsed: boolean;
  panel_order: TabId[];
  density: LayoutDensity;
  preset: LayoutPreset;
}

export interface UserDefaultParams {
  position_size_usdc: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  min_edge_threshold: number;
  max_positions: number;
  order_timeout_seconds: number;
  polling_interval_seconds: number;
}

export interface UserFeatureFlags {
  bot_autopilot: boolean;
  polymarket: boolean;
  onchain_data: boolean;
  multi_agent_research: boolean;
  auto_rebalance: boolean;
}

export interface UserConfig {
  timezone: string;
  risk_thresholds: { max_position_pct: number; max_drawdown_pct: number };
  broker_preference: { default: string };
  dashboard_layout: DashboardLayout;
  alert_preferences: { email: boolean; push: boolean };
  default_params: UserDefaultParams;
  feature_flags: UserFeatureFlags;
}

export interface BotPosition {
  positionId: string;
  tokenId: string;
  slug: string;
  side: 'YES' | 'NO';
  entryPrice: number;
  fillPrice: number;
  shares: number;
  targetPrice: number;
  stopPrice: number;
  entryTimestamp: string;
  aiProbabilityAtEntry: number;
  lastFokFailTimestamp: string | null;
}

export interface BotCycleResult {
  cycleId: string;
  startedAt: string;
  completedAt: string | null;
  balanceBefore: number;
  balanceAfter: number | null;
  sellsExecuted: number;
  buysFilled: number;
  errors: string[];
  dryRun: boolean;
}

export interface BotConfig {
  enabled: boolean;
  liveTrading: boolean;
  intervalMinutes: number;
  maxPositions: number;
  positionSizeUsdc: number;
  minEdgeThreshold: number;
  stopLossPct: number;
  edgeCaptureRatio: number;
}

export interface BotState {
  ok: boolean;
  config: BotConfig;
  positions: BotPosition[];
  cycleHistory: BotCycleResult[];
  lastCycleAt: string | null;
  balance?: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

export type SignalStatus = 'GATED' | 'REVIEWED' | 'REJECTED';
export type SignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface TradeSignal {
  id: string;
  asset: string;
  model: string;
  direction: SignalDirection;
  confidence: number; // 0.0 to 1.0
  status: SignalStatus;
  timestamp: string | null;
  evidenceId: string;
  validUntil?: string | null;
  reason?: string;
}

export interface MetricTileData {
  label: string;
  value: string;
  status: 'cyan' | 'green' | 'amber' | 'red' | 'violet';
  subtext?: string;
}
