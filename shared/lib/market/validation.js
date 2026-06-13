const fs = require('node:fs');
const path = require('node:path');

const OHLCV_FAMILIES = new Set(['equities', 'indices', 'commodities', 'crypto', 'fx', 'prediction_market']);
const SCALAR_VALUE_FAMILIES = new Set(['pmi', 'macro', 'macro_alt', 'sentiment', 'breadth', 'prediction_market']);
const FRESHNESS_RULES_MS = {
  equities: {
    '5m': 96 * 60 * 60 * 1000,
    '15m': 96 * 60 * 60 * 1000,
    '30m': 96 * 60 * 60 * 1000,
    '1h': 96 * 60 * 60 * 1000,
    '4h': 48 * 60 * 60 * 1000,
    '1d': 72 * 60 * 60 * 1000,
    '1w': 14 * 24 * 60 * 60 * 1000,
    '1mo': 60 * 24 * 60 * 60 * 1000,
  },
  indices: {
    '5m': 96 * 60 * 60 * 1000,
    '15m': 96 * 60 * 60 * 1000,
    '30m': 96 * 60 * 60 * 1000,
    '1h': 96 * 60 * 60 * 1000,
    '4h': 48 * 60 * 60 * 1000,
    '1d': 72 * 60 * 60 * 1000,
    '1w': 14 * 24 * 60 * 60 * 1000,
    '1mo': 60 * 24 * 60 * 60 * 1000,
  },
  commodities: {
    '5m': 6 * 60 * 60 * 1000,
    '15m': 12 * 60 * 60 * 1000,
    '30m': 12 * 60 * 60 * 1000,
    '1h': 24 * 60 * 60 * 1000,
    '4h': 48 * 60 * 60 * 1000,
    '1d': 72 * 60 * 60 * 1000,
    '1w': 14 * 24 * 60 * 60 * 1000,
    '1mo': 60 * 24 * 60 * 60 * 1000,
  },
  crypto: {
    '5m': 3 * 60 * 60 * 1000,
    '15m': 6 * 60 * 60 * 1000,
    '30m': 12 * 60 * 60 * 1000,
    '1h': 24 * 60 * 60 * 1000,
    '4h': 48 * 60 * 60 * 1000,
    '1d': 72 * 60 * 60 * 1000,
    '1w': 14 * 24 * 60 * 60 * 1000,
    '1mo': 60 * 24 * 60 * 60 * 1000,
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
    '1w': 14 * 24 * 60 * 60 * 1000,
    '1mo': 60 * 24 * 60 * 60 * 1000,
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

const FAMILY_START_DATES = {
  crypto: '2009-01-03T00:00:00.000Z',
};

const PROVIDER_START_DATES = {
  binance: '2017-07-14T00:00:00.000Z',
  coinbase: '2012-06-01T00:00:00.000Z',
};

const LOWER_TIMEFRAMES = new Set(['tick', '1m', '5m', '15m', '30m', '1h', '4h']);
const DAILY_OR_ABOVE_TIMEFRAMES = new Set(['1d', '1w', '1mo']);

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

function normalizedProviderName(record) {
  return String(record.provider || record.source || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function sourceLabel(record) {
  return String(record.source || record.provider || record.provenance || '').toLowerCase();
}

function isLowerTimeframe(record) {
  return LOWER_TIMEFRAMES.has(record.timeframe || '');
}

function derivedFromTimeframe(record) {
  return String(
    record.derived_from_timeframe ||
    record.source_timeframe ||
    record.base_timeframe ||
    '',
  ).toLowerCase();
}

function providerStartDate(record) {
  const name = normalizedProviderName(record);
  for (const [provider, start] of Object.entries(PROVIDER_START_DATES)) {
    if (name.includes(provider)) return start;
  }
  return null;
}

function addTemporalProvenanceIssues(record, report, index) {
  const timestampMs = Date.parse(record.timestamp);
  if (!Number.isFinite(timestampMs)) return;

  const familyStart = FAMILY_START_DATES[record.family || 'unknown'];
  if (familyStart && timestampMs < Date.parse(familyStart)) {
    addIssue(
      report,
      'error',
      'before_family_inception',
      record,
      index,
      `record timestamp predates ${record.family} inception floor ${familyStart}`,
    );
  }

  const providerStart = providerStartDate(record);
  if (providerStart && timestampMs < Date.parse(providerStart)) {
    addIssue(
      report,
      'error',
      'before_provider_history',
      record,
      index,
      `record timestamp predates provider history floor ${providerStart}`,
    );
  }

  const label = sourceLabel(record);
  const derivedFrom = derivedFromTimeframe(record);
  if (
    isLowerTimeframe(record) &&
    (
      label.includes('synthetic') ||
      label.includes('deconstruct') ||
      label.includes('daily_aggregate') ||
      DAILY_OR_ABOVE_TIMEFRAMES.has(derivedFrom) ||
      // 5m rollups are synthetic ONLY when not provably aggregated from a native
      // sub-daily base. A 'rollup-from-5m' identity passthrough (derived_from_timeframe
      // in LOWER_TIMEFRAMES) is native Yahoo 5m and must remain storable; legacy
      // untagged 5m rollups (no sub-daily provenance) stay rejected.
      ((record.timeframe || '') === '5m' && label.includes('rollup') && !LOWER_TIMEFRAMES.has(derivedFrom))
    )
  ) {
    addIssue(
      report,
      'error',
      'synthetic_lower_timeframe',
      record,
      index,
      derivedFrom
        ? `lower-timeframe bar is derived from ${derivedFrom} history and must not be treated as live history`
        : 'lower-timeframe bar is synthetic/deconstructed and must not be treated as live history',
    );
  } else if (isLowerTimeframe(record) && label.includes('rollup')) {
    addIssue(
      report,
      'warning',
      'rollup_lower_timeframe',
      record,
      index,
      'lower-timeframe bar uses rollup provenance; verify it was aggregated from native lower-timeframe data',
    );
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

  addTemporalProvenanceIssues(record, report, index);

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

function readSnapshot(inputPath, options = {}) {
  if (!fs.existsSync(inputPath)) return null;
  const family = options.family ? String(options.family).trim() : null;
  
  if (fs.statSync(inputPath).isDirectory()) {
    if (family) {
      const familyPath = path.join(inputPath, family, 'backtest_history.json');
      if (!fs.existsSync(familyPath)) return null;
      try {
        const snapshot = JSON.parse(fs.readFileSync(familyPath, 'utf8'));
        return {
          ...snapshot,
          mode: snapshot.mode || 'backtest_history',
          loaded_family: family,
        };
      } catch (error) {
        return null;
      }
    }

    // Recursive merge of all backtest_history.json files
    const snapshot = { sources: [], errors: [], backfill_windows: [], mode: 'merged_history' };
    const files = [];
    const scan = (dir) => {
      fs.readdirSync(dir).forEach(file => {
        const full = path.join(dir, file);
        if (fs.statSync(full).isDirectory()) scan(full);
        else if (file === 'backtest_history.json') files.push(full);
      });
    };
    scan(inputPath);

    files.forEach(f => {
      try {
        const part = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (part.sources) for (const s of part.sources) snapshot.sources.push(s);
        if (part.errors) for (const e of part.errors) snapshot.errors.push(e);
        if (part.backfill_windows) for (const w of part.backfill_windows) snapshot.backfill_windows.push(w);
        if (!snapshot.fetched_at || part.fetched_at > snapshot.fetched_at) {
          snapshot.fetched_at = part.fetched_at;
        }
      } catch (e) { /* ignore corrupt parts */ }
    });
    return snapshot;
  }

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

  const uniqueBy = (items, keyFn) => {
    const seenItems = new Map();
    for (const item of items || []) {
      seenItems.set(keyFn(item), item);
    }
    return Array.from(seenItems.values());
  };

  const isHistoricalMerge = ['backtest_history', 'merged_history'].includes(base.mode) || ['backtest_history', 'merged_history'].includes(update.mode);

  // Keep historical diagnostics additive so repeated backfills don't erase prior context.
  // Live refreshes still prefer the current attempt's provider error set.
  merged.errors = isHistoricalMerge
    ? uniqueBy([...(base.errors || []), ...(update.errors || [])], (item) => [
        item.family || 'unknown',
        item.provider || 'unknown',
        item.symbol || item.series || item.metric || 'unknown',
        item.message || '',
        item.code || '',
      ].join(':'))
    : (update.errors || []);

  merged.backfill_windows = uniqueBy([...(base.backfill_windows || []), ...(update.backfill_windows || [])], (item) => [
    item.family || 'unknown',
    item.symbol || 'unknown',
    item.timeframe || 'unknown',
    item.days || item.requested_window || 'unknown',
    item.actual_window || '',
  ].join(':'));

  return merged;
}

function writeJson(outputPath, payload) {
  const tempPath = `${outputPath}.tmp`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tempPath, outputPath);
}

/**
 * Splits a snapshot into families and writes them to partitioned directories.
 * outputPath should be the root cache directory.
 */
function writePartitionedSnapshot(rootPath, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.sources)) return;
  
  const byFamily = new Map();
  snapshot.sources.forEach(s => {
    const family = s.family || 'unknown';
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(s);
  });

  for (const [family, sources] of byFamily.entries()) {
    const familyDir = path.join(rootPath, family);
    const familyPath = path.join(familyDir, 'backtest_history.json');
    
    // For each family, we should ideally merge with existing if any,
    // but the caller might have already merged.
    // If rootPath/family/backtest_history.json exists, and we are not doing a full rewrite,
    // we should merge.
    
    const familySnapshot = {
      ...snapshot,
      sources,
      // Filter errors and windows relevant to this family if possible, 
      // otherwise just replicate them.
      errors: (snapshot.errors || []).filter(e => !e.family || e.family === family),
      backfill_windows: (snapshot.backfill_windows || []).filter(w => !w.family || w.family === family)
    };

    writeJson(familyPath, familySnapshot);
  }
}

// Binary format per file: magic(4) + count(uint32LE) + N×[ts_ms,open,high,low,close,volume](6×float64LE)
// Metadata sidecar: <symbol>_<timeframe>.meta.json — family, provider, coordinate_id, etc.
const TS_MAGIC = 'SOVT';
const TS_RECORD_BYTES = 6 * 8; // 6 float64 fields
const TS_HEADER_BYTES = 8;     // 4 magic + 4 count

function tsIndexPath(tsDir, symbol, timeframe) {
  const safe = symbol.replace(/[^a-zA-Z0-9_]/g, '_');
  return {
    bin:  path.join(tsDir, `${safe}_${timeframe}.bin`),
    meta: path.join(tsDir, `${safe}_${timeframe}.meta.json`),
  };
}

/**
 * Writes a per-symbol binary time-series index from a snapshot.
 * tsDir should be e.g. storage/data/ts/
 * Only OHLCV families are indexed (equities, indices, crypto, commodities).
 */
// All ts-index bins are merge-protected in writeTsIndex (see loop below). The
// ts-index is the deepest store; the JSON partitions snapshots are rebuilt from
// are sub-daily-capped AND, for most families, never carried deep daily/1h/4h at
// all (that history lived only in the bins). So a snapshot rebuilt from JSON +
// a shallow live fetch must NEVER truncate any bin — daily/1w/1mo/1h/4h included.
// Retained for backward-compat references; merge-protection is now universal.
const SUB_DAILY_PRESERVED_TIMEFRAMES = new Set(['1m', '5m', '15m', '30m']);

function writeTsIndex(tsDir, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.sources)) return;
  fs.mkdirSync(tsDir, { recursive: true });

  // Group by symbol+timeframe
  const groups = new Map();
  for (const s of snapshot.sources) {
    if (!OHLCV_FAMILIES.has(s.family)) continue;
    if (!s.symbol || !s.timeframe || !s.timestamp) continue;
    const key = `${s.symbol}\0${s.timeframe}`;
    if (!groups.has(key)) groups.set(key, { records: [], meta: null });
    const g = groups.get(key);
    g.records.push(s);
    // Keep the most recent meta (last writer wins; good enough for provider/coordinate_id)
    if (!g.meta) {
      g.meta = {
        symbol: s.symbol,
        timeframe: s.timeframe,
        family: s.family,
        provider: s.provider || '',
        coordinate_id: s.coordinate_id || '',
        config_market: s.config_market || '',
        config_sector: s.config_sector || '',
      };
    }
  }

  for (const [key, { records, meta }] of groups) {
    if (!meta || records.length === 0) continue;

    // Merge-protection for EVERY timeframe: the bin is the deepest store, so a
    // snapshot rebuilt from the (sub-daily-capped, daily-shallow) JSON partition
    // must never truncate it. Merge with the existing bin; new records win on
    // timestamp conflict (handles split/dividend adjustments to a given bar),
    // existing records at other timestamps are preserved. Previously only
    // {1m,5m,15m,30m} were protected and daily/1h/4h/1w/1mo used replace, which
    // silently truncated deep daily bins (which never lived in JSON) to a single
    // live bar on every ingest.
    {
      const existing = readTsIndex(tsDir, meta.symbol, meta.timeframe);
      if (existing && existing.length > 0) {
        const newMs = new Set();
        for (const r of records) {
          const ms = Date.parse(r.timestamp);
          if (Number.isFinite(ms)) newMs.add(ms);
        }
        for (const r of existing) {
          const ms = Date.parse(r.timestamp);
          if (Number.isFinite(ms) && !newMs.has(ms)) records.push(r);
        }
      }
    }

    // Sort by timestamp ascending, deduplicate by ms timestamp
    records.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    const seen = new Set();
    const deduped = records.filter(r => {
      const ms = Date.parse(r.timestamp);
      if (!Number.isFinite(ms) || seen.has(ms)) return false;
      seen.add(ms);
      return true;
    });

    const count = deduped.length;
    const buf = Buffer.allocUnsafe(TS_HEADER_BYTES + count * TS_RECORD_BYTES);
    buf.write(TS_MAGIC, 0, 'ascii');
    buf.writeUInt32LE(count, 4);

    for (let i = 0; i < count; i++) {
      const r = deduped[i];
      const off = TS_HEADER_BYTES + i * TS_RECORD_BYTES;
      buf.writeDoubleLE(Date.parse(r.timestamp), off);
      buf.writeDoubleLE(Number(r.open)   || 0, off + 8);
      buf.writeDoubleLE(Number(r.high)   || 0, off + 16);
      buf.writeDoubleLE(Number(r.low)    || 0, off + 24);
      buf.writeDoubleLE(Number(r.close)  || 0, off + 32);
      buf.writeDoubleLE(Number(r.volume) || 0, off + 40);
    }

    const { bin, meta: metaPath } = tsIndexPath(tsDir, meta.symbol, meta.timeframe);
    const tmpBin = bin + '.tmp';
    fs.writeFileSync(tmpBin, buf);
    fs.renameSync(tmpBin, bin);
    fs.writeFileSync(metaPath, JSON.stringify({ ...meta, count }), 'utf8');
  }
}

/**
 * Reads a symbol's time series from the binary index.
 * Returns an array of OHLCV records (same shape as snapshot.sources entries),
 * or null if the index file doesn't exist yet.
 */
function readTsIndex(tsDir, symbol, timeframe) {
  const { bin, meta: metaPath } = tsIndexPath(tsDir, symbol, timeframe);
  if (!fs.existsSync(bin) || !fs.existsSync(metaPath)) return null;

  const buf = fs.readFileSync(bin);
  if (buf.length < TS_HEADER_BYTES) return null;
  if (buf.toString('ascii', 0, 4) !== TS_MAGIC) return null;

  const count = buf.readUInt32LE(4);
  if (buf.length < TS_HEADER_BYTES + count * TS_RECORD_BYTES) return null;

  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_) { return null; }

  const records = [];
  for (let i = 0; i < count; i++) {
    const off = TS_HEADER_BYTES + i * TS_RECORD_BYTES;
    const ts = buf.readDoubleLE(off);
    records.push({
      family:        meta.family,
      provider:      meta.provider,
      symbol:        meta.symbol,
      timeframe:     meta.timeframe,
      timestamp:     new Date(ts).toISOString(),
      open:          buf.readDoubleLE(off + 8),
      high:          buf.readDoubleLE(off + 16),
      low:           buf.readDoubleLE(off + 24),
      close:         buf.readDoubleLE(off + 32),
      volume:        buf.readDoubleLE(off + 40),
      coordinate_id: meta.coordinate_id || undefined,
      config_market: meta.config_market || undefined,
      config_sector: meta.config_sector || undefined,
    });
  }
  return records;
}

module.exports = {
  OHLCV_FAMILIES,
  isFiniteNumber,
  isValidTimestamp,
  mergeSnapshots,
  readSnapshot,
  readTsIndex,
  recordKey,
  validateSnapshot,
  writeJson,
  writePartitionedSnapshot,
  writeTsIndex,
};
