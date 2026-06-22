const fs = require('node:fs');
const path = require('node:path');

const OHLCV_FAMILIES = new Set(['equities', 'indices', 'commodities', 'crypto', 'fx', 'prediction_market']);
const PROVIDER_PRIORITY = { binance: 3, alpaca: 3, yahoo: 1, twelvedata: 1, frankfurter: 1, ecb: 1 };
const SCALAR_VALUE_FAMILIES = new Set(['pmi', 'macro', 'macro_alt', 'sentiment', 'breadth', 'prediction_market']);
const FRESHNESS_RULES_MS = {
  equities: {
    '1m': 96 * 60 * 60 * 1000,
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
    '1m': 2 * 60 * 60 * 1000,
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

function validatePoint(record, report, index) {
  if (!isFiniteNumber(record.close) && !isFiniteNumber(record.price) && !isFiniteNumber(record.last) && !isFiniteNumber(record.value)) {
    addIssue(report, 'error', 'invalid_price', record, index, `Point/tick record must have a valid non-negative close, price, value, or last field`);
  }
  if (isFiniteNumber(record.close) && record.close < 0) {
    addIssue(report, 'error', 'invalid_price', record, index, `Point close must be non-negative`);
  }
  if (isFiniteNumber(record.bid) && record.bid < 0) {
    addIssue(report, 'error', 'invalid_price', record, index, `Point bid must be non-negative`);
  }
  if (isFiniteNumber(record.ask) && record.ask < 0) {
    addIssue(report, 'error', 'invalid_price', record, index, `Point ask must be non-negative`);
  }
}

function validateOhlcv(record, report, index) {
  const isPoint = ['point', 'tick'].includes(record.timeframe || record.quote_type || 'point');
  if (isPoint || ('value' in record && !('open' in record))) {
    return validatePoint(record, report, index);
  }

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

  const strict = options.strict !== undefined ? Boolean(options.strict) : false;
  let blockingWarnings = 0;
  if (strict) {
    for (const issue of report.issues) {
      if (issue.severity === 'warning') {
        const isExemptRollup = issue.code === 'rollup_lower_timeframe' &&
                               (issue.family === 'commodities' || issue.family === 'equities');
        if (!isExemptRollup) {
          blockingWarnings++;
        }
      }
    }
  }

  report.ok = report.counts.error === 0 && (!strict || blockingWarnings === 0);

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

function renameWithRetry(src, dest, retries = 5, delayMs = 50) {
  for (let i = 0; i < retries; i++) {
    try {
      fs.renameSync(src, dest);
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      if (err.code === 'ENOENT') {
        try { fs.mkdirSync(path.dirname(dest), { recursive: true }); } catch (e) {}
      }
      // Block this thread for delayMs without a CPU busy-spin. Atomics.wait on
      // a throwaway never-notified SharedArrayBuffer is a true OS-level sleep
      // (the timeout branch returns 'timed-out'); it stays synchronous to match
      // this function's contract and adds no dependency. The previous
      // `while (Date.now()-start < delayMs) {}` pegged a core and blocked the
      // event loop for up to ~250ms (5 × 50ms) per contended rename.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
}

function writeJson(outputPath, payload) {
  const tempPath = `${outputPath}.tmp`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Only plain objects get the streaming "sources" fast path below — arrays (e.g.
  // execution_memory's [[id, ts], ...] format) and primitives go through plain
  // JSON.stringify so their shape on disk is unchanged.
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
    renameWithRetry(tempPath, outputPath);
    return;
  }

  const fd = fs.openSync(tempPath, 'w');
  const sources = payload.sources;
  const streamSources = Array.isArray(sources);

  fs.writeSync(fd, '{\n');
  let firstKey = true;
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'sources' && streamSources) continue;
    if (v === undefined) continue; // JSON.stringify drops undefined-valued keys; match that.
    if (!firstKey) fs.writeSync(fd, ',\n');
    fs.writeSync(fd, `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')}`);
    firstKey = false;
  }

  if (streamSources) {
    if (!firstKey) fs.writeSync(fd, ',\n');
    fs.writeSync(fd, `  "sources": [\n`);
    for (let i = 0; i < sources.length; i++) {
      fs.writeSync(fd, `    ${JSON.stringify(sources[i])}${i < sources.length - 1 ? ',' : ''}\n`);
    }
    fs.writeSync(fd, `  ]\n`);
  }

  fs.writeSync(fd, '}\n');
  fs.closeSync(fd);
  renameWithRetry(tempPath, outputPath);
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

function atomicTempPath(targetPath) {
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  return `${targetPath}.${suffix}.tmp`;
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

/**
 * mergeWriteBin(tsDir, meta, incoming) -- merge `incoming` records into the existing
 * bin for (meta.symbol, meta.timeframe) and atomically rewrite it.
 *
 * STREAMING / CONSTANT-HEAP: the existing bin is the deepest store and can hold
 * millions of rows (BTCUSDT 1m ≈ 3M). The old path called readTsIndex() to pull every
 * existing record into a JS object (each with a fresh ISO timestamp string) just to
 * merge — at backfill concurrency that materialized many millions of objects at once
 * and exhausted the V8 heap (OOM). Here the existing bin is read only as a Buffer
 * (external memory, NOT on the V8 heap) and merged with the (small) incoming window via
 * a two-sorted-stream merge that copies retained rows as raw 48-byte slices. Only the
 * incoming records are ever objects, so heap stays flat regardless of bin depth.
 *
 * Semantics are byte-identical to the previous object-based merge:
 *   - merge-protected for EVERY timeframe (existing rows at non-conflicting timestamps
 *     are always preserved — never truncated);
 *   - on a timestamp conflict, the higher-priority provider wins; on equal priority the
 *     incoming (new) row wins (handles split/dividend re-statements of a bar);
 *   - output is sorted ascending and de-duplicated by millisecond timestamp.
 * It also removes a latent `push(...existing)` call-spread that could RangeError above
 * ~100k existing rows in the gap-fill branch.
 */
function mergeWriteBin(tsDir, meta, incoming) {
  // Encode + sort + dedupe the incoming window (small). Keep-first on a tie matches the
  // old sort-then-filter dedup.
  const inc = [];
  for (const r of incoming) {
    const ms = Date.parse(r.timestamp);
    if (Number.isFinite(ms)) inc.push({ ms, r });
  }
  inc.sort((a, b) => a.ms - b.ms);
  const incDedup = [];
  let prevMs = null;
  for (const x of inc) {
    if (x.ms !== prevMs) { incDedup.push(x); prevMs = x.ms; }
  }

  const { bin, meta: metaPath } = tsIndexPath(tsDir, meta.symbol, meta.timeframe);

  // Read the existing bin as a Buffer only (no object materialization).
  let existBuf = null;
  let existCount = 0;
  let existProvider = '';
  if (fs.existsSync(bin) && fs.existsSync(metaPath)) {
    const b = fs.readFileSync(bin);
    if (b.length >= TS_HEADER_BYTES && b.toString('ascii', 0, 4) === TS_MAGIC) {
      const c = b.readUInt32LE(4);
      if (b.length >= TS_HEADER_BYTES + c * TS_RECORD_BYTES) { existBuf = b; existCount = c; }
    }
    try { existProvider = (JSON.parse(fs.readFileSync(metaPath, 'utf8')).provider) || ''; } catch (_) { /* keep '' */ }
  }

  const existingPriority = PROVIDER_PRIORITY[existProvider] ?? 0;
  const incomingPriority = PROVIDER_PRIORITY[meta.provider] ?? 0;
  // Higher-priority existing data is gap-fill-only: keep existing on a tie.
  const existingWinsOnTie = existingPriority > incomingPriority;

  const maxCount = existCount + incDedup.length;
  const out = Buffer.allocUnsafe(TS_HEADER_BYTES + maxCount * TS_RECORD_BYTES);
  let w = 0;

  const copyExisting = (k) => {
    const src = TS_HEADER_BYTES + k * TS_RECORD_BYTES;
    existBuf.copy(out, TS_HEADER_BYTES + w * TS_RECORD_BYTES, src, src + TS_RECORD_BYTES);
    w += 1;
  };
  const writeIncoming = (x) => {
    const off = TS_HEADER_BYTES + w * TS_RECORD_BYTES;
    out.writeDoubleLE(x.ms, off);
    out.writeDoubleLE(Number(x.r.open)   || 0, off + 8);
    out.writeDoubleLE(Number(x.r.high)   || 0, off + 16);
    out.writeDoubleLE(Number(x.r.low)    || 0, off + 24);
    out.writeDoubleLE(Number(x.r.close)  || 0, off + 32);
    out.writeDoubleLE(Number(x.r.volume) || 0, off + 40);
    w += 1;
  };
  const existMs = (k) => existBuf.readDoubleLE(TS_HEADER_BYTES + k * TS_RECORD_BYTES);

  let i = 0;
  let j = 0;
  while (i < existCount && j < incDedup.length) {
    const em = existMs(i);
    const im = incDedup[j].ms;
    if (em === im) {
      if (existingWinsOnTie) copyExisting(i); else writeIncoming(incDedup[j]);
      i += 1; j += 1;
    } else if (em < im) {
      copyExisting(i); i += 1;
    } else {
      writeIncoming(incDedup[j]); j += 1;
    }
  }
  while (i < existCount) { copyExisting(i); i += 1; }
  while (j < incDedup.length) { writeIncoming(incDedup[j]); j += 1; }

  const count = w;
  out.write(TS_MAGIC, 0, 'ascii');
  out.writeUInt32LE(count, 4);
  const finalBuf = out.subarray(0, TS_HEADER_BYTES + count * TS_RECORD_BYTES);

  const tmpBin = atomicTempPath(bin);
  const tmpMeta = atomicTempPath(metaPath);
  fs.writeFileSync(tmpBin, finalBuf);
  renameWithRetry(tmpBin, bin);
  fs.writeFileSync(tmpMeta, JSON.stringify({ ...meta, count }), 'utf8');
  renameWithRetry(tmpMeta, metaPath);
}

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
        ...(s.derived_from_timeframe ? { derived_from: s.derived_from_timeframe } : {}),
      };
    }
  }

  // Merge-protection for EVERY timeframe: the bin is the deepest store, so a snapshot
  // rebuilt from the (sub-daily-capped, daily-shallow) JSON partition must never truncate
  // it. mergeWriteBin merges each incoming window into the existing bin in flat heap (the
  // existing bin is read as a Buffer, not millions of JS objects) — see its doc for the
  // exact precedence/dedup semantics, which match the prior object-based merge.
  for (const [, { records, meta }] of groups) {
    if (!meta || records.length === 0) continue;
    mergeWriteBin(tsDir, meta, records);
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
      family:                 meta.family,
      provider:               meta.provider,
      symbol:                 meta.symbol,
      timeframe:              meta.timeframe,
      timestamp:              new Date(ts).toISOString(),
      open:                   buf.readDoubleLE(off + 8),
      high:                   buf.readDoubleLE(off + 16),
      low:                    buf.readDoubleLE(off + 24),
      close:                  buf.readDoubleLE(off + 32),
      volume:                 buf.readDoubleLE(off + 40),
      coordinate_id:          meta.coordinate_id || undefined,
      config_market:          meta.config_market || undefined,
      config_sector:          meta.config_sector || undefined,
      derived_from_timeframe: meta.derived_from || undefined,
    });
  }
  return records;
}

/**
 * Like readTsIndex but materializes ONLY the records with timestamp >= sinceMs.
 *
 * The bin is time-sorted ascending and fixed-stride, so we read it into a Buffer
 * (external memory — NOT counted against the V8 old-space heap), binary-search the
 * first record at or after sinceMs, and build JS objects for just that tail. This
 * keeps an incremental rollup off the multi-million-object cost of deserializing a
 * deep base bin (e.g. BTCUSDT 1m ≈ 3M records) when only the recent window is needed
 * — the deserialized objects, not the Buffer, are what blow the heap.
 *
 * sinceMs SHOULD be aligned to a clean bucket boundary (e.g. a UTC-day boundary, a
 * multiple of every intraday interval up to 4h) so the first aggregated coarse bar in
 * the window is fully covered and the merge-write stays lossless.
 *
 * Falls back to a full readTsIndex when sinceMs is not finite. Returns an array
 * (possibly empty) or null if the bin/meta is missing or invalid.
 */
function readTsIndexSince(tsDir, symbol, timeframe, sinceMs) {
  if (!Number.isFinite(sinceMs)) return readTsIndex(tsDir, symbol, timeframe);
  const { bin, meta: metaPath } = tsIndexPath(tsDir, symbol, timeframe);
  if (!fs.existsSync(bin) || !fs.existsSync(metaPath)) return null;

  const buf = fs.readFileSync(bin);
  if (buf.length < TS_HEADER_BYTES) return null;
  if (buf.toString('ascii', 0, 4) !== TS_MAGIC) return null;

  const count = buf.readUInt32LE(4);
  if (buf.length < TS_HEADER_BYTES + count * TS_RECORD_BYTES) return null;

  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_) { return null; }

  // Binary-search the first index whose timestamp >= sinceMs (records are sorted asc).
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const ms = buf.readDoubleLE(TS_HEADER_BYTES + mid * TS_RECORD_BYTES);
    if (ms < sinceMs) lo = mid + 1; else hi = mid;
  }

  const records = [];
  for (let i = lo; i < count; i++) {
    const off = TS_HEADER_BYTES + i * TS_RECORD_BYTES;
    const ts = buf.readDoubleLE(off);
    records.push({
      family:                 meta.family,
      provider:               meta.provider,
      symbol:                 meta.symbol,
      timeframe:              meta.timeframe,
      timestamp:              new Date(ts).toISOString(),
      open:                   buf.readDoubleLE(off + 8),
      high:                   buf.readDoubleLE(off + 16),
      low:                    buf.readDoubleLE(off + 24),
      close:                  buf.readDoubleLE(off + 32),
      volume:                 buf.readDoubleLE(off + 40),
      coordinate_id:          meta.coordinate_id || undefined,
      config_market:          meta.config_market || undefined,
      config_sector:          meta.config_sector || undefined,
      derived_from_timeframe: meta.derived_from || undefined,
    });
  }
  return records;
}

module.exports = {
  OHLCV_FAMILIES,
  isFiniteNumber,
  isValidTimestamp,
  familyFreshnessThresholdMs,
  mergeSnapshots,
  readSnapshot,
  readTsIndex,
  readTsIndexSince,
  recordKey,
  renameWithRetry,
  validateSnapshot,
  writeJson,
  writePartitionedSnapshot,
  writeTsIndex,
};
