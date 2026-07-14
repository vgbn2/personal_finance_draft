'use strict';

const { validateFactorResult, validateObservation } = require('../../../contracts/analysis');

const METRICS = Object.freeze({
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  net_income: ['NetIncomeLoss'],
  operating_income: ['OperatingIncomeLoss'],
  operating_cash_flow: ['NetCashProvidedByUsedInOperatingActivities'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment'],
  assets: ['Assets'],
  liabilities: ['Liabilities'],
  equity: ['StockholdersEquity'],
});

const FLOW_METRICS = new Set(['revenue', 'net_income', 'operating_income', 'operating_cash_flow', 'capex']);

function reject(code, message, details = {}) {
  return { ok: false, error: { code, message, ...details } };
}

function utcDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

// Company Facts exposes the filing date, not the acceptance timestamp. Making the
// fact available at the next UTC day is conservative and prevents same-day lookahead.
function availabilityAfterFiled(filed) {
  const timestamp = utcDate(filed);
  if (!timestamp) return null;
  return new Date(Date.parse(timestamp) + 86_400_000).toISOString();
}

function unwrapRecordedArtifact(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reject('invalid_artifact', 'SEC artifact must be an object');
  const payload = input.payload || input;
  const provenance = input.payload ? input.provenance : null;
  if (!payload || typeof payload !== 'object' || !payload.cik || !payload.entityName || !payload.facts?.['us-gaap']) {
    return reject('invalid_companyfacts', 'SEC artifact is missing cik, entityName, or us-gaap facts');
  }
  if (input.payload && (!provenance?.source_url || !provenance?.retrieved_at || !provenance?.content_type)) {
    return reject('missing_provenance', 'recorded SEC artifact requires source URL, retrieval time, and content type');
  }
  return { ok: true, payload, provenance };
}

function durationDays(item) {
  if (!item.start || !item.end) return null;
  const value = (Date.parse(`${item.end}T00:00:00Z`) - Date.parse(`${item.start}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(value) ? value : null;
}

function usableFact(item, metric, asOfMs) {
  const availableAt = availabilityAfterFiled(item.filed);
  if (!availableAt || Date.parse(availableAt) > asOfMs || !Number.isFinite(item.val)) return false;
  if (!['10-Q', '10-K', '10-Q/A', '10-K/A'].includes(item.form)) return false;
  if (!item.end || !item.accn) return false;
  if (!FLOW_METRICS.has(metric)) return true;
  const days = durationDays(item);
  return days !== null && days >= 60 && days <= 380;
}

function candidateFacts(payload, metric, asOfMs) {
  const gaap = payload.facts['us-gaap'];
  for (const concept of METRICS[metric]) {
    const fact = gaap[concept];
    const rows = fact?.units?.USD;
    if (!Array.isArray(rows)) continue;
    const usable = rows.filter((item) => usableFact(item, metric, asOfMs));
    if (usable.length) return { concept, label: fact.label || concept, rows: usable };
  }
  return null;
}

function latestRestatementPerPeriod(rows) {
  const selected = new Map();
  for (const row of rows) {
    const key = `${row.start || 'instant'}:${row.end}:${row.fp || ''}:${row.fy || ''}`;
    const current = selected.get(key);
    const currentFiled = current ? Date.parse(`${current.filed}T00:00:00Z`) : -Infinity;
    const rowFiled = Date.parse(`${row.filed}T00:00:00Z`);
    if (!current || rowFiled > currentFiled || (rowFiled === currentFiled && String(row.accn) > String(current.accn))) selected.set(key, row);
  }
  return [...selected.values()];
}

function observationFor(payload, metric, concept, row) {
  const availableAt = availabilityAfterFiled(row.filed);
  return {
    subject_id: `equity:US:${payload.tickers?.[0] || `CIK${String(payload.cik).padStart(10, '0')}`}`,
    metric_id: `fundamental.${metric}`,
    value: row.val,
    unit: 'USD',
    period_end: utcDate(row.end),
    released_at: availableAt,
    available_at: availableAt,
    provider: 'sec_edgar_companyfacts',
    provider_ref: `sec:${payload.cik}:${concept}:${row.accn}`,
    quality: 'verified',
    metadata: { concept, accession: row.accn, form: row.form, filed: row.filed, frame: row.frame || null, fiscal_year: row.fy || null, fiscal_period: row.fp || null, start: row.start || null },
  };
}

function normalizeSecCompanyFacts(input, { asOf = new Date().toISOString() } = {}) {
  const artifact = unwrapRecordedArtifact(input);
  if (!artifact.ok) return artifact;
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs)) return reject('invalid_as_of', 'asOf must be an ISO timestamp');

  const observations = [];
  const missing = [];
  const concepts = {};
  for (const metric of Object.keys(METRICS)) {
    const candidate = candidateFacts(artifact.payload, metric, asOfMs);
    if (!candidate) {
      missing.push(metric);
      continue;
    }
    concepts[metric] = candidate.concept;
    for (const row of latestRestatementPerPeriod(candidate.rows)) {
      const observation = observationFor(artifact.payload, metric, candidate.concept, row);
      if (validateObservation(observation).ok) observations.push(observation);
    }
  }
  observations.sort((left, right) => left.metric_id.localeCompare(right.metric_id) || Date.parse(left.period_end) - Date.parse(right.period_end));
  return {
    ok: true,
    company: { cik: String(artifact.payload.cik).padStart(10, '0'), entity_name: artifact.payload.entityName, ticker: artifact.payload.tickers?.[0] || null },
    provenance: artifact.provenance,
    concepts,
    missing_metrics: missing,
    observations,
  };
}

function latestByMetric(observations, metric) {
  return observations.filter((item) => item.metric_id === `fundamental.${metric}`).sort((a, b) => Date.parse(b.period_end) - Date.parse(a.period_end));
}

function quarterlyFlows(observations, metric) {
  return latestByMetric(observations, metric).filter((item) => /^CY\d{4}Q[1-4]$/.test(item.metadata?.frame || ''));
}

function comparablePriorQuarter(rows, latest) {
  const match = /^(CY)(\d{4})(Q[1-4])$/.exec(latest?.metadata?.frame || '');
  if (!match) return null;
  const priorFrame = `${match[1]}${Number(match[2]) - 1}${match[3]}`;
  return rows.find((item) => item.metadata?.frame === priorFrame) || null;
}

function bounded(value, scale) {
  return Math.max(-1, Math.min(1, value / scale));
}

function buildSecFundamentalFactor(normalized, { asOf = new Date().toISOString(), validDays = 120 } = {}) {
  if (!normalized?.ok || !Array.isArray(normalized.observations)) return reject('invalid_normalized_facts', 'normalized SEC facts are required');
  const required = ['revenue', 'net_income', 'operating_income', 'operating_cash_flow', 'assets', 'liabilities'];
  const missing = required.filter((metric) => latestByMetric(normalized.observations, metric).length === 0);
  if (missing.length) return reject('missing_required_fundamentals', 'required SEC fundamentals are missing', { missing_metrics: missing });

  const revenue = quarterlyFlows(normalized.observations, 'revenue');
  const latestRevenue = revenue[0];
  const priorRevenue = comparablePriorQuarter(revenue, latestRevenue);
  const netIncome = quarterlyFlows(normalized.observations, 'net_income')[0];
  const operatingIncome = quarterlyFlows(normalized.observations, 'operating_income')[0];
  const cashFlow = latestByMetric(normalized.observations, 'operating_cash_flow')[0];
  const cashFlowNetIncome = latestByMetric(normalized.observations, 'net_income').find((item) => item.period_end === cashFlow?.period_end && item.metadata?.start === cashFlow?.metadata?.start);
  const assets = latestByMetric(normalized.observations, 'assets')[0];
  const liabilities = latestByMetric(normalized.observations, 'liabilities')[0];
  if (!latestRevenue || !priorRevenue || priorRevenue.value === 0 || latestRevenue.value <= 0 || !netIncome || !operatingIncome || !cashFlow || !cashFlowNetIncome || assets.value <= 0) {
    return reject('insufficient_fundamental_history', 'comparable year-over-year quarterly flows and positive revenue/assets are required');
  }

  const revenueGrowth = (latestRevenue.value - priorRevenue.value) / Math.abs(priorRevenue.value);
  const profitability = netIncome.value / latestRevenue.value;
  const operatingMargin = operatingIncome.value / latestRevenue.value;
  const cashConversion = cashFlow.value / Math.max(1, Math.abs(cashFlowNetIncome.value));
  const leverage = liabilities.value / assets.value;
  const signals = [bounded(revenueGrowth, 0.20), bounded(profitability, 0.20), bounded(operatingMargin, 0.25), bounded(cashConversion - 1, 1), bounded(0.60 - leverage, 0.60)];
  const score = signals.reduce((sum, value) => sum + value, 0) / signals.length;
  const used = [latestRevenue, priorRevenue, netIncome, operatingIncome, cashFlow, cashFlowNetIncome, assets, liabilities];
  const dataAsOf = used.map((item) => item.available_at).sort().at(-1);
  const validUntil = new Date(Date.parse(dataAsOf) + validDays * 86_400_000).toISOString();
  if (Date.parse(validUntil) < Date.parse(asOf)) return reject('stale_fundamentals', 'SEC fundamental evidence is outside the policy freshness window', { valid_until: validUntil });

  const factor = {
    domain: 'fundamental', score, strength: Math.min(1, Math.abs(score) + 0.35), coverage: required.length / Object.keys(METRICS).length,
    quality: 'verified', data_as_of: dataAsOf, valid_until: validUntil,
    evidence_ids: [...new Set(used.map((item) => item.provider_ref))],
    drivers: [`revenue growth ${(revenueGrowth * 100).toFixed(1)}%`, `operating margin ${(operatingMargin * 100).toFixed(1)}%`, `liabilities/assets ${(leverage * 100).toFixed(1)}%`, 'research heuristic; not decision-ready'],
  };
  const validation = validateFactorResult(factor);
  return validation.ok ? { ok: true, factor_result: factor, diagnostics: { revenue_growth: revenueGrowth, profitability, operating_margin: operatingMargin, cash_conversion: cashConversion, leverage } } : reject('invalid_fundamental_factor', 'fundamental factor failed v3 validation', { validation_errors: validation.errors });
}

module.exports = { METRICS, availabilityAfterFiled, normalizeSecCompanyFacts, buildSecFundamentalFactor };
