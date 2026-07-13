'use strict';

const fxFixture = require('../../../fixtures/analysis/providers/fx_macro_recorded.json');
const indexFixture = require('../../../fixtures/analysis/providers/index_breadth_recorded.json');
const eiaFixture = require('../../../fixtures/analysis/providers/eia_energy_recorded.json');
const coinMetricsFixture = require('../../../fixtures/analysis/providers/coinmetrics_btc_eth_recorded.json');
const defiFixture = require('../../../fixtures/analysis/providers/defillama_aave_recorded.json');
const { buildEiaEnergyFactor, buildDefillamaProtocolFactor, buildFxMacroFactor, unavailableProviderQuality } = require('../analyzers/recorded_provider_factors');
const { composeFamilyShadow } = require('../policies/family_shadow');
const { FX_3M_V1, INDEX_3M_V1, ENERGY_3M_V1, NATIVE_CHAIN_3M_V1, DEFI_PROTOCOL_3M_V1 } = require('../policies/family_policies_v1');

function datePlus(timestamp, days) { return new Date(Date.parse(timestamp) + days * 86_400_000).toISOString(); }
function fixtureFactor(domain, score, timestamp, quality = 'estimated') {
  return { domain, score, strength: Math.max(0.2, Math.abs(score)), coverage: 1, quality, data_as_of: timestamp, valid_until: datePlus(timestamp, 30), evidence_ids: [`synthetic-parity:${domain}`], drivers: [`${domain} fixture input for family-policy parity only`] };
}
function qualityFactor(timestamp, provider, quality = 'degraded') { return { domain: 'data_quality', score: quality === 'verified' ? 1 : -0.5, strength: 1, coverage: quality === 'verified' ? 1 : 0.5, quality, data_as_of: timestamp, valid_until: datePlus(timestamp, 30), evidence_ids: [`recorded:${provider}:quality`], drivers: [`recorded ${provider} fixture; other domains may be synthetic parity inputs`] }; }
function asset(asset_id, symbol, family, subtype, market, provider_ids) { return { asset_id, symbol, family, subtype, market, quote_currency: 'USD', region: market === 'GLOBAL' ? 'GLOBAL' : 'US', provider_ids }; }
function envelope(fixtureId, provenance, result, diagnostics = {}) { return { ok: result.ok, type: 'analysis_family_shadow', schema_version: 3, fixture_id: fixtureId, research_only: true, decision_ready: false, provenance, diagnostics, rows: result.ok ? [result.scorecard_row] : [], error: result.ok ? undefined : result.error }; }

function buildFxShadow() {
  const timestamp = fxFixture.provenance.retrieved_at;
  const macro = buildFxMacroFactor(fxFixture, { asOf: timestamp });
  if (!macro.ok) return envelope('fx-recorded', fxFixture.provenance, macro);
  const factors = [fixtureFactor('technical', 0.1, timestamp), macro.factor_result, qualityFactor(timestamp, 'ecb-treasury')];
  return envelope('fx-recorded', fxFixture.provenance, composeFamilyShadow({ assetDescriptor: asset('fx_pair:OTC:EURUSD', 'EURUSD', 'fx_pair', 'fx_pair', 'OTC', { ecb_pair: 'EXR.D.USD.EUR.SP00.A' }), factors, policy: FX_3M_V1, now: timestamp }), macro.diagnostics);
}
function buildIndexShadow() {
  const timestamp = indexFixture.provenance.retrieved_at;
  const unavailable = unavailableProviderQuality(indexFixture, 'spdj-breadth', timestamp);
  const factors = [fixtureFactor('technical', 0.1, timestamp), unavailable.factor_result];
  return envelope('index-breadth-unavailable', indexFixture.provenance, composeFamilyShadow({ assetDescriptor: asset('index:US:SPX', 'SPX', 'index', 'index', 'US', { index_vendor: 'SPDJI' }), factors, policy: INDEX_3M_V1, now: timestamp }), unavailable.diagnostics);
}
function buildEnergyShadow() {
  const timestamp = eiaFixture.provenance.retrieved_at;
  const supply = buildEiaEnergyFactor(eiaFixture, { asOf: timestamp });
  if (!supply.ok) return envelope('eia-energy-recorded', eiaFixture.provenance, supply);
  const factors = [fixtureFactor('technical', 0.05, timestamp), fixtureFactor('macro', 0, timestamp), supply.factor_result, qualityFactor(timestamp, 'eia')];
  return envelope('eia-energy-recorded', eiaFixture.provenance, composeFamilyShadow({ assetDescriptor: asset('commodity:US:CL', 'CL', 'commodity', 'energy', 'US', { eia_series: 'WCESTUS1,WCRFPUS2' }), factors, policy: ENERGY_3M_V1, now: timestamp }), supply.diagnostics);
}
function buildNativeChainShadows() {
  const timestamp = coinMetricsFixture.provenance.retrieved_at;
  const unavailable = unavailableProviderQuality(coinMetricsFixture, 'coinmetrics', timestamp);
  return ['BTC', 'ETH'].map((symbol) => envelope(`coinmetrics-${symbol.toLowerCase()}-unavailable`, coinMetricsFixture.provenance, composeFamilyShadow({ assetDescriptor: asset(`cryptoasset:GLOBAL:${symbol}`, symbol, 'cryptoasset', 'native_chain', 'GLOBAL', { coinmetrics_asset: symbol.toLowerCase() }), factors: [fixtureFactor('technical', 0, timestamp), unavailable.factor_result], policy: NATIVE_CHAIN_3M_V1, now: timestamp }), unavailable.diagnostics));
}
function buildDefiShadow() {
  const timestamp = defiFixture.provenance.retrieved_at;
  const onchain = buildDefillamaProtocolFactor(defiFixture, { asOf: timestamp });
  if (!onchain.ok) return envelope('defillama-aave-recorded', defiFixture.provenance, onchain);
  const factors = [fixtureFactor('technical', 0.05, timestamp), fixtureFactor('macro', 0, timestamp), onchain.factor_result, qualityFactor(timestamp, 'defillama')];
  return envelope('defillama-aave-recorded', defiFixture.provenance, composeFamilyShadow({ assetDescriptor: asset('cryptoasset:GLOBAL:AAVE', 'AAVE', 'cryptoasset', 'protocol_token', 'GLOBAL', { defillama_slug: 'aave' }), factors, policy: DEFI_PROTOCOL_3M_V1, now: timestamp }), onchain.diagnostics);
}

function buildAllRecordedFamilyShadows() { return [buildFxShadow(), buildIndexShadow(), buildEnergyShadow(), ...buildNativeChainShadows(), buildDefiShadow()]; }
module.exports = { buildFxShadow, buildIndexShadow, buildEnergyShadow, buildNativeChainShadows, buildDefiShadow, buildAllRecordedFamilyShadows };
