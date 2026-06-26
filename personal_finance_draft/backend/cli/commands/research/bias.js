'use strict';

const { optionValue, hasFlag, printPayload } = require('../../lib/utils.js');
const { STORAGE_TS_DIR } = require('../../../../shared/lib/runtime/paths.js');
const { readTsIndexSince } = require('../../../../shared/lib/market/validation.js');
const { fitHmm, permutationEntropy } = require('../../../../shared/lib/ml/hmm.js');

const TF_CONFIG = [
  { tf: '1m',  label: 'scalp',       horizon: '1–5 min',    lookbackDays: 2,    expiresBars: 3  },
  { tf: '5m',  label: 'micro',       horizon: '15–30 min',  lookbackDays: 4,    expiresBars: 3  },
  { tf: '15m', label: 'intraday-s',  horizon: '1–2 hrs',    lookbackDays: 7,    expiresBars: 4  },
  { tf: '1h',  label: 'intraday',    horizon: '4–8 hrs',    lookbackDays: 21,   expiresBars: 4  },
  { tf: '4h',  label: 'short-term',  horizon: '1–3 days',   lookbackDays: 60,   expiresBars: 3  },
  { tf: '1d',  label: 'medium-term', horizon: '1–3 weeks',  lookbackDays: 400,  expiresBars: 7  },
  { tf: '1w',  label: 'long-term',   horizon: '1–3 months', lookbackDays: 1460, expiresBars: 4  },
];

function computeRsi(closes, period = 14) {
  if (closes.length < period + 2) return null;
  const window = closes.slice(-(period + 2));
  let gains = 0, losses = 0;
  for (let i = 1; i < window.length; i++) {
    const d = window[i] - window[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const rs = gains / (losses || 0.0001);
  return 100 - 100 / (1 + rs);
}

function computeSma(closes, period) {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function computeAtrPct(bars, period = 14) {
  if (bars.length < period + 1) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    sum += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev));
  }
  return (sum / period) / bars[bars.length - 1].close * 100;
}

function computeZScore(closes, period = 20) {
  if (closes.length < period) return null;
  const window = closes.slice(-period);
  const mean = window.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  return sd === 0 ? 0 : (closes[closes.length - 1] - mean) / sd;
}

function analyzeTimeframe({ tf, label, horizon, lookbackDays, expiresBars }, symbol) {
  const sinceMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const bars = readTsIndexSince(STORAGE_TS_DIR, symbol, tf, sinceMs);
  if (bars.length < 20) return { tf, label, horizon, expiresBars, error: 'insufficient data', bars: bars.length };

  const closes = bars.map(b => b.close);
  const last = closes[closes.length - 1];
  const rsi = computeRsi(closes);
  const sma20 = computeSma(closes, 20);
  const sma50 = computeSma(closes, 50);
  const sma200 = computeSma(closes, 200);
  const zScore = computeZScore(closes);
  const atrPct = computeAtrPct(bars);

  // Trend: 3 of last 5 closes making lower lows = down; higher highs = up
  const recent = closes.slice(-5);
  const trendUp = recent[4] > recent[2] && recent[2] > recent[0];
  const trendDown = recent[4] < recent[2] && recent[2] < recent[0];
  const trend = trendUp ? 'up' : trendDown ? 'down' : 'sideways';

  // Score: each factor votes -1 (short), 0 (neutral), +1 (long)
  const votes = [];
  if (rsi !== null) votes.push(rsi < 30 ? 1 : rsi > 70 ? -1 : rsi < 45 ? -0.5 : rsi > 55 ? 0.5 : 0);
  if (sma20 !== null) votes.push(last > sma20 ? 1 : -1);
  if (sma50 !== null) votes.push(last > sma50 ? 1 : -1);
  if (zScore !== null) votes.push(zScore < -2 ? 0.5 : zScore > 2 ? -0.5 : zScore < -1 ? 0.25 : zScore > 1 ? -0.25 : 0);
  votes.push(trend === 'up' ? 1 : trend === 'down' ? -1 : 0);

  const score = votes.reduce((a, b) => a + b, 0) / votes.length;
  const bias = score > 0.2 ? 'long' : score < -0.2 ? 'short' : 'neutral';
  const confidence = Math.min(1, Math.abs(score)).toFixed(2);

  // Log-returns for HMM + entropy (at most last 500 bars to cap latency on 1m)
  const logReturns = [];
  const closesForHmm = closes.length > 500 ? closes.slice(-500) : closes;
  for (let i = 1; i < closesForHmm.length; i++) {
    if (closesForHmm[i] > 0 && closesForHmm[i-1] > 0)
      logReturns.push(Math.log(closesForHmm[i] / closesForHmm[i-1]));
  }
  const regime = fitHmm(logReturns);
  const entropy = permutationEntropy(closesForHmm.slice(-200), 3);

  return {
    tf, label, horizon, expiresBars, bars: bars.length,
    last: +last.toFixed(2),
    rsi: rsi !== null ? +rsi.toFixed(1) : null,
    sma20: sma20 !== null ? +sma20.toFixed(0) : null,
    sma50: sma50 !== null ? +sma50.toFixed(0) : null,
    sma200: sma200 !== null ? +sma200.toFixed(0) : null,
    zScore: zScore !== null ? +zScore.toFixed(2) : null,
    atrPct: atrPct !== null ? +atrPct.toFixed(2) : null,
    trend, bias, confidence: +confidence, score: +score.toFixed(3),
    regime: regime ? regime.label : null,
    regimeProbs: regime ? { trending: regime.trendingProb, choppy: regime.choppyProb } : null,
    entropy,
  };
}

function aggregateBias(timeframes) {
  const valid = timeframes.filter(t => !t.error && t.bias);
  if (valid.length === 0) return { bias: 'neutral', confidence: 0, aligned: false };

  // Weight: long-term counts most for structural bias; scalp/micro timeframes are noise at this scale
  const weights = { '1m': 0.2, '5m': 0.3, '15m': 0.5, '1h': 0.7, '4h': 1, '1d': 2, '1w': 3 };
  let weightedScore = 0, totalWeight = 0;
  for (const t of valid) {
    const w = weights[t.tf] || 1;
    weightedScore += t.score * w;
    totalWeight += w;
  }
  const aggScore = weightedScore / totalWeight;
  const bias = aggScore > 0.15 ? 'long' : aggScore < -0.15 ? 'short' : 'neutral';
  const confidence = Math.min(1, Math.abs(aggScore));
  const aligned = valid.every(t => t.bias === valid[0].bias);

  return { bias, confidence: +confidence.toFixed(2), aligned, score: +aggScore.toFixed(3) };
}

function renderTable(symbol, result) {
  const RESET = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[90m', RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m';
  const biasColor = (b) => b === 'long' ? GREEN : b === 'short' ? RED : YELLOW;
  const confBar = (c) => { const f = Math.round(c * 10); return `[${'█'.repeat(f)}${'░'.repeat(10 - f)}]`; };

  console.log(`\n${BOLD}${CYAN}BIAS — ${symbol}${RESET}  ${DIM}${new Date().toUTCString()}${RESET}`);
  console.log(DIM + '─'.repeat(72) + RESET);

  const agg = result.aggregate;
  const ac = biasColor(agg.bias);
  console.log(`${BOLD}Overall:${RESET}  ${ac}${BOLD}${agg.bias.toUpperCase()}${RESET}  confidence ${confBar(agg.confidence)} ${(agg.confidence * 100).toFixed(0)}%  ${agg.aligned ? `${GREEN}✔ aligned${RESET}` : `${YELLOW}⚠ mixed${RESET}`}`);

  if (result.ml) {
    const ml = result.ml;
    const mc = biasColor(ml.direction === 'up' ? 'long' : ml.direction === 'down' ? 'short' : 'neutral');
    console.log(`${BOLD}ML (${ml.model}):${RESET}  ${mc}${BOLD}${ml.direction.toUpperCase()}${RESET}  confidence ${confBar(ml.confidence)} ${(ml.confidence * 100).toFixed(0)}%`);
  }

  console.log(DIM + '─'.repeat(88) + RESET);
  console.log(`${BOLD}${'TF'.padEnd(5)} ${'Bias'.padEnd(8)} ${'RSI'.padEnd(6)} ${'vs SMA20'.padEnd(10)} ${'Z'.padEnd(7)} ${'Regime'.padEnd(10)} ${'Entropy'.padEnd(9)} Expires${RESET}`);

  for (const t of result.timeframes) {
    if (t.error) {
      console.log(`${t.tf.padEnd(5)} ${DIM}no data (${t.bars} bars)${RESET}`);
      continue;
    }
    const bc = biasColor(t.bias);
    const vs20 = t.sma20 ? (t.last > t.sma20 ? `${GREEN}above${RESET}` : `${RED}below${RESET}`) : DIM + 'n/a' + RESET;
    const zc = t.zScore !== null ? (t.zScore < -2 ? GREEN : t.zScore > 2 ? RED : '') : '';

    // Regime: green=trending, yellow=choppy, dim=unknown
    let regimeStr;
    if (t.regime === 'trending') regimeStr = `${GREEN}trending${RESET}`;
    else if (t.regime === 'choppy') regimeStr = `${YELLOW}choppy${RESET}`;
    else regimeStr = DIM + 'n/a' + RESET;

    // Entropy: green=low (orderly), red=high (random)
    let entropyStr;
    if (t.entropy !== null) {
      const ec = t.entropy < 0.5 ? GREEN : t.entropy > 0.8 ? RED : YELLOW;
      entropyStr = `${ec}${t.entropy.toFixed(2)}${RESET}`;
    } else {
      entropyStr = DIM + 'n/a' + RESET;
    }

    console.log(
      `${CYAN}${t.tf.padEnd(5)}${RESET} ${bc}${t.bias.padEnd(8)}${RESET}` +
      ` ${(t.rsi !== null ? t.rsi.toFixed(1) : 'n/a').padEnd(6)}` +
      ` ${vs20.padEnd(10 + 9)}` +
      ` ${zc}${(t.zScore !== null ? t.zScore.toFixed(2) : 'n/a').padEnd(7)}${RESET}` +
      ` ${regimeStr.padEnd(10 + 9)}` +
      ` ${entropyStr.padEnd(9 + 9)}` +
      ` ${t.expiresBars}b (~${t.horizon.split('–')[1] || t.horizon})`
    );
  }
  console.log(DIM + '─'.repeat(88) + RESET + '\n');
}

async function commandBias(args) {
  const symbol = (args[0] || optionValue(args, '--symbol', 'BTCUSDT')).toUpperCase();
  const isJson = hasFlag(args, '--json');
  const skipBackfill = hasFlag(args, '--no-backfill');

  // Auto-backfill before computing signal (per feedback: always refresh before market questions)
  if (!skipBackfill) {
    try {
      const { execFileSync } = require('child_process');
      const cliPath = require('path').resolve(__dirname, '../../sovereign_cli.js');
      if (!isJson) process.stdout.write('\x1b[90m⌛ refreshing crypto data...\x1b[0m\n');
      execFileSync(process.execPath, [cliPath, 'backfill-daemon', '--once', '--families', 'crypto'], {
        stdio: isJson ? 'ignore' : 'ignore',
        timeout: 90000,
      });
    } catch (_) { /* non-fatal — continue with cached data */ }
  }

  const timeframes = TF_CONFIG.map(cfg => analyzeTimeframe(cfg, symbol));
  const aggregate = aggregateBias(timeframes);

  // ML signal from logistic_v1 using the 1d bar's TA features (cross-family features imputed by model)
  let mlSignal = null;
  try {
    const { predict } = require('../../../../shared/lib/ml/onnx_runner.js');
    const daily = timeframes.find(t => t.tf === '1d' && !t.error);
    if (daily) {
      const featureObj = {
        rsi: daily.rsi, macd: 0, atr: daily.atrPct != null ? daily.atrPct / 100 : null,
        close: daily.last, return_fast: 0, return_slow: 0, volatility: daily.atrPct != null ? daily.atrPct / 100 : null,
        bollinger_middle: daily.sma20, bollinger_upper: null, bollinger_lower: null,
        divergence_score: 0, smc_score: 0,
      };
      const pred = await predict('logistic_v1', featureObj);
      mlSignal = { direction: pred.direction, confidence: pred.confidence, model: 'logistic_v1', class_probs: pred.class_probs };
    }
  } catch (_) { /* non-fatal — onnxruntime-node may not be available in all envs */ }

  const result = { symbol, generated_at: new Date().toISOString(), aggregate, timeframes, ml: mlSignal };

  if (isJson) {
    printPayload(result, args);
  } else {
    renderTable(symbol, result);
  }
  return 0;
}

module.exports = { commandBias };
