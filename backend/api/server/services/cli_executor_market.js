const fs = require('node:fs');
const {
  DEFAULT_SNAPSHOT,
} = require('../../../../shared/lib/runtime/paths');

const DEFAULT_HISTORY = DEFAULT_SNAPSHOT;

function stringOrFallback(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function parseLimit(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseSymbolList(value) {
  return String(value || '')
    .split(',')
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseEquityCsv(equityCsv) {
  return String(equityCsv || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function maxDrawdownFromEquity(values) {
  let peak = values[0] || 0;
  let maxDrawdown = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
    }
  }
  return maxDrawdown;
}

function localStatsFromEquityCsv(equityCsv) {
  const values = parseEquityCsv(equityCsv);
  if (values.length < 1) {
    return {
      ok: false,
      type: 'backend_stats',
      engine: 'sovereign_web_api',
      schema_version: 1,
      error: 'invalid --equity CSV',
    };
  }
  const returns = values.slice(1).map((value, index) => {
    const previous = values[index];
    return previous !== 0 ? (value - previous) / previous : 0;
  });
  const average = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length ? returns.reduce((sum, value) => sum + ((value - average) ** 2), 0) / returns.length : 0;
  const volatility = Math.sqrt(variance);
  const cumulativeReturn = values[0] !== 0 ? (values[values.length - 1] - values[0]) / values[0] : 0;
  return {
    ok: true,
    type: 'backend_stats',
    engine: 'sovereign_web_api',
    schema_version: 1,
    source: 'local_equity_curve',
    degraded: true,
    metric_basis: 'unannualized_local_equity_curve',
    unavailable_metrics: ['annualized_return', 'sortino', 'calmar'],
    observations: values.length,
    cumulative_return: Number(cumulativeReturn.toFixed(8)),
    annualized_return: null,
    volatility: Number(volatility.toFixed(8)),
    sharpe: volatility > 0 ? Number((average / volatility).toFixed(8)) : 0,
    sortino: null,
    max_drawdown: Number(maxDrawdownFromEquity(values).toFixed(8)),
    calmar: null,
  };
}

function normalizeRecord(record) {
  return {
    ...record,
    symbol: stringOrFallback(record.symbol, '').toUpperCase(),
    timeframe: stringOrFallback(record.timeframe, ''),
    timestamp: record.timestamp || record.time || record.date || null,
    close: Number(record.close),
    volume: Number(record.volume),
  };
}

function loadHistoryRecords(inputPath) {
  const payload = readJsonFile(inputPath);
  if (!payload) {
    return [];
  }

  const candidateArrays = [
    payload.sources,
    payload.records,
    payload.bars,
    payload.data,
  ];
  const records = candidateArrays.find((value) => Array.isArray(value));
  return Array.isArray(records) ? records.map(normalizeRecord) : [];
}

function sortRecordsByTime(records) {
  return [...records].sort((a, b) => {
    const left = String(a.timestamp || '');
    const right = String(b.timestamp || '');
    return left.localeCompare(right);
  });
}

function resolveHistorySlice(records, symbol, timeframe, limit) {
  const symbolKey = stringOrFallback(symbol, '').toUpperCase();
  const timeframeKey = stringOrFallback(timeframe, '');
  let filtered = records.filter((record) => {
    const matchesSymbol = !symbolKey || record.symbol === symbolKey;
    const matchesTimeframe = !timeframeKey || record.timeframe === timeframeKey;
    return matchesSymbol && matchesTimeframe;
  });
  filtered = sortRecordsByTime(filtered);
  if (limit > 0 && filtered.length > limit) {
    filtered = filtered.slice(-limit);
  }
  return filtered;
}

function bucketKeyForTimeframe(timestamp, timeframe) {
  const text = String(timestamp || '');
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) {
    return text;
  }

  if (timeframe === '1w') {
    const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayIndex = utc.getUTCDay();
    const offset = dayIndex === 0 ? 6 : dayIndex - 1;
    utc.setUTCDate(utc.getUTCDate() - offset);
    return utc.toISOString().slice(0, 10);
  }

  if (timeframe === '1mo') {
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${date.getUTCFullYear()}-${month}`;
  }

  return text;
}

function deriveCompressedHistory(records, symbol, timeframe, limit) {
  const symbolKey = stringOrFallback(symbol, '').toUpperCase();
  const sourceRecords = sortRecordsByTime(
    records.filter((record) => record.symbol === symbolKey && record.timeframe === '1d'),
  );
  if (!sourceRecords.length) {
    return [];
  }

  const grouped = new Map();
  for (const record of sourceRecords) {
    const bucket = bucketKeyForTimeframe(record.timestamp, timeframe);
    grouped.set(bucket, {
      ...record,
      timeframe,
      timestamp: bucket,
    });
  }

  let derived = sortRecordsByTime([...grouped.values()]);
  if (limit > 0 && derived.length > limit) {
    derived = derived.slice(-limit);
  }
  return derived;
}

function hasUsefulCorrelationPayload(payload) {
  return Boolean(payload)
    && payload.ok !== false
    && Number(payload.sample_size || 0) >= 2
    && Array.isArray(payload.values)
    && payload.values.length > 0;
}

function buildMarketDataSummary(query = {}) {
  const input = stringOrFallback(query.input, DEFAULT_HISTORY);
  const symbol = stringOrFallback(query.symbol, 'AAPL');
  const timeframe = stringOrFallback(query.timeframe, '1d');
  const limit = parseLimit(query.max_bars);
  const records = loadHistoryRecords(input);
  const slice = resolveHistorySlice(records, symbol, timeframe, limit);
  const first = slice[0] || {};
  const last = slice[slice.length - 1] || {};
  const closes = slice.map((record) => Number(record.close)).filter((value) => Number.isFinite(value));
  const volumes = slice.map((record) => Number(record.volume)).filter((value) => Number.isFinite(value));

  return {
    available: true,
    ok: true,
    type: 'market_data_summary',
    engine: 'sovereign_web_api',
    schema_version: 1,
    source: 'local_fixture',
    input,
    summary: {
      symbol: symbol.toUpperCase(),
      timeframe,
      bars: slice.length,
      first_timestamp: first.timestamp || null,
      last_timestamp: last.timestamp || null,
      first_close: Number.isFinite(Number(first.close)) ? Number(first.close) : null,
      last_close: Number.isFinite(Number(last.close)) ? Number(last.close) : null,
      min_close: closes.length ? Math.min(...closes) : null,
      max_close: closes.length ? Math.max(...closes) : null,
      total_volume: volumes.length ? volumes.reduce((sum, value) => sum + value, 0) : 0,
    },
    quality: {
      rejected_records: 0,
      usable_records: slice.length,
      stale_records: 0,
      provider_errors: 0,
    },
    records: slice,
  };
}

function pearsonCorrelation(valuesA, valuesB) {
  if (!valuesA.length || valuesA.length !== valuesB.length) {
    return 0;
  }

  const meanA = valuesA.reduce((sum, value) => sum + value, 0) / valuesA.length;
  const meanB = valuesB.reduce((sum, value) => sum + value, 0) / valuesB.length;
  let numerator = 0;
  let sumSquaresA = 0;
  let sumSquaresB = 0;
  for (let index = 0; index < valuesA.length; index += 1) {
    const deltaA = valuesA[index] - meanA;
    const deltaB = valuesB[index] - meanB;
    numerator += deltaA * deltaB;
    sumSquaresA += deltaA * deltaA;
    sumSquaresB += deltaB * deltaB;
  }

  const denominator = Math.sqrt(sumSquaresA * sumSquaresB);
  if (!Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(6));
}

function buildCorrelationMatrix(query = {}) {
  const input = stringOrFallback(query.input, DEFAULT_HISTORY);
  const timeframe = stringOrFallback(query.timeframe, '1d');
  const limit = parseLimit(query.max_bars);
  const requestedSymbols = parseSymbolList(query.symbols);
  const allRecords = loadHistoryRecords(input);
  const records = allRecords.filter((record) => !timeframe || record.timeframe === timeframe);
  const symbols = requestedSymbols.length
    ? requestedSymbols.map((symbol) => symbol.toUpperCase())
    : [...new Set((records.length ? records : allRecords).map((record) => record.symbol).filter(Boolean))];
  const bySymbol = new Map();

  for (const symbol of symbols) {
    let slice = resolveHistorySlice(records, symbol, timeframe, limit);
    if (!slice.length && (timeframe === '1w' || timeframe === '1mo')) {
      slice = deriveCompressedHistory(allRecords, symbol, timeframe, limit);
    }
    const byTimestamp = new Map(slice.map((record) => [String(record.timestamp || ''), record]));
    bySymbol.set(symbol, byTimestamp);
  }

  const commonTimestamps = symbols.reduce((shared, symbol, index) => {
    const timestamps = new Set([...bySymbol.get(symbol).keys()]);
    if (index === 0) {
      return timestamps;
    }
    return new Set([...shared].filter((timestamp) => timestamps.has(timestamp)));
  }, new Set());
  const alignedTimestamps = [...commonTimestamps].sort((left, right) => left.localeCompare(right));
  const alignedValues = symbols.map((symbol) => alignedTimestamps.map((timestamp) => Number(bySymbol.get(symbol).get(timestamp)?.close)));
  const completeIndices = alignedTimestamps
    .map((_, index) => index)
    .filter((index) => alignedValues.every((series) => Number.isFinite(series[index])));
  const finalTimestamps = completeIndices.map((index) => alignedTimestamps[index]);
  const finalValues = alignedValues.map((series) => completeIndices.map((index) => series[index]));
  const hasSufficientOverlap = finalTimestamps.length >= 2;
  const size = symbols.length;
  const values = Array.from({ length: size }, (_, rowIndex) => Array.from({ length: size }, (_, columnIndex) => {
    if (rowIndex === columnIndex) {
      return 1;
    }
    return pearsonCorrelation(finalValues[rowIndex], finalValues[columnIndex]);
  }));

  return {
    available: hasSufficientOverlap,
    ok: hasSufficientOverlap,
    type: 'correlation_matrix',
    engine: 'sovereign_web_api',
    schema_version: 1,
    source: 'local_fixture',
    input,
    timeframe,
    labels: symbols,
    values,
    sample_size: finalTimestamps.length,
    error: hasSufficientOverlap ? null : 'insufficient_aligned_observations',
  };
}

function buildMarketUniverse(query = {}) {
  const input = stringOrFallback(query.input, DEFAULT_HISTORY);
  const limit = parseLimit(query.max_entries);
  const records = loadHistoryRecords(input);
  const bySymbol = new Map();

  for (const record of records) {
    if (!record.symbol) {
      continue;
    }
    const current = bySymbol.get(record.symbol) || {
      symbol: record.symbol,
      records: 0,
      first_timestamp: record.timestamp || null,
      last_timestamp: record.timestamp || null,
    };
    current.records += 1;
    if (!current.first_timestamp || String(record.timestamp || '').localeCompare(String(current.first_timestamp || '')) < 0) {
      current.first_timestamp = record.timestamp || null;
    }
    if (!current.last_timestamp || String(record.timestamp || '').localeCompare(String(current.last_timestamp || '')) > 0) {
      current.last_timestamp = record.timestamp || null;
    }
    bySymbol.set(record.symbol, current);
  }

  const entries = [...bySymbol.values()]
    .sort((left, right) => right.records - left.records || left.symbol.localeCompare(right.symbol));

  return {
    available: true,
    ok: true,
    type: 'market_universe',
    engine: 'sovereign_web_api',
    schema_version: 1,
    source: 'local_fixture',
    input,
    entries: limit > 0 ? entries.slice(0, limit) : entries,
  };
}

function buildPortfolioSnapshot(query = {}) {
  const cash = Number(stringOrFallback(query.cash, '10000.0'));
  const positions = String(query.positions || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [symbol, quantity, averagePrice] = entry.split(':').map((part) => part.trim());
      return {
        symbol: stringOrFallback(symbol, '').toUpperCase(),
        quantity: Number(quantity || 0),
        average_price: Number(averagePrice || 0),
      };
    })
    .filter((position) => position.symbol);

  const market_value = positions.reduce((sum, position) => sum + (position.quantity * position.average_price), 0);
  return {
    available: true,
    ok: true,
    type: 'portfolio_snapshot',
    engine: 'sovereign_web_api',
    schema_version: 1,
    source: 'local_fixture',
    cash: Number.isFinite(cash) ? cash : 0,
    positions,
    summary: {
      market_value,
      equity: (Number.isFinite(cash) ? cash : 0) + market_value,
      positions: positions.length,
    },
  };
}

function localBackendFallback(command, query = {}) {
  switch (command) {
    case 'data summary':
      return buildMarketDataSummary(query);
    case 'correlation':
      return buildCorrelationMatrix(query);
    case 'universe':
      return buildMarketUniverse(query);
    case 'portfolio':
      return buildPortfolioSnapshot(query);
    default:
      return {
        available: false,
        ok: false,
        error: `No local fallback available for ${command}`,
      };
  }
}

module.exports = {
  DEFAULT_HISTORY,
  stringOrFallback,
  readJsonFile,
  parseLimit,
  parseSymbolList,
  finiteNumber,
  clamp,
  parseEquityCsv,
  maxDrawdownFromEquity,
  localStatsFromEquityCsv,
  normalizeRecord,
  loadHistoryRecords,
  sortRecordsByTime,
  resolveHistorySlice,
  bucketKeyForTimeframe,
  deriveCompressedHistory,
  hasUsefulCorrelationPayload,
  buildMarketDataSummary,
  pearsonCorrelation,
  buildCorrelationMatrix,
  buildMarketUniverse,
  buildPortfolioSnapshot,
  localBackendFallback,
};
