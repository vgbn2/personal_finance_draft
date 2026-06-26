const FEATURE_NAMES = [
  'return_fast',
  'return_slow',
  'volatility',
  'rsi',
  'macd',
  'atr',
  'smc_score',
  'divergence_score',
  'gamma',
  'theta',
  'vega',
  'kalman',
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function valueOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function logistic(value) {
  return 1 / (1 + Math.exp(-value));
}

function signalParts(feature) {
  const close = Math.max(valueOrZero(feature.close), 1);
  const return1 = valueOrZero(feature.return_fast);
  const return5 = valueOrZero(feature.return_slow);
  const volatility = valueOrZero(feature.volatility);
  const rsi = valueOrZero(feature.rsi);
  const macdNorm = valueOrZero(feature.macd) / close;
  const atrPct = valueOrZero(feature.atr) / close;
  const smcScore = valueOrZero(feature.smc_score);
  const divergenceScore = valueOrZero(feature.divergence_score);
  const sessionProfilePosition = valueOrZero(feature.session_volume_profile_position);
  const sessionProfileImbalance = valueOrZero(feature.session_volume_profile_imbalance);
  const gamma = valueOrZero(feature.gamma);
  const theta = valueOrZero(feature.theta);
  const vega = valueOrZero(feature.vega);
  const kalman = valueOrZero(feature.kalman);
  const trend = return5 * 8 + macdNorm * 20 + smcScore * 2 + sessionProfileImbalance * 4;
  const meanReversion = (50 - rsi) / 100 + divergenceScore * 0.5 + (sessionProfilePosition > 0.8 ? -0.15 : sessionProfilePosition < 0.2 ? 0.15 : 0);
  const breakout = return1 * 6 - volatility + smcScore + (sessionProfilePosition > 0.7 ? 0.5 : 0);
  const riskPenalty = volatility * 2 + atrPct;
  return {
    atrPct,
    breakout,
    divergenceScore,
    macdNorm,
    meanReversion,
    return1,
    return5,
    riskPenalty,
    smcScore,
    sessionProfileImbalance,
    sessionProfilePosition,
    rsi,
    trend,
    volatility,
    gamma,
    theta,
    vega,
    kalman,
  };
}

function predictionFromScore(score, confidenceScale = 1) {
  return {
    direction: score > 0 ? 'long' : 'flat',
    confidence: clamp(0.5 + Math.abs(score) * confidenceScale, 0, 1),
    raw_score: score,
  };
}

const modelCandidates = [
  {
    name: 'cnn_window_v0',
    family: 'neural',
    status: 'deterministic_adapter',
    description: 'convolution-style scorer over latest technical feature row',
    predict(feature) {
      const p = signalParts(feature);
      // confidenceScale=3 calibrates for real daily return magnitudes (~0.01–0.03 range)
      return predictionFromScore(p.trend + p.meanReversion * 0.25 - p.riskPenalty, 3);
    },
  },
  {
    name: 'xgboost_ranker_v0',
    family: 'boosting',
    status: 'deterministic_adapter',
    description: 'XGBoost-style boosted-tree ranker using nonlinear feature interactions',
    predict(feature) {
      const p = signalParts(feature);
      const score = (p.return5 > 0 ? 0.08 : -0.03) +
        (p.rsi < 45 ? 0.05 : 0) +
        (p.macdNorm > 0 ? 0.04 : -0.02) -
        p.volatility * 1.2 +
        p.return1 * p.return5 * 20;
      return predictionFromScore(score, 2);
    },
  },
  {
    name: 'gradient_boosted_trees_v0',
    family: 'boosting',
    status: 'deterministic_adapter',
    description: 'gradient-boosted decision tree style ensemble over momentum, RSI, and risk',
    predict(feature) {
      const p = signalParts(feature);
      const score = (p.trend > 0 ? 0.07 : -0.04) +
        (p.rsi >= 45 && p.rsi <= 65 ? 0.04 : -0.02) +
        (p.volatility < 0.025 ? 0.03 : -0.04) -
        p.atrPct;
      return predictionFromScore(score, 2);
    },
  },
  {
    name: 'random_forest_v0',
    family: 'trees',
    status: 'deterministic_adapter',
    description: 'random-forest style majority vote across simple technical regimes',
    predict(feature) {
      const p = signalParts(feature);
      const votes = [
        p.return5 > 0,
        p.return1 > 0,
        p.macdNorm > 0,
        p.rsi < 70,
        p.volatility < 0.035,
      ];
      const longVotes = votes.filter(Boolean).length;
      const score = (longVotes - (votes.length / 2)) / votes.length;
      return predictionFromScore(score, 1.5);
    },
  },
  {
    name: 'decision_tree_stump_v0',
    family: 'trees',
    status: 'deterministic_adapter',
    description: 'single decision tree stump for fast sanity checks',
    predict(feature) {
      const p = signalParts(feature);
      const score = p.return5 > 0 && p.rsi < 68 ? 0.12 : -0.08;
      return predictionFromScore(score, 1.5);
    },
  },
  {
    name: 'logistic_regression_v0',
    family: 'linear',
    status: 'deterministic_adapter',
    description: 'logistic linear margin over normalized technical features',
    predict(feature) {
      const p = signalParts(feature);
      const margin = p.return5 * 18 + p.return1 * 4 + p.macdNorm * 30 - p.volatility * 5 + (50 - Math.abs(p.rsi - 55)) / 150;
      const probability = logistic(margin);
      return { direction: probability >= 0.55 ? 'long' : 'flat', confidence: probability, raw_score: margin };
    },
  },
  {
    name: 'svm_margin_v0',
    family: 'linear',
    status: 'deterministic_adapter',
    description: 'support-vector style margin around trend and volatility boundaries',
    predict(feature) {
      const p = signalParts(feature);
      const margin = p.trend * 1.4 - p.volatility * 3 + (p.rsi < 72 ? 0.04 : -0.08);
      return predictionFromScore(margin, 1.4);
    },
  },
  {
    name: 'knn_pattern_v0',
    family: 'instance_based',
    status: 'deterministic_adapter',
    description: 'nearest-neighbor style pattern proxy using return and RSI similarity bands',
    predict(feature) {
      const p = signalParts(feature);
      const calmTrend = p.return5 > 0 && p.volatility < 0.03;
      const oversoldBounce = p.rsi < 42 && p.return1 > -0.015;
      const score = (calmTrend ? 0.09 : -0.02) + (oversoldBounce ? 0.07 : 0) - p.atrPct;
      return predictionFromScore(score, 1.7);
    },
  },
  {
    name: 'naive_bayes_regime_v0',
    family: 'probabilistic',
    status: 'deterministic_adapter',
    description: 'naive-Bayes style regime score from independent technical likelihood buckets',
    predict(feature) {
      const p = signalParts(feature);
      const trendLikelihood = p.return5 > 0 ? 0.62 : 0.42;
      const rsiLikelihood = p.rsi < 65 ? 0.58 : 0.35;
      const volLikelihood = p.volatility < 0.035 ? 0.6 : 0.4;
      const probability = (trendLikelihood * rsiLikelihood * volLikelihood) /
        ((trendLikelihood * rsiLikelihood * volLikelihood) + ((1 - trendLikelihood) * (1 - rsiLikelihood) * (1 - volLikelihood)));
      return { direction: probability >= 0.55 ? 'long' : 'flat', confidence: clamp(probability, 0, 1), raw_score: probability - 0.5 };
    },
  },
  {
    name: 'lstm_sequence_v0',
    family: 'neural',
    status: 'deterministic_adapter',
    description: 'sequence-model proxy emphasizing persistent multi-bar momentum',
    predict(feature) {
      const p = signalParts(feature);
      const persistence = Math.sign(p.return1) === Math.sign(p.return5) ? Math.abs(p.return5) : -Math.abs(p.return1);
      return predictionFromScore(persistence * 10 + p.macdNorm * 20 - p.volatility, 1.2);
    },
  },
  {
    name: 'transformer_attention_v0',
    family: 'neural',
    status: 'deterministic_adapter',
    description: 'attention-style scorer weighting trend, volatility, and mean-reversion context',
    predict(feature) {
      const p = signalParts(feature);
      const trendWeight = p.volatility < 0.025 ? 0.65 : 0.35;
      const reversionWeight = 1 - trendWeight;
      const score = p.trend * trendWeight + p.meanReversion * reversionWeight - p.riskPenalty * 0.5;
      return predictionFromScore(score, 1.2);
    },
  },
  {
    name: 'momentum_baseline_v0',
    family: 'baseline',
    status: 'deterministic_adapter',
    description: 'long when 5-period return is positive',
    predict(feature) {
      const score = valueOrZero(feature.close_return_5);
      return predictionFromScore(score, 10);
    },
  },
  {
    name: 'mean_reversion_baseline_v0',
    family: 'baseline',
    status: 'deterministic_adapter',
    description: 'long when RSI is washed out, flat when overbought',
    predict(feature) {
      const rsi = valueOrZero(feature.rsi_14);
      const score = (50 - rsi) / 100;
      return { direction: rsi < 45 ? 'long' : 'flat', confidence: clamp(0.5 + Math.abs(score), 0, 1), raw_score: score };
    },
  },
  {
    name: 'volatility_breakout_v0',
    family: 'baseline',
    status: 'deterministic_adapter',
    description: 'long when trend is positive and realized volatility is not elevated',
    predict(feature) {
      const p = signalParts(feature);
      return predictionFromScore(p.breakout, 1);
    },
  },
];

function summarizeReturns(returns) {
  const wins = returns.filter((value) => value > 0).length;
  const avg = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (returns.length - 1) : 0;
  return {
    hit_rate: returns.length ? wins / returns.length : 0,
    expectancy: avg,
    sharpe_like: variance > 0 ? avg / Math.sqrt(variance) : 0,
    total_return: returns.reduce((equity, value) => equity * (1 + value), 1) - 1,
  };
}

function scoreModel(features, model, horizon = 5, threshold = 0.55) {
  const bySymbol = new Map();
  for (const feature of features) {
    if (!bySymbol.has(feature.key)) bySymbol.set(feature.key, []);
    bySymbol.get(feature.key).push(feature);
  }

  const trades = [];
  for (const rows of bySymbol.values()) {
    rows.sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));
    for (let i = 0; i + horizon < rows.length; i += 1) {
      const prediction = model.predict(rows[i]);
      if (prediction.direction !== 'long' || prediction.confidence < threshold) {
        continue;
      }
      const entry = rows[i].close;
      const exit = rows[i + horizon].close;
      if (!entry || !exit) continue;
      trades.push({
        model: model.name,
        symbol: rows[i].symbol,
        entry_time: rows[i].as_of,
        exit_time: rows[i + horizon].as_of,
        entry,
        exit,
        return: exit / entry - 1,
        confidence: prediction.confidence,
        raw_score: prediction.raw_score,
      });
    }
  }

  return summarizeTrades(model, trades);
}

function summarizeTrades(model, trades) {
  const returns = trades.map((trade) => trade.return);
  const overall = summarizeReturns(returns);
  const symbols = [...new Set(trades.map((trade) => trade.symbol))].sort();
  const by_symbol = symbols.map((symbol) => {
    const symbolTrades = trades.filter((trade) => trade.symbol === symbol);
    return {
      symbol,
      trades: symbolTrades.length,
      ...summarizeReturns(symbolTrades.map((trade) => trade.return)),
    };
  }).sort((a, b) => b.sharpe_like - a.sharpe_like || b.total_return - a.total_return);
  const robustness_score = overall.sharpe_like + overall.expectancy * 10 + Math.min(trades.length, 25) / 100;
  return {
    name: model.name,
    family: model.family,
    status: model.status,
    description: model.description,
    feature_names: FEATURE_NAMES,
    trades: trades.length,
    robustness_score,
    ...overall,
    by_symbol,
    sample_trades: trades.slice(0, 5),
  };
}

function perSymbolWinners(models) {
  const symbols = new Set();
  for (const model of models) {
    for (const row of model.by_symbol || []) symbols.add(row.symbol);
  }
  return [...symbols].sort().map((symbol) => {
    const candidates = models
      .map((model) => {
        const metrics = (model.by_symbol || []).find((row) => row.symbol === symbol);
        return metrics ? { model: model.name, family: model.family, ...metrics } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.sharpe_like - a.sharpe_like || b.total_return - a.total_return);
    return {
      symbol,
      winner: candidates[0] ? candidates[0].model : null,
      candidates: candidates.slice(0, 5),
    };
  });
}

// Real trained ONNX models — predictions precomputed onto feature._onnxPred before backtest runs.
// predict() reads _onnxPred synchronously so the existing sync backtest loop is unchanged.
const onnxModelCandidates = ['xgboost_v1', 'logistic_v1', 'regime_classifier'].map((name) => ({
  name,
  family: 'onnx',
  status: 'onnx_model',
  description: `Trained ONNX model (${name}) — use precomputeForFeatures() before runBacktestJs`,
  predict(feature) {
    if (feature._onnxPred) {
      const { direction, confidence } = feature._onnxPred;
      return { direction: direction === 'up' ? 'long' : 'flat', confidence };
    }
    return { direction: 'flat', confidence: 0 };
  },
}));

// Short names used in strategy YAMLs → canonical model names
const MODEL_ALIASES = {
  xgboost:   'xgboost_v1',
  cnn_v3:    'cnn_window_v0',
  lstm_v1:   'lstm_sequence_v0',
  cnn:       'cnn_window_v0',
  lstm:      'lstm_sequence_v0',
  rf:        'random_forest_v0',
  dt:        'decision_tree_stump_v0',
  lr:        'logistic_v1',
  logistic:  'logistic_v1',
  svm:       'svm_margin_v0',
  regime:    'regime_classifier',
};

const ONNX_MODEL_NAMES = new Set(['xgboost_v1', 'logistic_v1', 'regime_classifier']);

function resolveModel(name) {
  const canonical = MODEL_ALIASES[name] || name;
  const found = onnxModelCandidates.find((c) => c.name === canonical) ||
    modelCandidates.find((c) => c.name === canonical);
  if (found) return found;
  const fallback = modelCandidates[0];
  console.warn(`[models] Unknown model "${name}" (canonical: "${canonical}") — falling back to ${fallback.name}`);
  return fallback;
}

function compareModels(featureFrame, options = {}) {
  const horizon = options.horizon || 5;
  const threshold = options.threshold || 0.55;
  const results = modelCandidates
    .map((model) => scoreModel(featureFrame.features || [], model, horizon, threshold))
    .sort((a, b) => b.robustness_score - a.robustness_score || b.sharpe_like - a.sharpe_like || b.total_return - a.total_return);
  return {
    generated_at: new Date().toISOString(),
    horizon,
    threshold,
    feature_count: featureFrame.features ? featureFrame.features.length : 0,
    candidate_count: modelCandidates.length,
    families: [...new Set(modelCandidates.map((model) => model.family))].sort(),
    winner: results[0] ? results[0].name : null,
    per_symbol_winners: perSymbolWinners(results),
    models: results,
  };
}

module.exports = {
  FEATURE_NAMES,
  MODEL_ALIASES,
  ONNX_MODEL_NAMES,
  compareModels,
  modelCandidates,
  onnxModelCandidates,
  perSymbolWinners,
  resolveModel,
  scoreModel,
};
