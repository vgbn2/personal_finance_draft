const { createClient } = require('@supabase/supabase-js');

require('./env');

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
  const raw = record.timestamp || record.observed_at || null;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeMacroObservation(record) {
  const series = String(record.series || '').trim();
  const observedAt = normalizeObservedAt(record);
  const rawValue = Number(record.value);
  const unit = MACRO_SERIES_UNITS[series] || 'level';

  return {
    family: 'macro',
    series,
    series_id: record.series_id ? String(record.series_id).trim() : null,
    source: String(record.source || record.provider || 'fred'),
    observed_at: observedAt,
    raw_value: Number.isFinite(rawValue) ? rawValue : null,
    normalized_value: Number.isFinite(rawValue) ? signedLog1p(rawValue) : null,
    unit,
    normalization_method: 'signed_log1p',
    payload: record,
  };
}

function buildMacroObservationRows(records) {
  const list = Array.isArray(records) ? records : [records];
  return list
    .filter((record) => record && record.family === 'macro' && record.series)
    .map(normalizeMacroObservation)
    .filter((record) => Boolean(record.observed_at) && Number.isFinite(record.raw_value));
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
      .upsert(batch, { onConflict: 'family,series,observed_at' });

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
  saveMacroObservations,
  signedLog1p,
};
