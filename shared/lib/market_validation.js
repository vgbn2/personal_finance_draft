const fs = require('node:fs');
const path = require('node:path');

const OHLCV_FAMILIES = new Set(['equities', 'indices', 'commodities', 'crypto', 'prediction_market']);
const SCALAR_VALUE_FAMILIES = new Set(['pmi', 'macro', 'macro_alt', 'sentiment', 'breadth', 'prediction_market']);

const FRESHNESS_RULES_MS = {
  equities: {
    '5m': 96 * 60 * 60 * 1000,
    '15m': 96 * 60 * 60 * 1000,
    '30m': 96 * 60 * 60 * 1000,
    '1h': 96 * 60 * 60 * 1000,
    '4h': 48 * 60 * 60 * 1000,
    '1d': 72 * 60 * 60 * 1000,
  },
  indices: {
    '5m': 96 * 60 * 60 * 1000,
    '15m': 96 * 60 * 60 * 1000,
    '30m': 96 * 60 * 60 * 1000,
    '1h': 96 * 60 * 60 * 1000,
    '4h': 48 * 60 * 60 * 1000,
    '1d': 72 * 60 * 60 * 1000,
  },
  commodities: {
    '5m': 6 * 60 * 60 * 1000,
    '15m': 12 * 60 * 60 * 1000,
    '30m': 12 * 60 * 60 * 1000,
    '1h': 24 * 60 * 60 * 1000,
    '4h': 48 * 60 * 60 * 1000,
    '1d': 72 * 60 * 60 * 1000,
  },
  crypto: {
    '5m': 3 * 60 * 60 * 1000,
    '15m': 6 * 60 * 60 * 1000,
    '30m': 12 * 60 * 60 * 1000,
    '1h': 24 * 60 * 60 * 1000,
    '4h': 48 * 60 * 60 * 1000,
    '1d': 72 * 60 * 60 * 1000,
  },
  fx: {
    tick: 6 * 60 * 60 * 1000,
    '1m': 6 * 60 * 60 * 1000,
    '5m': 6 * 60 * 60 * 1000,
    '15m': 12 * 60 * 60 * 1000,
    '30m': 12 * 60 * 60 * 1000,
    '1h': 24 * 60 * 60 * 1000,
    '4h': 48 * 60 * 60 * 1000,
    '1d': 72 * 60 * 60 * 1000,
    default: 72 * 60 * 60 * 1000,
  },
  pmi: { default: 45 * 24 * 60 * 60 * 1000 },
  macro: { default: 180 * 24 * 60 * 60 * 1000 },
  macro_alt: { default: 60 * 24 * 60 * 60 * 1000 },
  breadth: { default: 2 * 24 * 60 * 60 * 1000 },
  sentiment: { default: 2 * 24 * 60 * 60 * 1000 },
  onchain: { default: 2 * 24 * 60 * 60 * 1000 },
  crypto_tx: { default: 2 * 24 * 60 * 60 * 1000 },
  prediction_market: { default: 7 * 24 * 60 * 60 * 1000 },
  weather: { default: 7 * 24 * 60 * 60 * 1000 },
  flight: { default: 2 * 24 * 60 * 60 * 1000 },
  holdings: { default: 30 * 24 * 60 * 60 * 1000 },
  reserves: { default: 900 * 24 * 60 * 60 * 1000 },
  satellite_nrt: { default: 2 * 24 * 60 * 60 * 1000 },
  cargo: { default: 2 * 24 * 60 * 60 * 1000 },
};

const PROVIDER_TRUST = {
  fred: 0.95,
  ecb: 0.95,
  world_bank: 0.95,
  sec: 0.95,
  spglobal: 0.95,
  kalshi: 0.92,
  binance: 0.9,
  coinbase: 0.9,
  opensky: 0.88,
  nasa_power: 0.88,
  alternative_me: 0.75,
  yahoo: 0.72,
  frankfurter: 0.78,
  fxapi: 0.78,
  blockchair: 0.8,
  default: 0.7,
};

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidTimestamp(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('undefined') &&
    Number.isFinite(Date.parse(value));
}

function familyFreshnessThresholdMs(record) {
  const family = record.family || 'unknown';
  const timeframe = record.timeframe || 'default';
  const rules = FRESHNESS_RULES_MS[family];
  if (!rules) return null;
  return rules[timeframe] || rules.default || null;
}

function recencyScore(ageMs, thresholdMs) {
  if (!Number.isFinite(ageMs) || !Number.isFinite(thresholdMs) || thresholdMs <= 0) return null;
  if (ageMs <= thresholdMs) return 1;
  return Math.max(0, thresholdMs / ageMs);
}

function providerTrustScore(provider) {
  return PROVIDER_TRUST[provider || 'default'] || PROVIDER_TRUST.default;
}

function liquidityScore(record) {
  const candidates = [
    record.volume,
    record.volume_24h,
    record.volume_fp,
    record.volume_24h_fp,
    record.open_interest,
    record.open_interest_fp,
    record.count_fp,
  ];
  const numeric = candidates
    .map((value) => (typeof value === 'string' ? Number(value) : value))
    .find((value) => Number.isFinite(value) && value >= 0);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, Math.log10(1 + numeric) / 6));
}

function sourceReliabilityScore(record, fetchedAt) {
  const thresholdMs = familyFreshnessThresholdMs(record);
  const timestampMs = Date.parse(record.timestamp);
  const fetchedMs = Date.parse(fetchedAt || '');
  const ageMs = Number.isFinite(timestampMs) && Number.isFinite(fetchedMs) ? Math.max(0, fetchedMs - timestampMs) : null;
  const recency = Number.isFinite(ageMs)
    ? recencyScore(ageMs, thresholdMs || 24 * 60 * 60 * 1000)
    : 0.5;
  const trust = providerTrustScore(record.provider);
  const liquidity = liquidityScore(record);
  const weightedLiquidity = liquidity === null ? 0.5 : liquidity;
  const score = (recency * 0.5) + (trust * 0.3) + (weightedLiquidity * 0.2);
  return {
    score: Math.max(0, Math.min(1, score)),
    age_ms: ageMs,
    threshold_ms: thresholdMs,
    recency_score: recency,
    provider_trust: trust,
    liquidity_score: liquidity,
  };
}

function recordKey(record, index) {
  return [
    record.family || 'unknown',
    record.provider || 'unknown',
    record.symbol || record.underlying || record.series || record.location || record.region || record.country || record.chain || record.metric || 'unknown',
    record.timeframe || record.component || record.metric || record.option_type || 'point',
    record.timestamp || `index_${index}`,
  ].join(':');
}

function addIssue(report, severity, code, record, index, message) {
  const issue = {
    severity,
    code,
    key: recordKey(record, index),
    family: record.family || 'unknown',
    message,
  };
  report.issues.push(issue);
  report.counts[severity] += 1;
  report.by_family[issue.family] = report.by_family[issue.family] || { records: 0, errors: 0, warnings: 0 };
  report.by_family[issue.family][severity === 'error' ? 'errors' : 'warnings'] += 1;
  if (severity === 'error') {
    report.rejected_keys.push(issue.key);
  }
}

function addFreshnessIssue(report, severity, code, record, index, message) {
  addIssue(report, severity, code, record, index, message);
  report.freshness.issues += 1;
  if (severity === 'error') {
    report.freshness.stale_records += 1;
  }
}

function validateOhlcv(record, report, index) {
  for (const field of ['open', 'high', 'low', 'close']) {
    if (!isFiniteNumber(record[field]) || record[field] < 0) {
      addIssue(report, 'error', 'invalid_price', record, index, `OHLCV field ${field} must be a non-negative number`);
    }
  }
  if (isFiniteNumber(record.volume) && record.volume < 0) {
    addIssue(report, 'error', 'invalid_volume', record, index, 'volume must not be negative');
  }
  if (
    isFiniteNumber(record.high) &&
    isFiniteNumber(record.low) &&
    isFiniteNumber(record.open) &&
    isFiniteNumber(record.close) &&
    (record.high < record.low || record.high < record.open || record.high < record.close || record.low > record.open || record.low > record.close)
  ) {
    addIssue(report, 'error', 'bad_ohlc_ordering', record, index, 'OHLC ordering is internally inconsistent');
  }
}

function hasOhlcvShape(record) {
  return ['open', 'high', 'low', 'close'].some((field) => Object.prototype.hasOwnProperty.call(record, field));
}

function validateScalar(record, report, index) {
  if (!isFiniteNumber(record.value)) {
    addIssue(report, 'error', 'missing_value', record, index, 'scalar market or macro record must include a finite value');
  }
}

function validateWeather(record, report, index) {
  for (const field of ['temperature', 'temperature_max', 'temperature_min', 'precipitation', 'wind_speed', 'solar_radiation']) {
    if (Object.prototype.hasOwnProperty.call(record, field) && !isFiniteNumber(record[field])) {
      addIssue(report, 'error', 'missing_weather_metric', record, index, `weather field ${field} must include a finite value`);
    }
  }
}

function validateSourceRecord(record, report, index, seen) {
  const family = record.family || 'unknown';
  report.by_family[family] = report.by_family[family] || { records: 0, errors: 0, warnings: 0 };
  report.by_family[family].records += 1;

  if (!isValidTimestamp(record.timestamp)) {
    addIssue(report, 'error', 'invalid_timestamp', record, index, 'timestamp must be a valid known-at-time timestamp');
  }

  const key = recordKey(record, index);
  if (seen.has(key)) {
    addIssue(report, 'warning', 'duplicate_record', record, index, 'duplicate source identity and timestamp');
  }
  seen.add(key);

  if (family === 'prediction_market' && hasOhlcvShape(record)) {
    validateOhlcv(record, report, index);
  } else if (family !== 'prediction_market' && OHLCV_FAMILIES.has(family)) {
    validateOhlcv(record, report, index);
  } else if (SCALAR_VALUE_FAMILIES.has(family)) {
    validateScalar(record, report, index);
  } else if (family === 'weather') {
    validateWeather(record, report, index);
  }

  const freshness = sourceReliabilityScore(record, report.fetched_at);
  if (Number.isFinite(freshness.score)) {
    report.reliability.samples.push({
      key,
      family,
      provider: record.provider || 'unknown',
      symbol: record.symbol || record.underlying || record.series || record.location || record.region || record.country || record.chain || record.metric || 'unknown',
      score: Number(freshness.score.toFixed(3)),
    });
  }

  if (Number.isFinite(freshness.age_ms) && Number.isFinite(freshness.threshold_ms) && freshness.age_ms > freshness.threshold_ms) {
    addFreshnessIssue(
      report,
      report.reject_stale ? 'error' : 'warning',
      'stale_record',
      record,
      index,
      `record age ${Math.round(freshness.age_ms / 60000)}m exceeds freshness threshold ${Math.round(freshness.threshold_ms / 60000)}m`,
    );
  }
}

function isHistoricalMode(mode) {
  return ['provider_history', 'backtest_history', 'sample'].includes(mode);
}

function formatDecimal(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(3));
  }
  return value;
}

function validateSnapshot(snapshot, options = {}) {
  const sourceSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const mode = sourceSnapshot.mode || 'unknown';
  const rejectStale = options.rejectStale !== undefined ? Boolean(options.rejectStale) : !isHistoricalMode(mode);
  const report = {
    ok: true,
    mode,
    fetched_at: sourceSnapshot.fetched_at || null,
    total_records: Array.isArray(sourceSnapshot.sources) ? sourceSnapshot.sources.length : 0,
    usable_records: 0,
    rejected_records: 0,
    counts: { error: 0, warning: 0 },
    by_family: {},
    rejected_keys: [],
    issues: [],
    provider_errors: Array.isArray(sourceSnapshot.errors) ? sourceSnapshot.errors : [],
    reject_stale: rejectStale,
    freshness: { stale_records: 0, issues: 0 },
    reliability: { samples: [] },
  };

  if (!Array.isArray(sourceSnapshot.sources)) {
    addIssue(report, 'error', 'missing_sources', {}, 0, 'snapshot.sources must be an array');
    report.ok = false;
    return { report, usableSources: [] };
  }

  const seen = new Set();
  sourceSnapshot.sources.forEach((record, index) => validateSourceRecord(record, report, index, seen));

  const rejected = new Set(report.rejected_keys);
  const usableSources = sourceSnapshot.sources
    .filter((record, index) => !rejected.has(recordKey(record, index)))
    .map(record => {
      const formatted = { ...record };
      for (const [key, value] of Object.entries(formatted)) {
        formatted[key] = formatDecimal(value);
      }
      return formatted;
    });

  report.usable_records = usableSources.length;
  report.rejected_records = sourceSnapshot.sources.length - usableSources.length;
  report.ok = report.counts.error === 0 && report.provider_errors.length === 0;

  return { report, usableSources };
}

function readSnapshot(inputPath) {
  if (!fs.existsSync(inputPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function mergeSnapshots(base, update) {
  if (!base || !Array.isArray(base.sources)) return update;
  if (!update || !Array.isArray(update.sources)) return base;

  const merged = { ...update };
  const seen = new Map();

  // Load existing records into the map
  base.sources.forEach((record, index) => {
    seen.set(recordKey(record, index), record);
  });

  // Overwrite or add new records
  update.sources.forEach((record, index) => {
    seen.set(recordKey(record, index), record);
  });

  merged.sources = Array.from(seen.values()).sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    return 0;
  });

  // Errors describe the current fetch attempt. Preserving old provider failures
  // makes a healthy refresh look broken after the source has recovered.
  merged.errors = update.errors || [];

  return merged;
}

function writeJson(outputPath, payload) {
  const tempPath = `${outputPath}.tmp`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tempPath, outputPath);
}

module.exports = {
  OHLCV_FAMILIES,
  isFiniteNumber,
  isValidTimestamp,
  mergeSnapshots,
  readSnapshot,
  recordKey,
  validateSnapshot,
  writeJson,
};
