'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildScorecard } = require('../../../../backend/cli/commands/research/scorecard');
const { validateFactorResult } = require('../../../../shared/contracts/analysis');
const { adaptTechnicalV2Row } = require('../../../../shared/lib/analysis/analyzers/technical_v2_adapter');
const { writeTsIndex } = require('../../../../shared/lib/market/validation');

const NOW = Date.parse('2026-07-11T12:00:00.000Z');
const TF_MS = { '1h': 60 * 60 * 1000, '4h': 4 * 60 * 60 * 1000 };

function bars(timeframe, lastTimestamp, count = 30) {
  const step = TF_MS[timeframe];
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return {
      symbol: 'FRESHUSDT', family: 'crypto', provider: 'binance', timeframe,
      timestamp: new Date(lastTimestamp - (count - index - 1) * step).toISOString(),
      open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1000 + index,
    };
  });
}

async function buildFreshV2Row() {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-v2-adapter-'));
  try {
    writeTsIndex(tsDir, { sources: [
      ...bars('1h', NOW - TF_MS['1h']),
      ...bars('4h', NOW - TF_MS['4h']),
    ] });
    const scorecard = await buildScorecard(
      ['--family', 'crypto', '--tf', '1h,4h', '--min-conf', '0', '--top', '10'],
      { tsDir, now: NOW, universeLoader: async () => [{ symbol: 'FRESHUSDT', family: 'crypto' }] },
    );
    assert.equal(scorecard.schema_version, 2);
    assert.equal(scorecard.rows.length, 1);
    return scorecard.rows[0];
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
}

test('adapts a real complete fresh v2 row without changing direction, score, or strength', async () => {
  const input = await buildFreshV2Row();
  const result = adaptTechnicalV2Row(input, { now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.direction, input.bias);
  assert.equal(result.factor_result.score, input.score);
  assert.equal(result.factor_result.strength, input.confidence);
  assert.equal(result.factor_result.coverage, 1);
  assert.equal(result.factor_result.data_as_of, input.data_as_of);
  assert.equal(result.factor_result.valid_until, input.valid_until);
  assert.equal(result.factor_result.evidence_ids.length, 2);
  assert.equal(validateFactorResult(result.factor_result).ok, true);

  console.log(JSON.stringify({
    type: 'technical_v2_adapter',
    input_timeframes: Object.keys(input.tfs).length,
    accepted_timeframes: result.factor_result.evidence_ids.length,
    rejected_timeframes: 0,
    direction: result.direction,
    score: result.factor_result.score,
    strength: result.factor_result.strength,
    data_as_of: result.factor_result.data_as_of,
    valid_until: result.factor_result.valid_until,
  }));
});

test('rejects incomplete and expired v2 rows instead of promoting them', async () => {
  const source = await buildFreshV2Row();
  const incomplete = structuredClone(source);
  incomplete.timeframe_details['4h'] = undefined;
  assert.equal(adaptTechnicalV2Row(incomplete, { now: NOW }).error.code, 'incomplete_timeframe');

  const stale = structuredClone(source);
  stale.valid_until = '2026-07-11T11:59:59.000Z';
  assert.equal(adaptTechnicalV2Row(stale, { now: NOW }).error.code, 'stale_v2_row');

  const shortHistory = structuredClone(source);
  shortHistory.timeframe_details['1h'].bars = 19;
  assert.equal(adaptTechnicalV2Row(shortHistory, { now: NOW }).error.code, 'incomplete_timeframe');

  console.log(JSON.stringify({ type: 'technical_v2_adapter_rejections', inputs: 3, accepted: 0, rejected: 3 }));
});
