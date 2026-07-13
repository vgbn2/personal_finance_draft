'use strict';

const { buildRecordedAppleShadow } = require('./equity_3m_shadow');
const { buildAllRecordedFamilyShadows } = require('./recorded_family_shadows');

const ALL_RECORDED_FIXTURE_ID = 'all-recorded';
const STATE_RANK = Object.freeze({ eligible: 0, degraded: 1, excluded: 2 });

function rankShadowRows(rows) {
  return rows.slice().sort((left, right) => {
    const stateOrder = (STATE_RANK[left.decision_state] ?? 99) - (STATE_RANK[right.decision_state] ?? 99);
    if (stateOrder) return stateOrder;
    const strengthOrder = right.composite_strength - left.composite_strength;
    if (strengthOrder) return strengthOrder;
    return left.asset_descriptor.symbol.localeCompare(right.asset_descriptor.symbol);
  });
}

function buildAllRecordedShadowCatalog() {
  const equity = buildRecordedAppleShadow();
  const families = buildAllRecordedFamilyShadows();
  const envelopes = [equity, ...families];
  const rows = rankShadowRows(envelopes.flatMap((item) => item.rows || []));
  return {
    ok: envelopes.every((item) => item.ok), type: 'analysis_shadow_catalog', schema_version: 3,
    generated_at: envelopes.map((item) => item.generated_at || item.provenance?.retrieved_at).filter(Boolean).sort().at(-1),
    fixture_id: ALL_RECORDED_FIXTURE_ID, research_only: true, decision_ready: false,
    filters: { family: null, symbol: null, state: null },
    counts: {
      rows: rows.length,
      eligible: rows.filter((row) => row.decision_state === 'eligible').length,
      degraded: rows.filter((row) => row.decision_state === 'degraded').length,
      excluded: rows.filter((row) => row.decision_state === 'excluded').length,
      recorded_provider_envelopes: envelopes.length,
    },
    rows,
    provider_status: envelopes.map((item) => ({ fixture_id: item.fixture_id, ok: item.ok, fetch_status: item.provenance?.fetch_status || item.provenance?.sec?.fetch_status || 'recorded' })),
  };
}

function filterShadowCatalog(catalog, { family = '', symbol = '', state = '' } = {}) {
  const familyAliases = { equities: 'equity', crypto: 'cryptoasset', fx: 'fx_pair', indices: 'index', commodities: 'commodity' };
  const normalizedFamily = familyAliases[family] || family;
  const rows = rankShadowRows(catalog.rows.filter((row) => (!normalizedFamily || row.asset_descriptor.family === normalizedFamily)
    && (!symbol || row.asset_descriptor.symbol === symbol.toUpperCase())
    && (!state || row.decision_state === state)));
  return { ...catalog, filters: { family: normalizedFamily || null, symbol: symbol ? symbol.toUpperCase() : null, state: state || null }, counts: { ...catalog.counts, rows: rows.length, eligible: rows.filter((row) => row.decision_state === 'eligible').length, degraded: rows.filter((row) => row.decision_state === 'degraded').length, excluded: rows.filter((row) => row.decision_state === 'excluded').length }, rows };
}

module.exports = { ALL_RECORDED_FIXTURE_ID, buildAllRecordedShadowCatalog, filterShadowCatalog, rankShadowRows };
