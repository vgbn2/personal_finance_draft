'use strict';

// These values are deliberately synthetic and are not provider observations.
const syntheticFixture = {
  fixture_status: 'synthetic',
  fixture_id: 'analysis-contracts-v3-synthetic',
  source_note: 'Synthetic contract coverage only; not real provider data.',
};

const assetDescriptors = [
  { asset_id: 'equity:US:ACME', symbol: 'ACME', family: 'equity', subtype: 'common_stock', market: 'US', sector: 'technology', quote_currency: 'USD', region: 'US', provider_ids: { sec_cik: '0000000001' } },
  { asset_id: 'cryptoasset:GLOBAL:BTC', symbol: 'BTC', family: 'cryptoasset', subtype: 'native_chain', market: 'GLOBAL', quote_currency: 'USD', region: 'GLOBAL', provider_ids: { coinmetrics_asset: 'btc' } },
  { asset_id: 'cryptoasset:GLOBAL:PROTO', symbol: 'PROTO', family: 'cryptoasset', subtype: 'protocol_token', market: 'GLOBAL', quote_currency: 'USD', region: 'GLOBAL', provider_ids: { contract_address: '0xsynthetic' } },
  { asset_id: 'cryptoasset:GLOBAL:MEME', symbol: 'MEME', family: 'cryptoasset', subtype: 'exchange_or_meme_token', market: 'GLOBAL', quote_currency: 'USD', region: 'GLOBAL', provider_ids: { contract_address: '0xsyntheticmeme' } },
  { asset_id: 'fx_pair:GLOBAL:EURUSD', symbol: 'EURUSD', family: 'fx_pair', subtype: 'fx_pair', market: 'OTC', quote_currency: 'USD', region: 'EU-US', provider_ids: { ecb_pair: 'EURUSD' } },
  { asset_id: 'commodity:US:CL', symbol: 'CL', family: 'commodity', subtype: 'energy', market: 'US', quote_currency: 'USD', region: 'US', provider_ids: { eia_series: 'SYNTHETIC-CL' } },
  { asset_id: 'commodity:US:GC', symbol: 'GC', family: 'commodity', subtype: 'metals', market: 'US', quote_currency: 'USD', region: 'US', provider_ids: { exchange_contract: 'SYNTHETIC-GC' } },
  { asset_id: 'commodity:US:ZW', symbol: 'ZW', family: 'commodity', subtype: 'agriculture', market: 'US', quote_currency: 'USD', region: 'US', provider_ids: { exchange_contract: 'SYNTHETIC-ZW' } },
  { asset_id: 'index:US:SPX', symbol: 'SPX', family: 'index', subtype: 'index', market: 'US', quote_currency: 'USD', region: 'US', provider_ids: { index_vendor: 'SYNTHETIC-SPX' } },
];

const observation = {
  subject_id: 'equity:US:ACME',
  metric_id: 'fundamental.revenue',
  value: 123456789,
  unit: 'USD',
  period_end: '2026-06-30T00:00:00Z',
  released_at: '2026-07-30T20:05:00Z',
  available_at: '2026-07-30T20:05:00Z',
  ingested_at: '2026-07-30T20:06:00Z',
  provider: 'synthetic_fixture',
  provider_ref: 'analysis-contracts-v3-synthetic:revenue',
  vintage: null,
  quality: 'verified',
};

const factorResults = [
  { domain: 'technical', score: 0.42, strength: 0.61, coverage: 0.8, quality: 'verified', data_as_of: '2026-07-30T20:05:00Z', valid_until: '2026-10-30T20:05:00Z', evidence_ids: ['synthetic-observation-1'], drivers: ['synthetic momentum positive'] },
  { domain: 'fundamental', score: 0.18, strength: 0.44, coverage: 0.75, quality: 'estimated', data_as_of: '2026-07-30T20:05:00Z', valid_until: '2026-10-30T20:05:00Z', evidence_ids: ['synthetic-observation-2'], drivers: ['synthetic revenue growth positive'] },
  { domain: 'macro', score: 0.05, strength: 0.2, coverage: 0.5, quality: 'degraded', data_as_of: '2026-07-30T20:05:00Z', valid_until: '2026-10-30T20:05:00Z', evidence_ids: ['synthetic-observation-3'], drivers: ['synthetic macro evidence'] },
  { domain: 'data_quality', score: 0.7, strength: 0.7, coverage: 1, quality: 'verified', data_as_of: '2026-07-30T20:05:00Z', valid_until: '2026-10-30T20:05:00Z', evidence_ids: ['synthetic-observation-4'], drivers: ['synthetic provenance present'] },
];

const equityScorecardRow = {
  schema_version: 3,
  asset_descriptor: assetDescriptors[0],
  horizon: '3m',
  direction: 'long',
  composite_strength: 0.31,
  factor_results: factorResults,
  coverage: 0.76,
  data_quality: 'degraded',
  data_as_of: '2026-07-30T20:05:00Z',
  valid_until: '2026-10-30T20:05:00Z',
  decision_state: 'degraded',
  exclusion_reasons: ['synthetic macro coverage below the policy target'],
  scoring_policy: { id: 'equity', version: '3m-v1-shadow', family: 'equity', horizon: '3m' },
};

module.exports = { syntheticFixture, assetDescriptors, observation, factorResults, equityScorecardRow };
