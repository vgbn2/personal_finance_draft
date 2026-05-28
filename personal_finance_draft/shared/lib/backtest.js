const { modelCandidates } = require('./models');

function maxDrawdown(equityCurve) {
  let peak = 1;
  let max = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    max = Math.max(max, peak > 0 ? (peak - point.equity) / peak : 0);
  }
  return max;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sampleStddev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function quantile(values, q) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) return null;
  const sorted = [...finiteValues].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(1, q));
  const index = (sorted.length - 1) * clamped;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function createSeededRandom(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return function random() {
    seed += seed << 13;
    seed ^= seed >>> 7;
    seed += seed << 3;
    seed ^= seed >>> 17;
    seed += seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

function periodsPerYear(timeframe) {
  switch (timeframe) {
  case '5m': return 252 * 78;
  case '15m': return 252 * 26;
  case '30m': return 252 * 13;
  case '1h': return 252 * 6.5;
  case '4h': return 252 * 2;
  case '1d':
  default: return 252;
  }
}

function annualizedSharpe(returns, timeframe, horizon) {
  const deviation = sampleStddev(returns);
  if (returns.length < 2 || deviation === 0) return null;
  return (mean(returns) / deviation) * Math.sqrt(periodsPerYear(timeframe) / Math.max(horizon, 1));
}

function annualizedSortino(returns, timeframe, horizon) {
  const downside = returns.filter((value) => value < 0);
  const downsideDeviation = sampleStddev(downside);
  if (returns.length < 2 || downside.length < 2 || downsideDeviation === 0) return null;
  return (mean(returns) / downsideDeviation) * Math.sqrt(periodsPerYear(timeframe) / Math.max(horizon, 1));
}

function historicalTailRisk(returns, alpha = 0.05) {
  const finiteReturns = returns.filter((value) => Number.isFinite(value));
  if (!finiteReturns.length) return null;
  const threshold = quantile(finiteReturns, alpha);
  if (threshold === null) return null;
  const tail = finiteReturns.filter((value) => value <= threshold);
  return {
    alpha,
    value_at_risk: threshold,
    expected_shortfall: tail.length ? mean(tail) : threshold,
    tail_count: tail.length,
    sample_size: finiteReturns.length,
  };
}

function monteCarloStress(returns, options = {}) {
  const finiteReturns = returns.filter((value) => Number.isFinite(value));
  if (!finiteReturns.length) return null;
  const runs = Math.max(100, Math.floor(options.runs || 1000));
  const seedText = options.seed || `${finiteReturns.length}:${finiteReturns.reduce((sum, value) => sum + value, 0).toFixed(8)}`;
  const random = createSeededRandom(seedText);
  const finals = [];
  const drawdowns = [];

  for (let run = 0; run < runs; run += 1) {
    let equity = 1;
    let peak = 1;
    let maxRunDrawdown = 0;
    for (let i = 0; i < finiteReturns.length; i += 1) {
      const sampleIndex = Math.floor(random() * finiteReturns.length);
      const nextReturn = finiteReturns[sampleIndex];
      equity *= 1 + nextReturn;
      peak = Math.max(peak, equity);
      maxRunDrawdown = Math.max(maxRunDrawdown, peak > 0 ? (peak - equity) / peak : 0);
    }
    finals.push(equity);
    drawdowns.push(maxRunDrawdown);
  }

  const sortedFinals = [...finals].sort((a, b) => a - b);
  const sortedDrawdowns = [...drawdowns].sort((a, b) => a - b);
  return {
    runs,
    seed: seedText,
    sample_size: finiteReturns.length,
    mean_final_return: mean(finals) - 1,
    median_final_return: quantile(sortedFinals, 0.5) - 1,
    p05_final_return: quantile(sortedFinals, 0.05) - 1,
    p95_final_return: quantile(sortedFinals, 0.95) - 1,
    probability_of_loss: finals.filter((value) => value < 1).length / runs,
    mean_max_drawdown: mean(drawdowns),
    p95_max_drawdown: quantile(sortedDrawdowns, 0.95),
  };
}

function withinDateRange(row, from, to) {
  const stamp = Date.parse(row.as_of);
  if (!Number.isFinite(stamp)) return false;
  if (from && stamp < Date.parse(from)) return false;
  if (to && stamp > Date.parse(to)) return false;
  return true;
}

function filterFeatureFrame(featureFrame, options = {}) {
  const timeframe = options.timeframe || null;
  const from = options.from || null;
  const to = options.to || null;
  const features = (featureFrame.features || []).filter((feature) => {
    if (timeframe && feature.timeframe !== timeframe) return false;
    return withinDateRange(feature, from, to);
  });
  return { ...featureFrame, features, feature_count: features.length };
}

function splitFeatureFrame(featureFrame, trainRatio = 0.7) {
  const byKey = new Map();
  for (const feature of featureFrame.features || []) {
    if (!byKey.has(feature.key)) byKey.set(feature.key, []);
    byKey.get(feature.key).push(feature);
  }

  const train = [];
  const test = [];
  for (const rows of byKey.values()) {
    rows.sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));
    const splitIndex = Math.max(1, Math.min(rows.length - 1, Math.floor(rows.length * trainRatio)));
    train.push(...rows.slice(0, splitIndex));
    test.push(...rows.slice(splitIndex));
  }

  return {
    train: { ...featureFrame, features: train, feature_count: train.length },
    test: { ...featureFrame, features: test, feature_count: test.length },
  };
}

function runBacktest(featureFrame, options = {}) {
  const strategy = options.strategy || 'cnn_momentum';
  const modelName = options.model || 'cnn_window_v0';
  const threshold = options.threshold || 0.55;
  const horizon = options.horizon || 5;
  const costBps = options.costBps != null ? options.costBps : 5;
  const feeBps = options.feeBps != null ? options.feeBps : costBps / 2;
  const slippageBps = options.slippageBps != null ? options.slippageBps : costBps / 2;
  const timeframe = options.timeframe || null;
  const from = options.from || null;
  const to = options.to || null;
  const tailAlpha = options.tailAlpha != null ? options.tailAlpha : 0.05;
  const monteCarloRuns = options.monteCarloRuns != null ? options.monteCarloRuns : 1000;
  const model = modelCandidates.find((candidate) => candidate.name === modelName) || modelCandidates[0];
  const byKey = new Map();

  const filteredFrame = filterFeatureFrame(featureFrame, { timeframe, from, to });
  for (const feature of filteredFrame.features || []) {
    if (!byKey.has(feature.key)) byKey.set(feature.key, []);
    byKey.get(feature.key).push(feature);
  }

  const trades = [];
  const equityCurve = [{ timestamp: null, equity: 1 }];
  let equity = 1;

  for (const rows of byKey.values()) {
    rows.sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));
    for (let i = 0; i + horizon < rows.length; i += horizon) {
      const prediction = model.predict(rows[i]);
      if (prediction.direction !== 'long' || prediction.confidence < threshold) {
        continue;
      }
      const entry = rows[i].close;
      const exit = rows[i + horizon].close;
      if (!entry || !exit) continue;
      const grossReturn = exit / entry - 1;
      const entryDrag = (feeBps + slippageBps) / 10000;
      const exitDrag = (feeBps + slippageBps) / 10000;
      const adjustedEntry = entry * (1 + entryDrag);
      const adjustedExit = exit * (1 - exitDrag);
      const netReturn = adjustedExit / adjustedEntry - 1;
      equity *= 1 + netReturn;
      const trade = {
        strategy,
        model: model.name,
        symbol: rows[i].symbol,
        timeframe: rows[i].timeframe,
        provider: rows[i].provider || null,
        entry_time: rows[i].as_of,
        exit_time: rows[i + horizon].as_of,
        entry,
        exit,
        gross_return: grossReturn,
        net_return: netReturn,
        fee_bps: feeBps,
        slippage_bps: slippageBps,
        round_trip_cost_bps: feeBps * 2 + slippageBps * 2,
        cost_drag: grossReturn - netReturn,
        holding_period_bars: horizon,
        confidence: prediction.confidence,
      };
      trades.push(trade);
      equityCurve.push({ timestamp: trade.exit_time, equity });
    }
  }

  const returns = trades.map((trade) => trade.net_return);
  const wins = returns.filter((value) => value > 0).length;
  const losses = returns.filter((value) => value < 0);
  const avgWin = mean(returns.filter((value) => value > 0));
  const avgLoss = mean(losses);
  const primaryTimeframe = timeframe || (trades[0] && trades[0].timeframe) || '1d';
  const tailRisk = historicalTailRisk(returns, tailAlpha);
  const monteCarlo = monteCarloStress(returns, { runs: monteCarloRuns });
  return {
    generated_at: new Date().toISOString(),
    strategy,
    model: model.name,
    timeframe: primaryTimeframe,
    period: { from, to },
    threshold,
    horizon,
    cost_bps: costBps,
    fee_bps: feeBps,
    slippage_bps: slippageBps,
    metrics: {
      trades: trades.length,
      net_return: equity - 1,
      gross_return: trades.reduce((acc, trade) => acc * (1 + trade.gross_return), 1) - 1,
      max_drawdown: maxDrawdown(equityCurve),
      sharpe_ratio: annualizedSharpe(returns, primaryTimeframe, horizon),
      sortino_ratio: annualizedSortino(returns, primaryTimeframe, horizon),
      win_rate: trades.length ? wins / trades.length : 0,
      hit_rate: trades.length ? wins / trades.length : 0,
      expectancy: trades.length ? mean(returns) : 0,
      expected_value: trades.length ? mean(returns) : 0,
      average_win: avgWin,
      average_loss: avgLoss,
      payoff_ratio: avgLoss < 0 ? avgWin / Math.abs(avgLoss) : null,
      turnover: trades.length,
      tail_risk: tailRisk,
      monte_carlo: monteCarlo,
    },
    equity_curve: equityCurve,
    trade_logs: trades,
    trades,
    skipped: featureFrame.skipped || [],
  };
}

module.exports = {
  filterFeatureFrame,
  historicalTailRisk,
  monteCarloStress,
  runBacktest,
  splitFeatureFrame,
  quantile,
};
