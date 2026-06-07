const path = require('node:path');
const { REPO_ROOT } = require('../../../../../shared/lib/paths');

const DEFAULT_SNAPSHOT = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'backtest_history.json');
const fs = require('node:fs');

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function extractBars(payload, symbol, timeframe) {
  const candidates = [payload?.sources, payload?.records, payload?.bars, payload?.data];
  const records = candidates.find(Array.isArray) ?? [];
  return records
    .filter(r => {
      const sym = String(r.symbol || '').toUpperCase();
      const tf = String(r.timeframe || '');
      return (!symbol || sym === symbol) && (!timeframe || tf === timeframe);
    })
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
}

function sigmaPredict(close, upper, middle, lower) {
  if (!upper || !lower || upper === lower) return { direction: 'neutral', confidence: 0, reason: 'flat_band' };

  const bandwidth = upper - lower;
  const position = (close - lower) / bandwidth; // 0 = at lower, 1 = at upper
  const sigmas = (close - middle) / (bandwidth / 4); // approx sigma position

  if (position > 0.95) {
    return { direction: 'short', confidence: Math.min(0.85, 0.5 + (position - 0.9) * 3), reason: 'overbought_reversion', sigma: sigmas };
  }
  if (position < 0.05) {
    return { direction: 'long', confidence: Math.min(0.85, 0.5 + (0.1 - position) * 3), reason: 'oversold_reversion', sigma: sigmas };
  }
  if (position > 0.5) {
    return { direction: 'long', confidence: 0.3 + (position - 0.5) * 0.4, reason: 'above_midline_trend', sigma: sigmas };
  }
  return { direction: 'short', confidence: 0.3 + (0.5 - position) * 0.4, reason: 'below_midline_trend', sigma: sigmas };
}

function computeSigmaBand(query = {}) {
  const symbol = String(query.symbol || 'AAPL').toUpperCase();
  const timeframe = String(query.timeframe || '1d');
  const period = Math.max(5, Math.min(200, Number(query.period) || 20));
  const inputPath = String(query.input || DEFAULT_SNAPSHOT);

  const payload = readJsonSafe(inputPath);
  if (!payload) {
    return { ok: false, error: 'snapshot_not_found', input: inputPath };
  }

  const bars = extractBars(payload, symbol, timeframe);
  if (bars.length < period) {
    return {
      ok: false,
      error: 'insufficient_bars',
      symbol, timeframe, period,
      bars_available: bars.length,
    };
  }

  const closes = bars.map(b => Number(b.close)).filter(Number.isFinite);
  const window = closes.slice(-period);
  const m = window.reduce((s, v) => s + v, 0) / window.length;
  const variance = window.reduce((s, v) => s + (v - m) ** 2, 0) / window.length;
  const dev = Math.sqrt(variance);

  const upper = m + 2 * dev;
  const lower = m - 2 * dev;
  const current = closes[closes.length - 1];
  const prev = closes[closes.length - 2] ?? current;

  // Build chart series: last min(100, bars) closes with band values
  const chartLen = Math.min(100, bars.length);
  const chartBars = bars.slice(-chartLen);
  const series = chartBars.map((bar, i) => {
    const idx = closes.length - chartLen + i;
    const w = closes.slice(Math.max(0, idx - period + 1), idx + 1);
    if (w.length < 2) return null;
    const wm = w.reduce((s, v) => s + v, 0) / w.length;
    const wv = w.reduce((s, v) => s + (v - wm) ** 2, 0) / w.length;
    const wd = Math.sqrt(wv);
    return {
      t: bar.timestamp,
      close: Number(bar.close),
      upper: wm + 2 * wd,
      middle: wm,
      lower: wm - 2 * wd,
    };
  }).filter(Boolean);

  const prediction = sigmaPredict(current, upper, m, lower);

  return {
    ok: true,
    type: 'sigma_band',
    fetched_at: new Date().toISOString(),
    symbol, timeframe, period,
    bars_used: bars.length,
    current: {
      close: current,
      change_pct: prev !== 0 ? ((current - prev) / prev) : 0,
      upper: Number(upper.toFixed(4)),
      middle: Number(m.toFixed(4)),
      lower: Number(lower.toFixed(4)),
      bandwidth_pct: m !== 0 ? Number(((upper - lower) / m).toFixed(4)) : 0,
      position: Number(((current - lower) / (upper - lower)).toFixed(4)),
    },
    prediction,
    series,
  };
}

module.exports = {
  path: '/api/sigma-band',
  status: (payload) => (payload && payload.ok ? 200 : 422),
  handle: (query = {}) => computeSigmaBand(query),
};

