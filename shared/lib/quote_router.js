const DEFAULT_PROVIDER_PRIORITY = {
  headway_mt5: 101,
  mt5: 100,
  webull: 92,
  alpaca: 88,
  polygon: 86,
  binance: 82,
  coinbase: 80,
  stooq: 62,
  yahoo: 58,
  fred: 55,
  default: 10,
};

const CURRENCY_CODES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNH', 'VND']);
const COMMODITY_SYMBOLS = new Set(['XAUUSD', 'XAGUSD', 'XCUUSD', 'USOIL']);
const INDEX_ALIASES = {
  US500: 'SPX',
  SP500: 'SPX',
  SPX500: 'SPX',
  NAS100: 'NDX',
  US100: 'NDX',
  DJ30: 'DJI',
  US30: 'DJI',
};

function finiteNumber(value) {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function normalizeProvider(provider) {
  return String(provider || 'unknown').trim().toLowerCase();
}

function normalizeFamily(family) {
  const value = String(family || '').trim().toLowerCase();
  if (['stock', 'stocks', 'equity', 'equities'].includes(value)) return 'equities';
  if (['index', 'indices'].includes(value)) return 'indices';
  if (['forex', 'currency', 'currencies', 'fx'].includes(value)) return 'fx';
  if (['commodity', 'commodities'].includes(value)) return 'commodities';
  if (['crypto', 'cryptocurrency'].includes(value)) return 'crypto';
  return value || null;
}

function normalizeSymbol(symbol, family = null) {
  let value = String(symbol || '').trim().toUpperCase();
  value = value.replace(/\s+/g, '');
  value = value.replace(/[./:_-]/g, '');
  value = value.replace(/USDT$/, 'USD');
  value = INDEX_ALIASES[value] || value;
  if ((family === 'equities' || !family) && value.endsWith('US') && value.length > 2) {
    value = value.slice(0, -2);
  }
  if (family === 'crypto' && value.endsWith('USD')) {
    return `${value.slice(0, -3)}USDT`;
  }
  return value;
}

function inferFamily(symbol, explicitFamily = null) {
  const normalizedFamily = normalizeFamily(explicitFamily);
  if (normalizedFamily) return normalizedFamily;

  const normalized = normalizeSymbol(symbol);
  if (COMMODITY_SYMBOLS.has(normalized)) return 'commodities';
  if (Object.values(INDEX_ALIASES).includes(normalized) || ['SPX', 'NDX', 'DJI', 'VIX'].includes(normalized)) return 'indices';
  if (normalized.length === 6 && CURRENCY_CODES.has(normalized.slice(0, 3)) && CURRENCY_CODES.has(normalized.slice(3))) return 'fx';
  if (['BTCUSD', 'ETHUSD', 'BNBUSD', 'SOLUSD', 'XRPUSD', 'DOGEUSD', 'SUIUSD', 'ADAUSD', 'BTCUSDT', 'ETHUSDT'].includes(normalized)) return 'crypto';
  return 'equities';
}

function providerRank(provider, priority = DEFAULT_PROVIDER_PRIORITY) {
  const normalized = normalizeProvider(provider);
  return priority[normalized] ?? priority.default ?? 0;
}

function quoteIdentity(record) {
  const family = inferFamily(record.symbol || record.instrument_id, record.family);
  const symbol = normalizeSymbol(record.symbol || record.instrument_id, family);
  return [
    family,
    symbol,
    record.timeframe || record.quote_type || 'point',
    record.timestamp || '',
  ].join(':');
}

function recordScore(record, priority = DEFAULT_PROVIDER_PRIORITY) {
  const rank = providerRank(record.provider, priority);
  const quality = finiteNumber(record.quality_score) ?? 0;
  const volume = finiteNumber(record.volume) ?? finiteNumber(record.last_size) ?? 0;
  return (rank * 1000000) + (quality * 1000) + Math.min(volume, 999);
}

function selectPreferredQuoteRecords(records, options = {}) {
  const priority = options.providerPriority || DEFAULT_PROVIDER_PRIORITY;
  const selected = new Map();
  for (const record of records || []) {
    const key = quoteIdentity(record);
    const existing = selected.get(key);
    if (!existing || recordScore(record, priority) > recordScore(existing, priority)) {
      selected.set(key, record);
    }
  }
  return Array.from(selected.values());
}

function quoteRowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return [
    ...(Array.isArray(payload.sources) ? payload.sources : []),
    ...(Array.isArray(payload.quotes) ? payload.quotes : []),
    ...(Array.isArray(payload.ticks) ? payload.ticks : []),
    ...(Array.isArray(payload.bars) ? payload.bars : []),
  ];
}

function normalizeExternalQuoteRecord(row, provider, options = {}) {
  const sourceProvider = normalizeProvider(row.provider || provider);
  const rawSymbol = row.symbol || row.instrument || row.instrument_id || row.ticker;
  const family = inferFamily(rawSymbol, row.family || options.family);
  const symbol = normalizeSymbol(rawSymbol, family);
  const timestamp = row.timestamp || row.time || row.datetime || row.date;
  const parsedTimestamp = Date.parse(timestamp || '');
  const bid = finiteNumber(row.bid);
  const ask = finiteNumber(row.ask);
  const rawLast = finiteNumber(row.last) ?? finiteNumber(row.price) ?? finiteNumber(row.close);
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null;
  const last = rawLast !== null && rawLast > 0 ? rawLast : null;
  const close = last ?? mid;
  if (!symbol || !Number.isFinite(parsedTimestamp) || close === null) {
    return null;
  }

  const open = finiteNumber(row.open) ?? close;
  const high = finiteNumber(row.high) ?? Math.max(open, close);
  const low = finiteNumber(row.low) ?? Math.min(open, close);
  const volume = finiteNumber(row.volume) ?? finiteNumber(row.last_size) ?? 0;
  const timeframe = row.timeframe || row.period || 'tick';
  const isTick = String(timeframe).toLowerCase() === 'tick' && row.open == null && row.high == null && row.low == null;
  return {
    family,
    provider: sourceProvider,
    symbol,
    timeframe,
    timestamp: new Date(parsedTimestamp).toISOString(),
    open,
    high,
    low,
    close,
    volume,
    bid,
    ask,
    last: close,
    quote_type: isTick ? 'tick' : 'bar',
    source: `${sourceProvider}-quote-import`,
    source_url: `${sourceProvider}://local-quote-export`,
  };
}

function externalQuoteRejection(row, provider, options = {}) {
  if (!row || typeof row !== 'object') {
    return 'invalid_row';
  }

  const rawSymbol = row.symbol || row.instrument || row.instrument_id || row.ticker;
  const family = inferFamily(rawSymbol, row.family || options.family);
  const symbol = normalizeSymbol(rawSymbol, family);
  if (!symbol) {
    return 'missing_symbol';
  }

  const timestamp = row.timestamp || row.time || row.datetime || row.date;
  if (!Number.isFinite(Date.parse(timestamp || ''))) {
    return 'invalid_timestamp';
  }

  const bid = finiteNumber(row.bid);
  const ask = finiteNumber(row.ask);
  const rawLast = finiteNumber(row.last) ?? finiteNumber(row.price) ?? finiteNumber(row.close);
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null;
  const last = rawLast !== null && rawLast > 0 ? rawLast : null;
  if ((last ?? mid) === null) {
    return 'missing_price';
  }

  return `unknown_${normalizeProvider(provider)}`;
}

function summarizeExternalQuoteRejections(rejected) {
  return rejected.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});
}

function normalizeExternalQuotePayloadWithReport(payload, provider, options = {}) {
  const rows = quoteRowsFromPayload(payload);
  const records = [];
  const rejected = [];

  rows.forEach((row, index) => {
    const record = normalizeExternalQuoteRecord(row, provider, options);
    if (record) {
      records.push(record);
      return;
    }

    rejected.push({
      row_index: index,
      provider: normalizeProvider(row?.provider || provider),
      symbol: row?.symbol || row?.instrument || row?.instrument_id || row?.ticker || null,
      reason: externalQuoteRejection(row, provider, options),
    });
  });

  return {
    records,
    rejected,
    report: {
      input_rows: rows.length,
      usable_records: records.length,
      rejected_records: rejected.length,
      rejection_reasons: summarizeExternalQuoteRejections(rejected),
    },
  };
}

function normalizeExternalQuotePayload(payload, provider, options = {}) {
  return normalizeExternalQuotePayloadWithReport(payload, provider, options).records;
}

module.exports = {
  DEFAULT_PROVIDER_PRIORITY,
  inferFamily,
  normalizeExternalQuotePayload,
  normalizeExternalQuotePayloadWithReport,
  normalizeExternalQuoteRecord,
  normalizeFamily,
  normalizeProvider,
  normalizeSymbol,
  providerRank,
  quoteIdentity,
  selectPreferredQuoteRecords,
};
