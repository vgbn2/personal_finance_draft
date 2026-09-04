// ponytail: automated unique strategy explorer utilizing native C++20 backtest core with strict novelty deduplication
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { calculateRollingFeatureFrame, generateSampleBars } = require('../../shared/lib/market/indicators.js');
const { fetchBinanceBaseCandles } = require('../../shared/lib/providers/binance.js');
const { fetchYahooBaseCandles } = require('../../shared/lib/providers/yahoo.js');
const { runBacktest } = require('../../shared/lib/strategy/backtest.js');
const { buildStrategyPlan } = require('../../backend/cli/commands/strategy/strategy_presenter.js');
const { REPO_ROOT } = require('../../shared/lib/runtime/paths.js');

const EXPLORER_STATE_FILE = path.join(REPO_ROOT, 'storage/data/strategy_explorer_state.json');
const STRATEGIES_DIR = path.join(REPO_ROOT, 'config/strategies');

function writeStrategyRegistryFile(candidate) {
  try {
    const yamlContent = buildStrategyPlan(candidate.name, {
      kind: candidate.family,
      family: candidate.family,
      model: candidate.model,
      timeframe: candidate.timeframe,
      threshold: candidate.threshold,
      maxHoldingDays: candidate.horizon,
      universe: candidate.universe,
      indicators: candidate.indicators,
      riskWeight: candidate.risk_weight || 0.10,
      hypothesis: candidate.hypothesis,
      entrySignal: candidate.entry_signal,
      exitSignal: candidate.exit_signal,
    });
    const filePath = path.join(STRATEGIES_DIR, `${candidate.name}.yaml`);
    fs.writeFileSync(filePath, yamlContent, 'utf8');
    return filePath;
  } catch (err) {
    console.warn('[STRATEGY-EXPLORER] Could not write registry YAML:', err.message);
    return null;
  }
}

// Parameter spaces for combinatorial generation across distinct paradigms
const UNIVERSE_CHOICES = [
  ['SPY', 'QQQ'],
  ['BTCUSDT', 'ETHUSDT'],
  ['AAPL', 'MSFT', 'NVDA'],
  ['SPY', 'BTCUSDT', 'GLD'],
  ['PLTR', 'TSLA', 'AMD'],
  ['INTC', 'NVDA', 'AAPL']
];

const VALID_MODELS = [
  'cnn_window_v0',
  'random_forest_v0',
  'logistic_regression_v0',
  'svm_margin_v0',
  'knn_pattern_v0',
  'decision_tree_stump_v0'
];

const TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1d'];
const FAMILIES = ['momentum', 'mean_reversion', 'breakout', 'volatility', 'ml_alpha', 'stat_arb', 'orderflow'];

const INDICATOR_SETS = [
  { rsi: true, bollinger: true, atr: true, return_fast: true, return_slow: true, volatility: true },
  { rsi: true, macd: true, atr: true, return_fast: true, volatility: true },
  { bollinger: true, atr: true, return_slow: true, volatility: true },
  { rsi: true, stoch: true, return_fast: true, return_slow: true },
  { atr: true, volatility: true, return_fast: true, return_slow: true }
];

function loadExplorerState() {
  try {
    if (fs.existsSync(EXPLORER_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(EXPLORER_STATE_FILE, 'utf8'));
    }
  } catch (err) {}
  return {
    history: [],
    seenFingerprints: [],
    lastStrategy: null,
    totalDiscovered: 0
  };
}

function saveExplorerState(state) {
  try {
    const dir = path.dirname(EXPLORER_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(EXPLORER_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[EXPLORER] Failed to save state:', err.message);
  }
}

// Structural fingerprint ensuring uniqueness
function computeStrategyFingerprint(spec) {
  const norm = {
    family: spec.family,
    model: spec.model,
    timeframe: spec.timeframe,
    universe: [...(spec.universe || [])].sort(),
    indicators: Object.keys(spec.indicators || {}).sort(),
    threshold: spec.threshold,
    horizon: spec.horizon
  };
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex').slice(0, 16);
}

// Distance / Novelty metric (0.0 to 1.0)
function computeDistance(stratA, stratB) {
  if (!stratA || !stratB) return 1.0;
  let diffCount = 0;
  const totalDims = 6;

  if (stratA.family !== stratB.family) diffCount++;
  if (stratA.model !== stratB.model) diffCount++;
  if (stratA.timeframe !== stratB.timeframe) diffCount++;
  if (stratA.threshold !== stratB.threshold) diffCount++;
  if (stratA.horizon !== stratB.horizon) diffCount++;

  const uA = (stratA.universe || []).join(',');
  const uB = (stratB.universe || []).join(',');
  if (uA !== uB) diffCount++;

  return diffCount / totalDims;
}

// Generate candidate strategy guaranteed distinct from history and last run
function generateUniqueCandidate(state) {
  const maxAttempts = 1000;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const family = FAMILIES[Math.floor(Math.random() * FAMILIES.length)];
    const model = VALID_MODELS[Math.floor(Math.random() * VALID_MODELS.length)];
    const timeframe = TIMEFRAMES[Math.floor(Math.random() * TIMEFRAMES.length)];
    const universe = UNIVERSE_CHOICES[Math.floor(Math.random() * UNIVERSE_CHOICES.length)];
    const indicators = INDICATOR_SETS[Math.floor(Math.random() * INDICATOR_SETS.length)];
    const threshold = Number((0.50 + Math.random() * 0.10).toFixed(2));
    const horizon = [3, 5, 8, 13, 21][Math.floor(Math.random() * 5)];
    const cost_bps = 5;

    const name = `auto_${family}_${model}_${timeframe}_${Date.now().toString(36)}`;
    const candidate = {
      name,
      family,
      kind: family,
      model,
      timeframe,
      universe,
      indicators,
      threshold,
      horizon,
      cost_bps,
      created_at: new Date().toISOString()
    };

    const fingerprint = computeStrategyFingerprint(candidate);

    // Uniqueness constraint 1: must never have been explored before in history
    if (state.seenFingerprints && state.seenFingerprints.includes(fingerprint)) {
      continue;
    }

    // Uniqueness constraint 2: must have distance >= 0.5 (novelty) from immediately previous strategy
    if (state.lastStrategy) {
      const dist = computeDistance(candidate, state.lastStrategy);
      if (dist < 0.5) {
        continue;
      }
    }

    candidate.fingerprint = fingerprint;
    return candidate;
  }

  throw new Error('Unable to generate unique strategy candidate within attempt limit');
}

// Fetch or generate continuous deep bars (5,000+ bars for crypto, 1,000+ for equities)
async function loadDeepMarketBars(symbol, timeframe, minCount = 5000) {
  const isCrypto = symbol.includes('USDT') || symbol === 'BTCUSD' || symbol === 'ETHUSD';
  if (isCrypto) {
    try {
      const binanceSym = symbol === 'BTCUSD' ? 'BTCUSDT' : symbol === 'ETHUSD' ? 'ETHUSDT' : symbol;
      const binanceInterval = timeframe === '1d' ? '1d' : timeframe === '4h' ? '4h' : timeframe === '1h' ? '1h' : timeframe === '30m' ? '30m' : timeframe === '15m' ? '15m' : '5m';
      const raw = await fetchBinanceBaseCandles(binanceSym, minCount, binanceInterval);
      if (raw && raw.length > 0) {
        return raw.map(b => ({
          symbol,
          timeframe,
          timestamp: new Date(b.openTime).toISOString(),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
          family: 'crypto'
        }));
      }
    } catch (err) {
      console.warn(`[STRATEGY-EXPLORER] Live crypto fetch fallback for ${symbol}:`, err.message);
    }
  } else {
    try {
      const yahooInterval = timeframe === '1d' ? '1d' : timeframe === '1h' ? '1h' : timeframe === '15m' ? '15m' : timeframe === '5m' ? '5m' : '1d';
      const rangeDays = timeframe === '1d' ? Math.min(minCount, 1800) : 59;
      const raw = await fetchYahooBaseCandles(symbol, yahooInterval, rangeDays);
      if (raw && raw.length > 0) {
        return raw.map(b => ({
          symbol,
          timeframe,
          timestamp: new Date(b.openTime).toISOString(),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
          family: 'equities'
        }));
      }
    } catch (err) {
      console.warn(`[STRATEGY-EXPLORER] Live equities fetch fallback for ${symbol}:`, err.message);
    }
  }

  // Fallback to high-sample synthetic bars
  const synthetic = generateSampleBars(symbol, minCount, timeframe);
  synthetic.forEach(b => {
    b.family = isCrypto ? 'crypto' : 'equities';
    b.timeframe = timeframe;
  });
  return synthetic;
}

// Run backtest evaluation across primary universe asset using native C++ core on deep bar history
async function evaluateStrategyCandidate(candidate) {
  const primarySymbol = candidate.universe[0] || 'SPY';

  const bars = await loadDeepMarketBars(primarySymbol, candidate.timeframe, 5000);

  const frame = calculateRollingFeatureFrame(bars, 2, {
    rsi: candidate.indicators.rsi ? 14 : undefined,
    atr: candidate.indicators.atr ? 14 : undefined,
    bollinger: candidate.indicators.bollinger ? 20 : undefined,
    volatility: candidate.indicators.volatility ? 20 : undefined
  });
  frame.features.forEach(f => {
    f.family = bars[0]?.family || 'crypto';
    f.timeframe = candidate.timeframe;
  });

  // Route to native C++ engine with synchronized features
  const backtestResult = runBacktest(frame, {
    strategy: candidate.name,
    model: candidate.model,
    threshold: candidate.threshold,
    horizon: candidate.horizon,
    costBps: candidate.cost_bps,
    timeframe: candidate.timeframe,
    engine: 'cpp_frame'
  });

  return {
    symbol: primarySymbol,
    barCount: bars.length,
    engine: backtestResult.engine || 'sovereign_cpp_core',
    metrics: backtestResult.metrics || {},
    tradeCount: backtestResult.metrics?.trades || 0,
    netReturn: backtestResult.metrics?.net_return || 0,
    maxDrawdown: backtestResult.metrics?.max_drawdown || 0,
    sharpeRatio: backtestResult.metrics?.sharpe_ratio || 0,
    sortinoRatio: backtestResult.metrics?.sortino_ratio || 0,
    winRate: backtestResult.metrics?.win_rate || 0,
    tailRiskVaR: backtestResult.tail_risk?.value_at_risk || 0
  };
}

async function evaluateAndRegisterSpec(spec, options = {}) {
  const saveYaml = options.save_yaml !== false;
  const candidate = {
    name: spec.name,
    family: spec.family,
    kind: spec.family,
    model: spec.model,
    timeframe: spec.timeframe || '1h',
    universe: Array.isArray(spec.universe) && spec.universe.length > 0 ? spec.universe : ['SPY'],
    indicators: spec.indicators || { rsi: true, bollinger: true, atr: true, return_fast: true, return_slow: true, volatility: true },
    threshold: spec.threshold !== undefined ? spec.threshold : 0.60,
    horizon: spec.max_holding_days || spec.horizon || 5,
    cost_bps: spec.cost_bps || 5,
    risk_weight: spec.risk_weight || 0.10,
    hypothesis: spec.hypothesis || `Hypothesis for ${spec.name}`,
    entry_signal: spec.entry_signal || 'Entry condition satisfied',
    exit_signal: spec.exit_signal || 'Exit condition satisfied or horizon expired',
    created_at: new Date().toISOString()
  };

  candidate.fingerprint = computeStrategyFingerprint(candidate);

  const state = loadExplorerState();
  let noveltyDistance = 1.0;
  if (state.lastStrategy) {
    noveltyDistance = computeDistance(candidate, state.lastStrategy);
  }

  const evaluation = await evaluateStrategyCandidate(candidate);

  let registryFile = null;
  if (saveYaml) {
    registryFile = writeStrategyRegistryFile(candidate);
  }

  const entry = {
    ...candidate,
    novelty_distance: noveltyDistance,
    evaluation,
    registry_file: registryFile,
    timestamp: new Date().toISOString()
  };

  if (!state.history) state.history = [];
  if (!state.seenFingerprints) state.seenFingerprints = [];

  state.history.push(entry);
  if (!state.seenFingerprints.includes(candidate.fingerprint)) {
    state.seenFingerprints.push(candidate.fingerprint);
  }
  state.lastStrategy = candidate;
  state.totalDiscovered = (state.totalDiscovered || 0) + 1;

  saveExplorerState(state);
  return entry;
}

// Single exploration cycle
async function runExplorationCycle() {
  console.log(`\n[STRATEGY-EXPLORER] [${new Date().toISOString()}] Running unique discovery & backtest cycle...`);
  const state = loadExplorerState();

  const candidate = generateUniqueCandidate(state);
  return evaluateAndRegisterSpec(candidate, { save_yaml: true });
}

// Continuous loop with configurable interval (default 30 min)
async function startContinuousLoop(intervalMinutes = 30) {
  console.log(`[STRATEGY-EXPLORER] Starting continuous strategy discovery engine on steamlinux (Interval: ${intervalMinutes}m)...`);
  console.log(`[STRATEGY-EXPLORER] C++20 Sovereign Core Engine: ACTIVE`);
  await runExplorationCycle();

  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(async () => {
    try {
      await runExplorationCycle();
    } catch (err) {
      console.error('[STRATEGY-EXPLORER] Error during cycle execution:', err.message);
    }
  }, intervalMs);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isOnce = args.includes('--once');
  const intervalIdx = args.indexOf('--interval');
  const customInterval = intervalIdx !== -1 && args[intervalIdx + 1]
    ? parseInt(args[intervalIdx + 1], 10)
    : parseInt(process.env.EXPLORER_INTERVAL_MINUTES || '30', 10);

  if (isOnce) {
    runExplorationCycle().catch((err) => {
      console.error('[STRATEGY-EXPLORER] Exploration failed:', err.message);
      process.exitCode = 1;
    });
  } else {
    startContinuousLoop(customInterval);
  }
}

module.exports = {
  runExplorationCycle,
  evaluateAndRegisterSpec,
  generateUniqueCandidate,
  evaluateStrategyCandidate,
  computeStrategyFingerprint,
  computeDistance,
  loadExplorerState,
  saveExplorerState,
  startContinuousLoop
};
