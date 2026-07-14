'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { renderCandlestickChart } = require('../../../../backend/cli/tui/visualizations.js');
const A = require('../../../../shared/lib/ui/ansi');

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, '');
}

test('renderCandlestickChart degrades gracefully on empty input', () => {
  const out = stripAnsi(renderCandlestickChart([]));
  assert.match(out, /no bars to chart/i);
});

test('renderCandlestickChart degrades gracefully when no bar has a usable close', () => {
  const out = stripAnsi(renderCandlestickChart([{ close: null }, { close: 'n/a' }, {}]));
  assert.match(out, /no usable close prices/i);
});

test('renderCandlestickChart renders a header, the requested height of rows, and a First/Last/High/Low summary', () => {
  const bars = Array.from({ length: 30 }, (_, i) => ({
    open: 100 + i, high: 100 + i + 1, low: 100 + i - 1, close: 100 + i, timestamp: i,
  }));
  const out = stripAnsi(renderCandlestickChart(bars, 20, 8));
  assert.match(out, /Candlestick Chart/);
  assert.match(out, /30 bars loaded, 20 candles/);
  const lines = out.split('\n').filter(Boolean);
  assert.ok(lines.length >= 10, `expected at least 10 non-empty lines, got ${lines.length}`);
  assert.match(out, /First:\s*\$100/);
  assert.match(out, /Last:\s*\$129/);
});

test('renderCandlestickChart marks an up candle (close>=open) green and a down candle red', () => {
  const up = renderCandlestickChart([{ open: 1, high: 2, low: 1, close: 2 }], 4, 4);
  const down = renderCandlestickChart([{ open: 2, high: 2, low: 1, close: 1 }], 4, 4);
  assert.match(up, new RegExp(A.GREEN.replace(/\x1b\[/, '\\x1b\\[')));
  assert.match(down, new RegExp(A.RED.replace(/\x1b\[/, '\\x1b\\[')));
});

test('renderCandlestickChart summary High/Low reflect the wick extent, not just open/close', () => {
  // close=12, open=10, but the wick reaches high=20 / low=5 -- the candle body
  // alone (10..12) would never reveal the 20/5 extremes; the wick must.
  const out = stripAnsi(renderCandlestickChart([{ open: 10, high: 20, low: 5, close: 12 }], 10, 6));
  assert.match(out, /High:\s*\$20/);
  assert.match(out, /Low:\s*\$5/);
});

test('renderCandlestickChart falls back to close when open/high/low are absent (no crash)', () => {
  const out = stripAnsi(renderCandlestickChart([{ close: 42 }], 10, 5));
  assert.match(out, /First:\s*\$42/);
  assert.match(out, /Last:\s*\$42/);
});

test('renderCandlestickChart buckets a long series into the requested number of candles', () => {
  const bars = Array.from({ length: 5000 }, (_, i) => {
    const base = 100 + Math.sin(i / 50) * 10;
    return { open: base, high: base + 1, low: base - 1, close: base + 0.5 };
  });
  const out = stripAnsi(renderCandlestickChart(bars, 40, 6));
  assert.match(out, /5000 bars loaded, 40 candles/);
});

test('renderCandlestickChart draws an SMA overlay (labelled, yellow) when smaPeriod is set', () => {
  const bars = Array.from({ length: 30 }, (_, i) => ({ open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i }));
  const out = renderCandlestickChart(bars, 20, 8, { smaPeriod: 5 });
  assert.match(stripAnsi(out), /SMA\(5\)/);
  assert.match(out, new RegExp(A.YELLOW.replace(/\x1b\[/, '\\x1b\\[')), 'SMA marker/label is yellow');
});

test('renderCandlestickChart omits the SMA label when no period is given', () => {
  const bars = Array.from({ length: 10 }, (_, i) => ({ open: i, high: i + 1, low: i - 1, close: i }));
  assert.doesNotMatch(stripAnsi(renderCandlestickChart(bars, 8, 6)), /SMA\(/);
});

test('renderCandlestickChart renders a volume subplot when showVolume and bars carry volume', () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({ open: 100, high: 102, low: 98, close: 101, volume: 1000 + i * 100 }));
  const out = stripAnsi(renderCandlestickChart(bars, 16, 6, { showVolume: true }));
  assert.match(out, /Volume \(max/);
});

test('renderCandlestickChart skips the volume subplot when no bar carries volume', () => {
  const bars = Array.from({ length: 10 }, () => ({ open: 100, high: 101, low: 99, close: 100 }));
  assert.doesNotMatch(stripAnsi(renderCandlestickChart(bars, 8, 6, { showVolume: true })), /Volume \(max/);
});

test('renderCandlestickChart totalWidth mode keeps visible rows within the requested CLI width', () => {
  const bars = Array.from({ length: 80 }, (_, i) => ({
    open: 100000 + i,
    high: 100500 + i,
    low: 99500 + i,
    close: 100100 + i,
    volume: 1000000 + i * 1000,
  }));
  const out = stripAnsi(renderCandlestickChart(bars, 40, 6, {
    showVolume: true,
    smaPeriod: 5,
    totalWidth: true,
  }));
  const maxLine = Math.max(...out.split('\n').map((line) => line.length));
  assert.ok(maxLine <= 40, `expected visible width <= 40, got ${maxLine}\n${out}`);
});
