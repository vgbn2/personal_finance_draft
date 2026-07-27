'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { composeCombinedExactAsset } = require('../../../../shared/lib/analysis/services/combined_exact_asset');

const DECISION_AT = '2026-07-11T12:00:00.000Z';
const ASSET = {
  asset_id: 'fx_pair:OTC:EURUSD',
  symbol: 'EURUSD',
  family: 'fx_pair',
  subtype: 'fx_pair',
  market: 'OTC',
  sector: null,
  quote_currency: 'USD',
  region: 'EUR-USD',
  provider_ids: { legacy_symbol: 'EURUSD' },
  taxonomy_source: { legacy_family: 'fx', path: 'fx.symbols[0]' },
};
const TECHNICAL = {
  symbol: 'EURUSD',
  family: 'fx',
  complete: true,
  bias: 'long',
  score: 0.4,
  confidence: 0.6,
  data_as_of: '2026-07-11T08:00:00.000Z',
  valid_until: '2026-07-11T15:00:00.000Z',
  tfs: { '1h': 'long', '4h': 'long' },
  timeframe_details: {
    '1h': {
      bias: 'long',
      bars: 30,
      last_bar_at: '2026-07-11T08:00:00.000Z',
      valid_until: '2026-07-11T13:00:00.000Z',
    },
    '4h': {
      bias: 'long',
      bars: 30,
      last_bar_at: '2026-07-11T08:00:00.000Z',
      valid_until: '2026-07-11T16:00:00.000Z',
    },
  },
  confidence_kind: 'heuristic_vote_strength',
};
const MACRO = [
  {
    family: 'macro',
    series: 'CPI',
    source: 'fred',
    value: 100,
    period_end: '2026-05-01T00:00:00.000Z',
    released_at: '2026-06-01T12:00:00.000Z',
    available_at: '2026-06-01T12:00:01.000Z',
    ingested_at: '2026-06-01T12:00:02.000Z',
    vintage: 'initial',
  },
  {
    family: 'macro',
    series: 'US02YIELD',
    source: 'fred',
    value: 4.1,
    period_end: '2026-07-01T00:00:00.000Z',
    released_at: '2026-07-02T12:00:00.000Z',
    available_at: '2026-07-02T12:00:01.000Z',
    ingested_at: '2026-07-02T12:00:02.000Z',
    vintage: 'initial',
  },
];
const MAPPING = { macro_series: ['CPI', 'US02YIELD'], macro_max_age_days: 120 };

test('exact same-asset technical and point-in-time macro evidence compose deterministically', () => {
  const input = {
    asset: ASSET,
    technicalRow: TECHNICAL,
    macroRecords: MACRO,
    macroMapping: MAPPING,
    decisionAt: DECISION_AT,
  };
  const first = composeCombinedExactAsset(input);
  const second = composeCombinedExactAsset(structuredClone(input));

  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.asset_id, ASSET.asset_id);
  assert.equal(first.eligible, true);
  assert.equal(first.decision_ready, false);
  assert.equal(first.research_only, true);
  assert.deepEqual(first.components.map((item) => item.domain), ['data_quality', 'macro', 'technical']);
  assert.equal(first.scorecard_row.coverage, 0.75);
  assert.equal(first.scorecard_row.composite_strength, 0.1);
});

test('bare, mismatched, future-only, stale, and synthetic evidence fail closed', () => {
  const base = {
    asset: ASSET,
    technicalRow: TECHNICAL,
    macroRecords: MACRO,
    macroMapping: MAPPING,
    decisionAt: DECISION_AT,
  };

  const bare = composeCombinedExactAsset({ ...base, asset: { ...ASSET, asset_id: 'EURUSD' } });
  assert.equal(bare.ok, false);

  const mismatch = composeCombinedExactAsset({
    ...base,
    technicalRow: { ...TECHNICAL, symbol: 'EURJPY' },
  });
  assert.deepEqual(mismatch.reasons, ['technical_asset_mismatch']);

  const future = composeCombinedExactAsset({
    ...base,
    macroRecords: MACRO.map((row) => ({
      ...row,
      released_at: '2026-07-12T00:00:00.000Z',
      available_at: '2026-07-12T00:00:01.000Z',
      ingested_at: '2026-07-12T00:00:02.000Z',
    })),
  });
  assert.deepEqual(future.reasons, ['macro_observation_missing']);

  const stale = composeCombinedExactAsset({
    ...base,
    macroMapping: { ...MAPPING, macro_max_age_days: 1 },
  });
  assert.deepEqual(stale.reasons, ['stale_macro_observation']);

  const synthetic = composeCombinedExactAsset({
    ...base,
    macroRecords: MACRO.map((row) => ({ ...row, source: 'synthetic-fixture' })),
  });
  assert.deepEqual(synthetic.reasons, ['synthetic_macro_observation']);
});

test('later macro revisions remain invisible before available_at', () => {
  const revised = {
    ...MACRO[0],
    value: 102,
    vintage: 'revised',
    available_at: '2026-07-12T00:00:01.000Z',
    ingested_at: '2026-07-12T00:00:02.000Z',
  };
  const result = composeCombinedExactAsset({
    asset: ASSET,
    technicalRow: TECHNICAL,
    macroRecords: [...MACRO, revised],
    macroMapping: MAPPING,
    decisionAt: DECISION_AT,
  });
  const cpi = result.components
    .find((item) => item.domain === 'macro')
    .provenance.find((item) => item.series === 'CPI');

  assert.match(cpi.revision_id, /initial$/);
});
