<<<<<<<< HEAD:shared/lib/macro_store.js
module.exports = require('./data/macro_store');
========
const { createClient } = require('@supabase/supabase-js');

require('../runtime/env');

const SUPABASE_URL =
  process.env.SOVEREIGN_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';

const SUPABASE_SECRET_KEY =
  process.env.SOVEREIGN_SUPABASE_SECRET_KEY ||
  process.env.SOVEREIGN_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

const MACRO_SERIES_UNITS = {
  CPI: 'index_points',
  PPI: 'index_points',
  US02YIELD: 'percent',
  NFP: 'count',
  ADP: 'count',
  JOLTS: 'count',
  JOBLESS_CLAIMS: 'count',
  UNEMPLOYMENT_RATE: 'percent',
  GDP: 'level',
  RETAIL_SALES: 'level',
  CONSUMER_CONFIDENCE: 'index_points',
};

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

function signedLog1p(value) {
  if (!Number.isFinite(value)) return null;
  if (value === 0) return 0;
  return Math.sign(value) * Math.log1p(Math.abs(value));
}

function normalizeObservedAt(record) {
  const raw = record.period_end || record.timestamp || record.observed_at || null;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function macroRevisionId({ source, series, periodEnd, availableAt, vintage }) {
  if (!source || !series || !periodEnd || !availableAt) return null;
  return [source, series, periodEnd, availableAt, vintage || 'initial'].join(':');
}

function normalizeMacroObservation(record) {
  const series = String(record.series || record.symbol || '').trim();
  const observedAt = normalizeObservedAt(record);
  const rawValue = Number(record.value ?? record.close);
  const unit = MACRO_SERIES_UNITS[series] || 'level';
  const periodEnd = normalizeObservedAt(record);
  const releasedAt = normalizeTimestamp(record.released_at || record.release_date);
  const availableAt = normalizeTimestamp(record.available_at || record.realtime_start);
  const ingestedAt = normalizeTimestamp(record.ingested_at) || new Date().toISOString();
  const vintage = record.vintage == null ? null : String(record.vintage);
  const pointInTimeEligible = Boolean(
    periodEnd && releasedAt && availableAt
    && Date.parse(availableAt) >= Date.parse(releasedAt)
    && Date.parse(ingestedAt) >= Date.parse(availableAt),
  );
  const revisionId = pointInTimeEligible
    ? String(record.revision_id || macroRevisionId({
      source: String(record.source || record.provider || 'fred'),
      series,
      periodEnd,
      availableAt,
      vintage,
    }))
    : `legacy:${String(record.source || record.provider || 'fred')}:${series}:${periodEnd || 'unknown'}`;

  return {
    family: 'macro',
    series,
    source: String(record.source || record.provider || 'fred'),
    observed_at: observedAt,
    period_end: periodEnd,
    released_at: releasedAt,
    available_at: availableAt,
    ingested_at: ingestedAt,
    vintage,
    revision_id: revisionId,
    point_in_time_eligible: pointInTimeEligible,
    value: Number.isFinite(rawValue) ? rawValue : null,
    normalized_value: Number.isFinite(rawValue) ? signedLog1p(rawValue) : null,
    unit,
    normalization_method: 'signed_log1p',
    metadata: record,
  };
}

function selectMacroObservationsAsOf(records, asOf) {
  const decisionAt = normalizeTimestamp(asOf);
  if (!decisionAt) throw new TypeError('asOf must be a valid timestamp');
  const decisionMs = Date.parse(decisionAt);
  const selected = new Map();

  for (const record of buildMacroObservationRows(records)) {
    if (!record.point_in_time_eligible
      || Date.parse(record.available_at) > decisionMs
      || Date.parse(record.ingested_at) > decisionMs) continue;
    const key = `${record.family}:${record.series}:${record.period_end}`;
    const current = selected.get(key);
    const currentAvailableMs = current ? Date.parse(current.available_at) : -Infinity;
    const recordAvailableMs = Date.parse(record.available_at);
    const newerAvailability = recordAvailableMs > currentAvailableMs;
    const sameAvailabilityNewerIngest = current
      && recordAvailableMs === currentAvailableMs
      && Date.parse(record.ingested_at) > Date.parse(current.ingested_at);
    if (!current || newerAvailability || sameAvailabilityNewerIngest) {
      selected.set(key, record);
    }
  }

  return [...selected.values()].sort((left, right) => {
    const seriesOrder = left.series.localeCompare(right.series);
    return seriesOrder || Date.parse(left.period_end) - Date.parse(right.period_end);
  });
}

function buildMacroObservationRows(records) {
  const list = Array.isArray(records) ? records : [records];
  return list
    .filter((record) => record && (record.family === 'macro' || record.family === 'pmi') && (record.series || record.symbol))
    .map(normalizeMacroObservation)
    .filter((record) => Boolean(record.observed_at) && Number.isFinite(record.value));
}

function chunkRows(rows, size) {
  const output = [];
  for (let index = 0; index < rows.length; index += size) {
    output.push(rows.slice(index, index + size));
  }
  return output;
}

async function saveMacroObservations(records, options = {}) {
  const rows = buildMacroObservationRows(records);
  const batchSize = Math.max(1, Number(options.batchSize) || 250);

  if (!rows.length) {
    return {
      configured: isConfigured(),
      skipped: true,
      written: 0,
      records: 0,
      units: {},
    };
  }

  if (!isConfigured()) {
    return {
      configured: false,
      skipped: true,
      written: 0,
      records: rows.length,
      units: rows.reduce((acc, row) => {
        acc[row.unit] = (acc[row.unit] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  let written = 0;
  for (const batch of chunkRows(rows, batchSize)) {
    const { error } = await supabase
      .from(options.table || 'macro_observations')
      .upsert(batch, { onConflict: 'revision_id' });

    if (error) {
      throw new Error(`macro_observations write failed: ${error.message}`);
    }

    written += batch.length;
  }

  return {
    configured: true,
    skipped: false,
    written,
    records: rows.length,
    units: rows.reduce((acc, row) => {
      acc[row.unit] = (acc[row.unit] || 0) + 1;
      return acc;
    }, {}),
  };
}

module.exports = {
  MACRO_SERIES_UNITS,
  buildMacroObservationRows,
  isConfigured,
  normalizeMacroObservation,
  macroRevisionId,
  saveMacroObservations,
  selectMacroObservationsAsOf,
  signedLog1p,
};
>>>>>>>> feat-ink-tui-refactor-split:shared/lib/data/macro_store.js
