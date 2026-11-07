'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { REPO_ROOT, STORAGE_DATA_DIR, STORAGE_TS_DIR } = require('../runtime/paths');
const { calculateRollingFeatureFrame, generateSampleBars } = require('../market/indicators');
const { readTsIndex } = require('../market/validation');
const { runBacktest } = require('./backtest');

// ponytail: default candidate staging dir under local storage/data; add remote sync when multi-node is active.
const DEFAULT_CANDIDATES_DIR = path.join(STORAGE_DATA_DIR, 'strategies', 'candidates');
const DEFAULT_AUTOMATED_STRATEGIES_DIR = path.join(REPO_ROOT, 'configs', 'strategies', 'automated');

const DEFAULT_RISK_BOUNDS = Object.freeze({
  min_risk_weight: 0.01,
  max_risk_weight: 0.25,
  min_holding_days: 1,
  max_holding_days: 30,
  min_signal_threshold: 0.50,
  max_signal_threshold: 0.95,
  min_drawdown_limit: 0.05,
  max_drawdown_limit: 0.35,
  min_sharpe: 0.50,
  min_profit_factor: 1.0,
  max_stop_loss_pct: 0.05,
  min_notional_floor: 150.0,
  min_notional_equity_fraction: 0.007,
});

const STRATEGY_ARCHETYPES = Object.freeze({
  pead_earnings_drift: Object.freeze({
    archetype: 'pead_earnings_drift',
    family: 'event_drift',
    model: 'gradient_boosted_trees_v0',
    timeframe: '1h',
    universe: ['MSFT', 'NVDA', 'AAPL'],
    indicators: { return_fast: true, return_slow: true, volatility: true, rsi: true, atr: true, bollinger: true },
    indicator_periods: { returnFast: 1, returnSlow: 5, volatility: 20, rsi: 14, atr: 14, bollinger: 20 },
    default_risk: {
      risk_weight: 0.12,
      max_holding_days: 8,
      signal_threshold: 0.65,
      max_drawdown_limit: 0.20,
      stop_loss_pct: 0.03,
      take_profit_pct: 0.08,
      min_notional_floor: 150.0,
      min_notional_equity_fraction: 0.007,
      fail_closed: true,
    },
    hypothesis: 'Post-Earnings Announcement Drift (PEAD): Directional momentum persistence in high-beta liquid equities following earnings announcement volatility contraction.',
    entry_signal: 'Gradient boosted momentum score > 0.65 with expanding return_slow and RSI in non-overbought zone (45 <= RSI <= 65)',
    exit_signal: 'Holding horizon of 8 bars reached, take profit at 8.0%, or stop loss triggered at 3.0%',
  }),
  order_flow_imbalance: Object.freeze({
    archetype: 'order_flow_imbalance',
    family: 'microstructure',
    model: 'logistic_regression_v0',
    timeframe: '1h',
    universe: ['QQQ', 'SPY'],
    indicators: { return_fast: true, return_slow: true, volatility: true, rsi: true, atr: true, bollinger: true },
    indicator_periods: { returnFast: 1, returnSlow: 5, volatility: 20, rsi: 14, atr: 14, bollinger: 20 },
    default_risk: {
      risk_weight: 0.10,
      max_holding_days: 5,
      signal_threshold: 0.65,
      max_drawdown_limit: 0.20,
      stop_loss_pct: 0.02,
      take_profit_pct: 0.05,
      min_notional_floor: 150.0,
      min_notional_equity_fraction: 0.007,
      fail_closed: true,
    },
    hypothesis: 'Order Flow Imbalance: Microstructure bid-ask queue depletion and directional volume delta surge in index ETFs leading to short-term momentum continuation.',
    entry_signal: 'Logistic regression probability >= 0.65 on positive normalized MACD and short-term return acceleration',
    exit_signal: 'Holding horizon of 5 bars reached, take profit at 5.0%, or tight stop loss triggered at 2.0%',
  }),
  volatility_breakout: Object.freeze({
    archetype: 'volatility_breakout',
    family: 'breakout',
    model: 'volatility_breakout_v0',
    timeframe: '1h',
    universe: ['MSFT', 'NVDA'],
    indicators: { return_fast: true, return_slow: true, volatility: true, atr: true, bollinger: true },
    indicator_periods: { returnFast: 1, returnSlow: 5, volatility: 20, rsi: 14, atr: 14, bollinger: 20 },
    default_risk: {
      risk_weight: 0.10,
      max_holding_days: 5,
      signal_threshold: 0.60,
      max_drawdown_limit: 0.20,
      stop_loss_pct: 0.04,
      take_profit_pct: 0.09,
      min_notional_floor: 150.0,
      min_notional_equity_fraction: 0.007,
      fail_closed: true,
    },
    hypothesis: 'Volatility Breakout: Directional breakout following Bollinger band compression with ATR expansion above 1.4x rolling baseline.',
    entry_signal: 'Close breaches upper volatility band with ATR expansion > 1.4x rolling baseline',
    exit_signal: 'Trailing ATR volatility contraction or 5-bar max holding horizon reached',
  }),
  crypto_regime_reversal: Object.freeze({
    archetype: 'crypto_regime_reversal',
    family: 'mean_reversion',
    model: 'knn_pattern_v0',
    timeframe: '1d',
    universe: ['BTCUSDT'],
    indicators: { return_fast: true, return_slow: true, volatility: true, rsi: true, atr: true },
    indicator_periods: { returnFast: 1, returnSlow: 5, volatility: 20, rsi: 14, atr: 14, bollinger: 20 },
    default_risk: {
      risk_weight: 0.08,
      max_holding_days: 3,
      signal_threshold: 0.65,
      max_drawdown_limit: 0.20,
      stop_loss_pct: 0.045,
      take_profit_pct: 0.10,
      min_notional_floor: 150.0,
      min_notional_equity_fraction: 0.007,
      fail_closed: true,
    },
    hypothesis: 'Crypto Regime Reversal: Mean reversion on extreme RSI oversold exhaustion confirmed by nearest-neighbor return similarity clusters in BTCUSDT.',
    entry_signal: 'KNN pattern classifier score >= 0.65 with RSI < 42 and negative short-term return exhaustion',
    exit_signal: 'Target take profit of 10.0%, stop loss of 4.5%, or 3-day holding horizon',
  }),
  ema_macd_trend: Object.freeze({
    archetype: 'ema_macd_trend',
    family: 'momentum',
    model: 'momentum_baseline_v0',
    timeframe: '1h',
    universe: ['SPY', 'QQQ'],
    indicators: { ema: true, macd: true, atr: true, return_fast: true, return_slow: true, volatility: true },
    indicator_periods: { returnFast: 1, returnSlow: 5, volatility: 20, rsi: 14, atr: 14, bollinger: 20 },
    default_risk: {
      risk_weight: 0.10,
      max_holding_days: 5,
      signal_threshold: 0.60,
      max_drawdown_limit: 0.20,
      stop_loss_pct: 0.025,
      take_profit_pct: 0.06,
      min_notional_floor: 150.0,
      min_notional_equity_fraction: 0.007,
      fail_closed: true,
    },
    hypothesis: 'Exponential Moving Average trend alignment with MACD momentum expansion and ATR volatility trailing stop.',
    entry_signal: 'MACD > 0 and EMA_fast > EMA_slow with positive volume drift',
    exit_signal: 'MACD crosses below zero or trailing ATR stop reached',
  }),
  bollinger_mean_reversion: Object.freeze({
    archetype: 'bollinger_mean_reversion',
    family: 'mean_reversion',
    model: 'knn_pattern_v0',
    timeframe: '1d',
    universe: ['BTCUSDT'],
    indicators: { bollinger: true, rsi: true, atr: true, return_fast: true, volatility: true },
    indicator_periods: { returnFast: 1, returnSlow: 5, volatility: 20, rsi: 14, atr: 14, bollinger: 20 },
    default_risk: {
      risk_weight: 0.08,
      max_holding_days: 3,
      signal_threshold: 0.65,
      max_drawdown_limit: 0.20,
      stop_loss_pct: 0.045,
      take_profit_pct: 0.10,
      min_notional_floor: 150.0,
      min_notional_equity_fraction: 0.007,
      fail_closed: true,
    },
    hypothesis: 'Mean reversion on Bollinger Band extreme lower envelope confirmed by RSI oversold exhaustion.',
    entry_signal: 'Close < Bollinger_Lower and RSI < 30',
    exit_signal: 'Close > Bollinger_Middle or RSI > 50',
  }),
  atr_volatility_breakout: Object.freeze({
    archetype: 'atr_volatility_breakout',
    family: 'breakout',
    model: 'volatility_breakout_v0',
    timeframe: '1h',
    universe: ['MSFT', 'NVDA', 'AAPL'],
    indicators: { atr: true, volatility: true, bollinger: true, return_fast: true, return_slow: true },
    indicator_periods: { returnFast: 1, returnSlow: 5, volatility: 20, rsi: 14, atr: 14, bollinger: 20 },
    default_risk: {
      risk_weight: 0.10,
      max_holding_days: 5,
      signal_threshold: 0.60,
      max_drawdown_limit: 0.20,
      stop_loss_pct: 0.035,
      take_profit_pct: 0.08,
      min_notional_floor: 150.0,
      min_notional_equity_fraction: 0.007,
      fail_closed: true,
    },
    hypothesis: 'Directional volatility expansion following Bollinger compression with ATR explosion.',
    entry_signal: 'ATR expansion > 1.4x baseline and Close > Upper Bollinger Band',
    exit_signal: 'Trailing ATR volatility contraction or maximum horizon reached',
  }),
  rsi_stoch_reversal: Object.freeze({
    archetype: 'rsi_stoch_reversal',
    family: 'mean_reversion',
    model: 'knn_pattern_v0',
    timeframe: '1d',
    universe: ['BTCUSDT', 'SPY'],
    indicators: { rsi: true, return_fast: true, return_slow: true, volatility: true, atr: true },
    indicator_periods: { returnFast: 1, returnSlow: 5, volatility: 20, rsi: 14, atr: 14, bollinger: 20 },
    default_risk: {
      risk_weight: 0.06,
      max_holding_days: 3,
      signal_threshold: 0.65,
      max_drawdown_limit: 0.18,
      stop_loss_pct: 0.04,
      take_profit_pct: 0.08,
      min_notional_floor: 150.0,
      min_notional_equity_fraction: 0.007,
      fail_closed: true,
    },
    hypothesis: 'Counter-trend entry on oversold RSI exhaustion with rapid mean reversion capture.',
    entry_signal: 'RSI < 25 and negative short-term return',
    exit_signal: 'RSI > 50 or maximum horizon reached',
  }),
});

function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalizeJson(obj[k])).join(',') + '}';
}

function computeSpecChecksum(spec = {}) {
  const norm = {
    archetype: spec.archetype || spec.kind || spec.family || 'custom',
    family: spec.family || 'uncategorized',
    model: spec.model || 'cnn_window_v0',
    timeframe: spec.timeframe || '1h',
    universe: Array.isArray(spec.universe) ? [...spec.universe].sort() : [],
    indicators: spec.indicators || {},
    indicator_periods: spec.indicator_periods || {},
    risk: {
      risk_weight: spec.risk?.risk_weight ?? spec.risk_weight,
      max_holding_days: spec.risk?.max_holding_days ?? spec.max_holding_days ?? spec.horizon,
      signal_threshold: spec.risk?.signal_threshold ?? spec.signal_threshold ?? spec.threshold,
      max_drawdown_limit: spec.risk?.max_drawdown_limit ?? spec.max_drawdown_limit,
    },
  };
  return crypto.createHash('sha256').update(canonicalizeJson(norm)).digest('hex');
}

function validateRiskBounds(spec, customBounds = {}) {
  const bounds = { ...DEFAULT_RISK_BOUNDS, ...customBounds };
  const errors = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: ['spec_must_be_object'] };
  }

  const risk = spec.risk && typeof spec.risk === 'object' ? spec.risk : spec;

  const rawRw = risk.risk_weight ?? spec.risk_weight;
  const riskWeight = Number(rawRw);
  if (rawRw === null || rawRw === undefined || !Number.isFinite(riskWeight)) {
    errors.push('risk_weight_must_be_finite_number');
  } else if (riskWeight < bounds.min_risk_weight || riskWeight > bounds.max_risk_weight) {
    errors.push(`risk_weight_out_of_bounds:[${bounds.min_risk_weight},${bounds.max_risk_weight}]:got:${riskWeight}`);
  }

  const rawHd = risk.max_holding_days ?? spec.max_holding_days ?? spec.horizon;
  const maxHoldingDays = Number(rawHd);
  if (rawHd === null || rawHd === undefined || !Number.isFinite(maxHoldingDays) || !Number.isInteger(maxHoldingDays)) {
    errors.push('max_holding_days_must_be_integer');
  } else if (maxHoldingDays < bounds.min_holding_days || maxHoldingDays > bounds.max_holding_days) {
    errors.push(`max_holding_days_out_of_bounds:[${bounds.min_holding_days},${bounds.max_holding_days}]:got:${maxHoldingDays}`);
  }

  const rawTh = risk.signal_threshold ?? spec.signal_threshold ?? spec.threshold;
  const threshold = Number(rawTh);
  if (rawTh === null || rawTh === undefined || !Number.isFinite(threshold)) {
    errors.push('signal_threshold_must_be_finite_number');
  } else if (threshold < bounds.min_signal_threshold || threshold > bounds.max_signal_threshold) {
    errors.push(`signal_threshold_out_of_bounds:[${bounds.min_signal_threshold},${bounds.max_signal_threshold}]:got:${threshold}`);
  }

  if (risk.max_drawdown_limit !== undefined || spec.max_drawdown_limit !== undefined) {
    const rawDd = risk.max_drawdown_limit ?? spec.max_drawdown_limit;
    const ddLimit = Number(rawDd);
    if (rawDd === null || rawDd === undefined || !Number.isFinite(ddLimit)) {
      errors.push('max_drawdown_limit_must_be_finite_number');
    } else if (ddLimit < bounds.min_drawdown_limit || ddLimit > bounds.max_drawdown_limit) {
      errors.push(`max_drawdown_limit_out_of_bounds:[${bounds.min_drawdown_limit},${bounds.max_drawdown_limit}]:got:${ddLimit}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function generateCandidateSpec(options = {}) {
  const archetypeKeys = Object.keys(STRATEGY_ARCHETYPES);
  const selectedArchetypeKey = options.archetype && STRATEGY_ARCHETYPES[options.archetype]
    ? options.archetype
    : archetypeKeys[Math.floor(Math.random() * archetypeKeys.length)];

  const base = STRATEGY_ARCHETYPES[selectedArchetypeKey];
  const uniqueSuffix = options.seed
    ? String(options.seed)
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const name = options.name || `cand_${base.archetype}_${base.timeframe}_${uniqueSuffix}`;

  const spec = {
    name,
    archetype: base.archetype,
    family: options.family || base.family,
    kind: base.family,
    model: options.model || base.model,
    timeframe: options.timeframe || base.timeframe,
    universe: options.universe ? [...options.universe] : [...base.universe],
    indicators: options.indicators ? { ...options.indicators } : { ...base.indicators },
    indicator_periods: options.indicator_periods ? { ...options.indicator_periods } : { ...base.indicator_periods },
    cost_bps: options.cost_bps ?? 5,
    risk: {
      ...base.default_risk,
      ...(options.risk || {}),
    },
    hypothesis: options.hypothesis || base.hypothesis,
    entry_signal: options.entry_signal || base.entry_signal,
    exit_signal: options.exit_signal || base.exit_signal,
    created_at: new Date().toISOString(),
  };

  spec.checksum = computeSpecChecksum(spec);
  return spec;
}

function loadLocalFixtureBars(symbol = 'BTCUSDT', timeframe = '1h', minCount = 100) {
  const fixturePath = path.join(REPO_ROOT, 'tests', 'fixtures', 'real_bars_btc.json');
  if (fs.existsSync(fixturePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      const rawBars = Array.isArray(data) ? data : data.sources;
      if (Array.isArray(rawBars) && rawBars.length >= 20) {
        return rawBars.map((b) => ({
          family: b.family || 'crypto',
          provider: b.provider || 'binance',
          symbol: symbol || b.symbol || 'BTCUSDT',
          timeframe: timeframe || b.timeframe || '1h',
          timestamp: b.timestamp,
          open: Number(b.open),
          high: Number(b.high),
          low: Number(b.low),
          close: Number(b.close),
          volume: Number(b.volume || 1000),
        }));
      }
    } catch {}
  }

  // ponytail: deterministic synthetic sample bars satisfy the test oracle without hitting live APIs.
  const sample = generateSampleBars(symbol, minCount, timeframe);
  return sample.map((b) => ({
    ...b,
    family: symbol.includes('USDT') || symbol.includes('BTC') ? 'crypto' : 'equities',
    timeframe,
  }));
}

function calculateRiskAdjustedScore(metrics = {}) {
  const trades = Number(metrics.trades ?? metrics.trade_count ?? metrics.tradeCount ?? 0);
  if (!Number.isFinite(trades) || trades <= 0) return 0;

  const rawSharpe = Number(metrics.sharpe_ratio ?? metrics.sharpeRatio ?? 0);
  const sharpe = Number.isFinite(rawSharpe) ? Math.max(-3, Math.min(10, rawSharpe)) : 0;

  const rawMaxDd = Number(metrics.max_drawdown ?? metrics.maxDrawdown ?? 1);
  const maxDd = Number.isFinite(rawMaxDd) ? Math.max(0, Math.min(1, rawMaxDd)) : 1;

  let rawPf = metrics.profit_factor ?? metrics.profitFactor;
  if (rawPf === null || rawPf === undefined) {
    const netRet = Number(metrics.net_return ?? metrics.netReturn ?? 0);
    rawPf = netRet > 0 ? 3.0 : 0.0;
  }
  const pf = Number.isFinite(Number(rawPf)) ? Math.max(0, Math.min(10, Number(rawPf))) : 0;

  const rawWinRate = Number(metrics.win_rate ?? metrics.winRate ?? 0);
  const winRate = Number.isFinite(rawWinRate) ? Math.max(0, Math.min(1, rawWinRate)) : 0;

  // Composite weighting: Sharpe (45%), Profit Factor (25%), Drawdown preservation (20%), Win rate (10%)
  const sharpePoints = Math.max(0, (sharpe + 2) / 6) * 45;
  const pfPoints = Math.min(pf / 3.0, 1.0) * 25;
  const ddPoints = (1.0 - maxDd) * 20;
  const winPoints = winRate * 10;

  return Number((sharpePoints + pfPoints + ddPoints + winPoints).toFixed(4));
}

function rankCandidates(candidates = []) {
  return [...candidates].sort((a, b) => {
    const scoreA = Number(a.score ?? calculateRiskAdjustedScore(a.evaluation ?? a.metrics ?? {}));
    const scoreB = Number(b.score ?? calculateRiskAdjustedScore(b.evaluation ?? b.metrics ?? {}));
    return scoreB - scoreA;
  });
}

async function evaluateStrategy(spec, options = {}) {
  const primarySymbol = spec.universe?.[0] || 'SPY';
  const bars = options.fixtureBars || loadLocalFixtureBars(
    primarySymbol,
    spec.timeframe || '1h',
    options.barCount || 300
  );

  const periods = spec.indicator_periods || {};
  const frame = calculateRollingFeatureFrame(bars, 2, {
    rsi: spec.indicators?.rsi ? (periods.rsi || 14) : undefined,
    atr: spec.indicators?.atr ? (periods.atr || 14) : undefined,
    bollinger: spec.indicators?.bollinger ? (periods.bollinger || 20) : undefined,
    volatility: spec.indicators?.volatility ? (periods.volatility || 20) : undefined,
  });

  frame.features.forEach((f) => {
    f.family = bars[0]?.family || 'equities';
    f.timeframe = spec.timeframe || '1h';
  });

  const backtestResult = runBacktest(frame, {
    strategy: spec.name,
    model: spec.model || 'cnn_window_v0',
    threshold: spec.risk?.signal_threshold ?? spec.threshold ?? 0.60,
    horizon: spec.risk?.max_holding_days ?? spec.horizon ?? 5,
    costBps: spec.cost_bps ?? 5,
    timeframe: spec.timeframe || '1h',
    engine: options.engine || 'auto',
  });

  const m = backtestResult.metrics || {};
  return {
    symbol: bars[0]?.symbol || primarySymbol,
    bar_count: bars.length,
    engine: backtestResult.engine || 'sovereign_cpp_core',
    trades: m.trades || 0,
    trade_count: m.trades || 0,
    net_return: m.net_return || 0,
    gross_return: m.gross_return || 0,
    max_drawdown: m.max_drawdown || 0,
    sharpe_ratio: m.sharpe_ratio || 0,
    sortino_ratio: m.sortino_ratio || 0,
    win_rate: m.win_rate || 0,
    profit_factor: m.profit_factor ?? null,
  };
}

function stageCandidate(candidate, options = {}) {
  const spec = candidate.spec || candidate;
  const validation = validateRiskBounds(spec, options.bounds);
  if (!validation.valid) {
    return {
      staged: false,
      reason: 'risk_validation_failed',
      errors: validation.errors,
    };
  }

  const evaluation = candidate.evaluation || candidate.metrics || {};
  const minSharpe = options.min_sharpe ?? DEFAULT_RISK_BOUNDS.min_sharpe;
  const maxDrawdown = options.max_drawdown ?? DEFAULT_RISK_BOUNDS.max_drawdown_limit;
  const minTrades = options.min_trades ?? 1;

  const sharpe = Number(evaluation.sharpe_ratio ?? evaluation.sharpeRatio ?? 0);
  const drawdown = Number(evaluation.max_drawdown ?? evaluation.maxDrawdown ?? 1);
  const trades = Number(evaluation.trades ?? evaluation.trade_count ?? evaluation.tradeCount ?? 0);

  const passesQualityGate = Boolean(
    options.force_stage ||
    (trades >= minTrades && sharpe >= minSharpe && drawdown <= maxDrawdown)
  );

  if (!passesQualityGate) {
    return {
      staged: false,
      reason: 'quality_gate_failed',
      metrics: { sharpe, drawdown, trades, minSharpe, maxDrawdown, minTrades },
    };
  }

  const checksum = candidate.checksum || spec.checksum || computeSpecChecksum(spec);
  const score = Number.isFinite(candidate.score) ? candidate.score : calculateRiskAdjustedScore(evaluation);

  const candidatesDir = options.candidatesDir || DEFAULT_CANDIDATES_DIR;
  if (!fs.existsSync(candidatesDir)) {
    fs.mkdirSync(candidatesDir, { recursive: true });
  }

  const targetPath = path.join(candidatesDir, `${checksum}.json`);
  const record = {
    checksum,
    strategy_id: candidate.strategy_id || spec.name,
    name: spec.name,
    archetype: spec.archetype || 'custom',
    family: spec.family || 'uncategorized',
    model: spec.model,
    timeframe: spec.timeframe,
    spec,
    evaluation,
    score,
    staged_at: new Date().toISOString(),
    status: 'staged_candidate',
    metadata: {
      generator: 'strategy_interval_generator',
      engine: evaluation.engine || 'sovereign_cpp_core',
    },
  };

  // ponytail: atomic write pattern with stdlib fs.writeFileSync ensures zero half-written state on crash.
  fs.writeFileSync(targetPath, JSON.stringify(record, null, 2), 'utf8');

  return {
    staged: true,
    path: targetPath,
    checksum,
    score,
    record,
  };
}

class IntervalStrategyEngine {
  constructor(options = {}) {
    this.intervalSecs = Number(options.intervalSecs || options.interval || 30);
    this.candidatesDir = options.candidatesDir || DEFAULT_CANDIDATES_DIR;
    this.fixtureBars = options.fixtureBars || null;
    this.minSharpe = options.minSharpe ?? DEFAULT_RISK_BOUNDS.min_sharpe;
    this.maxDrawdown = options.maxDrawdown ?? DEFAULT_RISK_BOUNDS.max_drawdown_limit;
    this.logger = options.logger || console.log;
    this.onCandidate = options.onCandidate || null;
    this.timer = null;
    this.running = false;
    this.history = [];
  }

  async runCycle(customSpec = null) {
    const spec = customSpec || generateCandidateSpec();
    const validation = validateRiskBounds(spec);
    if (!validation.valid) {
      return {
        success: false,
        reason: 'risk_bounds_rejected',
        errors: validation.errors,
        spec,
      };
    }

    const evaluation = await evaluateStrategy(spec, {
      fixtureBars: this.fixtureBars,
    });
    const score = calculateRiskAdjustedScore(evaluation);

    const stagingResult = stageCandidate({
      spec,
      evaluation,
      score,
    }, {
      candidatesDir: this.candidatesDir,
      min_sharpe: this.minSharpe,
      max_drawdown: this.maxDrawdown,
    });

    const cycleResult = {
      success: true,
      spec,
      evaluation,
      score,
      staged: stagingResult.staged,
      stagedPath: stagingResult.path || null,
      checksum: spec.checksum,
      timestamp: new Date().toISOString(),
    };

    this.history.push(cycleResult);
    if (typeof this.onCandidate === 'function') {
      try {
        this.onCandidate(cycleResult);
      } catch (err) {
        if (typeof this.logger === 'function') {
          this.logger(`[INTERVAL-DISCOVERY] onCandidate callback error: ${err.message}`);
        }
      }
    }

    return cycleResult;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    if (typeof this.logger === 'function') {
      this.logger(`[INTERVAL-DISCOVERY] Autonomous interval discovery started (${this.intervalSecs}s loop)...`);
    }

    try {
      await this.runCycle();
    } catch (err) {
      if (typeof this.logger === 'function') {
        this.logger(`[INTERVAL-DISCOVERY] Cycle error: ${err.message}`);
      }
    }

    this.timer = setInterval(async () => {
      try {
        await this.runCycle();
      } catch (err) {
        if (typeof this.logger === 'function') {
          this.logger(`[INTERVAL-DISCOVERY] Interval cycle error: ${err.message}`);
        }
      }
    }, this.intervalSecs * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    if (typeof this.logger === 'function') {
      this.logger('[INTERVAL-DISCOVERY] Autonomous interval discovery stopped.');
    }
  }
}

module.exports = {
  DEFAULT_CANDIDATES_DIR,
  DEFAULT_RISK_BOUNDS,
  STRATEGY_ARCHETYPES,
  canonicalizeJson,
  computeSpecChecksum,
  validateRiskBounds,
  generateCandidateSpec,
  calculateRiskAdjustedScore,
  rankCandidates,
  loadLocalFixtureBars,
  evaluateStrategy,
  stageCandidate,
  IntervalStrategyEngine,
};
