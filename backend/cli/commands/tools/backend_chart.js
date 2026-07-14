'use strict';
const utils = require('../../lib/utils.js');
const { optionValue, DEFAULT_HISTORY, hasFlag } = utils;
const { readSnapshot, readTsIndex } = require('../../../../shared/lib/market/validation.js');
const { DEFAULT_TS_DIR } = require('../data/data_rollup.js');
const { renderPriceChart, renderCandlestickChart } = require('../../tui/visualizations.js');

// Same deep-ts-index-first, shallow-cache-fallback pattern backend_visualize.js's
// computeSigmaState() uses -- deep historical bars live in the ts-index, not the
// shallow last-fetch cache, which only ever holds whatever a recent live fetch
// touched.
function loadChartBars(symbol, timeframe) {
  const tsBars = readTsIndex(DEFAULT_TS_DIR, symbol, timeframe);
  if (tsBars && tsBars.length > 0) {
    return tsBars.filter((s) => typeof s.close === 'number' && isFinite(s.close));
  }
  const snapshot = readSnapshot(DEFAULT_HISTORY);
  if (!snapshot) return [];
  return (snapshot.sources || [])
    .filter((s) => s.symbol === symbol && (!s.timeframe || s.timeframe === timeframe) && typeof s.close === 'number' && isFinite(s.close))
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
}

async function runBackendChart(args = []) {
  let symbol = optionValue(args, '--symbol', null);
  const timeframe = optionValue(args, '--timeframe', '1d');
  const width = Math.max(10, parseInt(optionValue(args, '--width', '64'), 10) || 64);
  const barsWindow = Math.max(1, parseInt(optionValue(args, '--bars', '200'), 10) || 200);
  // 'line' (default, existing behavior) or 'candle' (OHLC candlesticks).
  const style = String(optionValue(args, '--style', 'line')).toLowerCase();
  // Candle-style overlays (ignored by line style): --sma N draws an SMA(N)
  // line, --volume adds a volume histogram subplot.
  const smaPeriod = Math.max(0, parseInt(optionValue(args, '--sma', '0'), 10) || 0);
  const showVolume = hasFlag(args, '--volume');

  if (!symbol && utils.isRichTerminal()) {
    const { pickAssets } = require('../../tui/asset_picker');
    symbol = await pickAssets({ label: 'Price Chart', multi: false });
    if (!symbol) return { ok: false, error: 'No symbol selected' };
  }
  if (!symbol) return { ok: false, error: 'No symbol provided. Use --symbol or the interactive picker.' };

  const allBars = loadChartBars(symbol, timeframe);
  if (allBars.length === 0) {
    return { ok: false, error: `No cached bars for ${symbol} on ${timeframe}. Run a backfill first.`, symbol, timeframe };
  }
  const bars = allBars.slice(-barsWindow);

  const isCandle = style === 'candle' || style === 'candles' || style === 'candlestick';
  console.log(isCandle
    ? renderCandlestickChart(bars, width, 12, { smaPeriod, showVolume, totalWidth: true })
    : renderPriceChart(bars, width));
  return { ok: true, symbol, timeframe, width, style: isCandle ? 'candle' : 'line', sma: smaPeriod, volume: showVolume, bars: bars.length, total_bars_available: allBars.length };
}

module.exports = { loadChartBars, runBackendChart };
