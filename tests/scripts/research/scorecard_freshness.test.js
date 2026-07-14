'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildScorecard, buildScorecardRefreshArgs, refreshScorecardData, renderScorecard } = require('../../../backend/cli/commands/research/scorecard.js');
const { adaptTechnicalV2Row } = require('../../../shared/lib/analysis/analyzers/technical_v2_adapter.js');
const { writeTsIndex } = require('../../../shared/lib/market/validation.js');

const NOW = Date.parse('2026-07-11T12:00:00.000Z');
const TF_MS = { '1h': 60 * 60 * 1000, '4h': 4 * 60 * 60 * 1000, '1d': 24 * 60 * 60 * 1000 };

function assertWithinWidth(output, width) {
  assert.ok(output.split('\n').every((line) => line.length <= width), `expected every line to fit ${width} columns:\n${output}`);
}

function renderResult(result, width = 80) {
  return renderScorecard(result.rows, result.filters, result.elapsed_ms, result, result.market_context, { width, colorize: false });
}

function bars(symbol, timeframe, lastTimestamp, count = 30) {
  const step = TF_MS[timeframe];
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return {
      symbol,
      family: 'crypto',
      provider: 'binance',
      timeframe,
      timestamp: new Date(lastTimestamp - (count - index - 1) * step).toISOString(),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000 + index,
    };
  });
}

function flatBars(symbol, timeframe, lastTimestamp, count = 30, close = 100) {
  const step = TF_MS[timeframe];
  return Array.from({ length: count }, (_, index) => ({
    symbol,
    family: 'crypto',
    provider: 'binance',
    timeframe,
    timestamp: new Date(lastTimestamp - (count - index - 1) * step).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }));
}

test('scorecard includes only complete fresh timeframe sets and exposes conservative timing', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorecard-fresh-'));
  try {
    writeTsIndex(tsDir, { sources: [
      ...bars('FRESHUSDT', '1h', NOW - TF_MS['1h']),
      ...bars('FRESHUSDT', '4h', NOW - TF_MS['4h']),
      ...bars('STALEUSDT', '1h', NOW - 10 * TF_MS['1h']),
      ...bars('STALEUSDT', '4h', NOW - TF_MS['4h']),
      ...bars('PARTIALUSDT', '1h', NOW - TF_MS['1h']),
    ] });

    const universe = [
      { symbol: 'FRESHUSDT', family: 'crypto' },
      { symbol: 'STALEUSDT', family: 'crypto' },
      { symbol: 'PARTIALUSDT', family: 'crypto' },
      // Macro evidence is not a price series and must never inflate a technical scorecard denominator.
      { symbol: 'CPI', family: 'macro' },
    ];
    const result = await buildScorecard(
      ['--family', 'crypto', '--tf', '1h,4h', '--min-conf', '0', '--top', '10'],
      { tsDir, now: NOW, universeLoader: async () => universe },
    );

    assert.equal(result.ok, true);
    assert.equal(result.schema_version, 2);
    assert.equal(result.total_symbols, 3);
    assert.equal(result.analyzed_symbols, 1);
    assert.equal(result.skipped, 2);
    assert.equal(result.eligible_symbols, 1);
    assert.equal(result.excluded_symbols, 2);
    assert.equal(result.confidence_filtered, 0);
    assert.equal(result.direction_filtered, 0);
    assert.equal(result.truncated_symbols, 0);
    assert.deepEqual(result.exclusion_summary, {
      total: 2,
      by_reason: { 'stale data': 1, 'insufficient data': 1 },
      by_timeframe: {
        '1h': { 'stale data': 1 },
        '4h': { 'insufficient data': 1 },
      },
    });
    assert.deepEqual(result.rows.map((row) => row.symbol), ['FRESHUSDT']);

    const row = result.rows[0];
    assert.equal(row.complete, true);
    assert.equal(row.confidence_kind, 'heuristic_vote_strength');
    assert.equal(row.data_as_of, new Date(NOW - TF_MS['4h']).toISOString());
    assert.equal(row.valid_until, new Date(NOW + 3 * TF_MS['1h']).toISOString());
    assert.equal(row.timeframe_details['1h'].age_ms, TF_MS['1h']);
    assert.equal(row.timeframe_details['4h'].age_ms, TF_MS['4h']);

    const stale = result.exclusions.find((entry) => entry.symbol === 'STALEUSDT');
    assert.equal(stale.reasons[0].reason, 'stale data');
    assert.equal(stale.reasons[0].timeframe, '1h');
    const partial = result.exclusions.find((entry) => entry.symbol === 'PARTIALUSDT');
    assert.equal(partial.reasons[0].reason, 'insufficient data');
    assert.equal(partial.reasons[0].timeframe, '4h');

    const output = renderResult(result);
    assert.match(output, /Status  1 eligible  ·  0 degraded  ·  2 excluded/);
    assert.match(output, /Data checks  stale data 1 · insufficient data 1/);
    assert.match(output, /ASSET\s+DIR\s+CONF\s+COV\s+STATE\s+TF 1h\/4h/);
    assert.doesNotMatch(output, /BTC-r|Aligned|Regime/);
    assertWithinWidth(output, 80);

    console.log(JSON.stringify({
      type: 'scorecard_freshness',
      total: result.total_symbols,
      scored: result.analyzed_symbols,
      excluded: result.skipped,
      data_as_of: row.data_as_of,
      valid_until: row.valid_until,
    }));
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});

test('scorecard can have fresh eligible rows that still fall below the confidence filter', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorecard-confidence-'));
  try {
    writeTsIndex(tsDir, { sources: [
      ...flatBars('LOWCONFUSDT', '1h', NOW - TF_MS['1h']),
      ...flatBars('LOWCONFUSDT', '4h', NOW - TF_MS['4h']),
      ...flatBars('LOWCONFUSDT', '1d', NOW - TF_MS['1d']),
    ] });

    const result = await buildScorecard(
      ['--family', 'crypto', '--tf', '1h,4h,1d', '--min-conf', '0.3', '--top', '10'],
      { tsDir, now: NOW, universeLoader: async () => [{ symbol: 'LOWCONFUSDT', family: 'crypto' }] },
    );

    assert.equal(result.ok, true);
    assert.equal(result.total_symbols, 1);
    assert.equal(result.analyzed_symbols, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.eligible_symbols, 1);
    assert.equal(result.excluded_symbols, 0);
    assert.equal(result.confidence_filtered, 1);
    assert.equal(result.direction_filtered, 0);
    assert.equal(result.truncated_symbols, 0);
    assert.equal(result.rows.length, 0);
    assert.equal(result.exclusions.length, 0);

    const output = renderResult(result);
    assert.match(output, /No rows shown: 1 candidate below the 30% confidence floor\./);
    assert.doesNotMatch(output, /ASSET\s+DIR/);
    assertWithinWidth(output, 80);
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});

test('scorecard allow-degraded mode scores partial coverage and labels it degraded', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorecard-degraded-'));
  try {
    writeTsIndex(tsDir, { sources: [
      ...bars('PARTIALOKUSDT', '1h', NOW - TF_MS['1h']),
      ...bars('PARTIALOKUSDT', '1d', NOW - TF_MS['1d']),
    ] });

    const result = await buildScorecard(
      ['--family', 'crypto', '--tf', '1h,4h,1d', '--min-conf', '0', '--top', '10', '--allow-degraded'],
      { tsDir, now: NOW, universeLoader: async () => [{ symbol: 'PARTIALOKUSDT', family: 'crypto' }] },
    );

    assert.equal(result.ok, true);
    assert.equal(result.total_symbols, 1);
    assert.equal(result.analyzed_symbols, 1);
    assert.equal(result.eligible_symbols, 0);
    assert.equal(result.degraded_symbols, 1);
    assert.equal(result.excluded_symbols, 0);
    assert.equal(result.confidence_filtered, 0);
    assert.equal(result.rows.length, 1);

    const row = result.rows[0];
    assert.equal(row.decision_state, 'degraded');
    assert.equal(row.coverage, 0.67);
    assert.equal(row.complete, false);
    assert.equal(row.degraded_reasons.length, 1);
    assert.equal(row.degraded_reasons[0].timeframe, '4h');
    assert.equal(row.degraded_reasons[0].reason, 'insufficient data');
    assert.equal(adaptTechnicalV2Row(row, { now: NOW }).error.code, 'incomplete_v2_row');

    const output = renderResult(result);
    assert.match(output, /Status  0 eligible  ·  1 degraded  ·  0 excluded/);
    assert.match(output, /PARTIALOKUSDT\s+long\s+\d+%\s+67%\s+degraded\s+↑\/\.\/↑/);
    assertWithinWidth(output, 80);
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});

test('scorecard reports direction filtering and top-limit truncation separately from confidence filtering', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorecard-direction-'));
  try {
    writeTsIndex(tsDir, { sources: [
      ...bars('LONGUSDT', '1h', NOW - TF_MS['1h']),
      ...bars('LONGUSDT', '4h', NOW - TF_MS['4h']),
      ...bars('LONG2USDT', '1h', NOW - TF_MS['1h']),
      ...bars('LONG2USDT', '4h', NOW - TF_MS['4h']),
    ] });
    const universe = [
      { symbol: 'LONGUSDT', family: 'crypto' },
      { symbol: 'LONG2USDT', family: 'crypto' },
    ];

    const result = await buildScorecard(
      ['--family', 'crypto', '--tf', '1h,4h', '--min-conf', '0', '--direction', 'short', '--top', '10'],
      { tsDir, now: NOW, universeLoader: async () => universe },
    );

    assert.equal(result.confidence_filtered, 0);
    assert.equal(result.direction_filtered, 2);
    assert.equal(result.truncated_symbols, 0);
    assert.equal(result.rows.length, 0);
    assert.match(renderResult(result), /No rows shown: 2 candidates did not match direction short\./);

    const limited = await buildScorecard(
      ['--family', 'crypto', '--tf', '1h,4h', '--min-conf', '0', '--top', '1'],
      { tsDir, now: NOW, universeLoader: async () => universe },
    );
    assert.equal(limited.confidence_filtered, 0);
    assert.equal(limited.direction_filtered, 0);
    assert.equal(limited.truncated_symbols, 1);
    assert.equal(limited.rows.length, 1);
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});

test('scorecard refresh is bounded to requested price families and can be exercised without providers', async () => {
  const args = buildScorecardRefreshArgs({ family: 'crypto', timeframes: ['1h', '4h', '1d'] });
  assert.deepEqual(args, ['--families', 'crypto', '--timeframes', '1h,4h,1d', '--days', '30', '--concurrency', '3']);

  let observedArgs = null;
  const exitCode = await refreshScorecardData(
    { family: 'crypto', timeframes: ['1h', '4h', '1d'] },
    async (passedArgs) => {
      observedArgs = passedArgs;
      return 0;
    },
  );
  assert.equal(exitCode, 0);
  assert.deepEqual(observedArgs, args);
});
