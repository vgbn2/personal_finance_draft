'use strict';
const utils = require('../../lib/utils.js');
const { optionValue, hasFlag, DEFAULT_HISTORY } = utils;
const { readSnapshot, readTsIndex } = require('../../../../shared/lib/market/validation.js');
const { DEFAULT_TS_DIR } = require('../data/data_rollup.js');

/**
 * Calculates a prediction model signal based on price deviation in standard deviations (sigmas).
 * @param {number} sigmas - Price deviation in standard deviations from the mean.
 * @param {number} bandwidth - Bollinger Band bandwidth.
 * @param {number} currentPrice - Latest close price.
 * @returns {object} Direction, confidence level, reason, and rounded sigmas value.
 */
function sigmaPrediction(sigmas, bandwidth, currentPrice) {
  const absS = Math.abs(sigmas);
  const bwPct = bandwidth / (currentPrice || 1);

  let direction, confidence, reason;
  if (sigmas > 2.0) {
    direction = 'SHORT'; confidence = Math.min(0.90, 0.65 + (sigmas - 2.0) * 0.10); reason = 'extreme overbought — mean reversion expected';
  } else if (sigmas < -2.0) {
    direction = 'LONG';  confidence = Math.min(0.90, 0.65 + (-sigmas - 2.0) * 0.10); reason = 'extreme oversold — mean reversion expected';
  } else if (sigmas > 1.0) {
    direction = 'SHORT'; confidence = 0.40 + (sigmas - 1.0) * 0.10; reason = 'above mean — mild overbought pressure';
  } else if (sigmas < -1.0) {
    direction = 'LONG';  confidence = 0.40 + (-sigmas - 1.0) * 0.10; reason = 'below mean — mild oversold pressure';
  } else {
    direction = 'NEUTRAL'; confidence = 0.30; reason = `within 1σ — indeterminate (bandwidth ${(bwPct * 100).toFixed(1)}%)`;
  }

  // Low bandwidth = squeeze, reduces conviction
  if (bwPct < 0.015) { confidence *= 0.75; reason += ' [squeeze — low conviction]'; }

  return { direction, confidence: Number(confidence.toFixed(3)), reason, sigmas: Number(sigmas.toFixed(4)) };
}

/**
 * Computes Bollinger Band metrics and statistical sigma values for a symbol and timeframe.
 * @param {string} symbol - Trading asset symbol.
 * @param {string} timeframe - Target timeframe interval.
 * @param {number} windowSize - Window size for mean and standard deviation computation.
 * @returns {object|null} Computed statistics object or null if there is insufficient data.
 */
function computeSigmaState(symbol, timeframe, windowSize) {
  // Deep historical bars live in the ts-index, not the shallow last-fetch
  // cache (DEFAULT_HISTORY) - a symbol/timeframe can have thousands of bars
  // on disk while the cache holds only what the most recent fetch touched.
  // Prefer the ts-index; fall back to the cache only for a symbol/timeframe
  // that's never been deep-backfilled (no .bin file at all).
  const tsBars = readTsIndex(DEFAULT_TS_DIR, symbol, timeframe);
  let bars;
  if (tsBars && tsBars.length > 0) {
    bars = tsBars.filter(s => typeof s.close === 'number' && isFinite(s.close));
  } else {
    const snapshot = readSnapshot(DEFAULT_HISTORY);
    if (!snapshot) return null;
    bars = (snapshot.sources || []).filter(s =>
      s.symbol === symbol &&
      (!s.timeframe || s.timeframe === timeframe) &&
      typeof s.close === 'number' && isFinite(s.close)
    ).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  }

  if (bars.length < windowSize) return null;

  const recent = bars.slice(-windowSize);
  const closes = recent.map(s => s.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const stddev = Math.sqrt(closes.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / closes.length);
  const currentPrice = closes[closes.length - 1];
  const prevPrice = closes[closes.length - 2] ?? currentPrice;
  const sigmas = (currentPrice - mean) / (stddev || 1);
  const upper = mean + 2 * stddev;
  const lower = mean - 2 * stddev;
  const bandwidth = upper - lower;
  const position = bandwidth > 0 ? (currentPrice - lower) / bandwidth : 0.5;

  return {
    bars: bars.length, closes, mean, stddev, currentPrice, prevPrice,
    sigmas, upper, lower, bandwidth, position,
    lastTimestamp: bars[bars.length - 1].timestamp,
    prediction: sigmaPrediction(sigmas, bandwidth, currentPrice),
  };
}

function renderSigmaFrame(symbol, timeframe, windowSize, state, pollIntervalSec, nextRefreshIn, tickCount) {
  const A_ESC = '\x1b';
  const CYAN = `${A_ESC}[1;36m`;
  const BOLD = `${A_ESC}[1m`;
  const GRAY = `${A_ESC}[90m`;
  const YELLOW = `${A_ESC}[33m`;
  const GREEN = `${A_ESC}[32m`;
  const RED = `${A_ESC}[31m`;
  const B_GREEN = `${A_ESC}[1;32m`;
  const B_RED = `${A_ESC}[1;31m`;
  const B_YELLOW = `${A_ESC}[1;33m`;
  const RESET = `${A_ESC}[0m`;
  const { renderSigmaSparkline } = require('../../tui/index.js');
  const { currentPrice, prevPrice, mean, stddev, sigmas, upper, lower, bandwidth, position, lastTimestamp, prediction } = state;

  const changePct = prevPrice !== 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
  const changeColor = changePct >= 0 ? GREEN : RED;
  const changeSign = changePct >= 0 ? '+' : '';

  const positionBar = (() => {
    const w = 30;
    const p = Math.round(position * (w - 1));
    const bar = Array(w).fill('─');
    bar[0] = '└'; bar[w - 1] = '┘';
    bar[Math.floor(w / 2)] = '┼';
    if (p >= 0 && p < w) bar[p] = `${B_YELLOW}●${RESET}`;
    return bar.join('');
  })();

  const predColor = prediction.direction === 'LONG' ? B_GREEN :
                    prediction.direction === 'SHORT' ? B_RED : GRAY;
  const confBar = (() => {
    const filled = Math.round(prediction.confidence * 10);
    return `[${GREEN}${'█'.repeat(filled)}${GRAY}${'░'.repeat(10 - filled)}${RESET}]`;
  })();

  const spinner = ['◐', '◓', '◑', '◒'][tickCount % 4];
  const nextSec = Math.max(0, Math.ceil(nextRefreshIn / 1000));

  let buf = '';
  buf += `\n${CYAN}${BOLD}Sigma Band Live${RESET}  ${GRAY}${symbol} · ${timeframe} · BB${windowSize}${RESET}`;
  buf += `  ${GRAY}${spinner} next poll ${nextSec}s${RESET}\n`;
  buf += `${GRAY}${'─'.repeat(72)}${RESET}\n`;

  // Price row
  buf += `  ${BOLD}Price${RESET}  ${YELLOW}${currentPrice.toFixed(currentPrice < 1 ? 6 : 4)}${RESET}`;
  buf += `  ${changeColor}${changeSign}${changePct.toFixed(3)}%${RESET}`;
  buf += `  ${GRAY}·  ${RESET}`;
  buf += `  ${BOLD}Mean${RESET} ${mean.toFixed(currentPrice < 1 ? 6 : 4)}`;
  buf += `  ${BOLD}σ${RESET} ${stddev.toFixed(currentPrice < 1 ? 6 : 4)}`;
  buf += `  ${GRAY}·  ${RESET}`;
  buf += `  Pos ${GRAY}${(position * 100).toFixed(1)}%${RESET}\n`;

  // Band rows
  buf += `  ${GRAY}Upper${RESET} ${RED}${upper.toFixed(currentPrice < 1 ? 6 : 4)}${RESET}`;
  buf += `   ${GRAY}Lower${RESET} ${GREEN}${lower.toFixed(currentPrice < 1 ? 6 : 4)}${RESET}`;
  buf += `   ${GRAY}BW${RESET} ${(bandwidth / (currentPrice || 1) * 100).toFixed(2)}%\n`;

  // Position bar
  buf += `  ${GRAY}low ─────────────────────────────── high${RESET}\n`;
  buf += `       ${positionBar}\n`;

  // Sigma chart
  buf += renderSigmaSparkline(mean, stddev, currentPrice);

  // Prediction box
  buf += `\n${GRAY}${'─'.repeat(72)}${RESET}\n`;
  buf += `  ${BOLD}Prediction${RESET}  ${predColor}${prediction.direction}${RESET}`;
  buf += `  ${GRAY}confidence${RESET} ${confBar} ${Math.round(prediction.confidence * 100)}%\n`;
  buf += `  ${GRAY}${prediction.reason}${RESET}`;
  buf += `  ${GRAY}·  ${sigmas >= 0 ? '+' : ''}${sigmas.toFixed(3)}σ from mean${RESET}\n`;
  buf += `  ${GRAY}Last bar: ${lastTimestamp ?? 'n/a'}  ·  ${state.bars} bars loaded${RESET}\n`;

  buf += `\n${GRAY}  q: quit   r: refresh now   polling every ${pollIntervalSec}s${RESET}\n`;

  return buf;
}

/**
 * Computes the number of lines required to display a buffer, accounting for ANSI codes and terminal column wrapping.
 * @param {string} buf - The text buffer to analyze.
 * @returns {number} The visual line count.
 */
function visualLineCount(buf) {
  const cols = process.stdout.columns || 80;
  const stripped = buf.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const lines = stripped.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  let count = 0;
  for (const line of lines) {
    count += Math.max(1, Math.ceil((line.length || 0) / cols));
  }
  return count;
}

async function runBackendVisualize(args = []) {
  let symbol = optionValue(args, '--symbol', null);
  let timeframe = optionValue(args, '--timeframe', '1d');
  let windowSize = parseInt(optionValue(args, '--window', '20'), 10) || 20;
  const pollSec = Math.max(5, parseInt(optionValue(args, '--interval', '30'), 10) || 30);
  const noPoll = hasFlag(args, '--no-poll');

  if (!symbol && utils.isRichTerminal()) {
    const { pickAssets } = require('../../tui/asset_picker');
    symbol = await pickAssets({ label: 'Sigma Band Visualizer', multi: false });
    if (!symbol) return { ok: false, error: 'No symbol selected' };
  }

  if (!symbol) return { ok: false, error: 'No symbol provided. Use --symbol or the interactive picker.' };

  // Initial compute
  let state = computeSigmaState(symbol, timeframe, windowSize);
  if (!state) {
    const snap = readSnapshot(DEFAULT_HISTORY);
    if (!snap) return { ok: false, error: 'No cache data found. Run a backfill first.' };
    return { ok: false, error: `Insufficient data for ${symbol} on ${timeframe} (need ${windowSize}+ bars).` };
  }

  // One-shot mode (no TTY or --no-poll)
  if (noPoll || !utils.isRichTerminal()) {
    const { renderSigmaSparkline } = require('../../tui/index.js');
    const { currentPrice, mean, stddev, sigmas, prediction } = state;
    console.log(`\n\x1b[1;36mSigma Bands — ${symbol} (${timeframe}, BB${windowSize})\x1b[0m`);
    console.log(`  Price: \x1b[33m${currentPrice.toFixed(4)}\x1b[0m  Mean: ${mean.toFixed(4)}  σ: ${stddev.toFixed(4)}  Position: \x1b[${Math.abs(sigmas) > 2 ? '31' : '32'}m${sigmas >= 0 ? '+' : ''}${sigmas.toFixed(3)}σ\x1b[0m`);
    console.log(renderSigmaSparkline(mean, stddev, currentPrice));
    console.log(`\n  Prediction: \x1b[1m${prediction.direction}\x1b[0m  ${Math.round(prediction.confidence * 100)}% — ${prediction.reason}`);
    return { ok: true, symbol, timeframe, window: windowSize, ...state };
  }

  // Live poll mode — raw stdin for q/r keys, periodic redraw
  process.stdin.removeAllListeners('data');
  if (process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let prevLineCount = 0;
  let nextRefreshAt = Date.now() + pollSec * 1000;
  let tickCount = 0;
  let stopped = false;

  function redraw() {
    const buf = renderSigmaFrame(symbol, timeframe, windowSize, state, pollSec, nextRefreshAt - Date.now(), tickCount);
    if (prevLineCount > 0) process.stdout.write(`\x1b[${prevLineCount}A\x1b[J`);
    process.stdout.write(buf);
    prevLineCount = visualLineCount(buf);
    tickCount++;
  }

  // Key handler: q exits, r refreshes immediately
  const onKey = (chunk) => {
    const key = String(chunk);
    if (key === 'q' || key === 'Q' || key === '\x03') {
      stopped = true;
      clearInterval(tickTimer);
      clearInterval(pollTimer);
      process.stdin.removeListener('data', onKey);
      if (process.stdin.setRawMode) process.stdin.setRawMode(false);
      process.stdout.write('\n\x1b[90mSigma Band live view stopped.\x1b[0m\n');
      return;
    }
    if (key === 'r' || key === 'R') {
      const fresh = computeSigmaState(symbol, timeframe, windowSize);
      if (fresh) state = fresh;
      nextRefreshAt = Date.now() + pollSec * 1000;
      redraw();
    }
  };
  process.stdin.on('data', onKey);

  // Draw immediately
  redraw();

  // Spinner tick every second
  const tickTimer = setInterval(() => {
    if (stopped) return;
    redraw();
  }, 1000);

  // Poll: re-read snapshot and redraw
  const pollTimer = setInterval(() => {
    if (stopped) return;
    const fresh = computeSigmaState(symbol, timeframe, windowSize);
    if (fresh) state = fresh;
    nextRefreshAt = Date.now() + pollSec * 1000;
    redraw();
  }, pollSec * 1000);

  // Wait until stopped
  return new Promise(resolve => {
    const check = setInterval(() => {
      if (stopped) {
        clearInterval(check);
        resolve({ ok: true, symbol, timeframe, window: windowSize });
      }
    }, 200);
  });
}

module.exports = { sigmaPrediction, computeSigmaState, renderSigmaFrame, visualLineCount, runBackendVisualize };
