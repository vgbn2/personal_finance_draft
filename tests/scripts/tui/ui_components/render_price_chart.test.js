'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { renderPriceChart } = require('../../../../backend/cli/tui/visualizations.js');
const A = require('../../../../shared/lib/ui/ansi');

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, '');
}

test('renderPriceChart degrades gracefully on empty input', () => {
  const out = stripAnsi(renderPriceChart([]));
  assert.match(out, /no bars to chart/i);
});

test('renderPriceChart degrades gracefully when no bar has a usable close', () => {
  const out = stripAnsi(renderPriceChart([{ close: null }, { close: 'n/a' }, {}]));
  assert.match(out, /no usable close prices/i);
});

test('renderPriceChart renders a header, the requested height of rows, and a First/Last/High/Low summary', () => {
  const bars = Array.from({ length: 30 }, (_, i) => ({ close: 100 + i, timestamp: i }));
  const out = stripAnsi(renderPriceChart(bars, 20, 8));
  assert.match(out, /Price Chart/);
  assert.match(out, /30 bars loaded, 30 usable closes/);
  // 8 chart rows + 1 axis/border row = 9 lines below the header line.
  const lines = out.split('\n').filter(Boolean);
  assert.ok(lines.length >= 10, `expected at least 10 non-empty lines, got ${lines.length}`);
  assert.match(out, /First:\s*\$100/);
  assert.match(out, /Last:\s*\$129/);
  assert.match(out, /High:\s*\$129/);
  assert.match(out, /Low:\s*\$100/);
});

test('renderPriceChart marks an upward move green and a downward move red', () => {
  const up = renderPriceChart([{ close: 1 }, { close: 2 }], 4, 4);
  const down = renderPriceChart([{ close: 2 }, { close: 1 }], 4, 4);
  assert.match(up, new RegExp(A.GREEN.replace(/\x1b\[/, '\\x1b\\[')));
  assert.match(down, new RegExp(A.RED.replace(/\x1b\[/, '\\x1b\\[')));
});

test('renderPriceChart handles a single bar without dividing by zero or crashing', () => {
  const out = stripAnsi(renderPriceChart([{ close: 42 }], 10, 5));
  assert.match(out, /First:\s*\$42/);
  assert.match(out, /Last:\s*\$42/);
});

test('renderPriceChart downsamples a long series to the requested width instead of truncating it', () => {
  const bars = Array.from({ length: 5000 }, (_, i) => ({ close: 100 + Math.sin(i / 50) * 10 }));
  const out = renderPriceChart(bars, 40, 6);
  assert.match(stripAnsi(out), /5000 bars loaded, 5000 usable closes/);
  // Every chart row is exactly `width` plotted columns (one leading space
  // after the axis tick + vline, then exactly `width` grid characters) --
  // proves sampling to a fixed width happened, not truncation/overflow.
  const firstChartLine = stripAnsi(out.split('\n').find((l) => stripAnsi(l).includes('|')));
  const plottedCols = firstChartLine.split('|')[1];
  assert.equal(plottedCols.length, 1 + 40);
});
