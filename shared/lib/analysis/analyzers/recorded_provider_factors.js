'use strict';

const { validateFactorResult } = require('../../../contracts/analysis');

function fail(code, message, details = {}) { return { ok: false, error: { code, message, ...details } }; }
function bounded(value, scale) { return Math.max(-1, Math.min(1, value / scale)); }
function validUntil(timestamp, days) { return new Date(Date.parse(timestamp) + days * 86_400_000).toISOString(); }
function parseEvidenceTimestamp(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Date.parse(`${raw}T00:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) return Date.parse(`${raw}Z`);
  return Date.parse(raw);
}
function evidenceTimestamp(values) {
  const timestamps = values.map(parseEvidenceTimestamp).filter(Number.isFinite);
  return timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null;
}
function unixTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric).toISOString();
}
function checked(factor, diagnostics) {
  const validation = validateFactorResult(factor);
  return validation.ok ? { ok: true, factor_result: factor, diagnostics } : fail('invalid_factor', 'recorded provider factor failed v3 validation', { validation_errors: validation.errors });
}
function recordedAvailable(fixture, asOf) {
  const retrieved = Date.parse(fixture?.provenance?.retrieved_at || '');
  const decision = Date.parse(asOf || '');
  return Number.isFinite(retrieved) && Number.isFinite(decision) && retrieved <= decision;
}

function buildEiaEnergyFactor(fixture, { asOf = fixture?.provenance?.retrieved_at } = {}) {
  if (!fixture || !String(fixture.provenance?.fetch_status || '').startsWith('success') || !Array.isArray(fixture.payload?.response?.data)) return fail('eia_unavailable', 'recorded EIA payload is unavailable');
  if (!recordedAvailable(fixture, asOf)) return fail('eia_not_yet_available', 'recorded EIA payload was not available at the decision time');
  const rows = fixture.payload.response.data;
  const series = (id) => rows.filter((row) => row.series === id && Number.isFinite(Number(row.value))).sort((a, b) => b.period.localeCompare(a.period));
  const stocks = series('WCESTUS1');
  const production = series('WCRFPUS2');
  if (stocks.length < 2 || production.length < 2) return fail('insufficient_eia_history', 'two EIA periods per required series are required');
  const stockChange = (Number(stocks[0].value) - Number(stocks[1].value)) / Math.abs(Number(stocks[1].value));
  const productionChange = (Number(production[0].value) - Number(production[1].value)) / Math.abs(Number(production[1].value));
  const score = (-bounded(stockChange, 0.03) - bounded(productionChange, 0.03)) / 2;
  const timestamp = evidenceTimestamp([stocks[0].period, production[0].period]);
  if (!timestamp) return fail('invalid_eia_period', 'latest EIA periods must be valid timestamps');
  return checked({
    domain: 'supply_demand', score, strength: Math.min(1, Math.abs(score) + 0.25), coverage: 1, quality: 'verified',
    data_as_of: timestamp, valid_until: validUntil(timestamp, 14),
    evidence_ids: [`eia:WCESTUS1:${stocks[0].period}`, `eia:WCRFPUS2:${production[0].period}`],
    drivers: [`crude stocks WoW ${(stockChange * 100).toFixed(2)}%`, `field production WoW ${(productionChange * 100).toFixed(2)}%`, 'research heuristic; not decision-ready'],
  }, { stock_change: stockChange, production_change: productionChange, rows: rows.length, evidence_as_of: timestamp, retrieved_at: fixture.provenance.retrieved_at });
}

function buildDefillamaProtocolFactor(fixture, { asOf = fixture?.provenance?.retrieved_at } = {}) {
  if (!fixture || fixture.provenance?.fetch_status !== 'success' || !Array.isArray(fixture.payload?.tvl)) return fail('defillama_unavailable', 'recorded DefiLlama payload is unavailable');
  if (!recordedAvailable(fixture, asOf)) return fail('defillama_not_yet_available', 'recorded DefiLlama payload was not available at the decision time');
  const tvl = fixture.payload.tvl.filter((row) => Number.isFinite(row.totalLiquidityUSD)).sort((a, b) => a.date - b.date);
  if (tvl.length < 2 || tvl[0].totalLiquidityUSD <= 0) return fail('insufficient_defillama_history', 'two positive TVL observations are required');
  const change = (tvl.at(-1).totalLiquidityUSD - tvl[0].totalLiquidityUSD) / tvl[0].totalLiquidityUSD;
  const score = bounded(change, 0.10);
  const timestamp = unixTimestamp(tvl.at(-1).date);
  if (!timestamp) return fail('invalid_defillama_timestamp', 'latest DefiLlama observation timestamp is invalid');
  return checked({
    domain: 'onchain', score, strength: Math.min(1, Math.abs(score) + 0.25), coverage: 1, quality: 'verified',
    data_as_of: timestamp, valid_until: validUntil(timestamp, 7), evidence_ids: [`defillama:${fixture.payload.id}:${tvl[0].date}-${tvl.at(-1).date}`],
    drivers: [`TVL window change ${(change * 100).toFixed(2)}%`, `recorded TVL points ${tvl.length}`, 'research heuristic; not decision-ready'],
  }, { tvl_change: change, records: tvl.length, evidence_as_of: timestamp, retrieved_at: fixture.provenance.retrieved_at });
}

function buildFxMacroFactor(fixture, { asOf = fixture?.provenance?.retrieved_at } = {}) {
  const payload = fixture?.payload;
  const yields = payload?.treasury_yield_curve?.records;
  const fx = Number(payload?.ecb_exchange_rate?.OBS_VALUE);
  if (fixture?.provenance?.fetch_status !== 'success' || !Array.isArray(yields) || yields.length < 2 || !Number.isFinite(fx)) return fail('fx_macro_unavailable', 'recorded ECB/Treasury payload is unavailable or incomplete');
  if (!recordedAvailable(fixture, asOf)) return fail('fx_macro_not_yet_available', 'recorded ECB/Treasury payload was not available at the decision time');
  const rows = yields.slice().sort((a, b) => String(a.NEW_DATE).localeCompare(String(b.NEW_DATE)));
  const latest = rows.at(-1);
  const prior = rows.at(-2);
  const latestSpread = Number(latest.BC_10YEAR) - Number(latest.BC_2YEAR);
  const priorSpread = Number(prior.BC_10YEAR) - Number(prior.BC_2YEAR);
  if (![latestSpread, priorSpread].every(Number.isFinite)) return fail('invalid_yield_curve', 'Treasury 2y/10y values are required');
  const spreadChange = latestSpread - priorSpread;
  const score = bounded(spreadChange, 0.25);
  const timestamp = evidenceTimestamp([latest.NEW_DATE, payload.ecb_exchange_rate.TIME_PERIOD]);
  if (!timestamp) return fail('invalid_fx_observation_date', 'latest Treasury and ECB observation dates are required');
  return checked({
    domain: 'macro', score, strength: Math.min(1, Math.abs(score) + 0.25), coverage: 1, quality: 'verified',
    data_as_of: timestamp, valid_until: validUntil(timestamp, 7),
    evidence_ids: [`treasury:curve:${latest.NEW_DATE}`, `ecb:EXR.D.USD.EUR.SP00.A:${payload.ecb_exchange_rate.TIME_PERIOD}`],
    drivers: [`US 10y-2y spread ${latestSpread.toFixed(2)}pp`, `daily spread change ${spreadChange.toFixed(2)}pp`, `ECB USD per EUR ${fx.toFixed(4)}`, 'research heuristic; not decision-ready'],
  }, { exchange_rate: fx, spread: latestSpread, spread_change: spreadChange, treasury_records: rows.length, evidence_as_of: timestamp, retrieved_at: fixture.provenance.retrieved_at });
}

function unavailableProviderQuality(fixture, providerId, timestamp = fixture?.provenance?.retrieved_at || new Date().toISOString()) {
  const quality = {
    domain: 'data_quality', score: -1, strength: 1, coverage: 0, quality: 'unknown',
    data_as_of: new Date(timestamp).toISOString(), valid_until: new Date(timestamp).toISOString(),
    evidence_ids: [`${providerId}:unavailable`], drivers: [`${providerId} unavailable: ${fixture?.error?.message || fixture?.provenance?.fetch_status || 'unknown'}`],
  };
  return checked(quality, { fetch_status: fixture?.provenance?.fetch_status || 'missing' });
}

module.exports = { buildEiaEnergyFactor, buildDefillamaProtocolFactor, buildFxMacroFactor, unavailableProviderQuality };
