'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { validateScorecardRow } = require('../../../../shared/contracts/analysis');
const { getFamilySections } = require('../../../../shared/contracts/analysis');
const { buildEiaEnergyFactor, buildDefillamaProtocolFactor, buildFxMacroFactor } = require('../../../../shared/lib/analysis/analyzers/recorded_provider_factors');
const { buildFxShadow, buildIndexShadow, buildEnergyShadow, buildNativeChainShadows, buildDefiShadow, buildAllRecordedFamilyShadows } = require('../../../../shared/lib/analysis/services/recorded_family_shadows');
const fx = require('../../../../shared/fixtures/analysis/providers/fx_macro_recorded.json');
const eia = require('../../../../shared/fixtures/analysis/providers/eia_energy_recorded.json');
const defi = require('../../../../shared/fixtures/analysis/providers/defillama_aave_recorded.json');

test('recorded FX, EIA, and DefiLlama payloads produce validated family factors', () => {
  const fxFactor = buildFxMacroFactor(fx);
  const energyFactor = buildEiaEnergyFactor(eia);
  const defiFactor = buildDefillamaProtocolFactor(defi);
  assert.equal(fxFactor.ok, true);
  assert.equal(energyFactor.ok, true);
  assert.equal(defiFactor.ok, true);
  assert.equal(fxFactor.diagnostics.treasury_records, 7);
  assert.equal(energyFactor.diagnostics.rows, 6);
  assert.equal(defiFactor.diagnostics.records, 10);
  assert.equal(fxFactor.factor_result.domain, 'macro');
  assert.equal(energyFactor.factor_result.domain, 'supply_demand');
  assert.equal(defiFactor.factor_result.domain, 'onchain');
  console.log(`recorded family factors: treasury=${fxFactor.diagnostics.treasury_records} eia=${energyFactor.diagnostics.rows} defi_tvl=${defiFactor.diagnostics.records}`);
});

test('recorded provider factors use evidence time rather than fixture retrieval time', () => {
  const fxFactor = buildFxMacroFactor(fx).factor_result;
  const energyFactor = buildEiaEnergyFactor(eia).factor_result;
  const defiFactor = buildDefillamaProtocolFactor(defi).factor_result;

  assert.equal(fxFactor.data_as_of, '2026-07-10T00:00:00.000Z');
  assert.equal(energyFactor.data_as_of, '2026-07-03T00:00:00.000Z');
  assert.equal(defiFactor.data_as_of, new Date(defi.payload.tvl.at(-1).date * 1000).toISOString());
  for (const [factor, fixture] of [[fxFactor, fx], [energyFactor, eia], [defiFactor, defi]]) {
    assert.ok(Date.parse(factor.data_as_of) < Date.parse(fixture.provenance.retrieved_at));
    assert.equal(Date.parse(factor.valid_until) > Date.parse(factor.data_as_of), true);
  }
  console.log(`recorded evidence timing: fx=${fxFactor.data_as_of} eia=${energyFactor.data_as_of} defi=${defiFactor.data_as_of}`);
});

test('recorded provider artifacts are invisible before their retrieval time', () => {
  const before = (fixture) => new Date(Date.parse(fixture.provenance.retrieved_at) - 1).toISOString();
  assert.equal(buildFxMacroFactor(fx, { asOf: before(fx) }).error.code, 'fx_macro_not_yet_available');
  assert.equal(buildEiaEnergyFactor(eia, { asOf: before(eia) }).error.code, 'eia_not_yet_available');
  assert.equal(buildDefillamaProtocolFactor(defi, { asOf: before(defi) }).error.code, 'defillama_not_yet_available');
  console.log('recorded provider timing: pre_retrieval_inputs=3 accepted=0 rejected=3');
});

test('family shadows validate and unavailable official feeds fail closed', () => {
  const fxShadow = buildFxShadow();
  const energyShadow = buildEnergyShadow();
  const defiShadow = buildDefiShadow();
  for (const shadow of [fxShadow, energyShadow, defiShadow]) {
    assert.equal(shadow.ok, true);
    assert.equal(shadow.research_only, true);
    assert.equal(shadow.decision_ready, false);
    assert.equal(validateScorecardRow(shadow.rows[0]).ok, true);
    assert.equal(shadow.rows[0].decision_state, 'degraded');
  }

  const indexShadow = buildIndexShadow();
  assert.equal(indexShadow.ok, true);
  assert.equal(indexShadow.rows[0].decision_state, 'excluded');
  assert.ok(indexShadow.rows[0].exclusion_reasons.includes('missing required breadth factor'));
  const native = buildNativeChainShadows();
  assert.equal(native.length, 2);
  assert.ok(native.every((shadow) => shadow.rows[0].decision_state === 'excluded'));
  assert.ok(native.every((shadow) => shadow.rows[0].exclusion_reasons.includes('missing required onchain factor')));
  console.log(`family shadows: degraded=3 excluded=${1 + native.length} official_unavailable=index,coinmetrics`);
});

test('family expansion produces one canonical six-row shadow inventory', () => {
  const shadows = buildAllRecordedFamilyShadows();
  assert.equal(shadows.length, 6);
  assert.deepEqual(shadows.map((item) => item.rows[0].asset_descriptor.symbol), ['EURUSD', 'SPX', 'CL', 'BTC', 'ETH', 'AAVE']);
  assert.equal(shadows.filter((item) => item.rows[0].decision_state === 'excluded').length, 3);
  assert.equal(shadows.filter((item) => item.rows[0].decision_state === 'degraded').length, 3);
  assert.ok(shadows.every((item) => item.rows[0].decision_state !== 'eligible'));
  console.log('family inventory: rows=6 eligible=0 degraded=3 excluded=3');
});

test('every expanded family exposes explicit applicable and inapplicable sections', () => {
  const rows = buildAllRecordedFamilyShadows().map((item) => item.rows[0]);
  for (const row of rows) {
    const sections = getFamilySections(row.asset_descriptor.family, row.asset_descriptor.subtype);
    assert.ok(Array.isArray(sections) && sections.length > 0);
    for (const factor of row.factor_results) assert.ok(sections.includes(factor.domain), `${row.asset_descriptor.symbol}:${factor.domain} must be applicable`);
    if (row.asset_descriptor.family !== 'cryptoasset') assert.equal(sections.includes('onchain'), false);
  }
  console.log(`family applicability: rows=${rows.length} explicit_sections=${rows.length} inapplicable_factors=0`);
});
